<script setup lang="ts">
import { CalendarDate } from '@internationalized/date'
import {
  fetchKPIData,
  generateSparklines,
  KPI_META,
  BASELINE,
  seededRand,
} from '~/composables/useKPIData'
import type { KPISnapshot, KPIValues, KPIDirection, TimeSlot, SparkSeries } from '~/composables/useKPIData'

// ---------------------------------------------------------------------------
// Time slots
// ---------------------------------------------------------------------------
const TIME_SLOTS: TimeSlot[] = ['8:00', '13:00', '17:00']

// ---------------------------------------------------------------------------
// Selected date (CalendarDate ↔ JS Date helpers)
// ---------------------------------------------------------------------------
function jsDateToCalendar(d: Date): CalendarDate {
  return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}
function calendarToJs(c: CalendarDate): Date {
  return new Date(c.year, c.month - 1, c.day)
}
function calendarToSeed(c: CalendarDate): string {
  return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`
}

const today = jsDateToCalendar(new Date())
const selectedDate = ref<CalendarDate>(today)
const isToday = computed(
  () => selectedDate.value.compare(today) === 0,
)
const viewingLabel = computed(() => {
  const d = calendarToJs(selectedDate.value)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
})
const todayLabel = computed(() =>
  calendarToJs(today).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long' }),
)

// ---------------------------------------------------------------------------
// Data state
// ---------------------------------------------------------------------------
const data = ref<KPISnapshot | null>(null)
const lastUpdated = ref<Date | null>(null)
const isRefreshing = ref(false)

// manualRefresh = true → randomise with timestamp seed (Refresh button)
// manualRefresh = false → stable seed for historical dates, BASELINE for today
async function refresh(manualRefresh = false) {
  isRefreshing.value = true
  let seed: string | undefined
  if (isToday.value) {
    seed = manualRefresh
      ? calendarToSeed(selectedDate.value) + '-' + Date.now().toString(36)
      : undefined // → returns BASELINE
  } else {
    seed = calendarToSeed(selectedDate.value) // stable per date
  }
  data.value = await fetchKPIData(seed)
  lastUpdated.value = new Date()
  isRefreshing.value = false
}

// When date changes, reload with stable seed
watch(selectedDate, () => refresh(false))

onMounted(() => refresh(false))

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function fmt(v: number, unit?: string): string {
  const s = v % 1 === 0 ? v.toLocaleString() : v.toFixed(1)
  return unit ? `${s}${unit}` : s
}

function trend(a: number, b: number): string {
  if (b > a * 1.01) return '↑'
  if (b < a * 0.99) return '↓'
  return '→'
}

// ---------------------------------------------------------------------------
// Color coding
// ---------------------------------------------------------------------------
function valueColor(v: number, key: keyof KPIValues, direction: KPIDirection): string {
  if (direction === 'neutral') return 'text-zinc-300'
  if (!data.value) return 'text-zinc-300'
  const vals = TIME_SLOTS.map(s => data.value![s][key][0])
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (max === min) return 'text-zinc-300'
  const norm = (v - min) / (max - min)
  if (direction === 'higher-better') {
    if (norm >= 0.7) return 'text-emerald-400'
    if (norm <= 0.3) return 'text-red-400'
  } else {
    if (norm >= 0.7) return 'text-red-400'
    if (norm <= 0.3) return 'text-emerald-400'
  }
  return 'text-zinc-300'
}

function trendColor(a: number, b: number, direction: KPIDirection): string {
  if (direction === 'neutral') return 'text-zinc-600'
  const t = trend(a, b)
  if (t === '→') return 'text-zinc-600'
  const upIsGood = direction === 'higher-better'
  if (t === '↑') return upIsGood ? 'text-emerald-400' : 'text-red-400'
  return upIsGood ? 'text-red-400' : 'text-emerald-400'
}

// ---------------------------------------------------------------------------
// Alerts toggle
// ---------------------------------------------------------------------------
const alertsOnly = ref(false)

// A KPI is "in alert" if the 17:00 today value trends worse than prev
function isInAlert(key: keyof KPIValues, direction: KPIDirection): boolean {
  if (!data.value) return false
  const [today, prev] = data.value['17:00'][key]
  if (direction === 'neutral') return false
  if (direction === 'lower-better') return today > prev * 1.01
  return today < prev * 0.99
}

const visibleKPIs = computed(() =>
  alertsOnly.value
    ? KPI_META.filter(k => isInAlert(k.key, k.direction))
    : KPI_META,
)

// ---------------------------------------------------------------------------
// Sparklines
// ---------------------------------------------------------------------------
const hoveredKPI = ref<string | null>(null)

// Memoised sparkline series per KPI key (recomputed when data changes)
const sparklineCache = computed(() => {
  if (!data.value) return {}
  const seed = calendarToSeed(selectedDate.value)
  return Object.fromEntries(
    KPI_META.map(k => [k.key, generateSparklines(k.key, data.value!, seed)]),
  )
})

// Day labels: last 7 days
const dayLabels = computed(() => {
  const base = calendarToJs(selectedDate.value)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() - 6 + i)
    return d.toLocaleDateString('en-GB', { weekday: 'short' })
  })
})

// SVG polyline point string from a series of values
function sparkPoints(values: number[], w: number, h: number): string {
  const padV = 6
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = (h - padV * 2) - ((v - min) / range) * (h - padV * 2) + padV
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

// Slot style: different emerald opacity + thickness
const slotSparkStyle: Record<TimeSlot, { stroke: string; opacity: string; width: string }> = {
  '8:00':   { stroke: '#34d399', opacity: '0.35', width: '1.5' },
  '13:00':  { stroke: '#34d399', opacity: '0.65', width: '1.5' },
  '17:00':  { stroke: '#34d399', opacity: '1',    width: '2' },
}

// ---------------------------------------------------------------------------
// Timestamp
// ---------------------------------------------------------------------------
const formattedTime = computed(() => {
  if (!lastUpdated.value) return '—'
  return lastUpdated.value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
})

// ---------------------------------------------------------------------------
// Summary stat cards
// ---------------------------------------------------------------------------
const stats = computed(() => {
  if (!data.value) return null
  const d = data.value
  const avgBatt = TIME_SLOTS.reduce((s, sl) => s + d[sl].batteryLevel[0], 0) / 3
  return {
    active: d['17:00'].active[0],
    battery: avgBatt,
    issues: d['17:00'].damaged[0] + d['17:00'].missing[0] + d['17:00'].unreachable[0],
    fuelLow: d['17:00'].fuelLow[0],
  }
})
</script>

<template>
  <!-- Full-screen shell — no sidebar -->
  <div class="flex flex-col h-screen overflow-hidden bg-zinc-950 text-zinc-100">

    <!-- ================================================================== -->
    <!-- HEADER                                                               -->
    <!-- ================================================================== -->
    <header class="shrink-0 flex items-center justify-between gap-4 px-6 py-3 border-b border-zinc-800 bg-zinc-950">

      <!-- Left: logo + title + today date badge -->
      <div class="flex items-center gap-4">
        <div class="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-bolt" class="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 class="text-sm font-bold text-zinc-50 leading-tight">Fleet Operations KPIs</h1>
          <p class="text-[11px] text-zinc-500">HumanForest · Supervisor Dashboard</p>
        </div>
        <!-- Today's date — always visible -->
        <div class="hidden sm:flex items-center gap-1.5 ml-2 px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700">
          <UIcon name="i-heroicons-calendar-days" class="w-3.5 h-3.5 text-zinc-400" />
          <span class="text-[11px] text-zinc-300">{{ todayLabel }}</span>
        </div>
      </div>

      <!-- Right: controls -->
      <div class="flex items-center gap-3 shrink-0">

        <!-- "Viewing" label when not today -->
        <Transition name="fade">
          <span v-if="!isToday" class="text-[11px] text-amber-400 flex items-center gap-1">
            <UIcon name="i-heroicons-eye" class="w-3.5 h-3.5" />
            Viewing: {{ viewingLabel }}
          </span>
        </Transition>

        <!-- Date picker: UPopover + UCalendar -->
        <UPopover :content="{ side: 'bottom', align: 'end' }">
          <UButton
            icon="i-heroicons-calendar"
            size="xs"
            color="neutral"
            variant="outline"
            :ui="{ base: !isToday ? 'ring-amber-500/50' : '' }"
          >
            {{ isToday ? 'Today' : viewingLabel }}
          </UButton>
          <template #content>
            <div class="p-2">
              <UCalendar
                v-model="selectedDate"
                size="sm"
                color="primary"
                :max-value="today"
              />
              <div v-if="!isToday" class="mt-2 px-1">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  block
                  @click="selectedDate = today"
                >
                  Back to today
                </UButton>
              </div>
            </div>
          </template>
        </UPopover>

        <!-- Solo alertas toggle -->
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800">
          <span class="text-[11px] text-zinc-400 select-none">Solo alertas</span>
          <USwitch
            v-model="alertsOnly"
            size="xs"
            color="primary"
          />
        </div>

        <!-- Separator -->
        <div class="w-px h-5 bg-zinc-800" />

        <!-- Last updated + Refresh -->
        <span class="text-[11px] text-zinc-600 hidden md:block">
          <span class="text-zinc-500 font-mono">{{ formattedTime }}</span>
        </span>
        <UButton
          icon="i-heroicons-arrow-path"
          size="xs"
          color="neutral"
          variant="outline"
          :loading="isRefreshing"
          @click="refresh(true)"
        >
          Refresh
        </UButton>
      </div>
    </header>

    <!-- ================================================================== -->
    <!-- STAT CARDS                                                           -->
    <!-- ================================================================== -->
    <div class="shrink-0 grid grid-cols-4 gap-3 px-6 pt-3 pb-2">

      <div class="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-bicycle" class="w-4.5 h-4.5 text-emerald-400" />
        </div>
        <div>
          <p class="text-[10px] text-zinc-500 uppercase tracking-wider">Active Fleet</p>
          <p class="text-lg font-bold text-zinc-50 tabular-nums leading-tight">
            {{ stats ? stats.active.toLocaleString() : '—' }}
          </p>
        </div>
        <span class="ml-auto text-[10px] text-emerald-400">17:00</span>
      </div>

      <div class="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-battery-100" class="w-4.5 h-4.5 text-blue-400" />
        </div>
        <div>
          <p class="text-[10px] text-zinc-500 uppercase tracking-wider">Avg Battery</p>
          <p class="text-lg font-bold text-zinc-50 tabular-nums leading-tight">
            {{ stats ? stats.battery.toFixed(1) + '%' : '—' }}
          </p>
        </div>
        <span class="ml-auto text-[10px] text-blue-400">Day avg</span>
      </div>

      <div class="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-4.5 h-4.5 text-red-400" />
        </div>
        <div>
          <p class="text-[10px] text-zinc-500 uppercase tracking-wider">Issues</p>
          <p class="text-lg font-bold text-zinc-50 tabular-nums leading-tight">
            {{ stats ? stats.issues.toLocaleString() : '—' }}
          </p>
        </div>
        <span class="ml-auto text-[10px] text-red-400">17:00</span>
      </div>

      <div class="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-fire" class="w-4.5 h-4.5 text-amber-400" />
        </div>
        <div>
          <p class="text-[10px] text-zinc-500 uppercase tracking-wider">Fuel Low</p>
          <p class="text-lg font-bold text-zinc-50 tabular-nums leading-tight">
            {{ stats ? stats.fuelLow.toLocaleString() : '—' }}
          </p>
        </div>
        <span class="ml-auto text-[10px] text-amber-400">17:00</span>
      </div>

    </div>

    <!-- ================================================================== -->
    <!-- KPI TABLE — fills remaining height, rows distributed proportionally -->
    <!-- ================================================================== -->
    <div class="flex-1 min-h-0 px-6 pb-4 flex flex-col">
      <div class="flex-1 min-h-0 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col overflow-hidden">

        <!-- Column headers: time slots -->
        <div class="shrink-0 grid grid-cols-[200px_repeat(3,1fr)] border-b border-zinc-800 bg-zinc-900">
          <div class="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500 border-r border-zinc-800 flex items-center">
            KPI
          </div>
          <div
            v-for="slot in TIME_SLOTS"
            :key="slot"
            class="px-4 py-2 text-center text-xs font-bold text-emerald-400 border-r border-zinc-800 last:border-r-0 flex items-center justify-between"
          >
            <span class="text-[10px] text-zinc-600 font-normal">Prev</span>
            <span>{{ slot }}</span>
            <span class="text-[10px] text-zinc-600 font-normal">Today</span>
          </div>
        </div>

        <!-- Table body -->
        <div class="flex-1 min-h-0 relative" style="overflow: visible;">

          <!-- KPI rows: grid filling full height -->
          <div
            v-if="data"
            class="absolute inset-0 flex flex-col"
          >
            <!-- Empty state when all filtered -->
            <Transition name="fade" mode="out-in">
              <div
                v-if="alertsOnly && visibleKPIs.length === 0"
                key="empty"
                class="flex-1 flex flex-col items-center justify-center gap-3"
              >
                <div class="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <UIcon name="i-heroicons-check-badge" class="w-5 h-5 text-emerald-400" />
                </div>
                <p class="text-sm font-medium text-zinc-400">Todos los KPIs dentro del rango</p>
                <p class="text-xs text-zinc-600">No hay alertas activas en 17:00</p>
              </div>

              <!-- Rows -->
              <div
                v-else
                key="rows"
                class="flex-1 flex flex-col"
                style="overflow: visible;"
              >
                <TransitionGroup name="row" tag="div" class="flex-1 flex flex-col" style="overflow: visible;">
                  <div
                    v-for="(kpi, idx) in visibleKPIs"
                    :key="kpi.key"
                    class="relative flex-1 min-h-0"
                    style="overflow: visible;"
                    @mouseenter="hoveredKPI = kpi.key"
                    @mouseleave="hoveredKPI = null"
                  >
                    <!-- Row content -->
                    <div
                      :class="[
                        'h-full grid grid-cols-[200px_repeat(3,1fr)] border-b border-zinc-800 last:border-b-0 transition-colors cursor-default',
                        idx % 2 !== 0 ? 'bg-zinc-800/20' : '',
                        hoveredKPI === kpi.key ? 'bg-zinc-800/50' : '',
                      ]"
                    >
                      <!-- KPI label -->
                      <div class="flex items-center px-4 border-r border-zinc-800">
                        <UTooltip
                          :text="kpi.direction === 'higher-better' ? 'Higher is better' : kpi.direction === 'lower-better' ? 'Lower is better' : 'Neutral'"
                        >
                          <span class="text-sm font-medium text-zinc-200 truncate cursor-default">{{ kpi.label }}</span>
                        </UTooltip>
                        <span v-if="kpi.unit" class="ml-1.5 text-[10px] text-zinc-600 shrink-0">{{ kpi.unit }}</span>
                        <!-- Alert dot -->
                        <span
                          v-if="isInAlert(kpi.key, kpi.direction)"
                          class="ml-auto w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"
                        />
                      </div>

                      <!-- Time slot cells: Prev (left) + Today (right) -->
                      <template v-for="slot in TIME_SLOTS" :key="`${kpi.key}-${slot}`">
                        <div class="flex items-center justify-between px-4 border-r border-zinc-800 last:border-r-0">
                          <!-- Prev: left, same size, subdued white -->
                          <span class="text-sm tabular-nums text-zinc-500">
                            {{ fmt(data[slot][kpi.key][1], kpi.unit) }}
                          </span>
                          <!-- Today: right, colored + trend -->
                          <div class="flex items-center gap-1">
                            <UTooltip :text="`Today vs Prev: ${trend(data[slot][kpi.key][0], data[slot][kpi.key][1])}`">
                              <span :class="['text-[11px]', trendColor(data[slot][kpi.key][0], data[slot][kpi.key][1], kpi.direction)]">
                                {{ trend(data[slot][kpi.key][0], data[slot][kpi.key][1]) }}
                              </span>
                            </UTooltip>
                            <span :class="['text-sm tabular-nums font-medium', valueColor(data[slot][kpi.key][0], kpi.key, kpi.direction)]">
                              {{ fmt(data[slot][kpi.key][0], kpi.unit) }}
                            </span>
                          </div>
                        </div>
                      </template>
                    </div>

                    <!-- Sparkline panel — appears on hover, overlaid absolutely -->
                    <Transition name="spark">
                      <div
                        v-if="hoveredKPI === kpi.key && sparklineCache[kpi.key]"
                        class="absolute left-0 right-0 z-50 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-xl shadow-2xl mx-1 px-4 pt-2 pb-3"
                        style="top: calc(100% + 2px);"
                      >
                        <!-- Spark header -->
                        <div class="flex items-center justify-between mb-1.5">
                          <span class="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                            {{ kpi.label }} · últimos 7 días
                          </span>
                          <div class="flex items-center gap-3">
                            <span
                              v-for="s in TIME_SLOTS"
                              :key="s"
                              class="text-[9px] text-zinc-500 flex items-center gap-1"
                            >
                              <span
                                class="inline-block w-4 h-0.5 rounded"
                                :style="{ background: slotSparkStyle[s].stroke, opacity: slotSparkStyle[s].opacity }"
                              />
                              {{ s }}
                            </span>
                          </div>
                        </div>

                        <!-- SVG sparkline -->
                        <svg
                          width="100%"
                          height="72"
                          viewBox="0 0 600 72"
                          preserveAspectRatio="none"
                          class="overflow-visible"
                        >
                          <!-- Subtle horizontal grid lines -->
                          <line x1="0" y1="12" x2="600" y2="12" stroke="#3f3f46" stroke-width="0.5" />
                          <line x1="0" y1="36" x2="600" y2="36" stroke="#3f3f46" stroke-width="0.5" />
                          <line x1="0" y1="60" x2="600" y2="60" stroke="#3f3f46" stroke-width="0.5" />

                          <!-- Day separators -->
                          <line
                            v-for="(_, i) in dayLabels"
                            :key="`sep-${i}`"
                            :x1="(i / 6) * 600"
                            y1="0"
                            :x2="(i / 6) * 600"
                            y2="60"
                            stroke="#27272a"
                            stroke-width="1"
                          />

                          <!-- Sparklines per slot -->
                          <polyline
                            v-for="series in sparklineCache[kpi.key]"
                            :key="series.slot"
                            :points="sparkPoints(series.values, 600, 60)"
                            fill="none"
                            :stroke="slotSparkStyle[series.slot].stroke"
                            :stroke-width="slotSparkStyle[series.slot].width"
                            :stroke-opacity="slotSparkStyle[series.slot].opacity"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />

                          <!-- Dot on last point for each series -->
                          <circle
                            v-for="series in sparklineCache[kpi.key]"
                            :key="`dot-${series.slot}`"
                            cx="600"
                            :cy="parseFloat(sparkPoints(series.values, 600, 60).split(' ').at(-1)!.split(',')[1])"
                            r="3"
                            :fill="slotSparkStyle[series.slot].stroke"
                            :fill-opacity="slotSparkStyle[series.slot].opacity"
                          />

                          <!-- X axis day labels -->
                          <text
                            v-for="(label, i) in dayLabels"
                            :key="`lbl-${i}`"
                            :x="(i / 6) * 600"
                            y="71"
                            text-anchor="middle"
                            font-size="9"
                            fill="#71717a"
                          >{{ label }}</text>
                        </svg>
                      </div>
                    </Transition>
                  </div>
                </TransitionGroup>
              </div>
            </Transition>
          </div>

          <!-- Skeleton while loading -->
          <div v-else class="absolute inset-0 flex flex-col">
            <div
              v-for="n in 10"
              :key="n"
              :class="['flex-1 grid grid-cols-[200px_repeat(3,1fr)] border-b border-zinc-800', n % 2 !== 0 ? 'bg-zinc-800/20' : '']"
            >
              <div class="flex items-center px-4 border-r border-zinc-800">
                <div class="h-3 w-24 bg-zinc-800 rounded animate-pulse" />
              </div>
              <div v-for="c in 3" :key="c" class="flex items-center justify-between px-4 border-r border-zinc-800 last:border-r-0">
                <div class="h-3 w-10 bg-zinc-800 rounded animate-pulse" />
                <div class="h-3 w-12 bg-zinc-800 rounded animate-pulse" />
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- Legend -->
      <div class="mt-2 flex items-center gap-5 text-[10px] text-zinc-600">
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          <span>Good</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
          <span>Needs attention</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="font-mono text-zinc-500">↑↓→</span>
          <span>Today vs Prev (per slot)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
          <span>Alert dot = 17:00 deterioration</span>
        </div>
        <div class="ml-auto text-zinc-700">Prototype · 06 Mar 2026 baseline</div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Fade transition for "viewing" label and empty state */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Row appear/disappear for alerts filter */
.row-enter-active { transition: all 0.25s ease; }
.row-leave-active { transition: all 0.2s ease; position: absolute; width: 100%; }
.row-enter-from { opacity: 0; transform: translateY(-6px); }
.row-leave-to { opacity: 0; transform: translateY(-6px); }

/* Sparkline panel slide-in */
.spark-enter-active { transition: opacity 0.15s ease, transform 0.15s ease; }
.spark-leave-active { transition: opacity 0.1s ease, transform 0.1s ease; }
.spark-enter-from { opacity: 0; transform: translateY(-4px); }
.spark-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
