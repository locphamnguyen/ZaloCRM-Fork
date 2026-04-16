<template>
  <div>
    <v-text-field
      v-model="filter"
      placeholder="Tìm trong danh sách..."
      prepend-inner-icon="mdi-magnify"
      variant="outlined"
      density="compact"
      clearable
      class="mb-3"
      hide-details
    />

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />

    <v-list v-if="filtered.length" lines="two">
      <v-list-item
        v-for="friend in filtered"
        :key="friend.userId ?? friend.id ?? friend.zaloId"
        class="px-2"
      >
        <template #prepend>
          <v-avatar color="blue-grey-lighten-4" size="40">
            <v-img v-if="friend.avatar" :src="friend.avatar" />
            <v-icon v-else color="blue-grey">mdi-account</v-icon>
          </v-avatar>
        </template>

        <v-list-item-title class="font-weight-medium">
          {{ friend.displayName ?? friend.name ?? friend.userId }}
        </v-list-item-title>
        <v-list-item-subtitle v-if="friend.phone" class="text-caption">
          {{ friend.phone }}
        </v-list-item-subtitle>

        <template #append>
          <v-menu>
            <template #activator="{ props }">
              <v-btn v-bind="props" icon="mdi-dots-vertical" variant="text" size="small" />
            </template>
            <v-list density="compact">
              <v-list-item
                prepend-icon="mdi-pencil-outline"
                title="Đặt biệt danh"
                @click="emit('set-alias', friend.userId ?? friend.id)"
              />
              <v-list-item
                prepend-icon="mdi-tag-off-outline"
                title="Xóa biệt danh"
                @click="emit('remove-alias', friend.userId ?? friend.id)"
              />
              <v-divider />
              <v-list-item
                prepend-icon="mdi-account-remove-outline"
                title="Xóa bạn"
                class="text-error"
                @click="emit('remove', friend.userId ?? friend.id)"
              />
              <v-list-item
                prepend-icon="mdi-block-helper"
                title="Chặn"
                class="text-error"
                @click="emit('block', friend.userId ?? friend.id)"
              />
            </v-list>
          </v-menu>
        </template>
      </v-list-item>
    </v-list>

    <div v-else-if="!loading" class="text-center text-grey py-8">
      <v-icon size="48" color="grey-lighten-1">mdi-account-multiple-outline</v-icon>
      <div class="mt-2">Không có bạn bè nào</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  friends: any[];
  loading: boolean;
}>();

const emit = defineEmits<{
  remove: [userId: string];
  block: [userId: string];
  'set-alias': [userId: string];
  'remove-alias': [userId: string];
}>();

const filter = ref('');

const filtered = computed(() => {
  if (!filter.value) return props.friends;
  const q = filter.value.toLowerCase();
  return props.friends.filter((f) => {
    const name = (f.displayName ?? f.name ?? '').toLowerCase();
    const phone = (f.phone ?? '').toLowerCase();
    return name.includes(q) || phone.includes(q);
  });
});
</script>

<style scoped>
</style>
