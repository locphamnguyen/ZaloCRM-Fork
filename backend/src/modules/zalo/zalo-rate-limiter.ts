/**
 * zalo-rate-limiter.ts — Per-account, per-operation-type rate limiting.
 * Prevents Zalo from blocking accounts by enforcing daily + burst limits
 * for each operation category (messages, reactions, group admin, etc.).
 *
 * In-memory with optional Redis persistence (TODO: Redis backing).
 * Fail-open: if checking fails, operations are allowed through.
 */
import type { OpCategory } from '../../shared/zalo-operations.js';

// ── Per-category limits ─────────────────────────────────────────────────────
interface CategoryLimit {
  daily: number;
  burst: number;       // max ops in burst window
  burstWindowMs: number;
}

const CATEGORY_LIMITS: Record<OpCategory, CategoryLimit> = {
  message:       { daily: 200,  burst: 5,  burstWindowMs: 30_000 },
  reaction:      { daily: 300,  burst: 10, burstWindowMs: 30_000 },
  chat_action:   { daily: 500,  burst: 15, burstWindowMs: 30_000 },
  group_admin:   { daily: 50,   burst: 5,  burstWindowMs: 60_000 },
  group_read:    { daily: 1000, burst: 20, burstWindowMs: 30_000 },
  friend_action: { daily: 30,   burst: 3,  burstWindowMs: 60_000 },
  friend_read:   { daily: 500,  burst: 10, burstWindowMs: 30_000 },
  profile:       { daily: 10,   burst: 3,  burstWindowMs: 60_000 },
  query:         { daily: 2000, burst: 30, burstWindowMs: 30_000 },
};

// ── Internal tracking ───────────────────────────────────────────────────────
interface DailyCounter {
  count: number;
  date: string; // YYYY-MM-DD
}

class ZaloRateLimiter {
  // Key: `${accountId}:${category}`
  private dailyCounts = new Map<string, DailyCounter>();
  private recentSends = new Map<string, number[]>();

  /**
   * Check if an operation is allowed.
   * Backward-compatible: category defaults to 'message' for existing callers.
   */
  checkLimits(accountId: string, category: OpCategory = 'message'): { allowed: boolean; reason?: string } {
    try {
      const limits = CATEGORY_LIMITS[category] || CATEGORY_LIMITS.message;
      const key = `${accountId}:${category}`;
      const today = new Date().toISOString().split('T')[0];

      // Daily limit
      const daily = this.dailyCounts.get(key);
      if (daily && daily.date === today && daily.count >= limits.daily) {
        return { allowed: false, reason: `Đã đạt giới hạn ${limits.daily} ${category}/ngày` };
      }

      // Burst limit
      const now = Date.now();
      const recent = (this.recentSends.get(key) || []).filter(t => now - t < limits.burstWindowMs);
      if (recent.length >= limits.burst) {
        const windowSec = Math.round(limits.burstWindowMs / 1000);
        return { allowed: false, reason: `Quá nhanh (>${limits.burst} ${category}/${windowSec}s)` };
      }

      return { allowed: true };
    } catch {
      // Fail-open: allow operation if rate limiter itself errors
      return { allowed: true };
    }
  }

  /**
   * Record a successful operation.
   * Backward-compatible: category defaults to 'message'.
   */
  recordSend(accountId: string, category: OpCategory = 'message'): void {
    const key = `${accountId}:${category}`;
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // Update burst window
    const recent = (this.recentSends.get(key) || []).filter(t => now - t < 60_000);
    recent.push(now);
    this.recentSends.set(key, recent);

    // Update daily count
    const daily = this.dailyCounts.get(key);
    if (daily && daily.date === today) {
      daily.count++;
    } else {
      this.dailyCounts.set(key, { count: 1, date: today });
    }
  }

  /** Get daily count for an account + category */
  getDailyCount(accountId: string, category: OpCategory = 'message'): number {
    const key = `${accountId}:${category}`;
    const today = new Date().toISOString().split('T')[0];
    const daily = this.dailyCounts.get(key);
    return daily && daily.date === today ? daily.count : 0;
  }

  /** Get all daily counts for an account (dashboard view) */
  getAllDailyCounts(accountId: string): Record<string, number> {
    const today = new Date().toISOString().split('T')[0];
    const result: Record<string, number> = {};
    for (const cat of Object.keys(CATEGORY_LIMITS)) {
      const key = `${accountId}:${cat}`;
      const daily = this.dailyCounts.get(key);
      result[cat] = daily && daily.date === today ? daily.count : 0;
    }
    return result;
  }

  /** Get limits config (for dashboard display) */
  getLimitsConfig(): Record<string, CategoryLimit> {
    return { ...CATEGORY_LIMITS };
  }
}

export const zaloRateLimiter = new ZaloRateLimiter();
