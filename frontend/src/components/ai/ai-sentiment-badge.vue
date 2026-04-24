<template>
  <div class="d-inline-flex align-center ga-1">
    <v-chip :color="chip.color" size="small" variant="tonal">
      <v-icon start :icon="chip.icon" size="16" />
      {{ chip.label }}
    </v-chip>
    <v-tooltip v-if="error" :text="error" location="top">
      <template #activator="{ props: tp }">
        <v-btn v-bind="tp" icon size="x-small" variant="text" color="error" @click="$emit('retry')">
          <v-icon size="16">mdi-refresh</v-icon>
        </v-btn>
      </template>
    </v-tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  sentiment: { label: 'positive' | 'neutral' | 'negative'; confidence: number; reason: string } | null;
  error?: string;
}>();

defineEmits<{ retry: [] }>();

const chip = computed(() => {
  if (!props.sentiment) return { color: 'grey', icon: 'mdi-emoticon-neutral-outline', label: 'Chưa phân tích' };
  if (props.sentiment.label === 'positive') return { color: 'success', icon: 'mdi-emoticon-happy-outline', label: 'Tích cực' };
  if (props.sentiment.label === 'negative') return { color: 'error', icon: 'mdi-emoticon-sad-outline', label: 'Tiêu cực' };
  return { color: 'warning', icon: 'mdi-emoticon-neutral-outline', label: 'Trung tính' };
});
</script>
