/**
 * block-types.ts — TypeScript interfaces for Block content shapes.
 * One interface per block type. All content objects are stored as Json in DB.
 */

export const BLOCK_TYPES = ['text', 'html', 'image', 'video', 'file', 'link', 'card'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface TextContent {
  text: string; // required, 1-4000 chars, may contain {{variables}}
}

export interface HtmlContent {
  html: string; // raw HTML; fallback plain text derived at send time
}

export interface ImageContent {
  caption?: string; // optional, up to 500 chars
  // attachments referenced via BlockAttachment records
}

export interface VideoContent {
  caption?: string;
  // attachments referenced via BlockAttachment records
}

export interface FileContent {
  description?: string;
  // attachments referenced via BlockAttachment records
}

export interface LinkContent {
  url: string;   // absolute URL
  title?: string;
  description?: string;
}

/** Card block — renders as formatted text in Zalo (no native card widget) */
export interface CardContent {
  heading: string;
  subheading?: string;
  body?: string;
  ctaText?: string;
  ctaUrl?: string;
  imageCaption?: string;
  // optional cover image via BlockAttachment
}

export type AnyBlockContent =
  | TextContent
  | HtmlContent
  | ImageContent
  | VideoContent
  | FileContent
  | LinkContent
  | CardContent;
