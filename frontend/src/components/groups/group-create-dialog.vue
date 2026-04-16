<template>
  <v-dialog v-model="open" max-width="480" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-account-group-outline</v-icon>
        Tạo nhóm mới
      </v-card-title>

      <v-card-text>
        <v-text-field
          v-model="form.name"
          label="Tên nhóm"
          variant="outlined"
          density="comfortable"
          autofocus
          :rules="[v => !!v || 'Vui lòng nhập tên nhóm']"
          class="mb-3"
        />
        <v-textarea
          v-model="memberInput"
          label="ID thành viên"
          variant="outlined"
          density="comfortable"
          placeholder="Nhập các ID cách nhau bởi dấu phẩy hoặc xuống dòng"
          hint="VD: 123456, 789012"
          rows="3"
          persistent-hint
        />
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="cancel">Hủy</v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          :disabled="!form.name.trim()"
          @click="submit"
        >
          Tạo nhóm
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [val: boolean];
  create: [payload: { name: string; memberIds: string[] }];
}>();

const open = ref(props.modelValue);
watch(() => props.modelValue, v => (open.value = v));
watch(open, v => emit('update:modelValue', v));

const form = ref({ name: '' });
const memberInput = ref('');

function parseMemberIds(): string[] {
  return memberInput.value
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function submit() {
  if (!form.value.name.trim()) return;
  emit('create', { name: form.value.name.trim(), memberIds: parseMemberIds() });
  cancel();
}

function cancel() {
  open.value = false;
  form.value.name = '';
  memberInput.value = '';
}
</script>
