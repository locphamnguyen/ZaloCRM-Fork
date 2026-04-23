/**
 * tag-service.ts — CRM tag CRUD + contact-tag link operations.
 * All queries are org-scoped. ContactTagLink uses @@unique([contactId,tagId]) for idempotency.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../shared/database/prisma-client.js';

export interface CreateTagInput {
  name: string;
  color?: string;
  icon?: string;
  source?: string; // 'crm' | 'zalo', default 'crm'
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
  icon?: string;
}

// ── Tag CRUD ──────────────────────────────────────────────────────────────────

export async function listTags(orgId: string, source?: string) {
  const where: any = { orgId };
  if (source && source !== 'all') where.source = source;
  return prisma.crmTag.findMany({
    where,
    orderBy: [{ source: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { links: true } } },
  });
}

export async function createTag(orgId: string, input: CreateTagInput) {
  return prisma.crmTag.create({
    data: {
      id: randomUUID(),
      orgId,
      name: input.name.trim(),
      color: input.color ?? '#888',
      icon: input.icon ?? null,
      source: input.source ?? 'crm',
    },
  });
}

export async function updateTag(orgId: string, tagId: string, input: UpdateTagInput) {
  const tag = await prisma.crmTag.findFirst({ where: { id: tagId, orgId } });
  if (!tag) return null;
  const data: any = {};
  if (typeof input.name === 'string') data.name = input.name.trim();
  if (typeof input.color === 'string') data.color = input.color;
  if (input.icon !== undefined) data.icon = input.icon;
  return prisma.crmTag.update({ where: { id: tagId }, data });
}

export async function deleteTag(orgId: string, tagId: string): Promise<boolean> {
  const tag = await prisma.crmTag.findFirst({ where: { id: tagId, orgId } });
  if (!tag) return false;
  await prisma.crmTag.delete({ where: { id: tagId } });
  return true;
}

// ── Contact-Tag Links ─────────────────────────────────────────────────────────

export async function getContactTags(orgId: string, contactId: string) {
  // Verify contact belongs to org
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId },
    select: { id: true },
  });
  if (!contact) return null;

  const links = await prisma.contactTagLink.findMany({
    where: { contactId },
    include: { tag: true },
    orderBy: { createdAt: 'desc' },
  });
  const crm = links.filter(l => l.tag.source === 'crm').map(l => l.tag);
  const zalo = links.filter(l => l.tag.source === 'zalo').map(l => l.tag);
  return { crm, zalo, links };
}

export interface LinkTagInput {
  tagId: string;
  appliedBy?: string;
}

export async function linkTagToContact(
  orgId: string,
  contactId: string,
  input: LinkTagInput,
): Promise<{ link: any; isNew: boolean } | null> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId },
    select: { id: true },
  });
  if (!contact) return null;

  const tag = await prisma.crmTag.findFirst({
    where: { id: input.tagId, orgId },
    select: { id: true, source: true },
  });
  if (!tag) return null;

  // Upsert — idempotent via @@unique([contactId,tagId])
  const existing = await prisma.contactTagLink.findFirst({
    where: { contactId, tagId: input.tagId },
  });
  if (existing) return { link: existing, isNew: false };

  const link = await prisma.contactTagLink.create({
    data: {
      id: randomUUID(),
      contactId,
      tagId: input.tagId,
      source: tag.source,
      appliedBy: input.appliedBy ?? null,
    },
    include: { tag: true },
  });
  return { link, isNew: true };
}

export async function unlinkTagFromContact(
  orgId: string,
  contactId: string,
  tagId: string,
): Promise<boolean> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId },
    select: { id: true },
  });
  if (!contact) return false;

  const link = await prisma.contactTagLink.findFirst({
    where: { contactId, tagId },
  });
  if (!link) return false;

  await prisma.contactTagLink.delete({ where: { id: link.id } });
  return true;
}
