/**
 * block-validator.ts — Plain validators for Block content per type.
 * No external deps (zod not in package.json).
 */
import { BLOCK_TYPES, type BlockType, type AnyBlockContent } from './block-types.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function str(val: unknown, field: string, max = 4000): string {
  if (typeof val !== 'string') throw new ValidationError(`${field} must be a string`);
  const trimmed = val.trim();
  if (trimmed.length === 0) throw new ValidationError(`${field} is required`);
  if (trimmed.length > max) throw new ValidationError(`${field} exceeds ${max} characters`);
  return trimmed;
}

function optStr(val: unknown, field: string, max = 500): string | undefined {
  if (val === undefined || val === null) return undefined;
  if (typeof val !== 'string') throw new ValidationError(`${field} must be a string`);
  if (val.length > max) throw new ValidationError(`${field} exceeds ${max} characters`);
  return val;
}

function isAbsoluteUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateBlockContent(type: BlockType, content: unknown): AnyBlockContent {
  if (!content || typeof content !== 'object') {
    throw new ValidationError('content must be an object');
  }
  const c = content as Record<string, unknown>;

  switch (type) {
    case 'text': {
      return { text: str(c.text, 'content.text', 4000) };
    }

    case 'html': {
      return { html: str(c.html, 'content.html', 50000) };
    }

    case 'image': {
      return { caption: optStr(c.caption, 'content.caption', 500) };
    }

    case 'video': {
      return { caption: optStr(c.caption, 'content.caption', 500) };
    }

    case 'file': {
      return { description: optStr(c.description, 'content.description', 500) };
    }

    case 'link': {
      const url = str(c.url, 'content.url', 2000);
      if (!isAbsoluteUrl(url)) throw new ValidationError('content.url must be an absolute http/https URL');
      return {
        url,
        title: optStr(c.title, 'content.title', 200),
        description: optStr(c.description, 'content.description', 500),
      };
    }

    case 'card': {
      return {
        heading: str(c.heading, 'content.heading', 200),
        subheading: optStr(c.subheading, 'content.subheading', 200),
        body: optStr(c.body, 'content.body', 2000),
        ctaText: optStr(c.ctaText, 'content.ctaText', 100),
        ctaUrl: (() => {
          const u = optStr(c.ctaUrl, 'content.ctaUrl', 2000);
          if (u && !isAbsoluteUrl(u)) throw new ValidationError('content.ctaUrl must be an absolute http/https URL');
          return u;
        })(),
        imageCaption: optStr(c.imageCaption, 'content.imageCaption', 500),
      };
    }

    default: {
      throw new ValidationError(`unknown block type: ${type as string}`);
    }
  }
}

export function validateBlockType(type: unknown): BlockType {
  if (!BLOCK_TYPES.includes(type as BlockType)) {
    throw new ValidationError(`type must be one of: ${BLOCK_TYPES.join(', ')}`);
  }
  return type as BlockType;
}

export function validateBlockName(name: unknown): string {
  if (typeof name !== 'string') throw new ValidationError('name must be a string');
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new ValidationError('name is required');
  if (trimmed.length > 200) throw new ValidationError('name exceeds 200 characters');
  return trimmed;
}
