<script setup lang="ts">
import { CalendarDate } from '@internationalized/date'
import {
  fetchKPIData,
  generateSparklines,
  KPI_META,
  seededRand,
} from '~/composables/useKPIData'
import type { KPISnapshot, KPIValues, KPIDirection, TimeSlot } from '~/composables/useKPIData'

// ---------------------------------------------------------------------------
// Time slots
// ---------------------------------------------------------------------------
const TIME_SLOTS: TimeSlot[] = ['8:00', '13:00', '17:00']

// ---------------------------------------------------------------------------
// Selected date helpers
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
const isToday = computed(() => selectedDate.value.compare(today) === 0)
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

async function refresh(manualRefresh = false) {
  isRefreshing.value = true
  let seed: string | undefined
  if (isToday.value) {
    seed = manualRefresh
      ? calendarToSeed(selectedDate.value) + '-' + Date.now().toString(36)
      : undefined
  } else {
    seed = calendarToSeed(selectedDate.value)
  }
  data.value = await fetchKPIData(seed)
  lastUpdated.value = new Date()
  isRefreshing.value = false
}

watch(selectedDate, () => refresh(false))
onMounted(() => refresh(false))

// ---------------------------------------------------------------------------
// Formatting
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

function isInAlert(key: keyof KPIValues, direction: KPIDirection): boolean {
  if (!data.value) return false
  const [tod, prev] = data.value['17:00'][key]
  if (direction === 'neutral') return false
  if (direction === 'lower-better') return tod > prev * 1.01
  return tod < prev * 0.99
}

const visibleKPIs = computed(() =>
  alertsOnly.value ? KPI_META.filter(k => isInAlert(k.key, k.direction)) : KPI_META,
)

// ---------------------------------------------------------------------------
// Sparklines — fixed-position panel near cursor
// ---------------------------------------------------------------------------
const SPARK_W = 420
const SPARK_H = 90
const PANEL_W = 480
const PANEL_H = 210 // approximate panel total height

const hoveredKPI = ref<string | null>(null)
const sparkHoveredDay = ref<number | null>(null)
const mousePos = ref({ x: 0, y: 0 })
const isOverPanel = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null

const hoveredKPIMeta = computed(() =>
  hoveredKPI.value ? KPI_META.find(k => k.key === hoveredKPI.value) ?? null : null,
)

function clearHide() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
}
function scheduleHide() {
  clearHide()
  hideTimer = setTimeout(() => {
    if (!isOverPanel.value) {
      hoveredKPI.value = null
      sparkHoveredDay.value = null
    }
  }, 120)
}

function onRowEnter(key: string, e: MouseEvent) {
  clearHide()
  hoveredKPI.value = key
  mousePos.value = { x: e.clientX, y: e.clientY }
}
function onRowMove(e: MouseEvent) {
  mousePos.value = { x: e.clientX, y: e.clientY }
}
function onRowLeave() {
  scheduleHide()
}
function onPanelEnter() {
  clearHide()
  isOverPanel.value = true
}
function onPanelLeave() {
  isOverPanel.value = false
  hoveredKPI.value = null
  sparkHoveredDay.value = null
}

// Panel position: follow cursor, flip above if near bottom
const sparkPanelStyle = computed(() => {
  const { x, y } = mousePos.value
  const half = PANEL_W / 2
  const margin = 18
  const winW = import.meta.client ? window.innerWidth : 1440
  const winH = import.meta.client ? window.innerHeight : 900
  const left = Math.max(half + 8, Math.min(winW - half - 8, x))
  const top = (y + margin + PANEL_H > winH - 12)
    ? y - PANEL_H - margin   // flip above
    : y + margin              // below
  return { left: `${left}px`, top: `${top}px` }
})

// Memoised sparkline data
const sparklineCache = computed(() => {
  if (!data.value) return {}
  const seed = calendarToSeed(selectedDate.value)
  return Object.fromEntries(
    KPI_META.map(k => [k.key, generateSparklines(k.key, data.value!, seed)]),
  )
})

// Day labels for x-axis
const dayLabels = computed(() => {
  const base = calendarToJs(selectedDate.value)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() - 6 + i)
    return d.toLocaleDateString('en-GB', { weekday: 'short' })
  })
})

