import { ref } from 'vue';
import { api } from '@/api';

export interface AutomationCondition {
  field: string;
  op: string;
  value?: string | string[] | number | null;
}

export interface AutomationAction {
  type: string;
  userId?: string;
  templateId?: string;
  status?: string;
  offsetHours?: number;
  typeLabel?: string;
  notes?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  description?: string | null;
  trigger: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  enabled: boolean;
  priority: number;
  runCount: number;
  lastRunAt?: string | null;
  createdAt: string;
}

export function useAutomationRules() {
  const rules = ref<AutomationRule[]>([]);
  const loading = ref(false);
  const saving = ref(false);

  async function fetchRules() {
    loading.value = true;
    try {
      const res = await api.get('/automation/rules');
      rules.value = res.data.rules ?? [];
    } finally {
      loading.value = false;
    }
  }

  async function createRule(payload: Partial<AutomationRule>) {
    saving.value = true;
    try {
      const res = await api.post('/automation/rules', payload);
      await fetchRules();
      return res.data as AutomationRule;
    } finally {
      saving.value = false;
    }
  }

  async function updateRule(id: string, payload: Partial<AutomationRule>) {
    saving.value = true;
    try {
      const res = await api.put(`/automation/rules/${id}`, payload);
      await fetchRules();
      return res.data as AutomationRule;
    } finally {
      saving.value = false;
    }
  }

  async function deleteRule(id: string) {
    saving.value = true;
    try {
      await api.delete(`/automation/rules/${id}`);
      await fetchRules();
      return true;
    } finally {
      saving.value = false;
    }
  }

  return { rules, loading, saving, fetchRules, createRule, updateRule, deleteRule };
}
