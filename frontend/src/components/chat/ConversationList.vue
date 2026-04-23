<template>
  <div class="conversation-list d-flex flex-column" style="width: 100%; border-right: 1px solid var(--border-glow, rgba(0,242,255,0.1)); height: 100%;">
    <!-- Account filter + Search -->
    <div class="pa-2">
      <v-select
        v-model="selectedAccountId"
        :items="accountOptions"
        item-title="text"
        item-value="value"
        label="Tất cả Zalo"
        density="compact"
        variant="solo-filled"
        hide-details
        clearable
        class="mb-2"
        @update:model-value="$emit('filter-account', $event)"
      />
      <v-text-field
        :model-value="search"
        @update:model-value="$emit('update:search', $event)"
        placeholder="Tìm kiếm..."
        prepend-inner-icon="mdi-magnify"
        variant="solo-filled"
        density="compact"
        hide-details
        clearable
      />
    </div>

    <!-- Tab switcher: Main / Other -->
    <div class="d-flex px-2 pb-1">
      <v-btn-toggle v-model="activeTab" mandatory density="compact" color="primary" class="w-100">
        <v-btn value="main" size="small" class="flex-grow-1">Chính</v-btn>
        <v-btn value="other" size="small" class="flex-grow-1">Khác</v-btn>
      </v-btn-toggle>
    </div>

    <!-- Filter bar -->
    <div class="d-flex flex-wrap gap-1 px-2 pb-2">
      <v-chip
        :variant="filters.unread ? 'elevated' : 'outlined'"
        color="primary"
        size="small"
        class="filter-chip"
        @click="toggleFilter('unread')"
      >
        <v-icon icon="mdi-email-outline" start size="14" />
        Chưa đọc
        <v-badge
          v-if="counts.unread > 0"
          :content="counts.unread > 99 ? '99+' : counts.unread"
          color="error"
          inline
          class="ml-1"
        />
      </v-chip>

      <v-chip
        :variant="filters.unreplied ? 'elevated' : 'outlined'"
        color="warning"
        size="small"
        class="filter-chip"
        @click="toggleFilter('unreplied')"
      >
        <v-icon icon="mdi-reply-outline" start size="14" />
        Chưa trả lời
        <v-badge
          v-if="counts.unreplied > 0"
          :content="counts.unreplied > 99 ? '99+' : counts.unreplied"
          color="warning"
          inline
          class="ml-1"
        />
      </v-chip>

      <!-- Date range filter -->
      <v-menu v-model="showDateMenu" :close-on-content-click="false" location="bottom start">
        <template #activator="{ props: menuProps }">
          <v-chip
            v-bind="menuProps"
            :variant="hasDateFilter ? 'elevated' : 'outlined'"
            color="secondary"
            size="small"
            class="filter-chip"
          >
            <v-icon icon="mdi-calendar-range" start size="14" />
            {{ dateLabel }}
          </v-chip>
        </template>
        <v-card min-width="280" class="pa-3">
          <div class="text-subtitle-2 mb-2">Lọc theo thời gian</div>
          <v-text-field
            v-model="filters.from"
            label="Từ ngày"
            type="date"
            density="compact"
            variant="outlined"
            hide-details
            class="mb-2"
          />
          <v-text-field
            v-model="filters.to"
            label="Đến ngày"
            type="date"
            density="compact"
            variant="outlined"
            hide-details
            class="mb-2"
          />
          <div class="d-flex gap-2 justify-end">
            <v-btn size="small" variant="text" @click="clearDateFilter">Xóa</v-btn>
            <v-btn size="small" color="primary" @click="showDateMenu = false">Áp dụng</v-btn>
          </div>
        </v-card>
      </v-menu>

      <!-- Tag filter -->
      <v-menu v-model="showTagMenu" :close-on-content-click="false" location="bottom start">
        <template #activator="{ props: menuProps }">
          <v-chip
            v-bind="menuProps"
            :variant="filters.tags.length > 0 ? 'elevated' : 'outlined'"
            color="success"
            size="small"
            class="filter-chip"
          >
            <v-icon icon="mdi-tag-outline" start size="14" />
            Tags
            <span v-if="filters.tags.length > 0" class="ml-1">({{ filters.tags.length }})</span>
          </v-chip>
        </template>
        <v-card min-width="220" max-height="300" class="overflow-y-auto">
          <v-list density="compact" select-strategy="leaf" v-model:selected="filters.tags">
            <v-list-subheader>Chọn tags</v-list-subheader>
            <div v-if="availableTags.length === 0" class="text-caption text-grey pa-3">
              Chưa có tags nào
            </div>
            <v-list-item
              v-for="tag in availableTags"
              :key="tag"
              :value="tag"
            >
              <template #prepend="{ isSelected }">
                <v-checkbox-btn :model-value="isSelected" density="compact" />
              </template>
              <v-list-item-title>{{ tag }}</v-list-item-title>
            </v-list-item>
          </v-list>
          <v-divider />
          <div class="pa-2 d-flex justify-end">
            <v-btn size="small" variant="text" @click="filters.tags = []">Xóa tất cả</v-btn>
          </div>
        </v-card>
      </v-menu>

      <!-- Clear all filters -->
      <v-chip
        v-if="hasAnyFilter"
        variant="text"
        color="error"
        size="small"
        class="filter-chip"
        @click="clearAllFilters"
      >
        <v-icon icon="mdi-close-circle-outline" start size="14" />
        Xóa lọc
      </v-chip>
    </div>

    <!-- List -->
    <v-list class="flex-grow-1 overflow-y-auto pa-0" density="compact">
      <v-progress-linear v-if="loading" indeterminate color="primary" />

      <v-list-item
        v-for="conv in conversations"
        :key="conv.id"
        :active="conv.id === selectedId"
        @click="$emit('select', conv.id)"
        @contextmenu.prevent="openContextMenu($event, conv)"
        class="py-2"
        :class="{ 'conversation-active': conv.id === selectedId, 'bg-blue-lighten-5': conv.unreadCount > 0 && conv.id !== selectedId }"
      >
        <template #prepend>
          <v-avatar size="40" color="grey-lighten-2">
            <v-icon v-if="conv.threadType === 'group'" icon="mdi-account-group" />
            <v-img v-else-if="conv.contact?.avatarUrl" :src="conv.contact.avatarUrl" />
            <v-icon v-else icon="mdi-account" />
          </v-avatar>
        </template>

        <v-list-item-title class="d-flex align-center">
          <span class="text-truncate" :class="{ 'font-weight-bold': conv.unreadCount > 0 }">
            {{ conv.threadType === 'group' ? (conv.contact?.fullName || 'Nhóm') : (conv.contact?.crmName || conv.contact?.fullName || 'Unknown') }}
          </span>
          <v-chip v-if="conv.threadType === 'group'" size="x-small" color="info" variant="tonal" class="ml-1">Nhóm</v-chip>
          <v-spacer />
          <span class="text-caption text-grey ml-1">{{ formatTime(conv.lastMessageAt) }}</span>
        </v-list-item-title>

        <v-list-item-subtitle class="d-flex align-center">
          <span class="text-truncate" style="max-width: 200px;" :class="{ 'font-weight-medium': conv.unreadCount > 0 }">
            {{ lastMessagePreview(conv) }}
          </span>
          <v-spacer />
          <AiSentimentBadge v-if="parseSentiment(conv)" :sentiment="parseSentiment(conv)" class="mr-2" />
          <v-badge
            v-if="conv.unreadCount > 0"
            :content="conv.unreadCount"
            color="error"
            inline
          />
        </v-list-item-subtitle>

        <!-- Zalo account indicator -->
        <template #append>
          <span v-if="conv.zaloAccount?.displayName" class="text-caption text-grey-darken-1 ml-1" style="font-size: 0.65rem; max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            {{ conv.zaloAccount.displayName }}
          </span>
        </template>
      </v-list-item>

      <div v-if="!loading && conversations.length === 0" class="text-center pa-8 text-grey">
        Chưa có cuộc trò chuyện nào
      </div>
    </v-list>

    <!-- Context menu for tab actions -->
    <v-menu
      v-model="contextMenu.show"
      :target="[contextMenu.x, contextMenu.y]"
      location="end"
    >
      <v-list density="compact">
        <v-list-item
          v-if="activeTab === 'main'"
          prepend-icon="mdi-archive-arrow-down-outline"
          @click="moveConversation(contextMenu.convId, 'other')"
        >
          <v-list-item-title>Chuyển sang tab Khác</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-else
          prepend-icon="mdi-archive-arrow-up-outline"
          @click="moveConversation(contextMenu.convId, 'main')"
        >
          <v-list-item-title>Chuyển sang tab Chính</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue';
