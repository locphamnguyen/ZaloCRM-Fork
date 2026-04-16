/**
 * zalo-operations.ts — DRY wrapper for all zca-js API calls.
 * Every Zalo operation goes through this service:
 *   1. Resolve account → get API instance from ZaloPool
 *   2. Check rate limits (per operation type)
 *   3. Execute zca-js call
 *   4. Handle session-expired errors (auto-reconnect + retry once)
 *   5. Emit Socket.IO events
 *   6. Return result or throw typed error
 */
import type { Server } from 'socket.io';
import { zaloPool } from '../modules/zalo/zalo-pool.js';
import { zaloRateLimiter } from '../modules/zalo/zalo-rate-limiter.js';
import { logger } from './utils/logger.js';
import { prisma } from './database/prisma-client.js';

// ── Error types ─────────────────────────────────────────────────────────────
export class ZaloOpError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_CONNECTED' | 'RATE_LIMITED' | 'SESSION_EXPIRED' | 'API_ERROR' | 'INVALID_PARAMS',
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'ZaloOpError';
  }
}

// ── Operation categories for rate limiting ──────────────────────────────────
export type OpCategory =
  | 'message'       // send text, image, video, voice, link, card, sticker, forward
  | 'reaction'      // add reaction
  | 'chat_action'   // typing, delete, undo, edit, pin/unpin, reply
  | 'group_admin'   // create, rename, avatar, settings, add/remove members, deputy, transfer, block
  | 'group_read'    // list, info, members, polls, invite links, pending
  | 'friend_action' // add, accept, reject, cancel, remove, block, alias
  | 'friend_read'   // list, find, online, recommendations, sent requests
  | 'profile'       // update name, avatar, status
  | 'query';        // getUserInfo, getGroupInfo — read-only

// ── Types ───────────────────────────────────────────────────────────────────
interface ExecOptions {
  accountId: string;
  category: OpCategory;
  operation: string;           // human-readable name for logging
  io?: Server | null;          // Socket.IO server for event emission
  socketEvent?: string;        // event name to emit on success
  socketRoom?: string;         // room to emit to (default: org-level)
  socketPayload?: any;         // data to emit (merged with result)
}

interface ZaloCredentials {
  cookie: any;
  imei: string;
  userAgent: string;
}

// ── Reconnect mutex ─────────────────────────────────────────────────────────
const reconnecting = new Map<string, Promise<void>>();

async function attemptReconnect(accountId: string): Promise<void> {
  // If already reconnecting this account, wait for it
  const existing = reconnecting.get(accountId);
  if (existing) return existing;

  const attempt = (async () => {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { sessionData: true },
    });
    const session = account?.sessionData as ZaloCredentials | null;
    if (!session?.imei) {
      throw new ZaloOpError('No saved session for reconnect', 'SESSION_EXPIRED', 401);
    }
    logger.info(`[zalo-ops:${accountId}] Auto-reconnecting after session expiry...`);
    await zaloPool.reconnect(accountId, session);
  })();

  reconnecting.set(accountId, attempt);
  try {
    await attempt;
  } finally {
    reconnecting.delete(accountId);
  }
}

// ── Session expiry detection ────────────────────────────────────────────────
// Strict patterns to avoid false positives (e.g. "session data parsing" errors)
const SESSION_EXPIRED_PATTERNS = [
  'session expired',
  'session has expired',
  'not logged in',
  'login required',
  'cookie expired',
  'cookie is invalid',
  'invalid session',
  'invalid token',
];

function isSessionExpiredError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return SESSION_EXPIRED_PATTERNS.some(p => msg.includes(p));
}

// ── Core execution engine ───────────────────────────────────────────────────
/**
 * Execute a zca-js operation with all safety layers.
 *
 * @param opts - account, category, operation name, socket config
 * @param fn  - callback receiving the zca-js `api` instance, returns result
 * @returns The result of fn(api)
 * @throws ZaloOpError with typed code
 *
 * Usage:
 *   const result = await zaloOps.exec(
 *     { accountId, category: 'message', operation: 'sendMessage' },
 *     (api) => api.sendMessage({ msg: 'hello' }, threadId, 0)
 *   );
 */
