<template>
  <div class="d-flex flex-column ga-3">
    <div v-for="(action, index) in modelValue" :key="index" class="pa-3 border rounded d-flex flex-column ga-2">
      <div class="d-flex ga-2 align-center flex-wrap">
        <v-select
          :model-value="action.type"
          :items="actionOptions"
          item-title="title"
          item-value="value"
          label="Hành động"
          density="comfortable"
          style="min-width: 220px"
          @update:model-value="updateAction(index, 'type', $event)"
        />
        <v-btn icon variant="text" color="error" @click="removeAction(index)">
          <v-icon>mdi-delete</v-icon>
        </v-btn>
      </div>

      <v-text-field
        v-if="action.type === 'assign_user'"
        :model-value="action.userId || ''"
        label="User ID"
        density="comfortable"
        @update:model-value="updateAction(index, 'userId', $event)"
      />

      <v-select
        v-if="action.type === 'send_template'"
        :model-value="action.templateId || ''"
        :items="templateItems"
        item-title="title"
        item-value="value"
        label="Template"
        density="comfortable"
        @update:model-value="updateAction(index, 'templateId', $event)"
      />

      <v-select
        v-if="action.type === 'update_status'"
        :model-value="action.status || ''"
        :items="statusItems"
        item-title="title"
        item-value="value"
        label="Trạng thái mới"
        density="comfortable"
        @update:model-value="updateAction(index, 'status', $event)"
      />

      <template v-if="action.type === 'create_appointment'">
        <v-text-field
          :model-value="String(action.offsetHours ?? 24)"
          label="Số giờ sau trigger"
          density="comfortable"
          type="number"
          @update:model-value="updateNumericAction(index, 'offsetHours', $event)"
        />
        <v-text-field
          :model-value="action.typeLabel || ''"
          label="Loại lịch hẹn"
          density="comfortable"
          @update:model-value="updateAction(index, 'typeLabel', $event)"
        />
      </template>
    </div>

    <div>
      <v-btn variant="tonal" prepend-icon="mdi-plus" @click="addAction">Thêm hành động</v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { AutomationAction } from '@/composables/use-automation-rules';
import type { MessageTemplate } from '@/composables/use-message-templates';

const props = defineProps<{
  modelValue: AutomationAction[];
  templates: MessageTemplate[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: AutomationAction[]];
}>();

const actionOptions = [
  { title: 'Assign user', value: 'assign_user' },
  { title: 'Send template', value: 'send_template' },
  { title: 'Update status', value: 'update_status' },
  { title: 'Create appointment', value: 'create_appointment' },
];

const statusItems = [
  { title: 'Mới', value: 'new' },
  { title: 'Đã liên hệ', value: 'contacted' },
  { title: 'Quan tâm', value: 'interested' },
  { title: 'Chuyển đổi', value: 'converted' },
  { title: 'Mất', value: 'lost' },
];

const templateItems = computed(() => props.templates.map((template) => ({ title: template.name, value: template.id })));

function addAction() {
  emit('update:modelValue', [...props.modelValue, { type: 'update_status', status: 'contacted' }]);
}

function updateAction(index: number, key: keyof AutomationAction, value: unknown) {
  const next = props.modelValue.map((action, currentIndex) => (
    currentIndex === index ? { ...action, [key]: value } : action
  ));
  emit('update:modelValue', next);
}

function updateNumericAction(index: number, key: keyof AutomationAction, value: unknown) {
  updateAction(index, key, Number(value ?? 0));
}

function removeAction(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, currentIndex) => currentIndex !== index));
}
</script>