import type { Conversation, AiSentiment } from '@/composables/use-chat';
import { api } from '@/api/index';
import AiSentimentBadge from '@/components/ai/ai-sentiment-badge.vue';

defineProps<{
  conversations: Conversation[];
  selectedId: string | null;
  loading: boolean;
  search: string;
}>();

const emit = defineEmits<{
  select: [id: string];
  'update:search': [value: string];
  'filter-account': [accountId: string | null];
  'update:filters': [params: Record<string, string>];
  'tab-changed': [tab: string];
  'conversation-moved': [id: string, tab: string];
}>();

// ── Tab state ──────────────────────────────────────────────────────────────
const activeTab = ref('main');

// ── Context menu state ─────────────────────────────────────────────────────
const contextMenu = reactive({
  show: false,
  x: 0,
  y: 0,
  convId: '',
});

// ── Account selector ────────────────────────────────────────────────────────
const accountOptions = ref<{ text: string; value: string }[]>([]);
const selectedAccountId = ref<string | null>(null);

// ── Filter state ────────────────────────────────────────────────────────────
const filters = reactive({
  unread: false,
  unreplied: false,
  from: null as string | null,
  to: null as string | null,
  tags: [] as string[],
});

const counts = reactive({ unread: 0, unreplied: 0, total: 0 });
const availableTags = ref<string[]>([]);
const showDateMenu = ref(false);
const showTagMenu = ref(false);

