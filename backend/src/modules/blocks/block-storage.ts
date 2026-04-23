/**
 * block-storage.ts — File I/O for Block attachments.
 * Storage layout: <uploadDir>/<orgId>/blocks/<blockId>/<uuid>-<sanitized-filename>
 * storagePath stored in DB is relative to uploadDir (no leading slash).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../../config/index.js';

export interface AttachmentMeta {
  storagePath: string; // relative path stored in DB
  filename: string;    // sanitized filename
}

const MIME_ALLOWLIST = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'application/pdf',
  'application/zip',
  'application/octet-stream',
  'text/plain',
]);

export function isMimeAllowed(mimeType: string): boolean {
  return MIME_ALLOWLIST.has(mimeType);
}

/** Sanitize filename: strip path separators, normalize unicode, limit length */
function sanitizeFilename(original: string): string {
  // Normalize unicode (NFC)
  let name = original.normalize('NFC');
  // Strip path separators and null bytes
  name = name.replace(/[/\\<>:"|?*\x00]/g, '_');
  // Collapse leading dots (hidden files)
  name = name.replace(/^\.+/, '');
  // Trim and cap length
  name = name.trim().slice(0, 200) || 'file';
  return name;
}

export function getAbsolutePath(storagePath: string): string {
  // storagePath is relative; resolve against uploadDir
  return path.join(config.uploadDir, storagePath);
}

/**
 * Write attachment buffer to disk under org-scoped block directory.
 * Returns metadata to persist in BlockAttachment record.
 */
export async function writeAttachment(
  orgId: string,
  blockId: string,
  _mimeType: string,
  buffer: Buffer,
  originalFilename: string,
): Promise<AttachmentMeta> {
  const sanitized = sanitizeFilename(originalFilename);
  const uuid = randomUUID();
  const storedFilename = `${uuid}-${sanitized}`;

  // Relative path stored in DB (no leading slash)
  const relativePath = path.join(orgId, 'blocks', blockId, storedFilename);
  const absolutePath = getAbsolutePath(relativePath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return { storagePath: relativePath, filename: sanitized };
}

/** Delete attachment file from disk. Non-fatal if file already gone. */
export async function deleteAttachmentFile(storagePath: string): Promise<void> {
  const absPath = getAbsolutePath(storagePath);
  try {
    await fs.unlink(absPath);
  } catch (err: unknown) {
    // Ignore ENOENT — file already removed
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}
