<template>
  <div>
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <h1 class="text-h5 mr-4">Bạn bè</h1>
      <v-spacer />
      <v-select
        v-model="selectedAccountId"
        :items="accounts"
        item-title="displayName"
        item-value="id"
        label="Tài khoản Zalo"
        variant="outlined"
        density="compact"
        hide-details
        style="max-width: 260px"
        prepend-inner-icon="mdi-cellphone-link"
      />
    </div>

    <v-card v-if="!selectedAccountId" class="text-center py-10 text-grey">
      <v-icon size="48" color="grey-lighten-1">mdi-account-multiple-outline</v-icon>
      <div class="mt-2">Chọn tài khoản Zalo để xem danh sách bạn bè</div>
    </v-card>

    <template v-else>
      <v-tabs v-model="tab" color="primary" class="mb-4">
        <v-tab value="all">
          <v-icon start>mdi-account-multiple-outline</v-icon>
          Tất cả
          <v-chip v-if="friends.length" size="x-small" class="ml-1">{{ friends.length }}</v-chip>
        </v-tab>
        <v-tab value="online">
          <v-icon start color="success">mdi-circle-small</v-icon>
          Online
          <v-chip v-if="onlineFriends.length" size="x-small" color="success" class="ml-1">
            {{ onlineFriends.length }}
          </v-chip>
        </v-tab>
        <v-tab value="requests">
          <v-icon start>mdi-account-clock-outline</v-icon>
          Lời mời
        </v-tab>
        <v-tab value="search">
          <v-icon start>mdi-account-search-outline</v-icon>
          Tìm kiếm
        </v-tab>
        <v-tab value="recommendations">
          <v-icon start>mdi-account-star-outline</v-icon>
          Gợi ý
        </v-tab>
      </v-tabs>

      <v-window v-model="tab">
        <!-- All friends -->
        <v-window-item value="all">
          <FriendList
            :friends="friends"
            :loading="loading"
            @remove="onRemove"
            @block="onBlock"
            @set-alias="openAliasDialog"
            @remove-alias="onRemoveAlias"
          />
        </v-window-item>

        <!-- Online -->
        <v-window-item value="online">
          <FriendList
            :friends="onlineFriends"
            :loading="loading"
            @remove="onRemove"
            @block="onBlock"
            @set-alias="openAliasDialog"
            @remove-alias="onRemoveAlias"
          />
        </v-window-item>

        <!-- Requests -->
        <v-window-item value="requests">
          <FriendRequestPanel
            :sent-requests="sentRequests"
            :loading="loading"
            @cancel="onCancelRequest"
            @accept="onAcceptRequest"
            @reject="onRejectRequest"
          />
        </v-window-item>

        <!-- Search -->
        <v-window-item value="search">
          <FriendSearchPanel
            :results="searchResults"
            :loading="loading"
            @search="onSearch"
            @send-request="onSendRequest"
          />
        </v-window-item>

        <!-- Recommendations -->
        <v-window-item value="recommendations">
          <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />
          <v-list v-if="recommendations.length" lines="two">
            <v-list-item
              v-for="rec in recommendations"
              :key="rec.userId ?? rec.id"
              class="px-2"
            >
              <template #prepend>
                <v-avatar color="blue-grey-lighten-4" size="40">
                  <v-img v-if="rec.avatar" :src="rec.avatar" />
                  <v-icon v-else color="blue-grey">mdi-account</v-icon>
                </v-avatar>
              </template>
              <v-list-item-title class="font-weight-medium">
                {{ rec.displayName ?? rec.name ?? rec.userId }}
              </v-list-item-title>
              <v-list-item-subtitle v-if="rec.phone" class="text-caption">
                {{ rec.phone }}
              </v-list-item-subtitle>
              <template #append>
                <v-btn
                  size="small"
                  color="primary"
                  variant="tonal"
                  prepend-icon="mdi-account-plus-outline"
                  @click="onSendRequest(rec.userId ?? rec.id)"
                >
                  Thêm bạn
                </v-btn>
              </template>
            </v-list-item>
          </v-list>
          <div v-else-if="!loading" class="text-center text-grey py-8">
            <v-icon size="48" color="grey-lighten-1">mdi-account-star-outline</v-icon>
            <div class="mt-2">Không có gợi ý nào</div>
          </div>
        </v-window-item>
      </v-window>
    </template>

    <!-- Alias dialog -->
    <v-dialog v-model="aliasDialog" max-width="360">
      <v-card>
        <v-card-title>Đặt biệt danh</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="aliasInput"
            label="Biệt danh"
            variant="outlined"
            density="compact"
            autofocus
            @keyup.enter="confirmAlias"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="aliasDialog = false">Hủy</v-btn>
          <v-btn color="primary" @click="confirmAlias">Lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useSelectedAccount } from '@/composables/use-selected-account';
