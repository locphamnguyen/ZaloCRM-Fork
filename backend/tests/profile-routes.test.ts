/**
 * profile-routes.test.ts — Integration tests for Zalo profile management routes.
 * Covers all 4 endpoints: get profile, last-online, avatar, status.
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

const { profileRoutes } = await import('../src/modules/zalo/profile-routes.js');

const BASE = '/api/v1/zalo-accounts/za-1/profile';

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(profileRoutes);
  return app;
}

beforeEach(() => { vi.clearAllMocks(); });

// ── GET profile ───────────────────────────────────────────────────────────────
describe('GET /profile', () => {
  it('happy path — returns account profile', async () => {
    zaloOpsMock.getAccountInfo.mockResolvedValue({ name: 'Test User', uid: 'uid-1' });
    const res = await buildApp().inject({ method: 'GET', url: BASE });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ profile: { name: 'Test User', uid: 'uid-1' } });
    expect(zaloOpsMock.getAccountInfo).toHaveBeenCalledWith('za-1');
  });

  it('returns 500 when zaloOps throws', async () => {
    zaloOpsMock.getAccountInfo.mockRejectedValue(new Error('Zalo down'));
    const res = await buildApp().inject({ method: 'GET', url: BASE });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'Zalo down' });
  });
});

// ── GET last-online ───────────────────────────────────────────────────────────
describe('GET /profile/last-online/:userId', () => {
  it('happy path — returns last online timestamp', async () => {
    const ts = 1700000000000;
    zaloOpsMock.getLastOnline.mockResolvedValue({ lastOnline: ts });
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/last-online/u1` });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ lastOnline: { lastOnline: ts } });
    expect(zaloOpsMock.getLastOnline).toHaveBeenCalledWith('za-1', 'u1');
  });

  it('returns 500 when zaloOps throws', async () => {
    zaloOpsMock.getLastOnline.mockRejectedValue(new Error('lookup failed'));
    const res = await buildApp().inject({ method: 'GET', url: `${BASE}/last-online/u1` });
    expect(res.statusCode).toBe(500);
  });
});

// ── PATCH avatar ──────────────────────────────────────────────────────────────
describe('PATCH /profile/avatar', () => {
  it('happy path — changes avatar and returns success', async () => {
    zaloOpsMock.changeAccountAvatar.mockResolvedValue(undefined);
    const res = await buildApp().inject({
      method: 'PATCH', url: `${BASE}/avatar`,
      payload: { filePath: '/tmp/avatar.jpg' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ success: true });
    expect(zaloOpsMock.changeAccountAvatar).toHaveBeenCalledWith('za-1', '/tmp/avatar.jpg');
  });

  it('returns 400 when filePath missing', async () => {
    const res = await buildApp().inject({
      method: 'PATCH', url: `${BASE}/avatar`, payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: 'filePath is required' });
    expect(zaloOpsMock.changeAccountAvatar).not.toHaveBeenCalled();
  });
});

// ── PUT status ────────────────────────────────────────────────────────────────
describe('PUT /profile/status', () => {
  it('happy path — sets online status', async () => {
    zaloOpsMock.setOnlineStatus.mockResolvedValue(undefined);
    const res = await buildApp().inject({
      method: 'PUT', url: `${BASE}/status`,
      payload: { status: 'online' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ success: true });
    expect(zaloOpsMock.setOnlineStatus).toHaveBeenCalledWith('za-1', true);
  });

  it('happy path — sets offline status', async () => {
    zaloOpsMock.setOnlineStatus.mockResolvedValue(undefined);
    const res = await buildApp().inject({
      method: 'PUT', url: `${BASE}/status`,
      payload: { status: 'offline' },
    });
    expect(res.statusCode).toBe(200);
    expect(zaloOpsMock.setOnlineStatus).toHaveBeenCalledWith('za-1', false);
  });

  it('returns 400 for invalid status value', async () => {
    const res = await buildApp().inject({
      method: 'PUT', url: `${BASE}/status`,
      payload: { status: 'away' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ error: "status must be 'online' or 'offline'" });
    expect(zaloOpsMock.setOnlineStatus).not.toHaveBeenCalled();
  });

  it('returns 400 when status is missing', async () => {
    const res = await buildApp().inject({
      method: 'PUT', url: `${BASE}/status`, payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(zaloOpsMock.setOnlineStatus).not.toHaveBeenCalled();
  });
});
