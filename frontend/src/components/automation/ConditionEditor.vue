<template>
  <div class="d-flex flex-column ga-3">
    <div v-for="(condition, index) in modelValue" :key="index" class="d-flex ga-2 align-center flex-wrap">
      <v-select
        :model-value="condition.field"
        :items="fieldOptions"
        item-title="title"
        item-value="value"
        label="Trường"
        density="comfortable"
        style="min-width: 180px"
        @update:model-value="updateCondition(index, 'field', $event)"
      />
      <v-select
        :model-value="condition.op"
        :items="operatorOptions"
        item-title="title"
        item-value="value"
        label="Điều kiện"
        density="comfortable"
        style="min-width: 160px"
        @update:model-value="updateCondition(index, 'op', $event)"
      />
      <v-text-field
        :model-value="displayValue(condition.value)"
        label="Giá trị"
        density="comfortable"
        style="min-width: 220px"
        @update:model-value="updateCondition(index, 'value', $event)"
      />
      <v-btn icon variant="text" color="error" @click="removeCondition(index)">
        <v-icon>mdi-delete</v-icon>
      </v-btn>
    </div>

    <div>
      <v-btn variant="tonal" prepend-icon="mdi-plus" @click="addCondition">Thêm điều kiện</v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AutomationCondition } from '@/composables/use-automation-rules';

const props = defineProps<{
  modelValue: AutomationCondition[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: AutomationCondition[]];
}>();

const fieldOptions = [
  { title: 'Nguồn contact', value: 'contact.source' },
  { title: 'Trạng thái contact', value: 'contact.status' },
  { title: 'Người phụ trách', value: 'contact.assignedUserId' },
  { title: 'Nội dung tin nhắn', value: 'message.content' },
  { title: 'Loại tin nhắn', value: 'message.contentType' },
  { title: 'Số tin chưa đọc', value: 'conversation.unreadCount' },
];

const operatorOptions = [
  { title: 'Bằng', value: 'eq' },
  { title: 'Khác', value: 'neq' },
  { title: 'Chứa', value: 'contains' },
  { title: 'Nằm trong', value: 'in' },
  { title: 'Lớn hơn', value: 'gt' },
  { title: 'Nhỏ hơn', value: 'lt' },
  { title: 'Để trống', value: 'is_empty' },
  { title: 'Không trống', value: 'is_not_empty' },
];

function addCondition() {
  emit('update:modelValue', [...props.modelValue, { field: 'contact.status', op: 'eq', value: '' }]);
}

function updateCondition(index: number, key: keyof AutomationCondition, value: unknown) {
  const next = props.modelValue.map((condition, currentIndex) => (
    currentIndex === index ? { ...condition, [key]: value } : condition
  ));
  emit('update:modelValue', next);
}

function removeCondition(index: number) {
  emit('update:modelValue', props.modelValue.filter((_, currentIndex) => currentIndex !== index));
}

function displayValue(value: AutomationCondition['value']) {
  return Array.isArray(value) ? value.join(', ') : String(value ?? '');
}
</script>
