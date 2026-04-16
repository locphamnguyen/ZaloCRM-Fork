/**
 * friend-routes.test.ts — Integration tests for Zalo friend management routes.
 * Covers all 18 endpoints across 4 groups: queries, requests, management, privacy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mockUser, mockZaloOps } from './test-helpers.js';

// ── Hoisted mock state ────────────────────────────────────────────────────────
const zaloOpsMock = mockZaloOps();

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    zaloAccount: { findFirst: vi.fn() },
    zaloAccountAccess: { findFirst: vi.fn() },
  },
}));
vi.mock('../src/shared/zalo-operations.js', () => ({
  zaloOps: zaloOpsMock,
  ZaloOpError: class extends Error {
    code: string; statusCode: number;
    constructor(msg: string, code: string, statusCode = 400) {
      super(msg); this.code = code; this.statusCode = statusCode;
    }
  },
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/modules/auth/auth-middleware.js', () => ({
  authMiddleware: async (req: any) => { req.user = mockUser(); },
}));
vi.mock('../src/modules/zalo/zalo-route-helpers.js', () => ({
  resolveAccount: vi.fn().mockResolvedValue({ id: 'za-1', orgId: 'org-1' }),
  checkAccess: vi.fn().mockResolvedValue(true),
  handleError: vi.fn().mockImplementation((reply: any, err: any) => {
    reply.status(500).send({ error: err?.message || 'Error' });
  }),
}));

const { friendRoutes } = await import('../src/modules/zalo/friend-routes.js');

const BASE = '/api/v1/zalo-accounts/za-1/friends';

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(friendRoutes);
  return app;
}

beforeEach(() => { vi.clearAllMocks(); });

// ── Friend Queries ─────────────────────────────────────────────────────────────
describe('Friend Queries', () => {
  it('GET /friends — returns all friends', async () => {
    zaloOpsMock.getAllFriends.mockResolvedValue([{ id: 'u1', name: 'Alice' }]);
    const res = await buildApp().inject({ method: 'GET', url: BASE });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ data: [{ id: 'u1' }] });
    expect(zaloOpsMock.getAllFriends).toHaveBeenCalledWith('za-1');
  });

  it('GET /friends/find — returns search results', async () => {
    zaloOpsMock.findUser.mockResolvedValue([{ id: 'u2' }]);
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/find?q=alice` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ data: [{ id: 'u2' }] });
    expect(zaloOpsMock.findUser).toHaveBeenCalledWith('za-1', 'alice');
  });

  it('GET /friends/find — returns 400 when q missing', async () => {
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/find` });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Query param q is required' });
    expect(zaloOpsMock.findUser).not.toHaveBeenCalled();
  });

  it('GET /friends/online — returns online friends', async () => {
    zaloOpsMock.getFriendOnlines.mockResolvedValue([{ id: 'u3' }]);
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/online` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ data: [{ id: 'u3' }] });
    expect(zaloOpsMock.getFriendOnlines).toHaveBeenCalledWith('za-1');
  });

  it('GET /friends/recommendations — returns suggestions', async () => {
    zaloOpsMock.getFriendRecommendations.mockResolvedValue([{ id: 'u4' }]);
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/recommendations` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ data: [{ id: 'u4' }] });
    expect(zaloOpsMock.getFriendRecommendations).toHaveBeenCalledWith('za-1');
  });

  it('GET /friends/aliases — returns alias list', async () => {
    zaloOpsMock.getAliasList.mockResolvedValue([{ userId: 'u5', alias: 'Bob' }]);
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/aliases` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ data: [{ alias: 'Bob' }] });
    expect(zaloOpsMock.getAliasList).toHaveBeenCalledWith('za-1');
  });
});

// ── Friend Requests ────────────────────────────────────────────────────────────
describe('Friend Requests', () => {
  it('GET /friends/requests/sent — returns sent requests', async () => {
    zaloOpsMock.getSentFriendRequests.mockResolvedValue([{ userId: 'u6' }]);
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/requests/sent` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ data: [{ userId: 'u6' }] });
    expect(zaloOpsMock.getSentFriendRequests).toHaveBeenCalledWith('za-1');
  });

  it('GET /friends/requests/:userId/status — returns request status', async () => {
    zaloOpsMock.getFriendRequestStatus.mockResolvedValue({ status: 'pending' });
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/requests/u7/status` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ data: { status: 'pending' } });
    expect(zaloOpsMock.getFriendRequestStatus).toHaveBeenCalledWith('za-1', 'u7');
  });

  it('POST /friends/requests — sends friend request', async () => {
    zaloOpsMock.sendFriendRequest.mockResolvedValue({ success: true });
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/requests`,
      payload: { userId: 'u8', message: 'Hi!' },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toMatchObject({ data: { success: true } });
    expect(zaloOpsMock.sendFriendRequest).toHaveBeenCalledWith('za-1', 'Hi!', 'u8');
  });

  it('POST /friends/requests — returns 400 when userId missing', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/requests`, payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'userId is required' });
    expect(zaloOpsMock.sendFriendRequest).not.toHaveBeenCalled();
  });

  it('POST /friends/requests/:userId/accept — accepts request', async () => {
    zaloOpsMock.acceptFriendRequest.mockResolvedValue({ success: true });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/requests/u9/accept`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.acceptFriendRequest).toHaveBeenCalledWith('za-1', 'u9');
  });

  it('POST /friends/requests/:userId/reject — rejects request', async () => {
    zaloOpsMock.rejectFriendRequest.mockResolvedValue({ success: true });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/requests/u10/reject`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.rejectFriendRequest).toHaveBeenCalledWith('za-1', 'u10');
  });

  it('DELETE /friends/requests/:userId — cancels sent request', async () => {
    zaloOpsMock.cancelFriendRequest.mockResolvedValue({ success: true });
    const res = await buildApp().inject({ method: 'DELETE', url: `${BASE}/requests/u11` });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.cancelFriendRequest).toHaveBeenCalledWith('za-1', 'u11');
  });
});

// ── Friend Management ──────────────────────────────────────────────────────────
describe('Friend Management', () => {
  it('DELETE /friends/:userId — removes friend', async () => {
    zaloOpsMock.removeFriend.mockResolvedValue({ success: true });
    const res = await buildApp().inject({ method: 'DELETE', url: `${BASE}/u12` });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.removeFriend).toHaveBeenCalledWith('za-1', 'u12');
  });

  it('PUT /friends/:userId/alias — sets alias', async () => {
    zaloOpsMock.changeFriendAlias.mockResolvedValue({ success: true });
    const res = await buildApp().inject({
      method: 'PUT', url: `${BASE}/u13/alias`,
      payload: { alias: 'Bobby' },
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.changeFriendAlias).toHaveBeenCalledWith('za-1', 'Bobby', 'u13');
  });

  it('PUT /friends/:userId/alias — returns 400 when alias missing', async () => {
    const res = await buildApp().inject({
      method: 'PUT', url: `${BASE}/u13/alias`, payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'alias is required' });
    expect(zaloOpsMock.changeFriendAlias).not.toHaveBeenCalled();
  });

  it('DELETE /friends/:userId/alias — removes alias', async () => {
    zaloOpsMock.removeFriendAlias.mockResolvedValue({ success: true });
    const res = await buildApp().inject({ method: 'DELETE', url: `${BASE}/u14/alias` });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.removeFriendAlias).toHaveBeenCalledWith('za-1', 'u14');
  });
});

// ── Privacy ────────────────────────────────────────────────────────────────────
describe('Privacy', () => {
  it('POST /friends/:userId/block — blocks user', async () => {
    zaloOpsMock.blockUser.mockResolvedValue({ success: true });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/u15/block`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.blockUser).toHaveBeenCalledWith('za-1', 'u15');
  });

  it('DELETE /friends/:userId/block — unblocks user', async () => {
    zaloOpsMock.unblockUser.mockResolvedValue({ success: true });
    const res = await buildApp().inject({ method: 'DELETE', url: `${BASE}/u16/block` });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.unblockUser).toHaveBeenCalledWith('za-1', 'u16');
  });

  it('POST /friends/:userId/block-feed — blocks feed', async () => {
    zaloOpsMock.blockViewFeed.mockResolvedValue({ success: true });
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/u17/block-feed`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.blockViewFeed).toHaveBeenCalledWith('za-1', true, 'u17');
  });

  it('DELETE /friends/:userId/block-feed — unblocks feed', async () => {
    zaloOpsMock.blockViewFeed.mockResolvedValue({ success: true });
    const res = await buildApp().inject({ method: 'DELETE', url: `${BASE}/u18/block-feed` });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.blockViewFeed).toHaveBeenCalledWith('za-1', false, 'u18');
  });
});
