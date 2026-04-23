/**
 * ZaloAccountPool — singleton that manages live Zalo SDK instances.
 * Handles QR login, session reconnect, message listener lifecycle,
 * and credential persistence to the database.
 *
 * Note: zca-js is imported via createRequire because its TypeScript
 * declarations don't expose named exports in ESM mode.
 */
import { createRequire } from 'module';
import type { Server } from 'socket.io';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { attachZaloListener, type UserInfoCacheEntry } from './zalo-listener-factory.js';
import { emitWebhook } from '../api/webhook-service.js';
import { startMessageSync, stopMessageSync } from './zalo-message-sync.js';

// zca-js has no reliable ESM type exports — load via CJS interop
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Zalo } = require('zca-js') as { Zalo: new (opts: { logging: boolean; selfListen?: boolean }) => any };

interface ZaloCredentials {
  cookie: any;
  imei: string;
  userAgent: string;
}

interface ZaloInstance {
  zalo: any;
  api: any;
  status: 'connected' | 'disconnected' | 'qr_pending' | 'connecting';
  displayName?: string;
  zaloUid?: string;
  lastActivity: Date;
}

class ZaloAccountPool {
  private instances = new Map<string, ZaloInstance>();
  private io: Server | null = null;
  // Shared user-info cache passed into each listener context
  private userInfoCache = new Map<string, UserInfoCacheEntry>();
  // Circuit breaker: track disconnect timestamps per account
  private disconnectHistory = new Map<string, number[]>();

  setIO(io: Server): void {
    this.io = io;
  }

  // Initiate QR-based login; emits QR events to frontend via Socket.IO
  async loginQR(accountId: string): Promise<void> {
    const zalo = new Zalo({ logging: false, selfListen: true });
    this.instances.set(accountId, { zalo, api: null, status: 'qr_pending', lastActivity: new Date() });

    try {
      const api = await zalo.loginQR({}, (event: any) => {
        switch (event.type) {
          case 0: // QRCodeGenerated
            this.io?.to(`account:${accountId}`).emit('zalo:qr', { accountId, qrImage: event.data.image });
            break;
          case 1: // QRCodeExpired
            this.io?.to(`account:${accountId}`).emit('zalo:qr-expired', { accountId });
            event.actions?.retry();
            break;
          case 2: // QRCodeScanned
            this.io?.to(`account:${accountId}`).emit('zalo:scanned', {
              accountId,
              displayName: event.data.display_name,
              avatar: event.data.avatar,
            });
            break;
          case 4: // GotLoginInfo
            this.saveCredentials(accountId, {
              cookie: event.data.cookie,
              imei: event.data.imei,
              userAgent: event.data.userAgent,
            });
            break;
        }
      });

      const instance = this.instances.get(accountId)!;
      instance.api = api;
      instance.status = 'connected';
      instance.lastActivity = new Date();

      const ownId = await api.getOwnId();
      instance.zaloUid = ownId;

      // Fetch own profile info for avatar
      try {
        const userInfo = await api.getUserInfo(ownId);
        const profiles = userInfo?.changed_profiles || {};
        const profile = profiles[ownId] || profiles[`${ownId}_0`];
        if (profile?.avatar) {
          await prisma.zaloAccount.update({
            where: { id: accountId },
            data: { avatarUrl: profile.avatar, displayName: profile.zaloName || profile.zalo_name || profile.displayName || instance.displayName },
          });
        }
      } catch {}

      this.attachListener(accountId, api);
      this.io?.emit('zalo:connected', { accountId, zaloUid: ownId });
      await this.updateAccountDB(accountId, 'connected', ownId);
      // Emit webhook (orgId lookup is async, fire-and-forget)
      prisma.zaloAccount.findUnique({ where: { id: accountId }, select: { orgId: true } })
        .then((rec) => rec && emitWebhook(rec.orgId, 'zalo.connected', { accountId }))
        .catch(() => {});

      // Fire-and-forget: link orphaned conversations on login
      this.backfillOrphanedConversations(accountId, api).catch((err) => {
        logger.warn(`[zalo:${accountId}] Backfill orphaned conversations failed:`, err);
      });
    } catch (err) {
      const instance = this.instances.get(accountId);
      if (instance) instance.status = 'disconnected';
      this.io?.emit('zalo:error', { accountId, error: String(err) });
      throw err;
    }
  }

