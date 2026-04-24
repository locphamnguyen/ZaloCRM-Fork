<template>
  <v-row>
    <v-col cols="12" md="6">
      <ConversionFunnelChart :data="funnel" />
    </v-col>
    <v-col cols="12" md="6">
      <ResponseTimeChart :data="responseTime" />
    </v-col>
    <v-col cols="12">
      <TeamLeaderboard :data="teamPerformance" />
    </v-col>
  </v-row>
</template>

<script setup lang="ts">
import ConversionFunnelChart from '@/components/analytics/ConversionFunnelChart.vue';
import ResponseTimeChart from '@/components/analytics/ResponseTimeChart.vue';
import TeamLeaderboard from '@/components/analytics/TeamLeaderboard.vue';
import type { ConversionFunnelData, TeamPerformanceData, ResponseTimeData } from '@/composables/use-analytics';

defineProps<{
  funnel: ConversionFunnelData | null;
  teamPerformance: TeamPerformanceData | null;
  responseTime: ResponseTimeData | null;
}>();
</script>