async function exec<T>(opts: ExecOptions, fn: (api: any) => Promise<T>): Promise<T> {
  const { accountId, category, operation } = opts;

  // 1. Check connection
  const instance = zaloPool.getInstance(accountId);
  if (!instance?.api || instance.status !== 'connected') {
    throw new ZaloOpError(
      `Zalo account not connected (status: ${instance?.status ?? 'unknown'})`,
      'NOT_CONNECTED',
      400,
    );
  }

  // 2. Rate limit check
  const limit = zaloRateLimiter.checkLimits(accountId, category);
  if (!limit.allowed) {
    throw new ZaloOpError(limit.reason || 'Rate limited', 'RATE_LIMITED', 429);
  }

  // 3. Execute with retry on session expiry
  let lastError: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await fn(instance.api);

      // Record successful operation
      zaloRateLimiter.recordSend(accountId, category);

      // 4. Emit Socket.IO event if configured
      if (opts.io && opts.socketEvent) {
        const payload = opts.socketPayload
          ? { accountId, ...opts.socketPayload, result }
          : { accountId, operation, result };
        if (opts.socketRoom) {
          opts.io.to(opts.socketRoom).emit(opts.socketEvent, payload);
        } else {
          opts.io.emit(opts.socketEvent, payload);
        }
      }

      return result;
    } catch (err: any) {
      lastError = err;

      // On first attempt, check if session expired → reconnect + retry
      if (attempt === 0 && isSessionExpiredError(err)) {
        logger.warn(`[zalo-ops:${accountId}] Session expired during ${operation}, attempting reconnect...`);
        try {
          await attemptReconnect(accountId);
          // After reconnect, get fresh API instance
          const freshInstance = zaloPool.getInstance(accountId);
          if (freshInstance?.api && freshInstance.status === 'connected') {
            // Use fresh API directly — don't mutate the captured reference
            const retryResult = await fn(freshInstance.api);
            zaloRateLimiter.recordSend(accountId, category);
            return retryResult;
          }
        } catch (reconnectErr) {
          logger.error(`[zalo-ops:${accountId}] Reconnect failed:`, reconnectErr);
          throw new ZaloOpError(
            'Session expired and reconnect failed. QR re-login required.',
            'SESSION_EXPIRED',
            401,
          );
        }
      }

      // Non-session error or second attempt — throw
      break;
    }
  }

  // Wrap unknown errors
  if (lastError instanceof ZaloOpError) throw lastError;
  logger.error(`[zalo-ops:${accountId}] ${operation} failed:`, lastError);
  throw new ZaloOpError(
    `${operation} failed: ${lastError?.message || String(lastError)}`,
    'API_ERROR',
    500,
  );
}

// ── Pre-built operations ────────────────────────────────────────────────────

// ─── Messaging ──────────────────────────────────────────────────────────────
async function sendMessage(accountId: string, threadId: string, threadType: 0 | 1, msg: any, io?: Server | null) {
  return exec({ accountId, category: 'message', operation: 'sendMessage', io, socketEvent: 'chat:message' },
    (api) => api.sendMessage(msg, threadId, threadType));
}

async function sendImage(accountId: string, threadId: string, threadType: 0 | 1, attachments: any[], io?: Server | null) {
  return exec({ accountId, category: 'message', operation: 'sendImage', io },
    (api) => api.sendMessage({ attachments }, threadId, threadType));
}

async function sendSticker(accountId: string, stickerId: number, threadId: string, threadType: 0 | 1) {
  return exec({ accountId, category: 'message', operation: 'sendSticker' },
    (api) => api.sendSticker(stickerId, null, threadId, threadType));
}

async function sendLink(accountId: string, threadId: string, threadType: 0 | 1, link: any) {
  return exec({ accountId, category: 'message', operation: 'sendLink' },
    (api) => api.sendLink(link, threadId, threadType));
}

async function sendCard(accountId: string, threadId: string, threadType: 0 | 1, cardData: any) {
  return exec({ accountId, category: 'message', operation: 'sendCard' },
    (api) => api.sendCard(cardData, threadId, threadType));
}

async function sendVoice(accountId: string, threadId: string, threadType: 0 | 1, voicePath: string, duration?: number) {
  return exec({ accountId, category: 'message', operation: 'sendVoice' },
    (api) => api.sendVoice(voicePath, threadId, threadType, duration));
}

