/**
 * chat-operations-routes.test.ts — Integration tests for extended chat operations.
 * Uses Fastify inject() to exercise all 11 route handlers end-to-end with mocked deps.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mockUser, mockPrisma, mockZaloOps, mockEventBuffer, mockIO } from './test-helpers.js';

// ── Hoisted mock state ────────────────────────────────────────────────────────
const prismaMock = mockPrisma();
const zaloOpsMock = mockZaloOps();
const eventBufferMock = mockEventBuffer();

vi.mock('../src/shared/database/prisma-client.js', () => ({ prisma: prismaMock }));
vi.mock('../src/shared/zalo-operations.js', () => ({
  zaloOps: zaloOpsMock,
  ZaloOpError: class extends Error {
    code: string; statusCode: number;
    constructor(msg: string, code: string, statusCode = 400) {
      super(msg); this.code = code; this.statusCode = statusCode;
    }
  },
}));
vi.mock('../src/shared/event-buffer.js', () => ({ eventBuffer: eventBufferMock }));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser(); },
}));
vi.mock('../src/modules/zalo/zalo-access-middleware.js', () => ({
  requireZaloAccess: () => async () => {},
}));

// Import AFTER mocks are registered
const { chatOperationsRoutes } = await import('../src/modules/chat/chat-operations-routes.js');

// ── Shared fixtures ───────────────────────────────────────────────────────────
const CONV = { id: 'conv-1', orgId: 'org-1', threadType: 'user', externalThreadId: 'ext-1', zaloAccountId: 'za-1' };

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('io', mockIO());
  app.register(chatOperationsRoutes);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.conversation.findFirst.mockResolvedValue(CONV);
  prismaMock.message.findFirst.mockResolvedValue({ senderUid: 'uid-sender' });
  prismaMock.message.update.mockResolvedValue({});
  prismaMock.message.create.mockResolvedValue({});
  prismaMock.messageReaction.upsert.mockResolvedValue({});
});

// ── Reactions ─────────────────────────────────────────────────────────────────
describe('POST /api/v1/conversations/:id/reactions', () => {
  it('happy path — records reaction and upserts db row', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/conversations/conv-1/reactions',
      payload: { msgId: 'msg-1', reaction: 'heart' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ success: true });
    expect(zaloOpsMock.addReaction).toHaveBeenCalledWith('za-1', '❤️', expect.objectContaining({ msgId: 'msg-1', threadId: 'ext-1' }));
    expect(eventBufferMock.recordReaction).toHaveBeenCalled();
    expect(prismaMock.messageReaction.upsert).toHaveBeenCalled();
  });

  it('returns 400 when msgId or reaction missing', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/reactions', payload: { msgId: 'msg-1' } });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'msgId and reaction required' });
  });

  it('returns 404 when conversation not found', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(null);
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/reactions', payload: { msgId: 'msg-1', reaction: 'like' } });
    expect(res.statusCode).toBe(404);
  });
});

// ── Typing ────────────────────────────────────────────────────────────────────
describe('POST /api/v1/conversations/:id/typing', () => {
  it('happy path — sends typing event', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/typing', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ success: true });
    expect(zaloOpsMock.sendTypingEvent).toHaveBeenCalledWith('za-1', 'ext-1', 0);
    expect(eventBufferMock.recordTyping).toHaveBeenCalled();
  });

  it('returns 404 when conversation not found', async () => {
    prismaMock.conversation.findFirst.mockResolvedValue(null);
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/typing', payload: {} });
    expect(res.statusCode).toBe(404);
  });
});

// ── Delete message ────────────────────────────────────────────────────────────
describe('DELETE /api/v1/conversations/:id/messages/:msgId', () => {
  it('happy path — deletes and marks db row', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/conversations/conv-1/messages/msg-1', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.deleteMessage).toHaveBeenCalledWith('za-1', 'msg-1', '', 'uid-sender', 'ext-1', 0, false);
    expect(prismaMock.message.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'msg-1' } }));
  });

  it('onlyMe=true skips db update', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/conversations/conv-1/messages/msg-1', payload: { onlyMe: true } });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.deleteMessage).toHaveBeenCalledWith('za-1', 'msg-1', '', 'uid-sender', 'ext-1', 0, true);
    expect(prismaMock.message.update).not.toHaveBeenCalled();
  });
});

// ── Undo message ──────────────────────────────────────────────────────────────
describe('POST /api/v1/conversations/:id/messages/:msgId/undo', () => {
  it('happy path — undoes and marks db row deleted', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/messages/msg-1/undo', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.undoMessage).toHaveBeenCalledWith('za-1', 'msg-1', '', 'uid-sender', 'ext-1', 0);
    expect(prismaMock.message.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isDeleted: true }) }));
  });
});

// ── Edit message ──────────────────────────────────────────────────────────────
describe('POST /api/v1/conversations/:id/messages/:msgId/edit', () => {
  it('happy path — edits and updates db', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/messages/msg-1/edit', payload: { content: 'hello edited' } });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.editMessage).toHaveBeenCalledWith('za-1', 'msg-1', '', 'hello edited', 'ext-1', 0);
    expect(prismaMock.message.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ content: 'hello edited' }) }));
  });

  it('returns 400 for empty content', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/messages/msg-1/edit', payload: { content: '   ' } });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'content required' });
  });
});

// ── Forward ───────────────────────────────────────────────────────────────────
describe('POST /api/v1/conversations/:id/forward', () => {
  it('happy path — forwards to each target conversation', async () => {
    const target = { ...CONV, id: 'conv-2' };
    prismaMock.conversation.findFirst
      .mockResolvedValueOnce(CONV)   // source lookup
      .mockResolvedValueOnce(target); // target lookup
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/forward', payload: { msgId: 'msg-1', targetConversationIds: ['conv-2'] } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ success: true, forwarded: 1 });
    expect(zaloOpsMock.forwardMessage).toHaveBeenCalledWith('za-1', 'msg-1', 'ext-1', 0);
  });

  it('returns 400 when msgId or targetConversationIds missing', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/forward', payload: { msgId: 'msg-1' } });
    expect(res.statusCode).toBe(400);
  });
});

// ── Pin / Unpin ───────────────────────────────────────────────────────────────
describe('POST /api/v1/conversations/:id/pin', () => {
  it('happy path — pins conversation', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/pin', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.pinConversation).toHaveBeenCalledWith('za-1', true, 'ext-1', 0);
  });
});

describe('POST /api/v1/conversations/:id/unpin', () => {
  it('happy path — unpins conversation', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/unpin', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.pinConversation).toHaveBeenCalledWith('za-1', false, 'ext-1', 0);
  });
});

// ── Sticker ───────────────────────────────────────────────────────────────────
describe('POST /api/v1/conversations/:id/sticker', () => {
  it('happy path — sends sticker and creates message row', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/sticker', payload: { stickerId: 101 } });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.sendSticker).toHaveBeenCalledWith('za-1', 101, 'ext-1', 0);
    expect(prismaMock.message.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ contentType: 'sticker' }) }));
  });

  it('returns 400 when stickerId missing', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/sticker', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'stickerId required' });
  });
});

// ── Link ──────────────────────────────────────────────────────────────────────
describe('POST /api/v1/conversations/:id/link', () => {
  it('happy path — sends link and creates message row', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/link', payload: { url: 'https://example.com' } });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.sendLink).toHaveBeenCalledWith('za-1', 'ext-1', 0, { link: 'https://example.com' });
    expect(prismaMock.message.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ contentType: 'link' }) }));
  });

  it('returns 400 when url is empty', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/link', payload: { url: '  ' } });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'url required' });
  });
});

// ── Card ──────────────────────────────────────────────────────────────────────
describe('POST /api/v1/conversations/:id/card', () => {
  it('happy path — sends card and creates message row', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/card', payload: { contactId: 'contact-99' } });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.sendCard).toHaveBeenCalledWith('za-1', 'ext-1', 0, 'contact-99');
    expect(prismaMock.message.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ contentType: 'contact_card' }) }));
  });

  it('returns 400 when contactId is empty', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'POST', url: '/api/v1/conversations/conv-1/card', payload: { contactId: '' } });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'contactId required' });
  });
});
