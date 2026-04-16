export interface AutomationTemplateContext {
  org?: { id: string; name: string | null } | null;
  contact?: {
    id: string;
    fullName: string | null;
    crmName?: string | null;
    phone: string | null;
    email?: string | null;
    status: string | null;
    tags?: unknown; // stored as Json in DB — cast to string[] when joining
    zaloName?: string | null; // resolved from Zalo API, not in DB
  } | null;
  conversation?: { id: string } | null;
}

const TEMPLATE_VARIABLES: Record<string, (context: AutomationTemplateContext) => string> = {
  // Contact fields
  'contact.fullName': (ctx) => ctx.contact?.fullName ?? '',
  'contact.phone': (ctx) => ctx.contact?.phone ?? '',
  'contact.email': (ctx) => ctx.contact?.email ?? '',
  'contact.status': (ctx) => ctx.contact?.status ?? '',
  'contact.crmName': (ctx) => ctx.contact?.crmName ?? ctx.contact?.fullName ?? '',
  'contact.zaloName': (ctx) => ctx.contact?.zaloName ?? ctx.contact?.fullName ?? '',
  'contact.tags': (ctx) => {
    const tags = ctx.contact?.tags;
    if (!tags) return '';
    if (Array.isArray(tags)) return (tags as string[]).join(', ');
    return '';
  },

  // Conversation fields
  'conversation.id': (ctx) => ctx.conversation?.id ?? '',

  // Org fields
  'org.name': (ctx) => ctx.org?.name ?? '',

  // Date/time helpers (Vietnamese locale)
  'date.today': () => new Intl.DateTimeFormat('vi-VN').format(new Date()),
  'date.now': () =>
    new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date()),
};

/** All variable names available for template authoring UI */
export const AVAILABLE_VARIABLES: string[] = Object.keys(TEMPLATE_VARIABLES);

export function renderMessageTemplate(content: string, context: AutomationTemplateContext): string {
  return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, token: string) => {
    const resolver = TEMPLATE_VARIABLES[token];
    return resolver ? resolver(context) : '';
  });
}
