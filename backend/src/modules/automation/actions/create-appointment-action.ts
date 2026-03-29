import { randomUUID } from 'node:crypto';
import { prisma } from '../../../shared/database/prisma-client.js';

export async function createAppointmentAction(input: {
  orgId: string;
  contactId: string;
  assignedUserId?: string | null;
  offsetHours?: number;
  typeLabel?: string;
  notes?: string;
}) {
  const offsetHours = Number.isFinite(input.offsetHours) ? Number(input.offsetHours) : 24;
  const appointmentDate = new Date(Date.now() + offsetHours * 60 * 60 * 1000);

  return prisma.appointment.create({
    data: {
      id: randomUUID(),
      orgId: input.orgId,
      contactId: input.contactId,
      assignedUserId: input.assignedUserId ?? null,
      appointmentDate,
      type: input.typeLabel ?? 'automation_follow_up',
      status: 'scheduled',
      notes: input.notes ?? 'Tạo tự động bởi workflow automation',
    },
  });
}
