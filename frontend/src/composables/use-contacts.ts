/**
 * Composable for contact (khách hàng) management:
 * - List with filters, pagination
 * - CRUD operations
 * - CRM pipeline status
 */
import { ref, reactive } from 'vue';
import { api } from '@/api/index';

export interface Contact {
  id: string;
  fullName: string | null;
  crmName?: string | null;
  phone: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  source: string | null;
  status: string | null;
  zaloUid?: string | null;
  nextAppointment: string | null;
  notes: string | null;
  tags: string[];
  assignedUserId?: string | null;
  assignedUser?: { fullName: string } | null;
  createdAt?: string;
  firstContactDate?: string | null;
  leadScore: number;
  lastActivity: string | null;
  mergedInto: string | null;
}

export interface DuplicateGroup {
  id: string;
  contactIds: string[];
  matchType: string;
  confidence: number;
  resolved: boolean;
  createdAt: string;
  contacts: Contact[];
}

export interface ContactFilters {
  search: string;
  source: string;
  status: string;
}

export const SOURCE_OPTIONS = [
  { text: 'Facebook', value: 'FB' },
  { text: 'TikTok', value: 'TT' },
  { text: 'Giới thiệu', value: 'GT' },
  { text: 'Cá nhân', value: 'CN' },
];

export const STATUS_OPTIONS = [
  { text: 'Mới', value: 'new' },
  { text: 'Đã liên hệ', value: 'contacted' },
  { text: 'Quan tâm', value: 'interested' },
  { text: 'Chuyển đổi', value: 'converted' },
  { text: 'Mất', value: 'lost' },
];

export function useContacts() {
  const contacts = ref<Contact[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const saving = ref(false);
  const deleting = ref(false);

  const filters = reactive<ContactFilters>({
    search: '',
    source: '',
    status: '',
  });

  const pagination = reactive({ page: 1, limit: 20 });

  async function fetchContacts() {
    loading.value = true;
    try {
      const res = await api.get('/contacts', {
        params: {
          page: pagination.page,
          limit: pagination.limit,
          search: filters.search || undefined,
          source: filters.source || undefined,
          status: filters.status || undefined,
        },
      });
      contacts.value = res.data.contacts ?? res.data;
      total.value = res.data.total ?? contacts.value.length;
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchContact(id: string): Promise<Contact | null> {
    try {
      const res = await api.get(`/contacts/${id}`);
      return res.data;
    } catch (err) {
      console.error('Failed to fetch contact:', err);
      return null;
    }
  }

  async function createContact(payload: Partial<Contact>): Promise<Contact | null> {
    saving.value = true;
    try {
      const res = await api.post('/contacts', payload);
      await fetchContacts();
      return res.data;
    } catch (err) {
      console.error('Failed to create contact:', err);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function updateContact(id: string, payload: Partial<Contact>): Promise<Contact | null> {
    saving.value = true;
    try {
      const res = await api.put(`/contacts/${id}`, payload);
      const idx = contacts.value.findIndex(c => c.id === id);
      if (idx !== -1) contacts.value[idx] = res.data;
      return res.data;
    } catch (err) {
      console.error('Failed to update contact:', err);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function deleteContact(id: string): Promise<boolean> {
    deleting.value = true;
    try {
      await api.delete(`/contacts/${id}`);
      await fetchContacts();
      return true;
    } catch (err) {
      console.error('Failed to delete contact:', err);
      return false;
    } finally {
      deleting.value = false;
    }
  }

  function resetFilters() {
    filters.search = '';
    filters.source = '';
    filters.status = '';
    pagination.page = 1;
    fetchContacts();
  }

  return {
    contacts, total, loading, saving, deleting,
    filters, pagination,
    fetchContacts, fetchContact,
    createContact, updateContact, deleteContact,
    resetFilters,
  };
}

export function useContactIntelligence() {
  const duplicateGroups = ref<DuplicateGroup[]>([]);
  const duplicateTotal = ref(0);
  const loadingDuplicates = ref(false);
  const merging = ref(false);

  async function fetchDuplicateGroups(page = 1, limit = 20) {
    loadingDuplicates.value = true;
    try {
      const res = await api.get('/contacts/duplicates', {
        params: { page, limit, resolved: 'false' },
      });
      duplicateGroups.value = res.data.groups ?? [];
      duplicateTotal.value = res.data.total ?? 0;
    } catch (err) {
      console.error('Failed to fetch duplicate groups:', err);
    } finally {
      loadingDuplicates.value = false;
    }
  }

  async function mergeDuplicateGroup(groupId: string, primaryContactId: string): Promise<boolean> {
    merging.value = true;
    try {
      await api.post(`/contacts/duplicates/${groupId}/merge`, { primaryContactId });
      return true;
    } catch (err) {
      console.error('Failed to merge contacts:', err);
      return false;
    } finally {
      merging.value = false;
    }
  }

  async function recomputeIntelligence(): Promise<boolean> {
    try {
      await api.post('/contacts/intelligence/recompute');
      return true;
    } catch (err) {
      console.error('Failed to trigger recompute:', err);
      return false;
    }
  }

  return {
    duplicateGroups, duplicateTotal, loadingDuplicates, merging,
    fetchDuplicateGroups, mergeDuplicateGroup, recomputeIntelligence,
  };
}
