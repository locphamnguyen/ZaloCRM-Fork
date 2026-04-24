<template>
  <v-card variant="outlined" class="mb-3">
    <v-card-title class="d-flex align-center text-body-1">
      <v-icon class="mr-2">mdi-robot-outline</v-icon>
      Gợi ý AI
      <v-spacer />
      <v-btn size="small" variant="text" :loading="loading" @click="$emit('generate')">Ask AI</v-btn>
    </v-card-title>
    <v-card-text>
      <v-alert v-if="error" type="error" density="compact" class="mb-2 d-flex align-center">
        <span class="flex-grow-1">{{ error }}</span>
        <v-btn size="x-small" variant="tonal" class="ml-2" @click="$emit('generate')">Thử lại</v-btn>
      </v-alert>
      <div v-if="suggestion" class="text-body-2 mb-3" style="white-space: pre-wrap;">{{ suggestion }}</div>
      <div v-else class="text-body-2 text-grey mb-3">Chưa có gợi ý.</div>
      <div class="d-flex justify-end">
        <v-btn color="primary" variant="tonal" :disabled="!suggestion" @click="$emit('apply')">Chèn vào ô nhập</v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
defineProps<{ suggestion: string; loading: boolean; error: string }>();
defineEmits<{ generate: []; apply: [] }>();
</script>
