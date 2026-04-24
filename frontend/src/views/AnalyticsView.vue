<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center mb-4 flex-wrap gap-2">
      <h1 class="text-h4">
        <v-icon class="mr-2" style="color: #00F2FF;">mdi-chart-timeline-variant-shimmer</v-icon>
        Phân tích nâng cao
      </h1>
      <v-spacer />
      <v-text-field
        v-model="dateFrom"
        label="Từ ngày"
        type="date"
        density="compact"
        variant="outlined"
        style="max-width: 180px;"
        class="mr-2"
        hide-details
      />
      <v-text-field
        v-model="dateTo"
        label="Đến ngày"
        type="date"
        density="compact"
        variant="outlined"
        style="max-width: 180px;"
        class="mr-2"
        hide-details
      />
      <v-btn color="primary" prepend-icon="mdi-refresh" :loading="loading" @click="fetchAll">Xem</v-btn>
    </div>

    <!-- Tabs -->
    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="overview">Tổng quan</v-tab>
      <v-tab value="funnel">Phễu khách hàng</v-tab>
      <v-tab value="team">Đội nhóm</v-tab>
      <v-tab value="response">Thời gian trả lời</v-tab>
      <v-tab value="heatmap">Heatmap</v-tab>
      <v-tab value="tags">Thẻ tag</v-tab>
      <v-tab value="drip">Drip campaigns</v-tab>
      <v-tab value="builder">Báo cáo tùy chỉnh</v-tab>
    </v-tabs>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-4" />

    <v-window v-model="tab">
      <v-window-item value="overview">
        <OverviewPanel :funnel="funnel" :team-performance="teamPerformance" :response-time="responseTime" />
      </v-window-item>

      <v-window-item value="funnel">
        <ConversionFunnelChart :data="funnel" />
      </v-window-item>

      <v-window-item value="team">
        <TeamLeaderboard :data="teamPerformance" />
      </v-window-item>

      <v-window-item value="response">
        <v-row>
          <v-col cols="12"><ResponseTimeChart :data="responseTime" /></v-col>
          <v-col cols="12" v-if="responseTime?.byUser?.length">
            <v-card>
              <v-card-title class="text-body-1">Thời gian trả lời theo nhân viên</v-card-title>
              <v-card-text>
                <v-data-table :headers="rtUserHeaders" :items="responseTime.byUser" density="compact" no-data-text="Không có dữ liệu">
                  <template #item.avgSeconds="{ item }">{{ formatTime(item.avgSeconds) }}</template>
                </v-data-table>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-window-item>

      <v-window-item value="heatmap">
        <ResponseHeatmap :data="responseHeatmap" />
      </v-window-item>

      <v-window-item value="tags">
        <TagDistributionChart :data="tagDistribution" />
      </v-window-item>

      <v-window-item value="drip">
        <DripKpiCard :data="dripKpi" />
      </v-window-item>

      <v-window-item value="builder">
        <ReportBuilder
          :result="customResult"
          :saved-reports="savedReports"
          :loading="loading"
          :date-from="dateFrom"
          :date-to="dateTo"
          @run="runCustomReport"
          @save="onSaveReport"
          @run-saved="onRunSaved"
          @delete-saved="deleteSavedReport"
        />
      </v-window-item>
    </v-window>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useAnalytics } from '@/composables/use-analytics';
import type { ReportConfig, SavedReport } from '@/composables/use-analytics';
import OverviewPanel from '@/components/analytics/OverviewPanel.vue';
import ConversionFunnelChart from '@/components/analytics/ConversionFunnelChart.vue';
import TeamLeaderboard from '@/components/analytics/TeamLeaderboard.vue';
import ResponseTimeChart from '@/components/analytics/ResponseTimeChart.vue';
import ReportBuilder from '@/components/analytics/ReportBuilder.vue';
import ResponseHeatmap from '@/components/analytics/ResponseHeatmap.vue';
import TagDistributionChart from '@/components/analytics/TagDistributionChart.vue';
import DripKpiCard from '@/components/analytics/DripKpiCard.vue';

const {
  funnel, teamPerformance, responseTime, customResult, savedReports,
  responseHeatmap, tagDistribution, dripKpi,
  loading, dateFrom, dateTo,
  fetchAll, runCustomReport, fetchSavedReports, createSavedReport, deleteSavedReport, runSavedReport,
} = useAnalytics();

const tab = ref('overview');

const rtUserHeaders = [
  { title: 'Họ tên', key: 'fullName' },
  { title: 'TG trả lời TB', key: 'avgSeconds', align: 'end' as const },
];

function formatTime(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m === 0 ? `${s} giây` : `${m} phút ${s} giây`;
}

async function onSaveReport(data: { name: string; type: string; config: ReportConfig }) {
  await createSavedReport(data);
}

async function onRunSaved(report: SavedReport) {
  const result = await runSavedReport(report.id);
  if (result) customResult.value = result;
  tab.value = 'builder';
}

onMounted(() => {
  fetchAll();
  fetchSavedReports();
});
</script>
