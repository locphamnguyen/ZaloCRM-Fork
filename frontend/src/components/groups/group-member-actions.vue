<template>
  <v-menu location="bottom end">
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        icon="mdi-dots-vertical"
        variant="text"
        size="small"
        density="comfortable"
      />
    </template>

    <v-list density="compact" min-width="180">
      <v-list-item
        prepend-icon="mdi-shield-account"
        title="Phó nhóm"
        @click="$emit('promote', member)"
      />
      <v-list-item
        prepend-icon="mdi-shield-off"
        title="Hạ chức"
        @click="$emit('demote', member)"
      />
      <v-divider class="my-1" />
      <v-list-item
        prepend-icon="mdi-account-remove"
        title="Xóa khỏi nhóm"
        class="text-error"
        @click="$emit('remove', member)"
      />
      <v-list-item
        prepend-icon="mdi-block-helper"
        title="Chặn"
        class="text-error"
        @click="$emit('block', member)"
      />
      <v-divider class="my-1" />
      <v-list-item
        prepend-icon="mdi-crown-outline"
        title="Chuyển quyền"
        @click="$emit('transfer', member)"
      />
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
defineProps<{ member: any }>();

defineEmits<{
  promote: [member: any];
  demote: [member: any];
  remove: [member: any];
  block: [member: any];
  transfer: [member: any];
}>();
</script>
