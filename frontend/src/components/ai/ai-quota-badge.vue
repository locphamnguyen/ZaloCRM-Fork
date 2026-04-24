<template>
  <v-tooltip :text="tooltipText" location="bottom">
    <template #activator="{ props: tp }">
      <v-chip
        v-bind="tp"
        :color="chipColor"
        size="x-small"
        variant="tonal"
        prepend-icon="mdi-lightning-bolt"
      >
        {{ usage.usedToday }}/{{ usage.maxDaily }}
      </v-chip>
    </template>
  </v-tooltip>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export interface AiUsageInfo {
  usedToday: number;
  maxDaily: number;
  remaining: number;
  enabled: boolean;
}

const props = defineProps<{ usage: AiUsageInfo }>();

const usagePct = computed(() => (props.usage.maxDaily > 0 ? props.usage.usedToday / props.usage.maxDaily : 0));

const chipColor = computed(() => {
  if (!props.usage.enabled) return 'grey';
  if (usagePct.value >= 1) return 'error';
  if (usagePct.value >= 0.8) return 'warning';
  return 'success';
});

const tooltipText = computed(() => {
  if (!props.usage.enabled) return 'AI đang tắt';
  if (props.usage.remaining <= 0) return 'Đã dùng hết quota hôm nay';
  return `Còn lại ${props.usage.remaining} lượt AI hôm nay`;
});
</script>
