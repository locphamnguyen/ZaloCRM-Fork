<template>
  <div class="d-flex flex-column h-100">
    <!-- Toolbar -->
    <div class="d-flex align-center pa-4 pb-2 gap-3">
      <h1 class="text-h5 mr-2">Nhóm Zalo</h1>
      <v-select
        v-model="selectedAccountId"
        :items="accounts"
        item-title="displayName"
        item-value="id"
        label="Tài khoản"
        variant="outlined"
        density="compact"
        hide-details
        style="max-width: 240px"
        :loading="accountLoading"
        @update:model-value="onAccountChange"
      >
        <template #item="{ props: itemProps, item }">
          <v-list-item v-bind="itemProps">
            <template #append>
              <v-chip size="x-small" :color="item.raw.status === 'connected' ? 'success' : 'error'" variant="tonal">
                {{ item.raw.status === 'connected' ? 'Online' : 'Offline' }}
              </v-chip>
            </template>
          </v-list-item>
        </template>
      </v-select>
      <v-btn
        icon="mdi-refresh"
        variant="text"
        :loading="loading"
        :disabled="!selectedAccountId"
        @click="refresh"
      />
    </div>

    <!-- Two-panel layout -->
    <div class="d-flex flex-1-1 overflow-hidden mx-4 mb-4 gap-3">
      <!-- Left: Group list -->
      <v-card variant="outlined" class="d-flex flex-column overflow-hidden" style="width: 280px; min-width: 240px">
        <GroupList
          :groups="groups"
          :selected-id="selectedGroupId"
          :loading="loading"
          @select="onSelectGroup"
          @create="showCreateDialog = true"
        />
      </v-card>

      <!-- Right: Group detail -->
      <v-card variant="outlined" class="flex-1-1 d-flex flex-column overflow-hidden">
        <GroupDetailPanel
          :group="selectedGroup"
          :members="members"
          :blocked="blocked"
          :pending="pending"
          :polls="polls"
          :loading="loading"
          @open-settings="showSettingsDialog = true"
          @add-deputy="m => runAction(() => addDeputy(selectedAccountId, selectedGroupId, m.id || m.uid))"
          @remove-deputy="m => runAction(() => removeDeputy(selectedAccountId, selectedGroupId, m.id || m.uid))"
          @remove-member="m => runAction(() => removeMembers(selectedAccountId, selectedGroupId, [m.id || m.uid]))"
          @block-member="m => runAction(() => blockMember(selectedAccountId, selectedGroupId, m.id || m.uid))"
          @transfer-ownership="m => runAction(() => transferOwnership(selectedAccountId, selectedGroupId, m.id || m.uid))"
          @unblock-member="m => runAction(() => unblockMember(selectedAccountId, selectedGroupId, m.id || m.uid))"
          @approve-pending="m => runAction(() => addMembers(selectedAccountId, selectedGroupId, [m.id || m.uid]))"
          @reject-pending="m => runAction(() => removeMembers(selectedAccountId, selectedGroupId, [m.id || m.uid]))"
          @create-poll="showPollDialog = true"
        />
      </v-card>
    </div>

    <!-- Dialogs -->
    <GroupCreateDialog
      v-model="showCreateDialog"
      @create="onCreateGroup"
    />

    <GroupSettingsDialog
      v-model="showSettingsDialog"
      :group="selectedGroup"
      @save="onSaveSettings"
      @leave="onLeaveGroup"
      @disperse="onDisperseGroup"
    />

    <PollCreateDialog
      v-model="showPollDialog"
      @create="onCreatePoll"
    />

    <!-- Snackbar feedback -->
    <v-snackbar v-model="snack.show" :color="snack.color" timeout="3000" location="bottom end">
      {{ snack.message }}
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useSelectedAccount } from '@/composables/use-selected-account';
import { useGroups } from '@/composables/use-groups';
import { usePolls } from '@/composables/use-polls';
import GroupList from '@/components/groups/group-list.vue';
import GroupDetailPanel from '@/components/groups/group-detail-panel.vue';
import GroupCreateDialog from '@/components/groups/group-create-dialog.vue';
import GroupSettingsDialog from '@/components/groups/group-settings-dialog.vue';
import PollCreateDialog from '@/components/groups/poll-create-dialog.vue';

const { accounts, selectedAccountId, selectAccount, loading: accountLoading } = useSelectedAccount();
const {
  groups, selectedGroup, members, blocked, pending,
  loading, actionLoading,
  fetchGroups, fetchGroup, fetchMembers, fetchBlocked, fetchPending,
  createGroup, renameGroup,
  addMembers, removeMembers, addDeputy, removeDeputy,
  transferOwnership, blockMember, unblockMember,
  leaveGroup, disperseGroup,
} = useGroups();

const { polls, createPoll } = usePolls();

const selectedGroupId = ref('');
const showCreateDialog = ref(false);
const showSettingsDialog = ref(false);
const showPollDialog = ref(false);

const snack = reactive({ show: false, message: '', color: 'success' });

function notify(message: string, color = 'success') {
  snack.message = message;
  snack.color = color;
  snack.show = true;
}

async function onAccountChange(id: string) {
  selectAccount(id);
  selectedGroupId.value = '';
  selectedGroup.value = null;
  members.value = [];
  if (id) await fetchGroups(id);
}

async function onSelectGroup(groupId: string) {
  selectedGroupId.value = groupId;
  const acct = selectedAccountId.value;
  await Promise.all([
    fetchGroup(acct, groupId),
    fetchMembers(acct, groupId),
    fetchBlocked(acct, groupId),
    fetchPending(acct, groupId),
  ]);
}

async function refresh() {
  if (!selectedAccountId.value) return;
  await fetchGroups(selectedAccountId.value);
  if (selectedGroupId.value) await onSelectGroup(selectedGroupId.value);
}

async function runAction(fn: () => Promise<any>) {
  const result = await fn();
  if (result !== null) {
    notify('Thành công');
    if (selectedGroupId.value) await onSelectGroup(selectedGroupId.value);
  } else {
    notify('Thao tác thất bại', 'error');
  }
}

async function onCreateGroup(payload: { name: string; memberIds: string[] }) {
  const result = await createGroup(selectedAccountId.value, payload);
  if (result) notify('Tạo nhóm thành công');
  else notify('Tạo nhóm thất bại', 'error');
}

async function onSaveSettings(settings: { name: string }) {
  if (settings.name && settings.name !== selectedGroup.value?.name) {
    await runAction(() => renameGroup(selectedAccountId.value, selectedGroupId.value, settings.name));
  }
}

async function onLeaveGroup() {
  const result = await leaveGroup(selectedAccountId.value, selectedGroupId.value);
  if (result !== null) {
    notify('Đã rời nhóm');
    selectedGroupId.value = '';
    selectedGroup.value = null;
  } else {
    notify('Rời nhóm thất bại', 'error');
  }
}

async function onDisperseGroup() {
  const result = await disperseGroup(selectedAccountId.value, selectedGroupId.value);
  if (result !== null) {
    notify('Đã giải tán nhóm');
    selectedGroupId.value = '';
    selectedGroup.value = null;
  } else {
    notify('Giải tán nhóm thất bại', 'error');
  }
}

async function onCreatePoll(payload: Parameters<typeof createPoll>[2]) {
  const result = await createPoll(selectedAccountId.value, selectedGroupId.value, payload);
  if (result) notify('Tạo bình chọn thành công');
  else notify('Tạo bình chọn thất bại', 'error');
}
</script>
