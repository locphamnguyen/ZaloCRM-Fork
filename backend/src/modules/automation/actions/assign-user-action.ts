import { prisma } from '../../../shared/database/prisma-client.js';

export async function assignUserAction(contactId: string, userId: string, orgId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, orgId }, select: { id: true } });
  if (!user) return null;

  return prisma.contact.update({
    where: { id: contactId },
    data: { assignedUserId: userId },
  });
}