// ── Computed helpers ────────────────────────────────────────────────────────
const hasDateFilter = computed(() => !!(filters.from || filters.to));

const hasAnyFilter = computed(
  () => filters.unread || filters.unreplied || hasDateFilter.value || filters.tags.length > 0
);

const dateLabel = computed(() => {
  if (!hasDateFilter.value) return 'Thời gian';
  if (filters.from && filters.to) {
    return `${formatDateShort(filters.from)} – ${formatDateShort(filters.to)}`;
  }
  if (filters.from) return `Từ ${formatDateShort(filters.from)}`;
  return `Đến ${formatDateShort(filters.to!)}`;
});

// ── Filter actions ──────────────────────────────────────────────────────────
function toggleFilter(key: 'unread' | 'unreplied') {
  filters[key] = !filters[key];
}

function clearDateFilter() {
  filters.from = null;
  filters.to = null;
  showDateMenu.value = false;
}

function clearAllFilters() {
  filters.unread = false;
  filters.unreplied = false;
  filters.from = null;
  filters.to = null;
  filters.tags = [];
}

function buildFilterParams(): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.unread) params.unread = 'true';
  if (filters.unreplied) params.unreplied = 'true';
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.tags.length > 0) params.tags = filters.tags.join(',');
  params.tab = activeTab.value;
  return params;
}

// ── Context menu ───────────────────────────────────────────────────────────
function openContextMenu(event: MouseEvent, conv: Conversation) {
  contextMenu.x = event.clientX;
  contextMenu.y = event.clientY;
  contextMenu.convId = conv.id;
  contextMenu.show = true;
}

async function moveConversation(convId: string, targetTab: string) {
  contextMenu.show = false;
  try {
    await api.patch(`/conversations/${convId}/tab`, { tab: targetTab });
    emit('conversation-moved', convId, targetTab);
  } catch (err) {
    console.error('Failed to move conversation:', err);
  }
}

