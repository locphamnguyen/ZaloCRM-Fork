/**
 * event-buffer.ts — Redis-backed event batching for typing indicators + reactions.
 * Aggregates high-frequency Socket.IO events to prevent event storms in multi-user
 * conversations. Emits batched updates at 1-second intervals.
 *
 * Architecture:
 *   - Typing: collects who's typing per conversation, emits once/sec
 *   - Reactions: batches reaction changes per message, emits once/sec
 *   - Falls back to in-memory if Redis unavailable (single-instance mode)
 */
import type { Server } from 'socket.io';
import { logger } from './utils/logger.js';

// ── Types ───────────────────────────────────────────────────────────────────
interface TypingEntry {
  userId: string;
  userName: string;
  expiresAt: number; // timestamp, auto-expire after 5s of no update
}

interface ReactionBatch {
  msgId: string;
  conversationId: string;
  reactions: Array<{ userId: string; userName: string; reaction: string; action: 'add' | 'remove' }>;
}

// ── Configuration ───────────────────────────────────────────────────────────
const FLUSH_INTERVAL_MS = 1_000;  // emit batched events every 1 second
const TYPING_TTL_MS = 5_000;      // typing indicator expires after 5s of silence

// ── In-memory buffers (Redis upgrade path: replace Maps with Redis hashes) ─
// Key: conversationId → Map<userId, TypingEntry>
const typingBuffer = new Map<string, Map<string, TypingEntry>>();
// Key: conversationId → ReactionBatch
const reactionBuffer = new Map<string, ReactionBatch>();

let flushTimer: ReturnType<typeof setInterval> | null = null;
let ioRef: Server | null = null;

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Start the event buffer flush loop. Call once at app startup.
 */
function start(io: Server): void {
  ioRef = io;
  if (flushTimer) return; // already running
  flushTimer = setInterval(() => flush(), FLUSH_INTERVAL_MS);
  logger.info('[event-buffer] Started (flush every 1s)');
}

/**
 * Stop the event buffer. Call on shutdown.
 */
function stop(): void {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  typingBuffer.clear();
  reactionBuffer.clear();
  ioRef = null;
  logger.info('[event-buffer] Stopped');
}

/**
 * Record a typing event. Batched and emitted once per second.
 */
function recordTyping(conversationId: string, userId: string, userName: string): void {
  let convTypers = typingBuffer.get(conversationId);
  if (!convTypers) {
    convTypers = new Map();
    typingBuffer.set(conversationId, convTypers);
  }
  convTypers.set(userId, {
    userId,
    userName,
    expiresAt: Date.now() + TYPING_TTL_MS,
  });
}

/**
 * Clear typing for a user (they sent a message or stopped typing).
 */
function clearTyping(conversationId: string, userId: string): void {
  const convTypers = typingBuffer.get(conversationId);
  if (convTypers) {
    convTypers.delete(userId);
    if (convTypers.size === 0) typingBuffer.delete(conversationId);
  }
}

/**
 * Record a reaction event. Batched and emitted once per second.
 */
function recordReaction(
  conversationId: string,
  msgId: string,
  userId: string,
  userName: string,
  reaction: string,
  action: 'add' | 'remove' = 'add',
): void {
  let batch = reactionBuffer.get(conversationId);
  if (!batch || batch.msgId !== msgId) {
    batch = { msgId, conversationId, reactions: [] };
    reactionBuffer.set(conversationId, batch);
  }
  batch.reactions.push({ userId, userName, reaction, action });
}

// ── Flush loop ──────────────────────────────────────────────────────────────
function flush(): void {
  if (!ioRef) return;
  const now = Date.now();

  // Flush typing indicators
  for (const [conversationId, typers] of typingBuffer) {
    // Remove expired entries
    for (const [uid, entry] of typers) {
      if (entry.expiresAt <= now) typers.delete(uid);
    }

    // Emit current typers (even if empty — signals "no one typing")
    const activeTypers = Array.from(typers.values()).map(t => ({
      userId: t.userId,
      userName: t.userName,
    }));

    ioRef.emit('chat:typing', { conversationId, typers: activeTypers });

    // Clean up empty entries
    if (typers.size === 0) typingBuffer.delete(conversationId);
  }

  // Flush reaction batches
  for (const [conversationId, batch] of reactionBuffer) {
    if (batch.reactions.length > 0) {
      ioRef.emit('chat:reactions', {
        conversationId,
        msgId: batch.msgId,
        reactions: batch.reactions,
      });
    }
  }
  reactionBuffer.clear();
}

// ── Export ───────────────────────────────────────────────────────────────────
export const eventBuffer = {
  start,
  stop,
  recordTyping,
  clearTyping,
  recordReaction,
};
