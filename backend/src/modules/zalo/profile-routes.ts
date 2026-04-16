/**
 * profile-routes.ts — REST API for Zalo account profile management.
 * Ports openzca `me` commands: info, last-online, avatar, status.
 * All routes scoped to /api/v1/zalo-accounts/:accountId/profile and require JWT auth.
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { resolveAccount, checkAccess, handleError } from './zalo-route-helpers.js';

const BASE = '/api/v1/zalo-accounts/:accountId/profile';

export async function profileRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  // GET .../profile — get Zalo account info
  app.get(BASE, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const { orgId } = request.user!;
    try {
      await resolveAccount(accountId, orgId);
      if (!await checkAccess(request, reply, accountId, 'read')) return;
      const result = await zaloOps.getAccountInfo(accountId);
      return { profile: result };
    } catch (err) {
      return handleError(reply, err, 'getAccountInfo');
    }
  });

  // GET .../profile/last-online/:userId — get last online time for a user
  app.get(`${BASE}/last-online/:userId`, async (request, reply) => {
    const { accountId, userId } = request.params as { accountId: string; userId: string };
    const { orgId } = request.user!;
    try {
      await resolveAccount(accountId, orgId);
      if (!await checkAccess(request, reply, accountId, 'read')) return;
      const result = await zaloOps.getLastOnline(accountId, userId);
      return { lastOnline: result };
    } catch (err) {
      return handleError(reply, err, 'getLastOnline');
    }
  });

  // PATCH .../profile/avatar — change Zalo account avatar
  app.patch(`${BASE}/avatar`, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const { filePath } = request.body as { filePath: string };
    const { orgId } = request.user!;
    if (!filePath) return reply.status(400).send({ error: 'filePath is required' });
    try {
      await resolveAccount(accountId, orgId);
      if (!await checkAccess(request, reply, accountId, 'admin')) return;
      const result = await zaloOps.changeAccountAvatar(accountId, filePath);
      return { success: true, result };
    } catch (err) {
      return handleError(reply, err, 'changeAccountAvatar');
    }
  });

  // PUT .../profile/status — set online/offline status
  app.put(`${BASE}/status`, async (request, reply) => {
    const { accountId } = request.params as { accountId: string };
    const { status } = request.body as { status: string };
    const { orgId } = request.user!;
    if (status !== 'online' && status !== 'offline') {
      return reply.status(400).send({ error: "status must be 'online' or 'offline'" });
    }
    try {
      await resolveAccount(accountId, orgId);
      if (!await checkAccess(request, reply, accountId, 'admin')) return;
      await zaloOps.setOnlineStatus(accountId, status === 'online');
      return { success: true };
    } catch (err) {
      return handleError(reply, err, 'setOnlineStatus');
    }
  });
}