// ── Counts fetch ────────────────────────────────────────────────────────────
async function fetchCounts() {
  try {
    const params: Record<string, string> = { tab: activeTab.value };
    if (selectedAccountId.value) params.accountId = selectedAccountId.value;
    const res = await api.get('/conversations/counts', { params });
    counts.unread = res.data.unread ?? 0;
    counts.unreplied = res.data.unreplied ?? 0;
    counts.total = res.data.total ?? 0;
  } catch {
    // Non-critical — badges just won't show counts
  }
}

// ── Available tags fetch ────────────────────────────────────────────────────
async function fetchAvailableTags() {
  try {
    const res = await api.get('/contacts', { params: { limit: '200', fields: 'tags' } });
    const contacts: any[] = Array.isArray(res.data) ? res.data : res.data.contacts || [];
    const tagSet = new Set<string>();
    for (const c of contacts) {
      const tags = Array.isArray(c.tags) ? c.tags : [];
      tags.forEach((t: string) => tagSet.add(t));
    }
    availableTags.value = Array.from(tagSet).sort();
  } catch {
    // Non-critical — tag filter will show empty list
  }
}

// ── Watchers ────────────────────────────────────────────────────────────────
watch(
  filters,
  () => emit('update:filters', buildFilterParams()),
  { deep: true }
);

watch(activeTab, () => {
  emit('tab-changed', activeTab.value);
  emit('update:filters', buildFilterParams());
  fetchCounts();
});

watch(selectedAccountId, () => {
  fetchCounts();
});

// ── Lifecycle ───────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    const res = await api.get('/zalo-accounts');
    const accounts = Array.isArray(res.data) ? res.data : res.data.accounts || [];
    accountOptions.value = accounts.map((a: any) => ({
      text: a.displayName || a.zaloUid || a.id,
      value: a.id,
    }));
  } catch {
    // Non-critical — filter just won't show accounts
  }

  await Promise.all([fetchCounts(), fetchAvailableTags()]);
});

// ── Utility functions ───────────────────────────────────────────────────────
function lastMessagePreview(conv: Conversation): string {
  const msg = conv.messages?.[0];
  if (!msg) return '';
  if (msg.isDeleted) return '(đã thu hồi)';
  const prefix = msg.senderType === 'self' ? 'Bạn: ' : '';

  switch (msg.contentType) {
    case 'image': return prefix + '📷 Hình ảnh';
    case 'sticker': return prefix + '🏷️ Sticker';
    case 'video': return prefix + '🎥 Video';
    case 'voice': return prefix + '🎤 Tin nhắn thoại';
    case 'gif': return prefix + 'GIF';
    case 'file': return prefix + '📎 Tệp đính kèm';
    case 'link': return prefix + '🔗 Liên kết';
    case 'bank_transfer': return prefix + '🏦 Chuyển khoản';
    case 'call': return prefix + '📞 Cuộc gọi';
    case 'qr_code': return prefix + '📱 Mã QR';
    case 'reminder': return prefix + '📅 Nhắc hẹn';
    case 'poll': return prefix + '📊 Bình chọn';
    case 'note': return prefix + '📝 Ghi chú';
    case 'forwarded': return prefix + '↩️ Chuyển tiếp';
    case 'contact_card': return prefix + '👤 Danh thiếp';
    case 'rich': return prefix + '📋 Tin nhắn đặc biệt';
  }

  // Reminder/calendar messages (legacy — before contentType was set)
  if (msg.content) {
    try {
      const p = JSON.parse(msg.content);
      if (p.action === 'msginfo.actionlist' && p.title) {
        return prefix + '📅 ' + p.title.slice(0, 50);
      }
    } catch { /* not JSON */ }
  }

  const text = msg.content || '';
  return prefix + (text.length > 50 ? text.slice(0, 50) + '...' : text);
}

function parseSentiment(conv: Conversation): AiSentiment | null {
  const raw = (conv.contact as any)?.metadata?.aiSentiment;
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 7) return `${diffDays} ngày`;

  return date.toLocaleDateString('vi-VN');
}

function formatDateShort(dateStr: string): string {
  // dateStr is YYYY-MM-DD from <input type="date">
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}
</script>
