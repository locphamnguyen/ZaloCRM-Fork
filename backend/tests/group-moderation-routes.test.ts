/**
 * group-moderation-routes.test.ts — Integration tests for group moderation and polls.
 * Covers all handlers in group-moderation-routes.ts via Fastify inject().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { mockUser, mockZaloOps } from './test-helpers.js';

// ── Hoisted mock state ─────────────────────────────────────────────────────────
const zaloOpsMock = mockZaloOps();

vi.mock('../src/shared/database/prisma-client.js', () => ({
  prisma: {
    zaloAccount: { findFirst: vi.fn() },
    zaloAccountAccess: { findFirst: vi.fn() },
    groupPoll: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
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
  handleError: vi.fn().mockImplementation((reply: any, err: any, _op: string) => {
    reply.status(500).send({ error: err?.message ?? 'Error' });
  }),
}));

const { groupModerationRoutes } = await import('../src/modules/zalo/group-moderation-routes.js');

const BASE = '/api/v1/zalo-accounts/za-1/groups';

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(groupModerationRoutes);
  return app;
}

beforeEach(() => { vi.clearAllMocks(); });

// ── POST block member ──────────────────────────────────────────────────────────
describe('POST .../groups/:groupId/block', () => {
  it('happy path — blocks member', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/block`,
      payload: { userId: 'u1' },
    });
    expect(res.statusCode).toBe(200);
    // result is undefined → JSON serialises to {} (undefined keys are dropped)
    expect(JSON.parse(res.body)).toEqual({});
    expect(zaloOpsMock.blockGroupMember).toHaveBeenCalledWith('za-1', 'u1', 'g1');
  });

  it('returns 400 when userId is missing', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/block`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'userId is required' });
  });
});

// ── DELETE unblock member ──────────────────────────────────────────────────────
describe('DELETE .../groups/:groupId/block/:userId', () => {
  it('happy path — unblocks member', async () => {
    const res = await buildApp().inject({ method: 'DELETE', url: `${BASE}/g1/block/u1` });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.unblockGroupMember).toHaveBeenCalledWith('za-1', 'u1', 'g1');
  });
});

// ── GET pending members ────────────────────────────────────────────────────────
describe('GET .../groups/:groupId/pending', () => {
  it('happy path — returns pending members', async () => {
    zaloOpsMock.getPendingGroupMembers.mockResolvedValueOnce([{ uid: 'u2' }]);
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/g1/pending` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ pending: [{ uid: 'u2' }] });
    expect(zaloOpsMock.getPendingGroupMembers).toHaveBeenCalledWith('za-1', 'g1');
  });
});

// ── GET blocked members ────────────────────────────────────────────────────────
describe('GET .../groups/:groupId/blocked', () => {
  it('happy path — returns blocked members', async () => {
    zaloOpsMock.getGroupBlockedMembers.mockResolvedValueOnce([{ uid: 'u3' }]);
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/g1/blocked` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ blocked: [{ uid: 'u3' }] });
    expect(zaloOpsMock.getGroupBlockedMembers).toHaveBeenCalledWith('za-1', 'g1');
  });
});

// ── GET group link ─────────────────────────────────────────────────────────────
describe('GET .../groups/:groupId/link', () => {
  it('happy path — returns link detail', async () => {
    zaloOpsMock.getGroupLinkDetail.mockResolvedValueOnce({ link: 'https://zalo.me/g/abc' });
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/g1/link` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ link: { link: 'https://zalo.me/g/abc' } });
    expect(zaloOpsMock.getGroupLinkDetail).toHaveBeenCalledWith('za-1', 'g1');
  });
});

// ── POST leave group ───────────────────────────────────────────────────────────
describe('POST .../groups/:groupId/leave', () => {
  it('happy path — leaves group', async () => {
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/g1/leave`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.leaveGroup).toHaveBeenCalledWith('za-1', 'g1');
  });
});

// ── POST disperse group ────────────────────────────────────────────────────────
describe('POST .../groups/:groupId/disperse', () => {
  it('happy path — disperses group', async () => {
    const res = await buildApp().inject({ method: 'POST', url: `${BASE}/g1/disperse`, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.disperseGroup).toHaveBeenCalledWith('za-1', 'g1');
  });
});

// ── POST create poll ───────────────────────────────────────────────────────────
describe('POST .../groups/:groupId/polls', () => {
  it('happy path — creates poll and returns 201', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/polls`,
      payload: { question: 'Lunch?', options: ['Pizza', 'Sushi'], multi: false, anonymous: true },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toMatchObject({ poll: { pollId: 'p1' } });
    expect(zaloOpsMock.createPoll).toHaveBeenCalledWith(
      'za-1',
      { question: 'Lunch?', options: ['Pizza', 'Sushi'], multi: false, anonymous: true, expireMs: undefined },
      'g1',
    );
  });

  it('returns 400 when question is missing', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/polls`,
      payload: { options: ['A', 'B'] },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'question and at least 2 options are required' });
  });

  it('returns 400 when fewer than 2 options provided', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/polls`,
      payload: { question: 'Q?', options: ['Only one'] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── GET poll detail ────────────────────────────────────────────────────────────
describe('GET .../groups/:groupId/polls/:pollId', () => {
  it('happy path — returns poll detail', async () => {
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/g1/polls/p1` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ poll: { question: 'Q?' } });
    expect(zaloOpsMock.getPollDetail).toHaveBeenCalledWith('za-1', 'p1');
  });
});

// ── POST vote on poll ──────────────────────────────────────────────────────────
describe('POST .../groups/:groupId/polls/:pollId/vote', () => {
  it('happy path — records vote', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/polls/p1/vote`,
      payload: { optionIds: [0, 2] },
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.votePoll).toHaveBeenCalledWith('za-1', 'p1', [0, 2], 'g1');
  });

  it('returns 400 when optionIds is empty', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/polls/p1/vote`,
      payload: { optionIds: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'optionIds array is required' });
  });
});

// ── POST lock poll ─────────────────────────────────────────────────────────────
describe('POST .../groups/:groupId/polls/:pollId/lock', () => {
  it('happy path — locks poll', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/polls/p1/lock`,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.lockPoll).toHaveBeenCalledWith('za-1', 'p1');
  });
});
