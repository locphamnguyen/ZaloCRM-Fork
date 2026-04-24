<template>
  <v-card variant="outlined" class="mb-3">
    <v-card-title class="d-flex align-center text-body-1">
      <v-icon class="mr-2">mdi-text-box-search-outline</v-icon>
      Tóm tắt AI
      <v-spacer />
      <AiQuotaBadge v-if="usage" :usage="usage" class="mr-2" />
      <v-btn size="small" variant="text" :loading="loading" @click="$emit('refresh')">Làm mới</v-btn>
    </v-card-title>
    <v-card-text>
      <v-alert v-if="error" type="error" density="compact" class="mb-2 d-flex align-center">
        <span class="flex-grow-1">{{ error }}</span>
        <v-btn size="x-small" variant="tonal" class="ml-2" @click="$emit('refresh')">Thử lại</v-btn>
      </v-alert>
      <div v-if="summary" class="text-body-2" style="white-space: pre-wrap;">{{ summary }}</div>
      <div v-else class="text-body-2 text-grey">Chưa có tóm tắt.</div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import AiQuotaBadge from './ai-quota-badge.vue';

export interface AiUsageInfo {
  usedToday: number;
  maxDaily: number;
  remaining: number;
  enabled: boolean;
}

defineProps<{ summary: string; loading: boolean; error?: string; usage?: AiUsageInfo }>();
defineEmits<{ refresh: [] }>();
</script>
