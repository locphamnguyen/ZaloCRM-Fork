import { ref } from 'vue';
import { api } from '@/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FunnelStage {
  status: string;
  count: number;
  rate: number;
}

export interface ConversionFunnelData {
  stages: FunnelStage[];
  totalContacts: number;
  avgConversionDays: number | null;
}

export interface TeamMember {
  userId: string;
  fullName: string;
  messagesSent: number;
  contactsConverted: number;
  appointmentsCompleted: number;
  avgResponseTime: number | null;
}

export interface TeamPerformanceData {
  users: TeamMember[];
}

export interface ResponseTimeData {
  daily: { date: string; avgSeconds: number }[];
  overall: number | null;
  byUser: { userId: string; fullName: string; avgSeconds: number }[];
}

export interface ReportConfig {
  metrics: string[];
  groupBy: string;
  dateRange: { from: string; to: string };
  filters?: { userId?: string; source?: string; status?: string };
}

export interface CustomReportResult {
  labels: string[];
  datasets: { metric: string; data: number[] }[];
}

export interface SavedReport {
  id: string;
  name: string;
  type: string;
  config: any;
  createdAt: string;
}

export interface HeatmapCell {
  dow: number;   // 0=Sunday … 6=Saturday
  hour: number;  // 0–23
  avgSeconds: number;
  sampleCount: number;
}

export interface HeatmapData {
  cells: HeatmapCell[];
}

export interface TagDistributionItem {
  tagId: string;
  name: string;
  color: string;
  source: string;
  contactCount: number;
  percent: number;
}

export interface TagDistributionData {
  tags: TagDistributionItem[];
}

export interface DripCampaign {
  id: string;
  name: string;
  enrolled: number;
  active: number;
  completed: number;
  failed: number;
  cancelled: number;
  sendSuccessRate: number;
  avgDaysToComplete: number | null;
}

export interface DripKpiData {
  campaigns: DripCampaign[];
}

// ── Composable ────────────────────────────────────────────────────────────────

const defaultFrom = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};
const defaultTo = () => new Date().toISOString().slice(0, 10);

export function useAnalytics() {
  const funnel = ref<ConversionFunnelData | null>(null);
  const teamPerformance = ref<TeamPerformanceData | null>(null);
  const responseTime = ref<ResponseTimeData | null>(null);
  const customResult = ref<CustomReportResult | null>(null);
  const savedReports = ref<SavedReport[]>([]);
  const responseHeatmap = ref<HeatmapData | null>(null);
  const tagDistribution = ref<TagDistributionData | null>(null);
  const dripKpi = ref<DripKpiData | null>(null);
  const loading = ref(false);
  const dateFrom = ref(defaultFrom());
  const dateTo = ref(defaultTo());

  async function fetchFunnel() {
    const res = await api.get('/analytics/conversion-funnel', {
      params: { from: dateFrom.value, to: dateTo.value },
    });
    funnel.value = res.data;
  }

  async function fetchTeamPerformance() {
    const res = await api.get('/analytics/team-performance', {
      params: { from: dateFrom.value, to: dateTo.value },
    });
    teamPerformance.value = res.data;
  }

  async function fetchResponseTime() {
    const res = await api.get('/analytics/response-time', {
      params: { from: dateFrom.value, to: dateTo.value },
    });
    responseTime.value = res.data;
  }

  async function fetchHeatmap() {
    const res = await api.get('/analytics/response-heatmap', {
      params: { from: dateFrom.value, to: dateTo.value },
    });
    responseHeatmap.value = res.data;
  }

  async function fetchTagDistribution() {
    const res = await api.get('/analytics/tag-distribution');
    tagDistribution.value = res.data;
  }

  async function fetchDripKpi() {
    const res = await api.get('/analytics/drip-kpi', {
      params: { from: dateFrom.value, to: dateTo.value },
    });
    dripKpi.value = res.data;
  }

  async function fetchAll() {
    loading.value = true;
    try {
      await Promise.all([
        fetchFunnel(),
        fetchTeamPerformance(),
        fetchResponseTime(),
        fetchHeatmap(),
        fetchTagDistribution(),
        fetchDripKpi(),
      ]);
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      loading.value = false;
    }
  }

  async function runCustomReport(config: ReportConfig) {
    loading.value = true;
    try {
      const res = await api.post('/analytics/custom', config);
      customResult.value = res.data;
    } catch (err) {
      console.error('Custom report error:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchSavedReports() {
    try {
      const res = await api.get('/saved-reports');
      savedReports.value = res.data.data || [];
    } catch (err) {
      console.error('Saved reports fetch error:', err);
    }
  }

  async function createSavedReport(data: { name: string; type: string; config: any }) {
    const res = await api.post('/saved-reports', data);
    savedReports.value.unshift(res.data);
    return res.data;
  }

  async function deleteSavedReport(id: string) {
    await api.delete(`/saved-reports/${id}`);
    savedReports.value = savedReports.value.filter((r) => r.id !== id);
  }

  async function runSavedReport(id: string) {
    loading.value = true;
    try {
      const res = await api.post(`/saved-reports/${id}/run`);
      return res.data;
    } catch (err) {
      console.error('Run saved report error:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  return {
    funnel, teamPerformance, responseTime, customResult, savedReports,
    responseHeatmap, tagDistribution, dripKpi,
    loading, dateFrom, dateTo,
    fetchAll, fetchFunnel, fetchTeamPerformance, fetchResponseTime,
    fetchHeatmap, fetchTagDistribution, fetchDripKpi,
    runCustomReport, fetchSavedReports, createSavedReport, deleteSavedReport, runSavedReport,
  };
}
