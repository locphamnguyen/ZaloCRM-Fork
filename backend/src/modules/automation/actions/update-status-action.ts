import { prisma } from '../../../shared/database/prisma-client.js';

export async function updateStatusAction(contactId: string, status: string) {
  return prisma.contact.update({
    where: { id: contactId },
    data: { status },
  });
}
