/**
 * Composable for ChatContactPanel state and actions:
 * - Form population from contact
 * - Save contact info
 * - Fetch appointments for contact
 */
import { ref, watch, reactive } from 'vue';
import { useContacts, type Contact } from '@/composables/use-contacts';
import { api } from '@/api/index';
import type { Appointment } from '@/components/chat/ChatAppointments.vue';

export function useChatContactPanel(
  getContactId: () => string | null,
  getContact: () => Contact | null,
  onSaved: () => void,
) {
  const { updateContact, fetchContact } = useContacts();

  const saving = ref(false);
  const saveSuccess = ref(false);
  const saveError = ref(false);
  const contactAppointments = ref<Appointment[]>([]);

  const form = reactive({
    fullName: '',
    crmName: '',
    phone: '',
    email: '',
    source: null as string | null,
    status: null as string | null,
    nextAppointmentDate: '',
    firstContactDate: '',
    tags: [] as string[],
    notes: '',
  });

  function populateForm(c: Contact) {
    form.fullName = c.fullName ?? '';
    form.crmName = c.crmName ?? '';
    form.phone = c.phone ?? '';
    form.email = c.email ?? '';
    form.source = c.source ?? null;
    form.status = c.status ?? null;
    form.nextAppointmentDate = c.nextAppointment
      ? new Date(c.nextAppointment).toISOString().split('T')[0]
      : '';
    form.firstContactDate = c.firstContactDate
      ? new Date(c.firstContactDate).toISOString().split('T')[0]
      : '';
    form.tags = Array.isArray(c.tags) ? [...c.tags] : [];
    form.notes = c.notes ?? '';
  }

  async function fetchContactExtras(contactId: string) {
    try {
      const res = await api.get(`/contacts/${contactId}/appointments`);
      contactAppointments.value = res.data.appointments ?? [];
    } catch (err) {
      console.error('fetchContactExtras error:', err);
    }
  }

  async function reloadAppointments() {
    const id = getContactId();
    if (!id) return;
    try {
      const res = await api.get(`/contacts/${id}/appointments`);
      contactAppointments.value = res.data.appointments ?? [];
    } catch (err) {
      console.error('reloadAppointments error:', err);
    }
  }

  watch(getContact, (c) => {
    if (!c) return;
    populateForm(c);
    fetchContactExtras(c.id);
  }, { immediate: true, deep: true });

  async function saveContact() {
    const contactId = getContactId();
    if (!contactId) return;
    saving.value = true;
    saveSuccess.value = false;
    saveError.value = false;

    const result = await updateContact(contactId, {
      fullName: form.fullName || null,
      crmName: form.crmName || null,
      phone: form.phone || null,
      email: form.email || null,
      source: form.source || null,
      status: form.status || null,
      nextAppointment: form.nextAppointmentDate
        ? new Date(form.nextAppointmentDate + 'T00:00:00').toISOString()
        : null,
      firstContactDate: form.firstContactDate
        ? new Date(form.firstContactDate + 'T00:00:00').toISOString()
        : null,
      tags: form.tags,
      notes: form.notes || null,
    });

    saving.value = false;
    if (result) {
      const fresh = await fetchContact(contactId);
      if (fresh) populateForm(fresh);
      saveSuccess.value = true;
      onSaved();
      setTimeout(() => { saveSuccess.value = false; }, 2500);
    } else {
      saveError.value = true;
    }
  }

  return {
    form,
    saving, saveSuccess, saveError,
    contactAppointments,
    saveContact, reloadAppointments,
  };
}
