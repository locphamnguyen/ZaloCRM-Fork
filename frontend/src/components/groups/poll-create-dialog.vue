<template>
  <v-dialog v-model="open" max-width="520" persistent scrollable>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-poll</v-icon>
        Tạo bình chọn
      </v-card-title>

      <v-card-text>
        <v-text-field
          v-model="form.question"
          label="Câu hỏi"
          variant="outlined"
          density="comfortable"
          autofocus
          class="mb-4"
        />

        <div class="mb-2 text-body-2 font-weight-medium">Các lựa chọn</div>
        <div
          v-for="(opt, idx) in form.options"
          :key="idx"
          class="d-flex align-center gap-2 mb-2"
        >
          <v-text-field
            v-model="form.options[idx]"
            :label="`Lựa chọn ${idx + 1}`"
            variant="outlined"
            density="compact"
            hide-details
          />
          <v-btn
            icon="mdi-close"
            size="small"
            variant="text"
            color="error"
            :disabled="form.options.length <= 2"
            @click="removeOption(idx)"
          />
        </div>
        <v-btn
          size="small"
          variant="tonal"
          prepend-icon="mdi-plus"
          class="mb-4"
          @click="form.options.push('')"
        >
          Thêm lựa chọn
        </v-btn>

        <v-row dense class="mb-2">
          <v-col cols="6">
            <v-switch
              v-model="form.multi"
              label="Chọn nhiều"
              color="primary"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col cols="6">
            <v-switch
              v-model="form.anonymous"
              label="Ẩn danh"
              color="primary"
              density="compact"
              hide-details
            />
          </v-col>
        </v-row>

        <v-text-field
          v-model="expireHours"
          label="Hết hạn sau (giờ, để trống = không giới hạn)"
          variant="outlined"
          density="compact"
          type="number"
          min="1"
          hide-details
        />
      </v-card-text>

      <v-card-actions class="px-4 pb-4">
        <v-spacer />
        <v-btn variant="text" @click="cancel">Hủy</v-btn>
        <v-btn
          color="primary"
          variant="elevated"
          :disabled="!form.question.trim() || form.options.some(o => !o.trim())"
          @click="submit"
        >
          Tạo bình chọn
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
  create: [payload: {
    question: string;
    options: string[];
    multi: boolean;
    anonymous: boolean;
    expireMs?: number;
  }];
}>();

const open = ref(props.modelValue);
watch(() => props.modelValue, v => (open.value = v));
watch(open, v => emit('update:modelValue', v));

const expireHours = ref('');
const form = ref({ question: '', options: ['', ''], multi: false, anonymous: false });

function removeOption(idx: number) {
  form.value.options.splice(idx, 1);
}

function submit() {
  const expireMs = expireHours.value ? Number(expireHours.value) * 3600 * 1000 : undefined;
  emit('create', {
    question: form.value.question.trim(),
    options: form.value.options.map(o => o.trim()).filter(Boolean),
    multi: form.value.multi,
    anonymous: form.value.anonymous,
    expireMs,
  });
  cancel();
}

function cancel() {
  open.value = false;
  form.value = { question: '', options: ['', ''], multi: false, anonymous: false };
  expireHours.value = '';
}
</script>
