<template>
  <div class="d-flex flex-column ga-4">
    <div class="d-flex align-center">
      <v-spacer />
      <v-btn v-if="canManage" color="primary" prepend-icon="mdi-plus" @click="openCreate">Thêm template</v-btn>
    </div>

    <v-data-table :headers="headers" :items="templates" :loading="loading" no-data-text="Chưa có template nào">
      <template #item.content="{ item }">
        <div class="text-body-2 text-medium-emphasis" style="max-width: 480px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          {{ item.content }}
        </div>
      </template>
      <template #item.actions="{ item }">
        <div v-if="canManage">
          <v-btn icon size="small" @click="openEdit(item)"><v-icon>mdi-pencil</v-icon></v-btn>
          <v-btn icon size="small" color="error" @click="remove(item.id)"><v-icon>mdi-delete</v-icon></v-btn>
        </div>
      </template>
    </v-data-table>

    <v-dialog v-model="showDialog" max-width="640">
      <v-card>
        <v-card-title>{{ form.id ? 'Sửa template' : 'Tạo template' }}</v-card-title>
        <v-card-text class="d-flex flex-column ga-3">
          <v-text-field v-model="form.name" label="Tên template *" :rules="[v => !!v || 'Bắt buộc']" />
          <v-text-field v-model="form.category" label="Nhóm" />
          <v-textarea v-model="form.content" label="Nội dung *" rows="6" :rules="[v => !!v || 'Bắt buộc']" hint="Hỗ trợ {{contact.fullName}}, {{contact.phone}}, {{contact.status}}, {{conversation.id}}, {{org.name}}" persistent-hint />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showDialog = false">Hủy</v-btn>
          <v-btn color="primary" :loading="saving" @click="save">Lưu</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import type { MessageTemplate } from '@/composables/use-message-templates';

const props = defineProps<{
  templates: MessageTemplate[];
  loading: boolean;
  saving: boolean;
  canManage: boolean;
}>();

const emit = defineEmits<{
  create: [payload: Partial<MessageTemplate>];
  update: [id: string, payload: Partial<MessageTemplate>];
  delete: [id: string];
}>();

const showDialog = ref(false);
const form = reactive<Partial<MessageTemplate>>({ id: '', name: '', category: '', content: '' });

const headers = [
  { title: 'Tên', key: 'name' },
  { title: 'Nhóm', key: 'category' },
  { title: 'Nội dung', key: 'content', sortable: false },
  { title: 'Hành động', key: 'actions', sortable: false, align: 'end' as const },
];

function openCreate() {
  form.id = '';
  form.name = '';
  form.category = '';
  form.content = '';
  showDialog.value = true;
}

function openEdit(template: MessageTemplate) {
  form.id = template.id;
  form.name = template.name;
  form.category = template.category ?? '';
  form.content = template.content;
  showDialog.value = true;
}

function save() {
  if (!form.name?.trim() || !form.content?.trim()) return;
  const payload = { name: form.name, category: form.category, content: form.content };
  if (form.id) {
    emit('update', form.id, payload);
  } else {
    emit('create', payload);
  }
  showDialog.value = false;
}

function remove(id: string) {
  emit('delete', id);
}
</script>
