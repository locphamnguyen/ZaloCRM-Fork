/**
 * test-helpers.ts — Shared test utilities for route handler tests.
 * Provides mock factories for Prisma, zaloOps, Fastify request/reply, and Socket.IO.
 * All route tests mock at the ZaloOperations boundary per architecture decision 6A.
 */
import { vi } from 'vitest';

// ── Mock user (JWT decoded) ────────────────────────────────────────────────
export function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    orgId: 'org-1',
    email: 'test@example.com',
    role: 'admin',
    ...overrides,
  };
}

// ── Mock Fastify request ───────────────────────────────────────────────────
export function mockRequest(overrides: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  user?: ReturnType<typeof mockUser>;
} = {}) {
  return {
    user: overrides.user ?? mockUser(),
    params: overrides.params ?? {},
    query: overrides.query ?? {},
    body: overrides.body ?? {},
  } as any;
}

// ── Mock Fastify reply ─────────────────────────────────────────────────────
export function mockReply() {
  const reply: any = {
    statusCode: 200,
    body: null,
    status(code: number) { reply.statusCode = code; return reply; },
    send(data: unknown) { reply.body = data; return reply; },
  };
  return reply;
}

// ── Mock Socket.IO server ──────────────────────────────────────────────────
export function mockIO() {
  return { emit: vi.fn() } as any;
}

// ── Prisma mock factory ────────────────────────────────────────────────────
export function mockPrisma() {
  return {
    conversation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    message: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    messageReaction: {
      upsert: vi.fn(),
    },
    zaloAccount: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    zaloAccountAccess: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    groupPoll: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    contact: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
}

// ── ZaloOps mock factory — all methods as vi.fn() ──────────────────────────
export function mockZaloOps() {
  return {
    addReaction: vi.fn().mockResolvedValue({ success: true }),
    sendTypingEvent: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    undoMessage: vi.fn().mockResolvedValue(undefined),
    editMessage: vi.fn().mockResolvedValue(undefined),
    forwardMessage: vi.fn().mockResolvedValue(undefined),
    pinConversation: vi.fn().mockResolvedValue({ success: true }),
    getPinConversations: vi.fn().mockResolvedValue([]),
    sendSticker: vi.fn().mockResolvedValue({ success: true }),
    sendLink: vi.fn().mockResolvedValue({ success: true }),
    sendCard: vi.fn().mockResolvedValue({ success: true }),
    // Group management
    createGroup: vi.fn().mockResolvedValue({ groupId: 'g1' }),
    renameGroup: vi.fn().mockResolvedValue(undefined),
    changeGroupAvatar: vi.fn().mockResolvedValue(undefined),
    updateGroupSettings: vi.fn().mockResolvedValue(undefined),
    addUserToGroup: vi.fn().mockResolvedValue(undefined),
    removeUserFromGroup: vi.fn().mockResolvedValue(undefined),
    addGroupDeputy: vi.fn().mockResolvedValue(undefined),
    removeGroupDeputy: vi.fn().mockResolvedValue(undefined),
    changeGroupOwner: vi.fn().mockResolvedValue(undefined),
    blockGroupMember: vi.fn().mockResolvedValue(undefined),
    unblockGroupMember: vi.fn().mockResolvedValue(undefined),
    leaveGroup: vi.fn().mockResolvedValue(undefined),
    disperseGroup: vi.fn().mockResolvedValue(undefined),
    // Group read
    getGroupInfo: vi.fn().mockResolvedValue({ name: 'Test Group' }),
    getAllGroups: vi.fn().mockResolvedValue([]),
    getGroupMembersInfo: vi.fn().mockResolvedValue([]),
    getGroupBlockedMembers: vi.fn().mockResolvedValue([]),
    getPendingGroupMembers: vi.fn().mockResolvedValue([]),
    getGroupLinkDetail: vi.fn().mockResolvedValue({ link: '' }),
    // Polls
    createPoll: vi.fn().mockResolvedValue({ pollId: 'p1' }),
    getPollDetail: vi.fn().mockResolvedValue({ question: 'Q?' }),
    votePoll: vi.fn().mockResolvedValue(undefined),
    lockPoll: vi.fn().mockResolvedValue(undefined),
    sharePoll: vi.fn().mockResolvedValue(undefined),
    // Friends
    getAllFriends: vi.fn().mockResolvedValue([]),
    findUser: vi.fn().mockResolvedValue([]),
    getFriendOnlines: vi.fn().mockResolvedValue([]),
    getFriendRecommendations: vi.fn().mockResolvedValue([]),
    sendFriendRequest: vi.fn().mockResolvedValue({ success: true }),
    acceptFriendRequest: vi.fn().mockResolvedValue({ success: true }),
    rejectFriendRequest: vi.fn().mockResolvedValue({ success: true }),
    cancelFriendRequest: vi.fn().mockResolvedValue({ success: true }),
    getSentFriendRequests: vi.fn().mockResolvedValue([]),
    getFriendRequestStatus: vi.fn().mockResolvedValue({ status: 'none' }),
    removeFriend: vi.fn().mockResolvedValue({ success: true }),
    changeFriendAlias: vi.fn().mockResolvedValue({ success: true }),
    removeFriendAlias: vi.fn().mockResolvedValue({ success: true }),
    getAliasList: vi.fn().mockResolvedValue([]),
    blockUser: vi.fn().mockResolvedValue({ success: true }),
    unblockUser: vi.fn().mockResolvedValue({ success: true }),
    blockViewFeed: vi.fn().mockResolvedValue({ success: true }),
    // Profile
    getUserInfo: vi.fn().mockResolvedValue({ name: 'Test' }),
    getOwnId: vi.fn().mockResolvedValue('uid-1'),
    getAccountInfo: vi.fn().mockResolvedValue({ name: 'Test' }),
    changeAccountAvatar: vi.fn().mockResolvedValue(undefined),
    setOnlineStatus: vi.fn().mockResolvedValue(undefined),
    getLastOnline: vi.fn().mockResolvedValue({ lastOnline: Date.now() }),
  };
}

// ── Mock eventBuffer ───────────────────────────────────────────────────────
export function mockEventBuffer() {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    recordTyping: vi.fn(),
    clearTyping: vi.fn(),
    recordReaction: vi.fn(),
  };
}
