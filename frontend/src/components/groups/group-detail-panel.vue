<template>
  <div v-if="!group" class="d-flex align-center justify-center h-100 text-grey">
    <div class="text-center">
      <v-icon size="64" color="grey-lighten-2">mdi-account-group-outline</v-icon>
      <p class="mt-3 text-body-2">Chọn một nhóm để xem chi tiết</p>
    </div>
  </div>

  <div v-else class="d-flex flex-column h-100">
    <!-- Header -->
    <div class="d-flex align-center pa-3 border-b">
      <v-avatar color="primary" size="40" class="mr-3">
        <v-icon>mdi-account-group</v-icon>
      </v-avatar>
      <div class="flex-1-1">
        <div class="text-subtitle-1 font-weight-medium">
          {{ group.name || group.groupName || 'Nhóm không tên' }}
        </div>
        <div v-if="group.totalMember" class="text-caption text-grey">
          {{ group.totalMember }} thành viên
        </div>
      </div>
      <v-btn icon="mdi-cog-outline" variant="text" @click="$emit('open-settings')" />
    </div>

    <!-- Tabs -->
    <v-tabs v-model="tab" density="compact" class="border-b">
      <v-tab value="members">
        <v-icon size="16" class="mr-1">mdi-account-multiple</v-icon>
        Thành viên
      </v-tab>
      <v-tab value="pending">
        <v-icon size="16" class="mr-1">mdi-clock-outline</v-icon>
        Chờ duyệt
        <v-badge v-if="pending.length" :content="pending.length" color="warning" inline class="ml-1" />
      </v-tab>
      <v-tab value="blocked">
        <v-icon size="16" class="mr-1">mdi-block-helper</v-icon>
        Bị chặn
      </v-tab>
      <v-tab value="polls">
        <v-icon size="16" class="mr-1">mdi-poll</v-icon>
        Bình chọn
      </v-tab>
    </v-tabs>

    <v-window v-model="tab" class="flex-1-1 overflow-y-auto">
      <!-- Members tab -->
      <v-window-item value="members">
        <v-list v-if="members.length" lines="two" class="pa-2">
          <v-list-item
            v-for="m in members"
            :key="m.id || m.uid"
            rounded="lg"
            class="mb-1"
          >
            <template #prepend>
              <v-avatar size="36" color="grey-lighten-3">
                <v-img v-if="m.avatar" :src="m.avatar" />
                <v-icon v-else size="20">mdi-account</v-icon>
              </v-avatar>
            </template>
            <v-list-item-title class="text-body-2">
              {{ m.displayName || m.name || m.uid }}
            </v-list-item-title>
            <v-list-item-subtitle v-if="m.isOwner || m.isDeputy" class="text-caption">
              <v-chip size="x-small" :color="m.isOwner ? 'amber' : 'blue'" variant="tonal">
                {{ m.isOwner ? 'Trưởng nhóm' : 'Phó nhóm' }}
              </v-chip>
            </v-list-item-subtitle>
            <template #append>
              <GroupMemberActions
                :member="m"
                @promote="$emit('add-deputy', m)"
                @demote="$emit('remove-deputy', m)"
                @remove="$emit('remove-member', m)"
                @block="$emit('block-member', m)"
                @transfer="$emit('transfer-ownership', m)"
              />
            </template>
          </v-list-item>
        </v-list>
        <div v-else-if="loading" class="d-flex justify-center pa-6">
          <v-progress-circular indeterminate color="primary" size="28" />
        </div>
        <div v-else class="text-center text-grey pa-6 text-body-2">Chưa có thành viên</div>
      </v-window-item>

      <!-- Pending tab -->
      <v-window-item value="pending">
        <v-list v-if="pending.length" class="pa-2">
          <v-list-item
            v-for="p in pending"
            :key="p.id || p.uid"
            rounded="lg"
            class="mb-1"
          >
            <v-list-item-title class="text-body-2">
              {{ p.displayName || p.name || p.uid }}
            </v-list-item-title>
            <template #append>
              <v-btn size="small" color="success" variant="tonal" class="mr-1" @click="$emit('approve-pending', p)">
                Duyệt
              </v-btn>
              <v-btn size="small" color="error" variant="tonal" @click="$emit('reject-pending', p)">
                Từ chối
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
        <div v-else class="text-center text-grey pa-6 text-body-2">Không có yêu cầu chờ duyệt</div>
      </v-window-item>

      <!-- Blocked tab -->
      <v-window-item value="blocked">
        <v-list v-if="blocked.length" class="pa-2">
          <v-list-item
            v-for="b in blocked"
            :key="b.id || b.uid"
            rounded="lg"
            class="mb-1"
          >
            <v-list-item-title class="text-body-2">
              {{ b.displayName || b.name || b.uid }}
            </v-list-item-title>
            <template #append>
              <v-btn size="small" variant="tonal" @click="$emit('unblock-member', b)">
                Bỏ chặn
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
        <div v-else class="text-center text-grey pa-6 text-body-2">Không có thành viên bị chặn</div>
      </v-window-item>

      <!-- Polls tab -->
      <v-window-item value="polls">
        <div class="pa-3">
          <v-btn
            color="primary"
            variant="tonal"
            prepend-icon="mdi-plus"
            block
            class="mb-3"
            @click="$emit('create-poll')"
          >
            Tạo bình chọn
          </v-btn>

          <v-list v-if="polls.length" class="pa-0">
            <v-card
              v-for="poll in polls"
              :key="poll.id"
              variant="outlined"
              class="mb-2"
            >
              <v-card-text class="pa-3">
                <div class="text-body-2 font-weight-medium mb-1">{{ poll.question }}</div>
                <div class="text-caption text-grey">{{ poll.options?.length }} lựa chọn</div>
                <v-chip v-if="poll.locked" size="x-small" color="error" variant="tonal" class="mt-1">
                  Đã khóa
                </v-chip>
              </v-card-text>
            </v-card>
          </v-list>
          <div v-else class="text-center text-grey text-body-2 pt-4">Chưa có bình chọn nào</div>
        </div>
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import GroupMemberActions from './group-member-actions.vue';

defineProps<{
  group: any;
  members: any[];
  blocked: any[];
  pending: any[];
  polls: any[];
  loading: boolean;
}>();

defineEmits<{
  'open-settings': [];
  'add-deputy': [member: any];
  'remove-deputy': [member: any];
  'remove-member': [member: any];
  'block-member': [member: any];
  'transfer-ownership': [member: any];
  'unblock-member': [member: any];
  'approve-pending': [member: any];
  'reject-pending': [member: any];
  'create-poll': [];
}>();

const tab = ref('members');
</script>
