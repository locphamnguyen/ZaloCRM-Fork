<template>
  <div
    class="chat-contact-panel d-flex flex-column"
    style="width: 320px; border-left: 1px solid rgba(0,0,0,0.12); height: 100%; overflow-y: auto; flex-shrink: 0;"
  >
    <div class="pa-3 d-flex align-center" style="border-bottom: 1px solid rgba(0,0,0,0.12);">
      <v-icon icon="mdi-account-details" class="mr-2" />
      <span class="font-weight-medium">Thông tin khách hàng</span>
      <v-spacer />
      <v-btn icon size="small" variant="text" @click="$emit('close')">
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </div>

    <div class="pa-3">
      <!-- Lead score + last activity display -->
      <div v-if="props.contact" class="d-flex align-center mb-3 ga-2">
        <v-chip
          :color="scoreColor(props.contact.leadScore)"
          size="small"
          variant="tonal"
          prepend-icon="mdi-star"
        >
          {{ props.contact.leadScore ?? 0 }} điểm
        </v-chip>
        <span v-if="props.contact.lastActivity" class="text-caption text-grey">
          {{ relativeTime(props.contact.lastActivity) }}
        </span>
      </div>

      <v-text-field v-model="form.crmName" label="Tên CRM (tên thật)" density="compact" variant="outlined" class="mb-2" hide-details
        hint="Tên chuẩn hóa dùng cho automation, VD: Nguyễn Văn Hải" persistent-hint />
      <v-text-field v-model="form.fullName" label="Tên hiển thị Zalo" density="compact" variant="outlined" class="mb-2" hide-details
        hint="Tên gợi nhớ trên Zalo, VD: Hải - Quan tâm 2PN" persistent-hint />
      <v-text-field v-model="form.phone" label="Số điện thoại" density="compact" variant="outlined" class="mb-2" hide-details />
      <v-text-field v-model="form.email" label="Email" type="email" density="compact" variant="outlined" class="mb-2" hide-details />

      <v-select v-model="form.source" label="Nguồn" :items="SOURCE_OPTIONS" item-title="text" item-value="value"
        density="compact" variant="outlined" clearable class="mb-2" hide-details />

      <v-select v-model="form.status" label="Trạng thái" :items="STATUS_OPTIONS" item-title="text" item-value="value"
        density="compact" variant="outlined" clearable class="mb-2" hide-details />

      <v-text-field v-model="form.firstContactDate" label="Ngày tiếp nhận" type="date"
        density="compact" variant="outlined" class="mb-2" hide-details />

      <v-text-field v-model="form.nextAppointmentDate" label="Hẹn tái khám" type="date"
        density="compact" variant="outlined" class="mb-2" hide-details />

      <v-combobox v-model="form.tags" label="Tags" multiple chips closable-chips
        density="compact" variant="outlined" class="mb-2" hide-details />

      <v-textarea v-model="form.notes" label="Ghi chú" rows="2" auto-grow
        density="compact" variant="outlined" class="mb-3" hide-details />

      <v-btn color="primary" block :loading="saving" @click="saveContact">Lưu thông tin</v-btn>

      <v-alert v-if="saveSuccess" type="success" density="compact" class="mt-2" closable @click:close="saveSuccess = false">
        Đã lưu thành công!
      </v-alert>
      <v-alert v-if="saveError" type="error" density="compact" class="mt-2" closable @click:close="saveError = false">
        Lưu thất bại, thử lại!
      </v-alert>

      <AiSummaryCard :summary="aiSummary" :loading="aiSummaryLoading" @refresh="$emit('refresh-ai-summary')" />

      <v-card variant="outlined" class="mb-3">
        <v-card-title class="d-flex align-center text-body-1">
          <v-icon class="mr-2">mdi-chart-bell-curve-cumulative</v-icon>
          Cảm xúc khách hàng
          <v-spacer />
          <v-btn size="small" variant="text" :loading="aiSentimentLoading" @click="$emit('refresh-ai-sentiment')">Làm mới</v-btn>
        </v-card-title>
        <v-card-text>
          <AiSentimentBadge :sentiment="aiSentiment" />
          <div v-if="aiSentiment?.reason" class="text-body-2 mt-2">{{ aiSentiment.reason }}</div>
        </v-card-text>
      </v-card>

      <ChatAppointments
        v-if="props.contactId"
        :contact-id="props.contactId"
        :appointments="contactAppointments"
        @refresh="reloadAppointments"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { SOURCE_OPTIONS, STATUS_OPTIONS } from '@/composables/use-contacts';
import type { Contact } from '@/composables/use-contacts';
import type { AiSentiment } from '@/composables/use-chat';
import { useChatContactPanel } from '@/composables/use-chat-contact-panel';
import ChatAppointments from './ChatAppointments.vue';
import AiSummaryCard from '@/components/ai/ai-summary-card.vue';
import AiSentimentBadge from '@/components/ai/ai-sentiment-badge.vue';

const props = defineProps<{
  contactId: string | null;
  contact: Contact | null;
  aiSummary: string;
  aiSummaryLoading: boolean;
  aiSentiment: AiSentiment | null;
  aiSentimentLoading: boolean;
}>();

const emit = defineEmits<{ close: []; saved: []; 'refresh-ai-summary': []; 'refresh-ai-sentiment': [] }>();

const {
  form, saving, saveSuccess, saveError,
  contactAppointments,
  saveContact, reloadAppointments,
} = useChatContactPanel(
  () => props.contactId,
  () => props.contact,
  () => emit('saved'),
);

function scoreColor(score: number) {
  if (score >= 70) return 'success';
  if (score >= 40) return 'orange';
  return 'error';
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  return `${days} ngày trước`;
}
</script>
