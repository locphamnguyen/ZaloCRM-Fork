<template>
  <v-dialog v-model="open" max-width="480" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-cog-outline</v-icon>
        Cài đặt nhóm
      </v-card-title>

      <v-card-text>
        <p class="text-caption text-grey mb-4">{{ group?.name || 'Nhóm' }}</p>

        <v-text-field
          v-model="newName"
          label="Đổi tên nhóm"
          variant="outlined"
          density="comfortable"
          class="mb-2"
        />
      </v-card-text>

      <v-card-actions class="px-4 pb-2">
        <v-spacer />
        <v-btn variant="text" @click="open = false">Hủy</v-btn>
        <v-btn color="primary" variant="elevated" @click="save">Lưu</v-btn>
      </v-card-actions>

      <v-divider />

      <v-card-actions class="px-4 py-3 d-flex gap-2">
        <v-btn
          color="warning"
          variant="tonal"
          prepend-icon="mdi-exit-to-app"
          @click="emit('leave'); open = false"
        >
          Rời nhóm
        </v-btn>
        <v-spacer />
        <v-btn
          color="error"
          variant="tonal"
          prepend-icon="mdi-delete-forever"
          @click="emit('disperse'); open = false"
        >
          Giải tán nhóm
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ modelValue: boolean; group: any }>();
const emit = defineEmits<{
  'update:modelValue': [val: boolean];
  save: [settings: { name: string }];
  leave: [];
  disperse: [];
}>();

const open = ref(props.modelValue);
watch(() => props.modelValue, v => (open.value = v));
watch(open, v => emit('update:modelValue', v));

const newName = ref('');
watch(() => props.group, g => { newName.value = g?.name || ''; }, { immediate: true });

function save() {
  emit('save', { name: newName.value.trim() });
  open.value = false;
}
</script>
