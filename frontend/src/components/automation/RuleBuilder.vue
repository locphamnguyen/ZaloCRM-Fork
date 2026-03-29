<template>
  <v-dialog :model-value="modelValue" max-width="900" @update:model-value="emit('update:modelValue', $event)">
    <v-card>
      <v-card-title>{{ rule?.id ? 'Sửa automation rule' : 'Tạo automation rule' }}</v-card-title>
      <v-card-text class="d-flex flex-column ga-4">
        <v-text-field v-model="localRule.name" label="Tên rule *" :rules="[v => !!v || 'Bắt buộc']" />
        <v-textarea v-model="localRule.description" label="Mô tả" rows="2" />
        <div class="d-flex ga-3 flex-wrap">
          <v-select v-model="localRule.trigger" :items="triggerItems" item-title="title" item-value="value" label="Trigger" style="min-width: 240px" />
          <v-text-field v-model="priorityValue" type="number" label="Độ ưu tiên" style="max-width: 180px" />
          <v-switch v-model="localRule.enabled" label="Đang bật" inset color="primary" />
        </div>

        <div>
          <div class="text-subtitle-1 mb-2">Conditions</div>
          <ConditionEditor v-model="ruleConditions" />
        </div>

        <div>
          <div class="text-subtitle-1 mb-2">Actions</div>
          <ActionEditor v-model="ruleActions" :templates="templates" />
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="emit('update:modelValue', false)">Hủy</v-btn>
        <v-btn color="primary" :loading="saving" @click="submit">Lưu</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import ConditionEditor from './ConditionEditor.vue';
import ActionEditor from './ActionEditor.vue';
import type { AutomationAction, AutomationCondition, AutomationRule } from '@/composables/use-automation-rules';
import type { MessageTemplate } from '@/composables/use-message-templates';

const props = defineProps<{
  modelValue: boolean;
  rule: AutomationRule | null;
  templates: MessageTemplate[];
  saving: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  save: [payload: Partial<AutomationRule>];
}>();

const triggerItems = [
  { title: 'Khi có tin nhắn đến', value: 'message_received' },
  { title: 'Khi tạo contact mới', value: 'contact_created' },
  { title: 'Khi đổi trạng thái contact', value: 'status_changed' },
];

const localRule = reactive<Partial<AutomationRule>>({
  name: '',
  description: '',
  trigger: 'contact_created',
  conditions: [],
  actions: [],
  enabled: true,
  priority: 0,
});

const priorityValue = computed({
  get: () => String(localRule.priority ?? 0),
  set: (value: string) => { localRule.priority = Number(value || 0); },
});

const ruleConditions = computed<AutomationCondition[]>({
  get: () => localRule.conditions ?? [],
  set: (value) => { localRule.conditions = value; },
});

const ruleActions = computed<AutomationAction[]>({
  get: () => localRule.actions ?? [],
  set: (value) => { localRule.actions = value; },
});

watch(() => props.rule, (rule) => {
  localRule.id = rule?.id;
  localRule.name = rule?.name ?? '';
  localRule.description = rule?.description ?? '';
  localRule.trigger = rule?.trigger ?? 'contact_created';
  localRule.conditions = rule?.conditions ? [...rule.conditions] : [];
  localRule.actions = rule?.actions ? [...rule.actions] : [];
  localRule.enabled = rule?.enabled ?? true;
  localRule.priority = rule?.priority ?? 0;
}, { immediate: true });

function submit() {
  if (!localRule.name?.trim()) return;
  emit('save', {
    id: localRule.id,
    name: localRule.name,
    description: localRule.description,
    trigger: localRule.trigger,
    conditions: localRule.conditions ?? [],
    actions: localRule.actions ?? [],
    enabled: localRule.enabled ?? true,
    priority: localRule.priority ?? 0,
  });
}
</script>
