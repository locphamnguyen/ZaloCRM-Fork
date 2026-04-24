<template>
  <v-card>
    <v-card-title class="text-body-1">Phân phối thẻ tag</v-card-title>
    <v-card-text>
      <div v-if="!hasData" class="text-center pa-8 text-grey">Không có dữ liệu</div>
      <Bar v-else :data="chartData" :options="chartOptions" style="max-height: 320px;" />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Bar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import type { TagDistributionData } from '@/composables/use-analytics';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const props = defineProps<{ data: TagDistributionData | null }>();

const hasData = computed(() => (props.data?.tags?.length ?? 0) > 0);

const chartData = computed(() => {
  const tags = props.data?.tags ?? [];
  return {
    labels: tags.map((t) => t.name),
    datasets: [
      {
        label: 'Số liên hệ',
        data: tags.map((t) => t.contactCount),
        backgroundColor: tags.map((t) => t.color || '#78909C'),
        borderRadius: 4,
      },
    ],
  };
});

const chartOptions = {
  indexAxis: 'y' as const,
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (ctx: { dataIndex: number; raw: unknown }) => {
          const tag = props.data?.tags?.[ctx.dataIndex];
          if (!tag) return String(ctx.raw);
          return `${tag.contactCount} liên hệ (${tag.percent.toFixed(1)}%)`;
        },
      },
    },
  },
  scales: {
    x: { beginAtZero: true, title: { display: true, text: 'Số liên hệ' } },
  },
};
</script>