async function forwardMessage(accountId: string, msgId: string, threadId: string, threadType: 0 | 1) {
  return exec({ accountId, category: 'message', operation: 'forwardMessage' },
    (api) => api.forwardMessage(msgId, threadId, threadType));
}

// ─── Chat Actions ───────────────────────────────────────────────────────────
async function addReaction(accountId: string, reaction: any, msgData: { msgId: string; cliMsgId?: string; threadId: string; threadType: 0 | 1 }) {
  return exec({ accountId, category: 'reaction', operation: 'addReaction' },
    (api) => api.addReaction(reaction, msgData));
}

async function sendTypingEvent(accountId: string, threadId: string, threadType: 0 | 1) {
  return exec({ accountId, category: 'chat_action', operation: 'sendTypingEvent' },
    (api) => api.sendTypingEvent(threadId, threadType));
}

async function deleteMessage(accountId: string, msgId: string, cliMsgId: string, ownerId: string, threadId: string, threadType: 0 | 1, onlyMe: boolean) {
  return exec({ accountId, category: 'chat_action', operation: 'deleteMessage' },
    (api) => api.deleteMessage(msgId, cliMsgId, ownerId, threadId, threadType, onlyMe));
}

async function undoMessage(accountId: string, msgId: string, cliMsgId: string, ownerId: string, threadId: string, threadType: 0 | 1) {
  return exec({ accountId, category: 'chat_action', operation: 'undo' },
    (api) => api.undo(msgId, cliMsgId, ownerId, threadId, threadType));
}

async function editMessage(accountId: string, msgId: string, cliMsgId: string, content: string, threadId: string, threadType: 0 | 1) {
  return exec({ accountId, category: 'chat_action', operation: 'editMessage' },
    (api) => api.sendMessage({ msg: content, editMsgId: msgId, editCliMsgId: cliMsgId }, threadId, threadType));
}

async function pinConversation(accountId: string, pin: boolean, threadId: string, threadType: 0 | 1) {
  return exec({ accountId, category: 'chat_action', operation: pin ? 'pin' : 'unpin' },
    (api) => api.setPinnedConversations(pin, threadId, threadType));
}

async function getPinConversations(accountId: string) {
  return exec({ accountId, category: 'query', operation: 'getPinConversations' },
    (api) => api.getPinConversations());
}

// ─── Group Management ───────────────────────────────────────────────────────
async function createGroup(accountId: string, options: { name: string; memberIds: string[] }) {
  return exec({ accountId, category: 'group_admin', operation: 'createGroup' },
    (api) => api.createGroup(options));
}

async function renameGroup(accountId: string, name: string, groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'renameGroup' },
    (api) => api.changeGroupName(name, groupId));
}

async function changeGroupAvatar(accountId: string, avatarPath: string, groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'changeGroupAvatar' },
    (api) => api.changeGroupAvatar(avatarPath, groupId));
}

async function updateGroupSettings(accountId: string, settings: any, groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'updateGroupSettings' },
    (api) => api.updateGroupSettings(settings, groupId));
}

async function addUserToGroup(accountId: string, userIds: string[], groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'addUserToGroup' },
    (api) => api.addUserToGroup(userIds, groupId));
}

async function removeUserFromGroup(accountId: string, userIds: string[], groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'removeUserFromGroup' },
    (api) => api.removeUserFromGroup(userIds, groupId));
}

async function addGroupDeputy(accountId: string, userId: string, groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'addGroupDeputy' },
    (api) => api.addGroupDeputy(userId, groupId));
}

async function removeGroupDeputy(accountId: string, userId: string, groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'removeGroupDeputy' },
    (api) => api.removeGroupDeputy(userId, groupId));
}

async function changeGroupOwner(accountId: string, newOwnerId: string, groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'changeGroupOwner' },
    (api) => api.changeGroupOwner(newOwnerId, groupId));
}

async function blockGroupMember(accountId: string, userId: string, groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'blockGroupMember' },
    (api) => api.addGroupBlockedMember(userId, groupId));
}

async function unblockGroupMember(accountId: string, userId: string, groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'unblockGroupMember' },
    (api) => api.removeGroupBlockedMember(userId, groupId));
}