import { useFriends } from '@/composables/use-friends';
import FriendList from '@/components/friends/friend-list.vue';
import FriendRequestPanel from '@/components/friends/friend-request-panel.vue';
import FriendSearchPanel from '@/components/friends/friend-search-panel.vue';

const { selectedAccountId, accounts } = useSelectedAccount();
const {
  friends, onlineFriends, sentRequests, recommendations, searchResults, loading,
  fetchFriends, fetchOnlineFriends, fetchSentRequests, fetchRecommendations,
  searchFriends, sendRequest, acceptRequest, rejectRequest, cancelRequest,
  removeFriend, blockUser, setAlias, removeAlias,
} = useFriends();

const tab = ref('all');
const aliasDialog = ref(false);
const aliasInput = ref('');
const aliasPendingUserId = ref('');

async function loadAll(accountId: string) {
  await Promise.all([
    fetchFriends(accountId),
    fetchOnlineFriends(accountId),
    fetchSentRequests(accountId),
    fetchRecommendations(accountId),
  ]);
}

onMounted(() => {
  if (selectedAccountId.value) loadAll(selectedAccountId.value);
});

watch(selectedAccountId, (id) => {
  if (id) loadAll(id);
});

async function onRemove(userId: string) {
  if (selectedAccountId.value) await removeFriend(selectedAccountId.value, userId);
}

async function onBlock(userId: string) {
  if (selectedAccountId.value) await blockUser(selectedAccountId.value, userId);
}

function openAliasDialog(userId: string) {
  aliasPendingUserId.value = userId;
  aliasInput.value = '';
  aliasDialog.value = true;
}

async function confirmAlias() {
  if (selectedAccountId.value && aliasPendingUserId.value && aliasInput.value.trim()) {
    await setAlias(selectedAccountId.value, aliasPendingUserId.value, aliasInput.value.trim());
  }
  aliasDialog.value = false;
}

async function onRemoveAlias(userId: string) {
  if (selectedAccountId.value) await removeAlias(selectedAccountId.value, userId);
}

async function onCancelRequest(userId: string) {
  if (selectedAccountId.value) {
    await cancelRequest(selectedAccountId.value, userId);
    await fetchSentRequests(selectedAccountId.value);
  }
}

async function onAcceptRequest(userId: string) {
  if (selectedAccountId.value) {
    await acceptRequest(selectedAccountId.value, userId);
    await fetchFriends(selectedAccountId.value);
  }
}

async function onRejectRequest(userId: string) {
  if (selectedAccountId.value) {
    await rejectRequest(selectedAccountId.value, userId);
  }
}

async function onSearch(query: string) {
  if (selectedAccountId.value) await searchFriends(selectedAccountId.value, query);
}

async function onSendRequest(userId: string, message?: string) {
  if (selectedAccountId.value) await sendRequest(selectedAccountId.value, userId, message);
}
</script>

<style scoped>
</style>
