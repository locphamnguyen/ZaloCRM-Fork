<template>
  <div>
    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-2" />

    <div class="text-subtitle-2 font-weight-bold mb-2">
      Đã gửi ({{ sentRequests.length }})
    </div>

    <v-list v-if="sentRequests.length" lines="two">
      <v-list-item
        v-for="req in sentRequests"
        :key="req.userId ?? req.id"
        class="px-2"
      >
        <template #prepend>
          <v-avatar color="blue-grey-lighten-4" size="40">
            <v-img v-if="req.avatar" :src="req.avatar" />
            <v-icon v-else color="blue-grey">mdi-account</v-icon>
          </v-avatar>
        </template>

        <v-list-item-title class="font-weight-medium">
          {{ req.displayName ?? req.name ?? req.userId }}
        </v-list-item-title>
        <v-list-item-subtitle v-if="req.phone" class="text-caption">
          {{ req.phone }}
        </v-list-item-subtitle>

        <template #append>
          <v-btn
            size="small"
            variant="outlined"
            color="error"
            prepend-icon="mdi-close"
            @click="emit('cancel', req.userId ?? req.id)"
          >
            Hủy
          </v-btn>
        </template>
      </v-list-item>
    </v-list>

    <div v-else-if="!loading" class="text-center text-grey py-6">
      <v-icon size="40" color="grey-lighten-1">mdi-send-clock-outline</v-icon>
      <div class="mt-2 text-body-2">Không có lời mời nào đã gửi</div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  sentRequests: any[];
  loading: boolean;
}>();

const emit = defineEmits<{
  cancel: [userId: string];
  accept: [userId: string];
  reject: [userId: string];
}>();
</script>

<style scoped>
</style>