async function leaveGroup(accountId: string, groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'leaveGroup' },
    (api) => api.leaveGroup(groupId));
}

async function disperseGroup(accountId: string, groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'disperseGroup' },
    (api) => api.disperseGroup(groupId));
}

// ─── Group Read ─────────────────────────────────────────────────────────────
async function getGroupInfo(accountId: string, groupId: string) {
  return exec({ accountId, category: 'group_read', operation: 'getGroupInfo' },
    (api) => api.getGroupInfo(groupId));
}

async function getAllGroups(accountId: string) {
  return exec({ accountId, category: 'group_read', operation: 'getAllGroups' },
    (api) => api.getAllGroups());
}

async function getGroupMembersInfo(accountId: string, groupId: string) {
  return exec({ accountId, category: 'group_read', operation: 'getGroupMembersInfo' },
    (api) => api.getGroupMembersInfo(groupId));
}

async function getGroupBlockedMembers(accountId: string, groupId: string) {
  return exec({ accountId, category: 'group_read', operation: 'getGroupBlockedMembers' },
    (api) => api.getGroupBlockedMember({}, groupId));
}

async function getPendingGroupMembers(accountId: string, groupId: string) {
  return exec({ accountId, category: 'group_read', operation: 'getPendingGroupMembers' },
    (api) => api.getPendingGroupMembers(groupId));
}

async function getGroupLinkDetail(accountId: string, groupId: string) {
  return exec({ accountId, category: 'group_read', operation: 'getGroupLinkDetail' },
    (api) => api.getGroupLinkDetail(groupId));
}

// ─── Group Polls ────────────────────────────────────────────────────────────
async function createPoll(accountId: string, options: any, groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'createPoll' },
    (api) => api.createPoll(options, groupId));
}

async function getPollDetail(accountId: string, pollId: string) {
  return exec({ accountId, category: 'group_read', operation: 'getPollDetail' },
    (api) => api.getPollDetail(pollId));
}

async function votePoll(accountId: string, pollId: string, optionIds: number[], groupId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'votePoll' },
    (api) => api.votePoll(optionIds, pollId, groupId));
}

async function lockPoll(accountId: string, pollId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'lockPoll' },
    (api) => api.lockPoll(pollId));
}

async function sharePoll(accountId: string, pollId: string) {
  return exec({ accountId, category: 'group_admin', operation: 'sharePoll' },
    (api) => api.sharePoll(pollId));
}

// ─── Friend Operations ──────────────────────────────────────────────────────
async function getAllFriends(accountId: string) {
  return exec({ accountId, category: 'friend_read', operation: 'getAllFriends' },
    (api) => api.getAllFriends());
}

async function findUser(accountId: string, query: string) {
  return exec({ accountId, category: 'friend_read', operation: 'findUser' },
    (api) => api.findUser(query));
}

async function getFriendOnlines(accountId: string) {
  return exec({ accountId, category: 'friend_read', operation: 'getFriendOnlines' },
    (api) => api.getFriendOnlines());
}

async function getFriendRecommendations(accountId: string) {
  return exec({ accountId, category: 'friend_read', operation: 'getFriendRecommendations' },
    (api) => api.getFriendRecommendations());
}

async function sendFriendRequest(accountId: string, message: string, userId: string) {
  return exec({ accountId, category: 'friend_action', operation: 'sendFriendRequest' },
    (api) => api.sendFriendRequest(message, userId));
}

async function acceptFriendRequest(accountId: string, userId: string) {
  return exec({ accountId, category: 'friend_action', operation: 'acceptFriendRequest' },
    (api) => api.acceptFriendRequest(userId));
}

async function rejectFriendRequest(accountId: string, userId: string) {
  return exec({ accountId, category: 'friend_action', operation: 'rejectFriendRequest' },
    (api) => api.rejectFriendRequest(userId));
}

async function cancelFriendRequest(accountId: string, userId: string) {
  return exec({ accountId, category: 'friend_action', operation: 'cancelFriendRequest' },
    (api) => api.undoFriendRequest(userId));
}

async function getSentFriendRequests(accountId: string) {
  return exec({ accountId, category: 'friend_read', operation: 'getSentFriendRequests' },
    (api) => api.getSentFriendRequest());
}

