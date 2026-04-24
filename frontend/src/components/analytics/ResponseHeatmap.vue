<template>
  <v-card>
    <v-card-title class="text-body-1">Bản đồ nhiệt thời gian trả lời</v-card-title>
    <v-card-text>
      <div v-if="!hasData" class="text-center pa-8 text-grey">Không có dữ liệu</div>
      <div v-else>
        <!-- Hour column labels -->
        <div class="heatmap-grid">
          <div class="heatmap-corner" />
          <div v-for="h in hours" :key="h" class="heatmap-hour-label">{{ h }}</div>

          <!-- Rows: one per day-of-week -->
          <template v-for="(dow, rowIdx) in dows" :key="rowIdx">
            <div class="heatmap-day-label">{{ dow }}</div>
            <div
              v-for="h in hours"
              :key="h"
              class="heatmap-cell"
              :style="{ backgroundColor: cellColor(rowIdx, h) }"
              :title="cellTooltip(rowIdx, h)"
            />
          </template>
        </div>

        <!-- Legend -->
        <div class="d-flex align-center mt-3 gap-2" style="max-width: 320px;">
          <span class="text-caption">Nhanh</span>
          <div class="legend-gradient flex-grow-1" />
          <span class="text-caption">Chậm</span>
        </div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { HeatmapData } from '@/composables/use-analytics';

const props = defineProps<{ data: HeatmapData | null }>();

// 0=Sunday→CN, 1→T2, …, 6→T7
const dows = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const hours = Array.from({ length: 24 }, (_, i) => i);

// Build lookup: dow+hour → { avgSeconds, sampleCount }
const cellMap = computed(() => {
  const map = new Map<string, { avgSeconds: number; sampleCount: number }>();
  for (const c of props.data?.cells ?? []) {
    map.set(`${c.dow}:${c.hour}`, { avgSeconds: c.avgSeconds, sampleCount: c.sampleCount });
  }
  return map;
});

const hasData = computed(() => (props.data?.cells?.length ?? 0) > 0);

// Interpolate between teal (fast ≤60s) and amber (slow ≥600s)
// Using #1ABC9C → #E67E22 — accessible, avoids pure red/green
function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

const FAST = { r: 0x1A, g: 0xBC, b: 0x9C }; // #1ABC9C teal
const SLOW = { r: 0xE6, g: 0x7E, b: 0x22 }; // #E67E22 amber/orange

function secondsToColor(s: number): string {
  const t = (s - 60) / (600 - 60); // 0 at 60s, 1 at 600s
  const r = lerp(FAST.r, SLOW.r, t);
  const g = lerp(FAST.g, SLOW.g, t);
  const b = lerp(FAST.b, SLOW.b, t);
  return `rgb(${r},${g},${b})`;
}

function cellColor(dow: number, hour: number): string {
  const entry = cellMap.value.get(`${dow}:${hour}`);
  if (!entry) return '#ECEFF1';
  return secondsToColor(entry.avgSeconds);
}

function cellTooltip(dow: number, hour: number): string {
  const entry = cellMap.value.get(`${dow}:${hour}`);
  if (!entry) return '';
  const label = dows[dow];
  const s = entry.avgSeconds;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  const timeStr = m > 0 ? `${m} phút ${sec} giây` : `${sec} giây`;
  return `${label} ${hour}:00 — ${timeStr} (${entry.sampleCount} mẫu)`;
}
</script>

<style scoped>
.heatmap-grid {
  display: grid;
  grid-template-columns: 28px repeat(24, 1fr);
  gap: 2px;
  overflow-x: auto;
}
.heatmap-corner {
  /* spacer for top-left */
}
.heatmap-hour-label {
  font-size: 10px;
  text-align: center;
  color: #78909c;
  line-height: 1;
  padding: 2px 0;
}
.heatmap-day-label {
  font-size: 11px;
  font-weight: 600;
  color: #546e7a;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 4px;
}
.heatmap-cell {
  height: 22px;
  border-radius: 2px;
  cursor: default;
  transition: opacity 0.15s;
}
.heatmap-cell:hover {
  opacity: 0.75;
}
.legend-gradient {
  height: 10px;
  border-radius: 4px;
  background: linear-gradient(to right, #1abc9c, #e67e22);
}
</style>
