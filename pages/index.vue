<script setup lang="ts">
import { fetchKPIData, KPI_META } from '~/composables/useKPIData'
import type { KPISnapshot, KPIValues, KPIDirection, TimeSlot } from '~/composables/useKPIData'

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const TIME_SLOTS: TimeSlot[] = ['8:00', '13:00', '17:00']

const data = ref<KPISnapshot | null>(null)
const lastUpdated = ref<Date | null>(null)
const isRefreshing = ref(false)

async function refresh(randomize = false) {
  isRefreshing.value = true
  data.value = await fetchKPIData(randomize)
  lastUpdated.value = new Date()
  isRefreshing.value = false
}

// Load on mount
onMounted(() => refresh())

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function fmt(v: number, unit?: string): string {
  const s = v % 1 === 0 ? v.toLocaleString() : v.toFixed(1)
  return unit ? `${s}${unit}` : s
}

// ---------------------------------------------------------------------------
// Trend indicator: compare value against its pair
// Arrow goes from [0] → [1] perspective: is [1] better or worse than [0]?
// ---------------------------------------------------------------------------
function trend(a: number, b: number): string {
  if (b > a * 1.01) return '↑'
  if (b < a * 0.99) return '↓'
  return '→'
}

// ---------------------------------------------------------------------------
// Color coding
// ---------------------------------------------------------------------------
// We evaluate the first value of each cell against the slot's own range
// to decide red / green / neutral badge color.

function valueColor(
  v: number,
  key: keyof KPIValues,
  direction: KPIDirection,
): string {
  if (direction === 'neutral') return 'text-zinc-400'

  // Get all first-values for this KPI across all slots to find min/max
  if (!data.value) return 'text-zinc-300'
  const vals = TIME_SLOTS.map(s => data.value![s][key][0])
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (max === min) return 'text-zinc-300'

  const norm = (v - min) / (max - min) // 0 = min, 1 = max

  if (direction === 'higher-better') {
    if (norm >= 0.7) return 'text-emerald-400 font-semibold'
    if (norm <= 0.3) return 'text-red-400 font-semibold'
    return 'text-zinc-300'
  } else {
    // lower-better: high norm = bad
    if (norm >= 0.7) return 'text-red-400 font-semibold'
    if (norm <= 0.3) return 'text-emerald-400 font-semibold'
    return 'text-zinc-300'
  }
}

function trendColor(a: number, b: number, direction: KPIDirection): string {
  if (direction === 'neutral') return 'text-zinc-500'
  const t = trend(a, b)
  if (t === '→') return 'text-zinc-500'
  const upIsGood = direction === 'higher-better'
  if (t === '↑') return upIsGood ? 'text-emerald-400' : 'text-red-400'
  return upIsGood ? 'text-red-400' : 'text-emerald-400'
}

// ---------------------------------------------------------------------------
// Timestamp
// ---------------------------------------------------------------------------
const formattedTime = computed(() => {
  if (!lastUpdated.value) return '—'
  return lastUpdated.value.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
})
</script>

