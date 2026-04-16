<template>
  <div class="d-flex flex-column h-100">
    <div class="pa-3 pb-2">
      <v-text-field
        v-model="search"
        density="compact"
        variant="outlined"
        placeholder="Tìm nhóm..."
        prepend-inner-icon="mdi-magnify"
        hide-details
        clearable
      />
    </div>

    <v-list v-if="!loading && filtered.length" lines="one" class="flex-1-1 overflow-y-auto">
      <v-list-item
        v-for="group in filtered"
        :key="group.id"
        :active="group.id === selectedId"
        active-color="primary"
        rounded="lg"
        class="mx-2 mb-1"
        @click="$emit('select', group.id)"
      >
        <template #prepend>
          <v-avatar color="primary" size="36">
            <v-icon size="20">mdi-account-group</v-icon>
          </v-avatar>
        </template>
        <v-list-item-title class="text-body-2 font-weight-medium">
          {{ group.name || group.groupName || 'Nhóm không tên' }}
        </v-list-item-title>
        <v-list-item-subtitle v-if="group.totalMember" class="text-caption">
          {{ group.totalMember }} thành viên
        </v-list-item-subtitle>
      </v-list-item>
    </v-list>

    <div v-else-if="loading" class="d-flex justify-center pa-6">
      <v-progress-circular indeterminate color="primary" size="32" />
    </div>

    <div v-else class="text-center text-grey pa-6 text-body-2">
      Không có nhóm nào
    </div>

    <div class="pa-3 pt-2">
      <v-btn
        color="primary"
        variant="tonal"
        block
        prepend-icon="mdi-plus"
        @click="$emit('create')"
      >
        Tạo nhóm
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  groups: any[];
  selectedId: string;
  loading: boolean;
}>();

defineEmits<{
  select: [groupId: string];
  create: [];
}>();

const search = ref('');

const filtered = computed(() => {
  if (!search.value) return props.groups;
  const q = search.value.toLowerCase();
  return props.groups.filter(g =>
    (g.name || g.groupName || '').toLowerCase().includes(q),
  );
});
</script>
