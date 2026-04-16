<template>
  <div>
    <div class="d-flex gap-2 mb-4">
      <v-text-field
        v-model="query"
        placeholder="Tìm theo tên hoặc số điện thoại..."
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        hide-details
        clearable
        @keyup.enter="onSearch"
      />
      <v-btn color="primary" :loading="loading" @click="onSearch">Tìm</v-btn>
    </div>

    <v-list v-if="results.length" lines="two">
      <v-list-item
        v-for="user in results"
        :key="user.userId ?? user.id"
        class="px-2"
      >
        <template #prepend>
          <v-avatar color="blue-grey-lighten-4" size="40">
            <v-img v-if="user.avatar" :src="user.avatar" />
            <v-icon v-else color="blue-grey">mdi-account</v-icon>
          </v-avatar>
        </template>

        <v-list-item-title class="font-weight-medium">
          {{ user.displayName ?? user.name ?? user.userId }}
        </v-list-item-title>
        <v-list-item-subtitle v-if="user.phone" class="text-caption">
          {{ user.phone }}
        </v-list-item-subtitle>

        <template #append>
          <div class="d-flex flex-column align-end gap-1">
            <v-btn
              v-if="!pendingId[user.userId ?? user.id]"
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="mdi-account-plus-outline"
              @click="openMessage(user.userId ?? user.id)"
            >
              Gửi lời mời
            </v-btn>
            <template v-else>
              <v-text-field
                v-model="messageMap[user.userId ?? user.id]"
                placeholder="Lời nhắn (tuỳ chọn)"
                variant="outlined"
                density="compact"
                hide-details
                style="min-width: 180px"
                class="mb-1"
              />
              <div class="d-flex gap-1">
                <v-btn size="small" color="primary" @click="onSend(user.userId ?? user.id)">Gửi</v-btn>
                <v-btn size="small" variant="text" @click="closeMessage(user.userId ?? user.id)">Hủy</v-btn>
              </div>
            </template>
          </div>
        </template>
      </v-list-item>
    </v-list>

    <div v-else-if="!loading && searched" class="text-center text-grey py-6">
      <v-icon size="40" color="grey-lighten-1">mdi-account-search-outline</v-icon>
      <div class="mt-2 text-body-2">Không tìm thấy kết quả</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';

defineProps<{
  results: any[];
  loading: boolean;
}>();

const emit = defineEmits<{
  search: [query: string];
  'send-request': [userId: string, message?: string];
}>();

const query = ref('');
const searched = ref(false);
// tracks which user rows have the message input open
const pendingId = reactive<Record<string, boolean>>({});
const messageMap = reactive<Record<string, string>>({});

function onSearch() {
  if (!query.value.trim()) return;
  searched.value = true;
  emit('search', query.value.trim());
}

function openMessage(userId: string) {
  pendingId[userId] = true;
  messageMap[userId] = '';
}

function closeMessage(userId: string) {
  pendingId[userId] = false;
}

function onSend(userId: string) {
  emit('send-request', userId, messageMap[userId] || undefined);
  pendingId[userId] = false;
}
</script>

<style scoped>
</style>
