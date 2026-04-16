/**
 * group-moderation-routes.ts — Group moderation, links, lifecycle, and polls.
 * Routes: /api/v1/zalo-accounts/:accountId/groups/:groupId/...
 */
import type { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/auth-middleware.js';
import { zaloOps } from '../../shared/zalo-operations.js';
import { resolveAccount, checkAccess, handleError } from './zalo-route-helpers.js';

export async function groupModerationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  const BASE = '/api/v1/zalo-accounts/:accountId/groups';

  // ── Moderation ──────────────────────────────────────────────────────────────

  app.post<{ Params: { accountId: string; groupId: string }; Body: { userId: string } }>(`${BASE}/:groupId/block`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { userId } = request.body ?? {};
    if (!userId) return reply.status(400).send({ error: 'userId is required' });
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.blockGroupMember(accountId, userId, groupId) };
    } catch (err) { return handleError(reply, err, 'blockGroupMember'); }
  });

  app.delete<{ Params: { accountId: string; groupId: string; userId: string } }>(`${BASE}/:groupId/block/:userId`, async (request, reply) => {
    const { accountId, groupId, userId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.unblockGroupMember(accountId, userId, groupId) };
    } catch (err) { return handleError(reply, err, 'unblockGroupMember'); }
  });

  app.get<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/blocked`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      return { blocked: await zaloOps.getGroupBlockedMembers(accountId, groupId) };
    } catch (err) { return handleError(reply, err, 'getGroupBlockedMembers'); }
  });

  app.get<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/pending`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      return { pending: await zaloOps.getPendingGroupMembers(accountId, groupId) };
    } catch (err) { return handleError(reply, err, 'getPendingGroupMembers'); }
  });

  // ── Links ───────────────────────────────────────────────────────────────────

  app.get<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/link`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      return { link: await zaloOps.getGroupLinkDetail(accountId, groupId) };
    } catch (err) { return handleError(reply, err, 'getGroupLinkDetail'); }
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  app.post<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/leave`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.leaveGroup(accountId, groupId) };
    } catch (err) { return handleError(reply, err, 'leaveGroup'); }
  });

  app.post<{ Params: { accountId: string; groupId: string } }>(`${BASE}/:groupId/disperse`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.disperseGroup(accountId, groupId) };
    } catch (err) { return handleError(reply, err, 'disperseGroup'); }
  });

  // ── Polls ───────────────────────────────────────────────────────────────────

  app.post<{
    Params: { accountId: string; groupId: string };
    Body: { question: string; options: string[]; multi?: boolean; anonymous?: boolean; expireMs?: number };
  }>(`${BASE}/:groupId/polls`, async (request, reply) => {
    const { accountId, groupId } = request.params;
    const { question, options, multi, anonymous, expireMs } = request.body ?? {};
    if (!question || !Array.isArray(options) || options.length < 2) {
      return reply.status(400).send({ error: 'question and at least 2 options are required' });
    }
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      const pollOptions = { question, options, multi: multi ?? false, anonymous: anonymous ?? false, expireMs };
      return reply.status(201).send({ poll: await zaloOps.createPoll(accountId, pollOptions, groupId) });
    } catch (err) { return handleError(reply, err, 'createPoll'); }
  });

  app.get<{ Params: { accountId: string; groupId: string; pollId: string } }>(`${BASE}/:groupId/polls/:pollId`, async (request, reply) => {
    const { accountId, pollId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'read'))) return;
      return { poll: await zaloOps.getPollDetail(accountId, pollId) };
    } catch (err) { return handleError(reply, err, 'getPollDetail'); }
  });

  app.post<{
    Params: { accountId: string; groupId: string; pollId: string };
    Body: { optionIds: number[] };
  }>(`${BASE}/:groupId/polls/:pollId/vote`, async (request, reply) => {
    const { accountId, groupId, pollId } = request.params;
    const { optionIds } = request.body ?? {};
    if (!Array.isArray(optionIds) || optionIds.length === 0) {
      return reply.status(400).send({ error: 'optionIds array is required' });
    }
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'chat'))) return;
      return { result: await zaloOps.votePoll(accountId, pollId, optionIds, groupId) };
    } catch (err) { return handleError(reply, err, 'votePoll'); }
  });

  app.post<{ Params: { accountId: string; groupId: string; pollId: string } }>(`${BASE}/:groupId/polls/:pollId/lock`, async (request, reply) => {
    const { accountId, pollId } = request.params;
    try {
      await resolveAccount(accountId, request.user!.orgId);
      if (!(await checkAccess(request, reply, accountId, 'admin'))) return;
      return { result: await zaloOps.lockPoll(accountId, pollId) };
    } catch (err) { return handleError(reply, err, 'lockPoll'); }
  });
}