  // Reconnect using previously saved session credentials
  async reconnect(accountId: string, credentials: ZaloCredentials): Promise<void> {
    const zalo = new Zalo({ logging: false, selfListen: true });
    this.instances.set(accountId, { zalo, api: null, status: 'connecting', lastActivity: new Date() });

    try {
      const api = await zalo.login({
        cookie: credentials.cookie,
        imei: credentials.imei,
        userAgent: credentials.userAgent,
      });

      const instance = this.instances.get(accountId)!;
      instance.api = api;
      instance.status = 'connected';
      instance.lastActivity = new Date();

      const ownId = await api.getOwnId();
      instance.zaloUid = ownId;

      // Fetch own profile info for avatar
      try {
        const userInfo = await api.getUserInfo(ownId);
        const profiles = userInfo?.changed_profiles || {};
        const profile = profiles[ownId] || profiles[`${ownId}_0`];
        if (profile?.avatar) {
          await prisma.zaloAccount.update({
            where: { id: accountId },
            data: { avatarUrl: profile.avatar, displayName: profile.zaloName || profile.zalo_name || profile.displayName || instance.displayName },
          });
        }
      } catch {}

      this.attachListener(accountId, api);
      await this.updateAccountDB(accountId, 'connected', ownId);
      this.io?.emit('zalo:connected', { accountId, zaloUid: ownId });
      prisma.zaloAccount.findUnique({ where: { id: accountId }, select: { orgId: true } })
        .then((rec) => rec && emitWebhook(rec.orgId, 'zalo.connected', { accountId }))
        .catch(() => {});

      // Fire-and-forget: link orphaned conversations on reconnect
      this.backfillOrphanedConversations(accountId, api).catch((err) => {
        logger.warn(`[zalo:${accountId}] Backfill orphaned conversations failed:`, err);
      });
    } catch (err) {
      const instance = this.instances.get(accountId);
      if (instance) instance.status = 'disconnected';
      await this.updateAccountDB(accountId, 'qr_pending', null);
      this.io?.emit('zalo:reconnect-failed', { accountId, error: String(err) });
    }
  }

  // Delegate listener setup to zalo-listener-factory
  private attachListener(accountId: string, api: any): void {
    attachZaloListener({
      accountId,
      api,
      io: this.io,
      userInfoCache: this.userInfoCache,
      onDisconnected: (id) => {
        const inst = this.instances.get(id);
        if (inst) inst.status = 'disconnected';
        this.updateAccountDB(id, 'disconnected', null);
        stopMessageSync(id);
        // Emit webhook for disconnect (fire-and-forget)
        prisma.zaloAccount.findUnique({ where: { id }, select: { orgId: true } })
          .then((rec) => rec && emitWebhook(rec.orgId, 'zalo.disconnected', { accountId: id }))
          .catch(() => {});

        // Circuit breaker: track disconnect count per account
        const now = Date.now();
        const key = `dc_${id}`;
        const history = (this.disconnectHistory.get(key) || []).filter(t => now - t < 5 * 60_000);
        history.push(now);
        this.disconnectHistory.set(key, history);

        if (history.length >= 5) {
          // >5 disconnects in 5 min → stop reconnecting, require QR re-login
          logger.error(`[zalo:${id}] Circuit breaker: ${history.length} disconnects in 5 min — stopping auto-reconnect. QR re-login required.`);
          this.updateAccountDB(id, 'qr_pending', null);
          this.io?.emit('zalo:reconnect-failed', { accountId: id, error: 'Session không ổn định, cần đăng nhập QR lại' });
          this.disconnectHistory.delete(key);
          return; // DON'T reconnect
        }

        // Normal auto-reconnect after 30 seconds
        setTimeout(() => this.autoReconnect(id), 30_000);
      },
    });

    // Start periodic group message sync backup
    startMessageSync(api, accountId);
  }

  // Persist session credentials to DB
  private saveCredentials(accountId: string, credentials: ZaloCredentials): void {
    prisma.zaloAccount
      .update({ where: { id: accountId }, data: { sessionData: credentials as any } })
      .catch((err) => logger.error(`[zalo:${accountId}] saveCredentials error:`, err));
  }

  // Sync account status and zaloUid to DB
  private async updateAccountDB(accountId: string, status: string, zaloUid: string | null): Promise<void> {
    try {
      await prisma.zaloAccount.update({
        where: { id: accountId },
        data: {
          status,
          ...(zaloUid !== null ? { zaloUid } : {}),
          ...(status === 'connected' ? { lastConnectedAt: new Date() } : {}),
        },
      });
    } catch (err) {
      logger.error(`[zalo:${accountId}] updateAccountDB error:`, err);
    }
  }