<template>
  <div class="min-h-screen bg-zinc-950 text-zinc-100 p-4">
    <!-- ------------------------------------------------------------------ -->
    <!-- Header                                                               -->
    <!-- ------------------------------------------------------------------ -->
    <div class="flex items-center justify-between mb-4 gap-4 flex-wrap">
      <div class="flex items-center gap-3">
        <UIcon name="i-heroicons-chart-bar-square" class="w-7 h-7 text-emerald-400" />
        <div>
          <h1 class="text-lg font-bold tracking-tight text-zinc-50">Fleet Operations KPIs</h1>
          <p class="text-xs text-zinc-500">HumanForest · Supervisor Dashboard</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <span class="text-xs text-zinc-500">
          Last updated: <span class="text-zinc-300 font-mono">{{ formattedTime }}</span>
        </span>
        <UButton
          icon="i-heroicons-arrow-path"
          size="sm"
          color="neutral"
          variant="outline"
          :loading="isRefreshing"
          @click="refresh(true)"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <!-- ------------------------------------------------------------------ -->
    <!-- Table                                                                -->
    <!-- ------------------------------------------------------------------ -->
    <UCard
      :ui="{
        body: 'p-0 overflow-auto',
        root: 'overflow-hidden ring-1 ring-zinc-800',
      }"
    >
      <table class="w-full border-collapse text-sm">
        <!-- Sticky header -->
        <thead class="sticky top-0 z-20 bg-zinc-900">
          <tr>
            <!-- KPI label column -->
            <th
              class="sticky left-0 z-30 bg-zinc-900 px-4 py-3 text-left text-xs font-semibold uppercase tracking-widest text-zinc-400 border-b border-r border-zinc-800 min-w-[160px]"
            >
              KPI
            </th>
            <!-- Time slot columns: each spans 2 sub-columns -->
            <th
              v-for="slot in TIME_SLOTS"
              :key="slot"
              colspan="2"
              class="px-4 py-3 text-center text-xs font-semibold uppercase tracking-widest text-emerald-400 border-b border-r border-zinc-800 last:border-r-0"
            >
              {{ slot }}
            </th>
          </tr>
          <!-- Sub-header: Today / Prev per slot -->
          <tr class="bg-zinc-900/80">
            <th class="sticky left-0 z-30 bg-zinc-900/80 border-b border-r border-zinc-800" />
            <template v-for="slot in TIME_SLOTS" :key="`sub-${slot}`">
              <th class="px-3 py-1.5 text-center text-[10px] text-zinc-500 border-b border-zinc-800 font-normal">
                Today
              </th>
              <th class="px-3 py-1.5 text-center text-[10px] text-zinc-500 border-b border-r border-zinc-800 last:border-r-0 font-normal">
                Prev
              </th>
            </template>
          </tr>
        </thead>

        <tbody v-if="data">
          <tr
            v-for="(kpi, idx) in KPI_META"
            :key="kpi.key"
            :class="[
              idx % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/40',
              'hover:bg-zinc-800/60 transition-colors',
            ]"
          >
            <!-- KPI label — sticky first column -->
            <td
              :class="[
                'sticky left-0 z-10 px-4 py-2.5 font-medium text-zinc-200 border-r border-zinc-800 whitespace-nowrap',
                idx % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/40',
              ]"
            >
              <UTooltip
                :text="kpi.direction === 'higher-better' ? 'Higher is better' : kpi.direction === 'lower-better' ? 'Lower is better' : 'Neutral'"
              >
                <span class="cursor-default">{{ kpi.label }}</span>
              </UTooltip>
              <span v-if="kpi.unit" class="ml-1 text-xs text-zinc-500">({{ kpi.unit }})</span>
            </td>

            <!-- Slot cells -->
            <template v-for="slot in TIME_SLOTS" :key="`${kpi.key}-${slot}`">
              <!-- Primary value (Today) -->
              <td class="px-3 py-2.5 text-center tabular-nums">
                <div class="flex items-center justify-center gap-1">
                  <span :class="valueColor(data[slot][kpi.key][0], kpi.key, kpi.direction)">
                    {{ fmt(data[slot][kpi.key][0], kpi.unit) }}
                  </span>
                  <UTooltip :text="`Today vs Prev: ${trend(data[slot][kpi.key][0], data[slot][kpi.key][1])}`">
                    <span
                      :class="['text-xs', trendColor(data[slot][kpi.key][0], data[slot][kpi.key][1], kpi.direction)]"
                    >
                      {{ trend(data[slot][kpi.key][0], data[slot][kpi.key][1]) }}
                    </span>
                  </UTooltip>
                </div>
              </td>

              <!-- Comparison value (Prev) — dimmer -->
              <td
                class="px-3 py-2.5 text-center tabular-nums text-zinc-500 border-r border-zinc-800 last:border-r-0 text-xs"
              >
                {{ fmt(data[slot][kpi.key][1], kpi.unit) }}
              </td>
            </template>
          </tr>
        </tbody>

        <!-- Loading skeleton -->
        <tbody v-else>
          <tr v-for="n in 10" :key="n" :class="n % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/40'">
            <td class="sticky left-0 px-4 py-3 border-r border-zinc-800" :class="n % 2 === 0 ? 'bg-zinc-950' : 'bg-zinc-900/40'">
              <div class="h-3 w-28 bg-zinc-800 rounded animate-pulse" />
            </td>
            <td v-for="c in 6" :key="c" class="px-3 py-3 text-center border-r border-zinc-800 last:border-r-0">
              <div class="h-3 w-12 bg-zinc-800 rounded animate-pulse mx-auto" />
            </td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <!-- ------------------------------------------------------------------ -->
    <!-- Legend                                                               -->
    <!-- ------------------------------------------------------------------ -->
    <div class="mt-3 flex items-center gap-5 text-xs text-zinc-500 flex-wrap">
      <div class="flex items-center gap-1.5">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
        <span>Good</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
        <span>Needs attention</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="text-zinc-400 font-mono">↑ ↓ →</span>
        <span>Trend: Today vs Prev</span>
      </div>
      <div class="ml-auto text-zinc-600">
        Data: prototype only · 06 Mar 2026 baseline
      </div>
    </div>
  </div>
</template>
