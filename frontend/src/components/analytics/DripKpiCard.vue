<template>
  <div>
    <div v-if="!hasData" class="d-flex justify-center pa-8">
      <v-card width="320">
        <v-card-text class="text-center text-grey">Không có dữ liệu</v-card-text>
      </v-card>
    </div>
    <v-row v-else>
      <v-col v-for="campaign in data!.campaigns" :key="campaign.id" cols="12" md="6" lg="4">
        <v-card>
          <v-card-title class="text-body-1 font-weight-bold">{{ campaign.name }}</v-card-title>
          <v-card-text>
            <!-- Status chips -->
            <div class="d-flex flex-wrap gap-2 mb-3">
              <v-chip size="small" color="blue-grey" variant="tonal">
                <v-icon start size="12">mdi-account-multiple</v-icon>
                {{ campaign.enrolled }} đăng ký
              </v-chip>
              <v-chip size="small" color="primary" variant="tonal">
                <v-icon start size="12">mdi-play-circle</v-icon>
                {{ campaign.active }} đang chạy
              </v-chip>
              <v-chip size="small" color="success" variant="tonal">
                <v-icon start size="12">mdi-check-circle</v-icon>
                {{ campaign.completed }} hoàn thành
              </v-chip>
              <v-chip size="small" color="error" variant="tonal">
                <v-icon start size="12">mdi-alert-circle</v-icon>
                {{ campaign.failed }} lỗi
              </v-chip>
              <v-chip size="small" color="warning" variant="tonal">
                <v-icon start size="12">mdi-cancel</v-icon>
                {{ campaign.cancelled }} hủy
              </v-chip>
            </div>

            <!-- KPI metrics -->
            <v-divider class="mb-3" />
            <div class="d-flex justify-space-between text-body-2">
              <span class="text-grey">Gửi thành công</span>
              <span class="font-weight-medium">{{ campaign.sendSuccessRate.toFixed(1) }}%</span>
            </div>
            <div class="d-flex justify-space-between text-body-2 mt-1">
              <span class="text-grey">TG hoàn thành TB</span>
              <span class="font-weight-medium">
                {{ campaign.avgDaysToComplete != null ? `${campaign.avgDaysToComplete.toFixed(1)} ngày` : '—' }}
              </span>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DripKpiData } from '@/composables/use-analytics';

const props = defineProps<{ data: DripKpiData | null }>();

const hasData = computed(() => (props.data?.campaigns?.length ?? 0) > 0);
</script>