function sparkY(values: number[], idx: number): number {
  const padV = 10
  const chartH = SPARK_H - padV * 2
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  return chartH - ((values[idx] - min) / range) * chartH + padV
}
function sparkPoints(values: number[]): string {
  return values
    .map((v, i) => `${((i / 6) * SPARK_W).toFixed(1)},${sparkY(values, i).toFixed(1)}`)
    .join(' ')
}
function sparkX(i: number): number { return (i / 6) * SPARK_W }

function onSparkMouseMove(e: MouseEvent) {
  const el = e.currentTarget as SVGElement
  const rect = el.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  sparkHoveredDay.value = Math.round(ratio * 6)
}

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
  <div class="flex flex-col h-screen overflow-hidden bg-zinc-950 text-zinc-100">

    <!-- ================================================================== -->
    <!-- HEADER                                                               -->
    <!-- ================================================================== -->
    <header class="shrink-0 flex items-center justify-between gap-6 px-8 py-4 border-b border-zinc-800 bg-zinc-950">

      <div class="flex items-center gap-5">
        <div class="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-bolt" class="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 class="text-base font-bold text-zinc-50 leading-tight">Fleet Operations KPIs</h1>
          <p class="text-xs text-zinc-500">HumanForest · Supervisor Dashboard</p>
        </div>
        <div class="hidden sm:flex items-center gap-2 ml-3 px-3 py-1.5 rounded-full bg-zinc-800/80 border border-zinc-700">
          <UIcon name="i-heroicons-calendar-days" class="w-3.5 h-3.5 text-zinc-400" />
          <span class="text-xs text-zinc-300">{{ todayLabel }}</span>
        </div>
      </div>

      <div class="flex items-center gap-3 shrink-0">
        <Transition name="fade">
          <span v-if="!isToday" class="text-xs text-amber-400 flex items-center gap-1.5">
            <UIcon name="i-heroicons-eye" class="w-3.5 h-3.5" />
            Viewing: {{ viewingLabel }}
          </span>
        </Transition>

        <UPopover :content="{ side: 'bottom', align: 'end' }">
          <UButton icon="i-heroicons-calendar" size="sm" color="neutral" variant="outline">
            {{ isToday ? 'Today' : viewingLabel }}
          </UButton>
          <template #content>
            <div class="p-2">
              <UCalendar v-model="selectedDate" size="sm" color="primary" :max-value="today" />
              <div v-if="!isToday" class="mt-2 px-1">
                <UButton size="xs" variant="ghost" color="neutral" block @click="selectedDate = today">
                  Back to today
                </UButton>
              </div>
            </div>
          </template>
        </UPopover>

        <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800">
          <span class="text-xs text-zinc-400 select-none">Solo alertas</span>
          <USwitch v-model="alertsOnly" size="xs" color="primary" />
        </div>

        <div class="w-px h-5 bg-zinc-800" />

        <span class="text-xs text-zinc-600 font-mono hidden md:block">{{ formattedTime }}</span>
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
    </header>

    <!-- ================================================================== -->
    <!-- STAT CARDS                                                           -->
    <!-- ================================================================== -->
    <div class="shrink-0 grid grid-cols-4 gap-4 px-8 pt-4 pb-3">

      <div class="rounded-2xl bg-zinc-900 border border-zinc-800 px-5 py-4 flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-bicycle" class="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <p class="text-xs text-zinc-500 uppercase tracking-wider mb-0.5">Active Fleet</p>
          <p class="text-3xl font-bold text-zinc-50 tabular-nums leading-none">
            {{ stats ? stats.active.toLocaleString() : '—' }}
          </p>
        </div>
        <span class="ml-auto text-xs text-emerald-400 self-start mt-1">17:00</span>
      </div>

      <div class="rounded-2xl bg-zinc-900 border border-zinc-800 px-5 py-4 flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-battery-100" class="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <p class="text-xs text-zinc-500 uppercase tracking-wider mb-0.5">Avg Battery</p>
          <p class="text-3xl font-bold text-zinc-50 tabular-nums leading-none">
            {{ stats ? stats.battery.toFixed(1) + '%' : '—' }}
          </p>
        </div>
        <span class="ml-auto text-xs text-blue-400 self-start mt-1">Day avg</span>
      </div>

      <div class="rounded-2xl bg-zinc-900 border border-zinc-800 px-5 py-4 flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6 text-red-400" />
        </div>
        <div>
          <p class="text-xs text-zinc-500 uppercase tracking-wider mb-0.5">Issues</p>
          <p class="text-3xl font-bold text-zinc-50 tabular-nums leading-none">
            {{ stats ? stats.issues.toLocaleString() : '—' }}
          </p>
        </div>
        <span class="ml-auto text-xs text-red-400 self-start mt-1">17:00</span>
      </div>

      <div class="rounded-2xl bg-zinc-900 border border-zinc-800 px-5 py-4 flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-fire" class="w-6 h-6 text-amber-400" />
        </div>
        <div>
          <p class="text-xs text-zinc-500 uppercase tracking-wider mb-0.5">Fuel Low</p>
          <p class="text-3xl font-bold text-zinc-50 tabular-nums leading-none">
            {{ stats ? stats.fuelLow.toLocaleString() : '—' }}
          </p>
        </div>
        <span class="ml-auto text-xs text-amber-400 self-start mt-1">17:00</span>
      </div>

    </div>

    <!-- ================================================================== -->
    <!-- KPI TABLE                                                            -->
    <!-- ================================================================== -->
    <div class="flex-1 min-h-0 px-8 pb-5 flex flex-col">
      <div class="flex-1 min-h-0 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col overflow-hidden">

        <!-- Column headers -->
        <div class="shrink-0 grid grid-cols-[220px_repeat(3,1fr)] border-b border-zinc-800 bg-zinc-900">
          <div class="px-5 py-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 border-r border-zinc-800 flex items-center">
            KPI
          </div>
          <div
            v-for="slot in TIME_SLOTS"
            :key="slot"
            class="px-5 py-3 flex items-center justify-between border-r border-zinc-800 last:border-r-0"
          >
            <span class="text-sm text-zinc-600">Prev</span>
            <span class="text-base font-bold text-emerald-400">{{ slot }}</span>
            <span class="text-sm text-zinc-600">Today</span>
          </div>
        </div>

        <!-- Table body -->
        <div class="flex-1 min-h-0 relative" style="overflow: visible;">
          <div v-if="data" class="absolute inset-0 flex flex-col">

            <Transition name="fade" mode="out-in">

              <!-- Empty state -->
              <div
                v-if="alertsOnly && visibleKPIs.length === 0"
                key="empty"
                class="flex-1 flex flex-col items-center justify-center gap-4"
              >
                <div class="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <UIcon name="i-heroicons-check-badge" class="w-7 h-7 text-emerald-400" />
                </div>
                <p class="text-base font-medium text-zinc-400">Todos los KPIs dentro del rango</p>
                <p class="text-sm text-zinc-600">No hay alertas activas en 17:00</p>
              </div>

              <!-- KPI rows -->
              <div v-else key="rows" class="flex-1 flex flex-col" style="overflow: visible;">
                <TransitionGroup name="row" tag="div" class="flex-1 flex flex-col" style="overflow: visible;">
                  <div
                    v-for="(kpi, idx) in visibleKPIs"
                    :key="kpi.key"
                    class="relative flex-1 min-h-0"
                    style="overflow: visible;"
                    @mouseenter="onRowEnter(kpi.key, $event)"
                    @mousemove="onRowMove"
                    @mouseleave="onRowLeave"
                  >
                    <div
                      :class="[
                        'h-full grid grid-cols-[220px_repeat(3,1fr)] border-b border-zinc-800 last:border-b-0 transition-colors cursor-default',
                        idx % 2 !== 0 ? 'bg-zinc-800/20' : '',
                        hoveredKPI === kpi.key ? 'bg-zinc-800/40' : '',
                      ]"
                    >
                      <!-- KPI label -->
                      <div class="flex items-center px-5 border-r border-zinc-800 gap-3">
                        <UTooltip :text="kpi.direction === 'higher-better' ? 'Higher is better' : kpi.direction === 'lower-better' ? 'Lower is better' : 'Neutral'">
                          <span class="text-base font-semibold text-zinc-200 truncate cursor-default">{{ kpi.label }}</span>
                        </UTooltip>
                        <span v-if="kpi.unit" class="text-xs text-zinc-600 shrink-0">{{ kpi.unit }}</span>
                        <span
                          v-if="isInAlert(kpi.key, kpi.direction)"
                          class="ml-auto w-2 h-2 rounded-full bg-red-400 shrink-0"
                        />
                      </div>

                      <!-- Slot cells -->
                      <template v-for="slot in TIME_SLOTS" :key="`${kpi.key}-${slot}`">
                        <div class="flex items-center justify-between px-5 border-r border-zinc-800 last:border-r-0">
                          <!-- Prev: left, subdued -->
                          <span class="text-xl tabular-nums text-zinc-500 font-medium">
                            {{ fmt(data[slot][kpi.key][1], kpi.unit) }}
                          </span>
                          <!-- Today: right, colored + trend -->
                          <div class="flex items-center gap-2">
                            <span :class="['text-sm', trendColor(data[slot][kpi.key][0], data[slot][kpi.key][1], kpi.direction)]">
                              {{ trend(data[slot][kpi.key][0], data[slot][kpi.key][1]) }}
                            </span>
                            <span :class="['text-xl tabular-nums font-bold', valueColor(data[slot][kpi.key][0], kpi.key, kpi.direction)]">
                              {{ fmt(data[slot][kpi.key][0], kpi.unit) }}
                            </span>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>
                </TransitionGroup>
              </div>

            </Transition>
          </div>

          <!-- Skeleton -->
          <div v-else class="absolute inset-0 flex flex-col">
            <div
              v-for="n in 10"
              :key="n"
              :class="['flex-1 grid grid-cols-[220px_repeat(3,1fr)] border-b border-zinc-800', n % 2 !== 0 ? 'bg-zinc-800/20' : '']"
            >
              <div class="flex items-center px-5 border-r border-zinc-800">
                <div class="h-4 w-28 bg-zinc-800 rounded animate-pulse" />
              </div>
              <div v-for="c in 3" :key="c" class="flex items-center justify-between px-5 border-r border-zinc-800 last:border-r-0">
                <div class="h-4 w-14 bg-zinc-800 rounded animate-pulse" />
                <div class="h-4 w-16 bg-zinc-800 rounded animate-pulse" />
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- Legend -->
      <div class="mt-2.5 flex items-center gap-6 text-xs text-zinc-600">
        <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-emerald-400 inline-block" /><span>Good</span></div>
        <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-red-400 inline-block" /><span>Needs attention</span></div>
        <div class="flex items-center gap-1.5"><span class="font-mono text-zinc-500">↑↓→</span><span>Today vs Prev</span></div>
        <div class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-red-400 inline-block" /><span>Alert dot = 17:00 deterioration</span></div>
        <div class="ml-auto text-zinc-700">Prototype · 06 Mar 2026 baseline</div>
      </div>
    </div>

    <!-- ================================================================== -->
    <!-- SPARKLINE PANEL — Teleported to body, follows cursor                -->
    <!-- ================================================================== -->
    <Teleport to="body">
      <Transition name="spark">
        <div
          v-if="hoveredKPIMeta && data && sparklineCache[hoveredKPIMeta.key]"
          class="fixed z-[9999] bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl px-5 pt-4 pb-3"
          :style="{ ...sparkPanelStyle, width: `${PANEL_W}px`, transform: 'translateX(-50%)' }"
          @mouseenter="onPanelEnter"
          @mouseleave="onPanelLeave"
        >
          <!-- Header -->
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
              {{ hoveredKPIMeta.label }} · últimos 7 días
            </span>
            <div class="flex items-center gap-4">
              <span
                v-for="s in TIME_SLOTS"
                :key="s"
                class="text-[10px] text-zinc-500 flex items-center gap-1.5"
              >
                <span
                  class="inline-block w-5 h-px rounded"
                  :style="{ background: slotSparkStyle[s].stroke, opacity: slotSparkStyle[s].opacity }"
                />
                {{ s }}
              </span>
            </div>
          </div>

          <!-- Hover values row -->
          <div class="flex items-center gap-4 mb-1.5 h-5">
            <template v-if="sparkHoveredDay !== null">
              <span class="text-xs font-semibold text-zinc-400 w-7 shrink-0">
                {{ dayLabels[sparkHoveredDay] }}
              </span>
              <span
                v-for="series in sparklineCache[hoveredKPIMeta.key]"
                :key="series.slot"
                class="text-sm font-bold tabular-nums"
                :style="{ color: slotSparkStyle[series.slot].stroke, opacity: slotSparkStyle[series.slot].opacity }"
              >
                {{ fmt(series.values[sparkHoveredDay], hoveredKPIMeta.unit) }}
              </span>
            </template>
          </div>

          <!-- SVG -->
          <svg
            :width="SPARK_W"
            :height="SPARK_H + 16"
            :viewBox="`0 0 ${SPARK_W} ${SPARK_H + 16}`"
            class="block mx-auto overflow-visible cursor-crosshair"
            @mousemove="onSparkMouseMove"
            @mouseleave="sparkHoveredDay = null"
          >
            <!-- Grid lines -->
            <line :x1="0" :y1="SPARK_H * 0.15" :x2="SPARK_W" :y2="SPARK_H * 0.15" stroke="#3f3f46" stroke-width="0.5" />
            <line :x1="0" :y1="SPARK_H * 0.5"  :x2="SPARK_W" :y2="SPARK_H * 0.5"  stroke="#3f3f46" stroke-width="0.5" />
            <line :x1="0" :y1="SPARK_H * 0.85" :x2="SPARK_W" :y2="SPARK_H * 0.85" stroke="#3f3f46" stroke-width="0.5" />

            <!-- Hover highlight column -->
            <rect
              v-if="sparkHoveredDay !== null"
              :x="sparkX(sparkHoveredDay) - SPARK_W / 12"
              y="0"
              :width="SPARK_W / 6"
              :height="SPARK_H"
              fill="#ffffff" fill-opacity="0.04" rx="2"
            />
            <line
              v-if="sparkHoveredDay !== null"
              :x1="sparkX(sparkHoveredDay)" y1="0"
              :x2="sparkX(sparkHoveredDay)" :y2="SPARK_H"
              stroke="#52525b" stroke-width="1" stroke-dasharray="3,2"
            />

            <!-- Lines -->
            <polyline
              v-for="series in sparklineCache[hoveredKPIMeta.key]"
              :key="series.slot"
              :points="sparkPoints(series.values)"
              fill="none"
              :stroke="slotSparkStyle[series.slot].stroke"
              :stroke-width="slotSparkStyle[series.slot].width"
              :stroke-opacity="slotSparkStyle[series.slot].opacity"
              stroke-linecap="round"
              stroke-linejoin="round"
            />

            <!-- Dots: hovered or last -->
            <template v-if="sparkHoveredDay !== null">
              <circle
                v-for="series in sparklineCache[hoveredKPIMeta.key]"
                :key="`hdot-${series.slot}`"
                :cx="sparkX(sparkHoveredDay)"
                :cy="sparkY(series.values, sparkHoveredDay)"
                r="5"
                :fill="slotSparkStyle[series.slot].stroke"
                :fill-opacity="slotSparkStyle[series.slot].opacity"
                stroke="#18181b" stroke-width="2"
              />
            </template>
            <template v-else>
              <circle
                v-for="series in sparklineCache[hoveredKPIMeta.key]"
                :key="`dot-${series.slot}`"
                :cx="sparkX(6)"
                :cy="sparkY(series.values, 6)"
                r="3.5"
                :fill="slotSparkStyle[series.slot].stroke"
                :fill-opacity="slotSparkStyle[series.slot].opacity"
              />
            </template>

            <!-- X axis -->
            <text
              v-for="(label, i) in dayLabels"
              :key="`lbl-${i}`"
              :x="sparkX(i)"
              :y="SPARK_H + 14"
              text-anchor="middle"
              font-size="10"
              :fill="sparkHoveredDay === i ? '#a1a1aa' : '#52525b'"
              :font-weight="sparkHoveredDay === i ? '600' : '400'"
            >{{ label }}</text>
          </svg>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.row-enter-active { transition: all 0.25s ease; }
.row-leave-active { transition: all 0.2s ease; position: absolute; width: 100%; }
.row-enter-from { opacity: 0; transform: translateY(-6px); }
.row-leave-to   { opacity: 0; transform: translateY(-6px); }

.spark-enter-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.spark-leave-active { transition: opacity 0.08s ease, transform 0.08s ease; }
.spark-enter-from   { opacity: 0; transform: translateX(-50%) translateY(-4px); }
.spark-leave-to     { opacity: 0; transform: translateX(-50%) translateY(-4px); }
</style>