  // Auto-reconnect using saved session from DB
  private async autoReconnect(accountId: string): Promise<void> {
    const inst = this.instances.get(accountId);
    // Skip if already reconnected or manually disconnected
    if (inst?.status === 'connected') return;

    try {
      const account = await prisma.zaloAccount.findUnique({
        where: { id: accountId },
        select: { sessionData: true },
      });
      const session = account?.sessionData as ZaloCredentials | null;
      if (session?.imei) {
        logger.info(`[zalo:${accountId}] Auto-reconnecting...`);
        await this.reconnect(accountId, session);
      } else {
        logger.warn(`[zalo:${accountId}] No saved session, cannot auto-reconnect`);
        this.io?.emit('zalo:reconnect-failed', { accountId, error: 'No saved session' });
      }
    } catch (err) {
      logger.error(`[zalo:${accountId}] Auto-reconnect failed:`, err);
      // Retry again in 2 minutes
      setTimeout(() => this.autoReconnect(accountId), 120_000);
    }
  }

  // Stop listener and remove from pool
  disconnect(accountId: string): void {
    const instance = this.instances.get(accountId);
    if (instance?.api?.listener) {
      try { instance.api.listener.stop(); } catch (err) {
        logger.warn(`[zalo:${accountId}] Error stopping listener:`, err);
      }
    }
    stopMessageSync(accountId);
    this.instances.delete(accountId);
  }

  getStatus(accountId: string): string {
    return this.instances.get(accountId)?.status ?? 'disconnected';
  }

  getAllStatuses(): Record<string, string> {
    const statuses: Record<string, string> = {};
    for (const [id, inst] of this.instances) statuses[id] = inst.status;
    return statuses;
  }

  // Return raw API instance for direct SDK calls (e.g. public API send message)
  getApi(accountId: string): any | null {
    const inst = this.instances.get(accountId);
    return inst?.status === 'connected' ? inst.api : null;
  }

  getInstance(accountId: string): ZaloInstance | undefined {
    return this.instances.get(accountId);
  }

  // Link orphaned conversations (contactId is null) to contacts via Zalo API
  private async backfillOrphanedConversations(accountId: string, api: any): Promise<void> {
    const account = await prisma.zaloAccount.findUnique({
      where: { id: accountId },
      select: { orgId: true },
    });
    if (!account) return;

    const orphaned = await prisma.conversation.findMany({
      where: { zaloAccountId: accountId, contactId: null, threadType: 'user' },
      select: { id: true, externalThreadId: true },
    });

    if (orphaned.length === 0) return;
    logger.info(`[zalo:${accountId}] Backfilling ${orphaned.length} orphaned conversation(s)`);

    for (const conv of orphaned) {
      const uid = conv.externalThreadId;
      if (!uid) continue;

      let contact = await prisma.contact.findFirst({
        where: { zaloUid: uid, orgId: account.orgId },
        select: { id: true },
      });

      if (!contact) {
        let zaloName = '';
        let avatar = '';
        let phone = '';
        try {
          const result = await api.getUserInfo(uid);
          const profiles = result?.changed_profiles || {};
          const profile = profiles[uid] || profiles[`${uid}_0`];
          if (profile) {
            zaloName = profile.zaloName || profile.zalo_name || profile.displayName || profile.display_name || '';
            avatar = profile.avatar || '';
            phone = profile.phoneNumber || '';
          }
        } catch (err) {
          logger.warn(`[zalo:${accountId}] getUserInfo failed for ${uid}:`, err);
        }

        const { randomUUID } = await import('node:crypto');
        contact = await prisma.contact.create({
          data: {
            id: randomUUID(),
            orgId: account.orgId,
            zaloUid: uid,
            fullName: zaloName || 'Unknown',
            avatarUrl: avatar || null,
            phone: phone || null,
          },
          select: { id: true },
        });
      }

      await prisma.conversation.update({
        where: { id: conv.id },
        data: { contactId: contact.id },
      });
    }

    logger.info(`[zalo:${accountId}] Backfill complete: ${orphaned.length} conversation(s) linked`);
  }
}

export const zaloPool = new ZaloAccountPool();
