import { ref } from 'vue';
import { api } from '@/api';

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  category?: string | null;
  createdAt: string;
}

export function useMessageTemplates() {
  const templates = ref<MessageTemplate[]>([]);
  const loading = ref(false);
  const saving = ref(false);

  async function fetchTemplates() {
    loading.value = true;
    try {
      const res = await api.get('/automation/templates');
      templates.value = res.data.templates ?? [];
    } finally {
      loading.value = false;
    }
  }

  async function createTemplate(payload: Partial<MessageTemplate>) {
    saving.value = true;
    try {
      const res = await api.post('/automation/templates', payload);
      await fetchTemplates();
      return res.data as MessageTemplate;
    } finally {
      saving.value = false;
    }
  }

  async function updateTemplate(id: string, payload: Partial<MessageTemplate>) {
    saving.value = true;
    try {
      const res = await api.put(`/automation/templates/${id}`, payload);
      await fetchTemplates();
      return res.data as MessageTemplate;
    } finally {
      saving.value = false;
    }
  }

  async function deleteTemplate(id: string) {
    saving.value = true;
    try {
      await api.delete(`/automation/templates/${id}`);
      await fetchTemplates();
      return true;
    } finally {
      saving.value = false;
    }
  }

  return { templates, loading, saving, fetchTemplates, createTemplate, updateTemplate, deleteTemplate };
}
