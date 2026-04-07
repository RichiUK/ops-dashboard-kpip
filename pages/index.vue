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

onMounted(() => refresh())

// ---------------------------------------------------------------------------
// Summary stat cards — computed from latest slot (17:00 today values)
// ---------------------------------------------------------------------------
const stats = computed(() => {
  if (!data.value) return null
  const d = data.value
  const avgBatt = (d['8:00'].batteryLevel[0] + d['13:00'].batteryLevel[0] + d['17:00'].batteryLevel[0]) / 3
  return {
    active: d['17:00'].active[0],
    battery: avgBatt,
    issues: d['17:00'].damaged[0] + d['17:00'].missing[0] + d['17:00'].unreachable[0],
    fuelLow: d['17:00'].fuelLow[0],
  }
})

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

function valueColor(v: number, key: keyof KPIValues, direction: KPIDirection): string {
  if (direction === 'neutral') return 'text-zinc-400'
  if (!data.value) return 'text-zinc-300'
  const vals = TIME_SLOTS.map(s => data.value![s][key][0])
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (max === min) return 'text-zinc-300'
  const norm = (v - min) / (max - min)
  if (direction === 'higher-better') {
    if (norm >= 0.7) return 'text-emerald-400 font-semibold'
    if (norm <= 0.3) return 'text-red-400 font-semibold'
    return 'text-zinc-300'
  } else {
    if (norm >= 0.7) return 'text-red-400 font-semibold'
    if (norm <= 0.3) return 'text-emerald-400 font-semibold'
    return 'text-zinc-300'
  }
}

function trendColor(a: number, b: number, direction: KPIDirection): string {
  if (direction === 'neutral') return 'text-zinc-600'
  const t = trend(a, b)
  if (t === '→') return 'text-zinc-600'
  const upIsGood = direction === 'higher-better'
  if (t === '↑') return upIsGood ? 'text-emerald-400' : 'text-red-400'
  return upIsGood ? 'text-red-400' : 'text-emerald-400'
}

const formattedTime = computed(() => {
  if (!lastUpdated.value) return '—'
  return lastUpdated.value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
})

// ---------------------------------------------------------------------------
// Sidebar nav
// ---------------------------------------------------------------------------
const navItems = [
  { icon: 'i-heroicons-squares-2x2', label: 'Dashboard', active: true },
  { icon: 'i-heroicons-truck', label: 'Fleet', active: false },
  { icon: 'i-heroicons-wrench-screwdriver', label: 'Maintenance', active: false },
  { icon: 'i-heroicons-bell', label: 'Alerts', active: false },
  { icon: 'i-heroicons-chart-bar', label: 'Reports', active: false },
  { icon: 'i-heroicons-cog-6-tooth', label: 'Settings', active: false },
]
</script>