async function getFriendRequestStatus(accountId: string, userId: string) {
  return exec({ accountId, category: 'friend_read', operation: 'getFriendRequestStatus' },
    (api) => api.getFriendRequestStatus(userId));
}

async function removeFriend(accountId: string, userId: string) {
  return exec({ accountId, category: 'friend_action', operation: 'removeFriend' },
    (api) => api.removeFriend(userId));
}

async function changeFriendAlias(accountId: string, alias: string, userId: string) {
  return exec({ accountId, category: 'friend_action', operation: 'changeFriendAlias' },
    (api) => api.changeFriendAlias(alias, userId));
}

async function removeFriendAlias(accountId: string, userId: string) {
  return exec({ accountId, category: 'friend_action', operation: 'removeFriendAlias' },
    (api) => api.removeFriendAlias(userId));
}

async function getAliasList(accountId: string) {
  return exec({ accountId, category: 'friend_read', operation: 'getAliasList' },
    (api) => api.getAliasList());
}

async function blockUser(accountId: string, userId: string) {
  return exec({ accountId, category: 'friend_action', operation: 'blockUser' },
    (api) => api.blockUser(userId));
}

async function unblockUser(accountId: string, userId: string) {
  return exec({ accountId, category: 'friend_action', operation: 'unblockUser' },
    (api) => api.unblockUser(userId));
}

async function blockViewFeed(accountId: string, block: boolean, userId: string) {
  return exec({ accountId, category: 'friend_action', operation: 'blockViewFeed' },
    (api) => api.blockViewFeed(block, userId));
}

// ─── Profile ────────────────────────────────────────────────────────────────
async function getUserInfo(accountId: string, userId: string) {
  return exec({ accountId, category: 'query', operation: 'getUserInfo' },
    (api) => api.getUserInfo(userId));
}

async function getOwnId(accountId: string) {
  return exec({ accountId, category: 'query', operation: 'getOwnId' },
    (api) => api.getOwnId());
}

async function getAccountInfo(accountId: string) {
  return exec({ accountId, category: 'profile', operation: 'getAccountInfo' },
    (api) => api.getAccountInfo());
}

async function changeAccountAvatar(accountId: string, filePath: string) {
  return exec({ accountId, category: 'profile', operation: 'changeAccountAvatar' },
    (api) => api.changeAccountAvatar(filePath));
}

async function setOnlineStatus(accountId: string, online: boolean) {
  return exec({ accountId, category: 'profile', operation: 'setOnlineStatus' },
    (api) => api.setOnlineStatus(online));
}

async function getLastOnline(accountId: string, userId: string) {
  return exec({ accountId, category: 'query', operation: 'getLastOnline' },
    (api) => api.getLastOnline(userId));
}

// ── Public API ──────────────────────────────────────────────────────────────
export const zaloOps = {
  // Core
  exec,

  // Messaging
  sendMessage,
  sendImage,
  sendSticker,
  sendLink,
  sendCard,
  sendVoice,
  forwardMessage,

  // Chat actions
  addReaction,
  sendTypingEvent,
  deleteMessage,
  undoMessage,
  editMessage,
  pinConversation,
  getPinConversations,

  // Group management
  createGroup,
  renameGroup,
  changeGroupAvatar,
  updateGroupSettings,
  addUserToGroup,
  removeUserFromGroup,
  addGroupDeputy,
  removeGroupDeputy,
  changeGroupOwner,
  blockGroupMember,
  unblockGroupMember,
  leaveGroup,
  disperseGroup,

  // Group read
  getGroupInfo,
  getAllGroups,
  getGroupMembersInfo,
  getGroupBlockedMembers,
  getPendingGroupMembers,
  getGroupLinkDetail,

  // Group polls
  createPoll,
  getPollDetail,
  votePoll,
  lockPoll,
  sharePoll,

  // Friend operations
  getAllFriends,
  findUser,
  getFriendOnlines,
  getFriendRecommendations,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  getSentFriendRequests,
  getFriendRequestStatus,
  removeFriend,
  changeFriendAlias,
  removeFriendAlias,
  getAliasList,
  blockUser,
  unblockUser,
  blockViewFeed,

  // Profile/query
  getUserInfo,
  getOwnId,
  getAccountInfo,
  changeAccountAvatar,
  setOnlineStatus,
  getLastOnline,
};
