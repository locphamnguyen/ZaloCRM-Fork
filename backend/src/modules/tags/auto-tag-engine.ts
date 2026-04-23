/**
 * auto-tag-engine.ts — Evaluates auto-tag rules against incoming events.
 * Operators: eq, ne, contains, in, gte, lte, regex, hasReplied.
 * Idempotent: ContactTagLink @@unique([contactId,tagId]) prevents duplicates.
 * Loop guard: engine reacts only to external events, never fires tag_applied itself.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { enqueueAdd } from './zalo-tag-sync-queue.js';

export interface TagEvent {
  type: string;       // 'message_received' | 'contact_updated'
  orgId: string;
  contactId: string;
  payload: Record<string, any>;
}

// ── DSL Condition Types ───────────────────────────────────────────────────────

interface SingleCondition {
  field: string;
  op: 'eq' | 'ne' | 'contains' | 'in' | 'gte' | 'lte' | 'regex' | 'hasReplied';
  value?: any;
}

interface CompositeCondition {
  all?: Array<SingleCondition | CompositeCondition>;
  any?: Array<SingleCondition | CompositeCondition>;
}

type Condition = SingleCondition | CompositeCondition;

// ── Field Resolver ────────────────────────────────────────────────────────────

function resolveField(path: string, payload: Record<string, any>): any {
  return path.split('.').reduce((obj: any, key) => obj?.[key], payload);
}

// ── Single Condition Matcher ──────────────────────────────────────────────────

function evalSingle(cond: SingleCondition, payload: Record<string, any>): boolean {
  if (cond.op === 'hasReplied') {
    // Special operator: checks payload.conversation.isReplied
    return Boolean(resolveField('conversation.isReplied', payload));
  }

  const actual = resolveField(cond.field, payload);

  switch (cond.op) {
    case 'eq':      return actual === cond.value;
    case 'ne':      return actual !== cond.value;
    case 'contains':
      if (typeof actual !== 'string') return false;
      return actual.toLowerCase().includes(String(cond.value ?? '').toLowerCase());
    case 'in':
      if (!Array.isArray(cond.value)) return false;
      return cond.value.includes(actual);
    case 'gte':     return actual >= cond.value;
    case 'lte':     return actual <= cond.value;
    case 'regex': {
      try {
        return new RegExp(String(cond.value)).test(String(actual ?? ''));
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

// ── Recursive Condition Matcher (exported for dry-run) ───────────────────────

export function matchesCondition(condition: Condition, payload: Record<string, any>): boolean {
  if ('all' in condition && Array.isArray(condition.all)) {
    return condition.all.every(c => matchesCondition(c as Condition, payload));
  }
  if ('any' in condition && Array.isArray(condition.any)) {
    return condition.any.some(c => matchesCondition(c as Condition, payload));
  }
  // Single condition
  return evalSingle(condition as SingleCondition, payload);
}

// ── Tag Application (idempotent) ──────────────────────────────────────────────

interface ApplyTagInput {
  contactId: string;
  tagId: string;
  source: string;
  appliedBy: string;
}

async function applyTag(input: ApplyTagInput): Promise<boolean> {
  const existing = await prisma.contactTagLink.findFirst({
    where: { contactId: input.contactId, tagId: input.tagId },
  });
  if (existing) return false; // already applied

  await prisma.contactTagLink.create({
    data: {
      id: randomUUID(),
      contactId: input.contactId,
      tagId: input.tagId,
      source: input.source,
      appliedBy: input.appliedBy,
    },
  });
  return true;
}

// ── Main Evaluate Function ────────────────────────────────────────────────────

export async function evaluate(event: TagEvent): Promise<void> {
  const rules = await prisma.autoTagRule.findMany({
    where: { orgId: event.orgId, event: event.type, enabled: true },
    include: { tag: true },
  });

  for (const rule of rules) {
    try {
      if (!matchesCondition(rule.condition as Condition, event.payload)) continue;

      const applied = await applyTag({
        contactId: event.contactId,
        tagId: rule.tagId,
        source: rule.tag.source,
        appliedBy: `auto-rule:${rule.id}`,
      });

      if (applied && rule.tag.source === 'zalo') {
        // Enqueue Zalo sync if contact has a zaloUid
        const contact = await prisma.contact.findUnique({
          where: { id: event.contactId },
          select: { zaloUid: true },
        });
        if (contact?.zaloUid) {
          const conversation = await prisma.conversation.findFirst({
            where: { contactId: event.contactId, threadType: 'user' },
            select: { zaloAccountId: true },
          });
          if (conversation?.zaloAccountId) {
            await enqueueAdd(conversation.zaloAccountId, contact.zaloUid, rule.tag.name);
          }
        }
      }
    } catch (err) {
      logger.warn(`[auto-tag-engine] Rule ${rule.id} evaluation error:`, err);
    }
  }
}
