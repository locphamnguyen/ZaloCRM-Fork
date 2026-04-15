<template>
  <div v-if="visible" class="quick-template-popup" @keydown="onKey">
    <v-card elevation="8" rounded="lg" max-width="420" max-height="360" class="d-flex flex-column">
      <v-list density="compact" nav class="overflow-y-auto flex-grow-1" style="max-height: 240px;">
        <v-list-subheader>Tin nhắn mẫu</v-list-subheader>

        <v-list-item
          v-for="(tpl, i) in filtered"
          :key="tpl.id"
          :active="i === selectedIndex"
          active-color="primary"
          @click="selectTemplate(tpl)"
          @mouseenter="selectedIndex = i"
        >
          <template #prepend>
            <v-icon
              :icon="tpl.isPersonal ? 'mdi-account' : 'mdi-account-group'"
              size="small"
              :color="tpl.isPersonal ? 'primary' : 'grey'"
            />
          </template>
          <v-list-item-title class="text-body-2">{{ tpl.name }}</v-list-item-title>
          <v-list-item-subtitle class="text-truncate text-caption">{{ tpl.content }}</v-list-item-subtitle>
        </v-list-item>

        <v-list-item v-if="!filtered.length" disabled>
          <v-list-item-title class="text-grey text-caption">Không tìm thấy mẫu nào</v-list-item-title>
        </v-list-item>
      </v-list>

      <template v-if="previewText">
        <v-divider />
        <div class="pa-2 bg-grey-lighten-4">
          <div class="text-caption text-grey mb-1">Xem trước:</div>
          <div class="text-body-2" style="white-space: pre-wrap; max-height: 80px; overflow-y: auto;">{{ previewText }}</div>
        </div>
      </template>
    </v-card>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

interface Template {
  id: string;
  name: string;
  content: string;
  category: string | null;
  isPersonal: boolean;
}

interface ContactCtx {
  fullName?: string | null;
  phone?: string | null;
  tags?: string[];
}

const props = defineProps<{
  visible: boolean;
  query: string;
  templates: Template[];
  contact?: ContactCtx | null;
}>();

const emit = defineEmits<{
  select: [renderedContent: string];
  close: [];
}>();

const selectedIndex = ref(0);

const filtered = computed(() => {
  if (!props.query) return props.templates;
  const q = props.query.toLowerCase();
  return props.templates.filter(
    (t) => t.name.toLowerCase().includes(q) || t.content.toLowerCase().includes(q),
  );
});

// Reset selection when filter changes
watch(filtered, () => { selectedIndex.value = 0; });

const previewText = computed(() => {
  const tpl = filtered.value[selectedIndex.value];
  if (!tpl) return '';
  return renderVariables(tpl.content);
});

function renderVariables(content: string): string {
  const now = new Date();
  const contact = props.contact;
  const vars: Record<string, string> = {
    'contact.fullName': contact?.fullName ?? '',
    'contact.phone': contact?.phone ?? '',
    'contact.zaloName': contact?.fullName ?? '',
    'contact.tags': (contact?.tags ?? []).join(', '),
    'date.today': new Intl.DateTimeFormat('vi-VN').format(now),
    'date.now': new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(now),
  };
  return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, token: string) => vars[token] ?? '');
}

function selectTemplate(tpl: Template) {
  emit('select', renderVariables(tpl.content));
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value = Math.min(selectedIndex.value + 1, filtered.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const tpl = filtered.value[selectedIndex.value];
    if (tpl) selectTemplate(tpl);
  } else if (e.key === 'Escape') {
    emit('close');
  }
}

// Expose onKey so parent (MessageThread) can forward keyboard events from the textarea
defineExpose({ onKey });
</script>

<style scoped>
.quick-template-popup {
  position: absolute;
  bottom: 100%;
  left: 0;
  z-index: 200;
  margin-bottom: 4px;
}
</style>
