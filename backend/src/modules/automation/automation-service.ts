import { prisma } from '../../shared/database/prisma-client.js';
import { logger } from '../../shared/utils/logger.js';
import { assignUserAction } from './actions/assign-user-action.js';
import { updateStatusAction } from './actions/update-status-action.js';
import { createAppointmentAction } from './actions/create-appointment-action.js';
import { sendTemplateAction } from './actions/send-template-action.js';

export type AutomationTriggerType = 'message_received' | 'contact_created' | 'status_changed';

type AutomationCondition = {
  field: string;
  op: 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'lt' | 'is_empty' | 'is_not_empty';
  value?: unknown;
};

type AutomationAction =
  | { type: 'assign_user'; userId: string }
  | { type: 'send_template'; templateId: string }
  | { type: 'update_status'; status: string }
  | { type: 'create_appointment'; offsetHours?: number; typeLabel?: string; notes?: string };

export interface AutomationContext {
  trigger: AutomationTriggerType;
  orgId: string;
  initiatedByAutomation?: boolean;
  _depth?: number;
  contact?: { id: string; fullName: string | null; crmName?: string | null; phone: string | null; status: string | null; source?: string | null; assignedUserId?: string | null } | null;
  conversation?: { id: string; unreadCount?: number; threadId?: string | null; threadType?: string; zaloAccountId?: string } | null;
  message?: { id: string; content: string | null; contentType: string; senderType?: string } | null;
  org?: { id: string; name: string | null } | null;
}

const MAX_AUTOMATION_DEPTH = 3;

export async function runAutomationRules(context: AutomationContext): Promise<void> {
  if (context.initiatedByAutomation) return;

  const depth = context._depth ?? 0;
  if (depth >= MAX_AUTOMATION_DEPTH) {
    logger.warn('[automation] Max recursion depth reached, skipping');
    return;
  }

  const rules = await prisma.automationRule.findMany({
    where: { orgId: context.orgId, trigger: context.trigger, enabled: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });

  for (const rule of rules) {
    try {
      const conditions = Array.isArray(rule.conditions) ? (rule.conditions as unknown as AutomationCondition[]) : [];
      const actions = Array.isArray(rule.actions) ? (rule.actions as unknown as AutomationAction[]) : [];
      if (!matchesConditions(conditions, context)) continue;

      for (const action of actions) {
        await executeAction(action, context);
      }

      await prisma.automationRule.update({
        where: { id: rule.id },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      });
    } catch (error) {
      logger.error(`[automation] Rule "${rule.name}" (${rule.id}) execution failed:`, error);
    }
  }
}

function matchesConditions(conditions: AutomationCondition[], context: AutomationContext): boolean {
  return conditions.every((condition) => evaluateCondition(condition, context));
}

function evaluateCondition(condition: AutomationCondition, context: AutomationContext): boolean {
  const current = getFieldValue(condition.field, context);

  switch (condition.op) {
    case 'eq': return current === condition.value;
    case 'neq': return current !== condition.value;
    case 'contains': return String(current ?? '').toLowerCase().includes(String(condition.value ?? '').toLowerCase());
    case 'in': return Array.isArray(condition.value) ? condition.value.includes(current) : false;
    case 'gt': return Number(current ?? 0) > Number(condition.value ?? 0);
    case 'lt': return Number(current ?? 0) < Number(condition.value ?? 0);
    case 'is_empty': return current === null || current === undefined || current === '';
    case 'is_not_empty': return !(current === null || current === undefined || current === '');
    default: return false;
  }
}

function getFieldValue(field: string, context: AutomationContext): unknown {
  switch (field) {
    case 'contact.source': return context.contact?.source;
    case 'contact.status': return context.contact?.status;
    case 'contact.assignedUserId': return context.contact?.assignedUserId;
    case 'message.content': return context.message?.content;
    case 'message.contentType': return context.message?.contentType;
    case 'conversation.unreadCount': return context.conversation?.unreadCount;
    default: return undefined;
  }
}

async function executeAction(action: AutomationAction, context: AutomationContext): Promise<void> {
  if (!context.contact?.id) return;

  if (action.type === 'assign_user' && action.userId) {
    await assignUserAction(context.contact.id, action.userId, context.orgId);
    return;
  }

  if (action.type === 'update_status' && action.status) {
    await updateStatusAction(context.contact.id, action.status);
    return;
  }

  if (action.type === 'create_appointment') {
    await createAppointmentAction({
      orgId: context.orgId,
      contactId: context.contact.id,
      assignedUserId: context.contact.assignedUserId ?? null,
      offsetHours: action.offsetHours,
      typeLabel: action.typeLabel,
      notes: action.notes,
    });
    return;
  }

  if (action.type === 'send_template' && context.conversation?.id && context.conversation.zaloAccountId) {
    const sentMessage = await sendTemplateAction({
      templateId: action.templateId,
      orgId: context.orgId,
      conversationId: context.conversation.id,
      zaloAccountId: context.conversation.zaloAccountId,
      threadId: context.conversation.threadId ?? null,
      threadType: context.conversation.threadType ?? 'user',
      context: { org: context.org, contact: context.contact, conversation: context.conversation },
    });

    if (sentMessage) {
      await prisma.conversation.update({
        where: { id: context.conversation.id },
        data: { lastMessageAt: new Date(), isReplied: true, unreadCount: 0 },
      });
    }
  }
}
