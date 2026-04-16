/**
 * group-routes.test.ts — Integration tests for group CRUD and membership management.
 * Covers all 11 handlers in group-routes.ts via Fastify inject().
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

const { groupRoutes } = await import('../src/modules/zalo/group-routes.js');

const BASE = '/api/v1/zalo-accounts/za-1/groups';

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(groupRoutes);
  return app;
}

beforeEach(() => { vi.clearAllMocks(); });

// ── GET all groups ─────────────────────────────────────────────────────────────
describe('GET /api/v1/zalo-accounts/:accountId/groups', () => {
  it('happy path — returns groups list', async () => {
    zaloOpsMock.getAllGroups.mockResolvedValueOnce([{ groupId: 'g1' }]);
    const res = await buildApp().inject({ method: 'GET', url: BASE });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ groups: [{ groupId: 'g1' }] });
    expect(zaloOpsMock.getAllGroups).toHaveBeenCalledWith('za-1');
  });
});

// ── GET group info ─────────────────────────────────────────────────────────────
describe('GET /api/v1/zalo-accounts/:accountId/groups/:groupId', () => {
  it('happy path — returns group info', async () => {
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/g1` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ group: { name: 'Test Group' } });
    expect(zaloOpsMock.getGroupInfo).toHaveBeenCalledWith('za-1', 'g1');
  });
});

// ── POST create group ──────────────────────────────────────────────────────────
describe('POST /api/v1/zalo-accounts/:accountId/groups', () => {
  it('happy path — creates group and returns 201', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: { name: 'New Group', memberIds: ['u1', 'u2'] },
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toMatchObject({ group: { groupId: 'g1' } });
    expect(zaloOpsMock.createGroup).toHaveBeenCalledWith('za-1', { name: 'New Group', memberIds: ['u1', 'u2'] });
  });

  it('returns 400 when name is missing', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: { memberIds: ['u1'] },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'name and memberIds are required' });
  });

  it('returns 400 when memberIds is empty array', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: BASE,
      payload: { name: 'Group', memberIds: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── PATCH rename group ─────────────────────────────────────────────────────────
describe('PATCH /api/v1/zalo-accounts/:accountId/groups/:groupId/name', () => {
  it('happy path — renames group', async () => {
    const res = await buildApp().inject({
      method: 'PATCH', url: `${BASE}/g1/name`,
      payload: { name: 'Renamed' },
    });
    expect(res.statusCode).toBe(200);
    // result is undefined → JSON serialises to {} (undefined keys are dropped)
    expect(JSON.parse(res.body)).toEqual({});
    expect(zaloOpsMock.renameGroup).toHaveBeenCalledWith('za-1', 'Renamed', 'g1');
  });

  it('returns 400 when name is missing', async () => {
    const res = await buildApp().inject({
      method: 'PATCH', url: `${BASE}/g1/name`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'name is required' });
  });
});

// ── PATCH group settings ───────────────────────────────────────────────────────
describe('PATCH /api/v1/zalo-accounts/:accountId/groups/:groupId/settings', () => {
  it('happy path — updates settings', async () => {
    const res = await buildApp().inject({
      method: 'PATCH', url: `${BASE}/g1/settings`,
      payload: { allowAddFriends: true },
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.updateGroupSettings).toHaveBeenCalledWith('za-1', { allowAddFriends: true }, 'g1');
  });
});

// ── POST add members ───────────────────────────────────────────────────────────
describe('POST /api/v1/zalo-accounts/:accountId/groups/:groupId/members', () => {
  it('happy path — adds members', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/members`,
      payload: { userIds: ['u1', 'u2'] },
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.addUserToGroup).toHaveBeenCalledWith('za-1', ['u1', 'u2'], 'g1');
  });

  it('returns 400 when userIds is missing', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/members`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'userIds array is required' });
  });
});

// ── DELETE remove members ──────────────────────────────────────────────────────
describe('DELETE /api/v1/zalo-accounts/:accountId/groups/:groupId/members', () => {
  it('happy path — removes members', async () => {
    const res = await buildApp().inject({
      method: 'DELETE', url: `${BASE}/g1/members`,
      payload: { userIds: ['u1'] },
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.removeUserFromGroup).toHaveBeenCalledWith('za-1', ['u1'], 'g1');
  });

  it('returns 400 when userIds is empty', async () => {
    const res = await buildApp().inject({
      method: 'DELETE', url: `${BASE}/g1/members`,
      payload: { userIds: [] },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ── POST add deputy ────────────────────────────────────────────────────────────
describe('POST /api/v1/zalo-accounts/:accountId/groups/:groupId/deputies', () => {
  it('happy path — adds deputy', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/deputies`,
      payload: { userId: 'u1' },
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.addGroupDeputy).toHaveBeenCalledWith('za-1', 'u1', 'g1');
  });

  it('returns 400 when userId is missing', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/deputies`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'userId is required' });
  });
});

// ── DELETE remove deputy ───────────────────────────────────────────────────────
describe('DELETE /api/v1/zalo-accounts/:accountId/groups/:groupId/deputies/:userId', () => {
  it('happy path — removes deputy', async () => {
    const res = await buildApp().inject({ method: 'DELETE', url: `${BASE}/g1/deputies/u1` });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.removeGroupDeputy).toHaveBeenCalledWith('za-1', 'u1', 'g1');
  });
});

// ── POST transfer ownership ────────────────────────────────────────────────────
describe('POST /api/v1/zalo-accounts/:accountId/groups/:groupId/transfer', () => {
  it('happy path — transfers ownership', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/transfer`,
      payload: { newOwnerId: 'u99' },
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.changeGroupOwner).toHaveBeenCalledWith('za-1', 'u99', 'g1');
  });

  it('returns 400 when newOwnerId is missing', async () => {
    const res = await buildApp().inject({
      method: 'POST', url: `${BASE}/g1/transfer`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'newOwnerId is required' });
  });
});