<template>
  <!-- Full-screen shell -->
  <div class="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">

    <!-- ================================================================== -->
    <!-- SIDEBAR                                                              -->
    <!-- ================================================================== -->
    <aside class="w-52 shrink-0 flex flex-col bg-zinc-900 border-r border-zinc-800">
      <!-- Logo -->
      <div class="flex items-center gap-2.5 px-5 py-5 border-b border-zinc-800">
        <div class="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
          <UIcon name="i-heroicons-bolt" class="w-4 h-4 text-white" />
        </div>
        <span class="font-bold text-sm tracking-tight text-zinc-100">HumanForest</span>
      </div>

      <!-- Nav -->
      <nav class="flex-1 p-3 flex flex-col gap-0.5">
        <a
          v-for="item in navItems"
          :key="item.label"
          href="#"
          :class="[
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
            item.active
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
          ]"
        >
          <UIcon :name="item.icon" class="w-4.5 h-4.5 shrink-0" />
          {{ item.label }}
        </a>
      </nav>

      <!-- Bottom: date -->
      <div class="px-5 py-4 border-t border-zinc-800">
        <p class="text-[10px] text-zinc-600 uppercase tracking-widest">Today</p>
        <p class="text-xs text-zinc-400 font-mono mt-0.5">{{ new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }}</p>
      </div>
    </aside>

    <!-- ================================================================== -->
    <!-- MAIN CONTENT                                                         -->
    <!-- ================================================================== -->
    <div class="flex-1 flex flex-col overflow-hidden">

      <!-- ---------------------------------------------------------------- -->
      <!-- HEADER                                                             -->
      <!-- ---------------------------------------------------------------- -->
      <header class="shrink-0 flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950">
        <div>
          <h1 class="text-base font-bold text-zinc-50">Fleet Operations KPIs</h1>
          <p class="text-xs text-zinc-500 mt-0.5">Supervisor dashboard · 3 check-ins per day</p>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-xs text-zinc-600">
            Updated <span class="text-zinc-400 font-mono">{{ formattedTime }}</span>
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
      </header>

      <!-- ---------------------------------------------------------------- -->
      <!-- STAT CARDS                                                         -->
      <!-- ---------------------------------------------------------------- -->
      <div class="shrink-0 grid grid-cols-4 gap-4 px-6 py-4">

        <!-- Active Fleet -->
        <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
            <UIcon name="i-heroicons-bicycle" class="w-5 h-5 text-emerald-400" />
          </div>
          <div class="min-w-0">
            <p class="text-[11px] text-zinc-500 uppercase tracking-wider">Active Fleet</p>
            <p class="text-xl font-bold text-zinc-50 tabular-nums leading-tight mt-0.5">
              {{ stats ? stats.active.toLocaleString() : '—' }}
            </p>
            <p class="text-[11px] text-emerald-400 mt-0.5 flex items-center gap-1">
              <UIcon name="i-heroicons-arrow-trending-up" class="w-3 h-3" />
              <span>17:00 snapshot</span>
            </p>
          </div>
        </div>

        <!-- Avg Battery -->
        <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
            <UIcon name="i-heroicons-battery-100" class="w-5 h-5 text-blue-400" />
          </div>
          <div class="min-w-0">
            <p class="text-[11px] text-zinc-500 uppercase tracking-wider">Avg Battery</p>
            <p class="text-xl font-bold text-zinc-50 tabular-nums leading-tight mt-0.5">
              {{ stats ? stats.battery.toFixed(1) + '%' : '—' }}
            </p>
            <p class="text-[11px] text-blue-400 mt-0.5 flex items-center gap-1">
              <UIcon name="i-heroicons-arrow-path" class="w-3 h-3" />
              <span>Avg across day</span>
            </p>
          </div>
        </div>

        <!-- Issues -->
        <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-400" />
          </div>
          <div class="min-w-0">
            <p class="text-[11px] text-zinc-500 uppercase tracking-wider">Issues</p>
            <p class="text-xl font-bold text-zinc-50 tabular-nums leading-tight mt-0.5">
              {{ stats ? stats.issues.toLocaleString() : '—' }}
            </p>
            <p class="text-[11px] text-red-400 mt-0.5 flex items-center gap-1">
              <UIcon name="i-heroicons-no-symbol" class="w-3 h-3" />
              <span>Damaged + Missing + Unreach.</span>
            </p>
          </div>
        </div>

        <!-- Fuel Low -->
        <div class="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <UIcon name="i-heroicons-fire" class="w-5 h-5 text-amber-400" />
          </div>
          <div class="min-w-0">
            <p class="text-[11px] text-zinc-500 uppercase tracking-wider">Fuel Low</p>
            <p class="text-xl font-bold text-zinc-50 tabular-nums leading-tight mt-0.5">
              {{ stats ? stats.fuelLow.toLocaleString() : '—' }}
            </p>
            <p class="text-[11px] text-amber-400 mt-0.5 flex items-center gap-1">
              <UIcon name="i-heroicons-arrow-trending-up" class="w-3 h-3" />
              <span>17:00 snapshot</span>
            </p>
          </div>
        </div>

      </div>

      <!-- ---------------------------------------------------------------- -->
      <!-- KPI TABLE — fills all remaining height, rows distributed evenly  -->
      <!-- ---------------------------------------------------------------- -->
      <div class="flex-1 px-6 pb-5 min-h-0 flex flex-col">
        <div class="flex-1 min-h-0 rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex flex-col">

          <!-- Table header row 1: time slots -->
          <div class="shrink-0 grid grid-cols-[180px_repeat(6,1fr)] border-b border-zinc-800 bg-zinc-900/80">
            <div class="px-4 py-2.5 flex items-center text-[10px] font-semibold uppercase tracking-widest text-zinc-500 border-r border-zinc-800">
              KPI
            </div>
            <div
              v-for="slot in TIME_SLOTS"
              :key="slot"
              class="col-span-2 px-4 py-2.5 text-center text-xs font-bold text-emerald-400 border-r border-zinc-800 last:border-r-0"
            >
              {{ slot }}
            </div>
          </div>

          <!-- Table header row 2: Today / Prev sub-labels -->
          <div class="shrink-0 grid grid-cols-[180px_repeat(6,1fr)] border-b border-zinc-800 bg-zinc-900/60">
            <div class="border-r border-zinc-800" />
            <template v-for="slot in TIME_SLOTS" :key="`sub-${slot}`">
              <div class="px-3 py-1.5 text-center text-[10px] text-zinc-600 font-normal">Today</div>
              <div class="px-3 py-1.5 text-center text-[10px] text-zinc-600 font-normal border-r border-zinc-800 last:border-r-0">Prev</div>
            </template>
          </div>

          <!-- Table body: grid-rows fills remaining height equally -->
          <div
            v-if="data"
            class="flex-1 min-h-0 grid"
            style="grid-template-rows: repeat(10, 1fr);"
          >
            <div
              v-for="(kpi, idx) in KPI_META"
              :key="kpi.key"
              :class="[
                'grid grid-cols-[180px_repeat(6,1fr)] border-b border-zinc-800 last:border-b-0 transition-colors',
                idx % 2 === 0 ? 'bg-transparent' : 'bg-zinc-800/20',
                'hover:bg-zinc-800/50',
              ]"
            >
              <!-- KPI label -->
              <div class="flex items-center px-4 border-r border-zinc-800">
                <UTooltip
                  :text="kpi.direction === 'higher-better' ? 'Higher is better' : kpi.direction === 'lower-better' ? 'Lower is better' : 'Neutral'"
                >
                  <span class="text-sm font-medium text-zinc-200 cursor-default truncate">{{ kpi.label }}</span>
                </UTooltip>
                <span v-if="kpi.unit" class="ml-1.5 text-[10px] text-zinc-600 shrink-0">{{ kpi.unit }}</span>
              </div>

              <!-- Slot cells -->
              <template v-for="slot in TIME_SLOTS" :key="`${kpi.key}-${slot}`">
                <!-- Today value -->
                <div class="flex items-center justify-center gap-1 px-2">
                  <span
                    :class="['text-sm tabular-nums', valueColor(data[slot][kpi.key][0], kpi.key, kpi.direction)]"
                  >
                    {{ fmt(data[slot][kpi.key][0], kpi.unit) }}
                  </span>
                  <UTooltip :text="`Today vs Prev: ${trend(data[slot][kpi.key][0], data[slot][kpi.key][1])}`">
                    <span :class="['text-[11px] leading-none', trendColor(data[slot][kpi.key][0], data[slot][kpi.key][1], kpi.direction)]">
                      {{ trend(data[slot][kpi.key][0], data[slot][kpi.key][1]) }}
                    </span>
                  </UTooltip>
                </div>

                <!-- Prev value -->
                <div class="flex items-center justify-center px-2 border-r border-zinc-800 last:border-r-0">
                  <span class="text-xs tabular-nums text-zinc-600">
                    {{ fmt(data[slot][kpi.key][1], kpi.unit) }}
                  </span>
                </div>
              </template>
            </div>
          </div>

          <!-- Skeleton while loading -->
          <div
            v-else
            class="flex-1 min-h-0 grid"
            style="grid-template-rows: repeat(10, 1fr);"
          >
            <div
              v-for="n in 10"
              :key="n"
              :class="['grid grid-cols-[180px_repeat(6,1fr)] border-b border-zinc-800 last:border-b-0', n % 2 !== 0 ? 'bg-zinc-800/20' : '']"
            >
              <div class="flex items-center px-4 border-r border-zinc-800">
                <div class="h-3 w-24 bg-zinc-800 rounded animate-pulse" />
              </div>
              <div v-for="c in 6" :key="c" class="flex items-center justify-center border-r border-zinc-800 last:border-r-0">
                <div class="h-3 w-10 bg-zinc-800 rounded animate-pulse" />
              </div>
            </div>
          </div>

        </div>

        <!-- Legend -->
        <div class="mt-2.5 flex items-center gap-5 text-[11px] text-zinc-600">
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            <span>Good</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-red-400 inline-block" />
            <span>Needs attention</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="font-mono text-zinc-500">↑↓→</span>
            <span>Today vs Prev</span>
          </div>
          <div class="ml-auto text-zinc-700">
            Prototype · 06 Mar 2026 baseline
          </div>
        </div>
      </div>

    </div>
  </div>
</template>
