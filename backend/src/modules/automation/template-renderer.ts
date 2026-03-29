const TEMPLATE_VARIABLES: Record<string, (context: AutomationTemplateContext) => string> = {
  'contact.fullName': (context) => context.contact?.fullName ?? '',
  'contact.phone': (context) => context.contact?.phone ?? '',
  'contact.status': (context) => context.contact?.status ?? '',
  'conversation.id': (context) => context.conversation?.id ?? '',
  'org.name': (context) => context.org?.name ?? '',
};

export interface AutomationTemplateContext {
  org?: { id: string; name: string | null } | null;
  contact?: { id: string; fullName: string | null; phone: string | null; status: string | null } | null;
  conversation?: { id: string } | null;
}

export function renderMessageTemplate(content: string, context: AutomationTemplateContext): string {
  return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, token: string) => {
    const resolver = TEMPLATE_VARIABLES[token];
    return resolver ? resolver(context) : '';
  });
}
