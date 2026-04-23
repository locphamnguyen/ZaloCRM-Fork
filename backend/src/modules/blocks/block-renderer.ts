/**
 * block-renderer.ts — Render a Block into sendable items for zca-js dispatch.
 * Returns a list of items; each item maps to one zca-js API call.
 * NOTE: zca-js in this codebase only confirms sendMessage (text). sendImage/sendFile
 * are not confirmed available — all types fall back to sendMessage with text payload.
 * Caller is responsible for actual dispatch.
 */
import { renderMessageTemplate, type AutomationTemplateContext } from '../automation/template-renderer.js';
import { getAbsolutePath } from './block-storage.js';
import type { AnyBlockContent, BlockType, TextContent, HtmlContent, ImageContent, VideoContent, FileContent, LinkContent, CardContent } from './block-types.js';

export type SendItemKind = 'text' | 'image' | 'file';

export interface SendItem {
  kind: SendItemKind;
  /** Text payload for kind=text; caption for kind=image/file */
  text: string;
  /** Absolute filesystem path — only set for kind=image or kind=file */
  absPath?: string;
}

export interface RenderedBlock {
  items: SendItem[];
}

interface AttachmentRow {
  storagePath: string;
  filename: string;
  mimeType: string;
  kind: string;
}

/** Strip HTML tags, collapse whitespace — simple plain-text fallback for html blocks */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Render template variables in a string, returning empty string if input is nullish */
function tpl(text: string | undefined, ctx: AutomationTemplateContext): string {
  if (!text) return '';
  return renderMessageTemplate(text, ctx);
}

export function renderBlockForSend(
  type: BlockType,
  content: AnyBlockContent,
  attachments: AttachmentRow[],
  ctx: AutomationTemplateContext,
): RenderedBlock {
  const items: SendItem[] = [];

  switch (type) {
    case 'text': {
      const c = content as TextContent;
      items.push({ kind: 'text', text: tpl(c.text, ctx) });
      break;
    }

    case 'html': {
      const c = content as HtmlContent;
      const plain = htmlToPlainText(tpl(c.html, ctx));
      items.push({ kind: 'text', text: plain });
      break;
    }

    case 'image': {
      const c = content as ImageContent;
      const caption = tpl(c.caption, ctx);
      if (attachments.length === 0) {
        // No attachment — just send caption if present
        if (caption) items.push({ kind: 'text', text: caption });
        break;
      }
      for (const att of attachments) {
        items.push({ kind: 'image', text: caption, absPath: getAbsolutePath(att.storagePath) });
      }
      break;
    }

    case 'video': {
      const c = content as VideoContent;
      const caption = tpl(c.caption, ctx);
      for (const att of attachments) {
        items.push({ kind: 'file', text: caption, absPath: getAbsolutePath(att.storagePath) });
      }
      if (attachments.length === 0 && caption) {
        items.push({ kind: 'text', text: caption });
      }
      break;
    }

    case 'file': {
      const c = content as FileContent;
      const description = tpl(c.description, ctx);
      for (const att of attachments) {
        items.push({ kind: 'file', text: description, absPath: getAbsolutePath(att.storagePath) });
      }
      if (attachments.length === 0 && description) {
        items.push({ kind: 'text', text: description });
      }
      break;
    }

    case 'link': {
      const c = content as LinkContent;
      const parts: string[] = [];
      if (c.title) parts.push(tpl(c.title, ctx));
      parts.push(tpl(c.url, ctx));
      if (c.description) parts.push(tpl(c.description, ctx));
      items.push({ kind: 'text', text: parts.filter(Boolean).join('\n') });
      break;
    }

    case 'card': {
      const c = content as CardContent;
      const parts: string[] = [];
      parts.push(tpl(c.heading, ctx));
      if (c.subheading) parts.push(tpl(c.subheading, ctx));
      if (c.body) parts.push(tpl(c.body, ctx));
      if (c.ctaText && c.ctaUrl) parts.push(`${tpl(c.ctaText, ctx)}: ${tpl(c.ctaUrl, ctx)}`);
      else if (c.ctaUrl) parts.push(tpl(c.ctaUrl, ctx));
      const cardText = parts.filter(Boolean).join('\n');

      // Optional cover image attachment
      const coverAtt = attachments.find((a) => a.kind === 'image');
      if (coverAtt) {
        const caption = tpl(c.imageCaption, ctx) || tpl(c.heading, ctx);
        items.push({ kind: 'image', text: caption, absPath: getAbsolutePath(coverAtt.storagePath) });
      }
      if (cardText) items.push({ kind: 'text', text: cardText });
      break;
    }
  }

  return { items };
}
