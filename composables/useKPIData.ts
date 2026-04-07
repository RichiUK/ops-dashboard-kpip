// ---------------------------------------------------------------------------
// KPI Data Layer
// ---------------------------------------------------------------------------
// fetchKPIData() is the single source of truth for the dashboard.
// To swap in a real API, replace the body of fetchKPIData() with:
//   return await $fetch('/api/kpi/latest')
// The shape returned must match KPISnapshot.
// ---------------------------------------------------------------------------

export type TimeSlot = '8:00' | '13:00' | '17:00'

export interface KPIValues {
  basicService: [number, number]
  damaged: [number, number]
  missing: [number, number]
  unreachable: [number, number]
  batteryLevel: [number, number]
  damageCollect: [number, number]
  fuelLow: [number, number]
  active: [number, number]
  greenhouse: [number, number]
  move: [number, number]
}

export type KPISnapshot = Record<TimeSlot, KPIValues>

// ---------------------------------------------------------------------------
// Baseline values (from whiteboard photo, 06 March 2026)
// ---------------------------------------------------------------------------
export const BASELINE: KPISnapshot = {
  '8:00': {
    basicService: [980, 1041],
    damaged: [239, 193],
    missing: [761, 776],
    unreachable: [145, 160],
    batteryLevel: [67.4, 65.7],
    damageCollect: [75, 196],
    fuelLow: [173, 279],
    active: [15609, 15289],
    greenhouse: [1004, 1145],
    move: [119, 119],
  },
  '13:00': {
    basicService: [749, 839],
    damaged: [171, 188],
    missing: [649, 652],
    unreachable: [132, 149],
    batteryLevel: [66.4, 65.9],
    damageCollect: [340, 437],
    fuelLow: [559, 573],
    active: [15205, 14945],
    greenhouse: [771, 906],
    move: [207, 293],
  },
  '17:00': {
    basicService: [589, 214],
    damaged: [142, 242],
    missing: [546, 567],
    unreachable: [144, 149],
    batteryLevel: [65.7, 65.5],
    damageCollect: [71, 694],
    fuelLow: [808, 787],
    active: [15169, 14759],
    greenhouse: [651, 692],
    move: [156, 271],
  },
}

// ---------------------------------------------------------------------------
// Seeded pseudo-random (LCG) — same date string always produces same data
// ---------------------------------------------------------------------------
export function seededRand(seed: string): () => number {
  // FNV-1a hash → xorshift32 (always unsigned, always in [0,1))
  let state = 2166136261 >>> 0
  for (let i = 0; i < seed.length; i++) {
    state = (state ^ seed.charCodeAt(i)) >>> 0
    state = Math.imul(state, 16777619) >>> 0
  }
  if (state === 0) state = 1
  return () => {
    state ^= state << 13; state >>>= 0
    state ^= state >>> 17; state >>>= 0
    state ^= state << 5;  state >>>= 0
    return state / 4294967296
  }
}

function jitterWith(v: number, rand: () => number, pct = 0.10): number {
  const factor = 1 + (rand() * 2 - 1) * pct
  const result = v * factor
  // Preserve integer nature of integer inputs
  return Number.isInteger(v) ? Math.round(result) : Math.round(result * 10) / 10
}

function jitterSlotWith(slot: KPIValues, rand: () => number): KPIValues {
  return Object.fromEntries(
    Object.entries(slot).map(([k, [a, b]]) => [k, [jitterWith(a, rand), jitterWith(b, rand)]]),
  ) as KPIValues
}

// ---------------------------------------------------------------------------
// fetchKPIData — swap this body for a real API call when ready
// ---------------------------------------------------------------------------
export async function fetchKPIData(dateSeed?: string): Promise<KPISnapshot> {
  // --- REAL API INTEGRATION POINT ---
  // return await $fetch<KPISnapshot>('/api/kpi/latest')
  // ----------------------------------

  if (!dateSeed) return BASELINE

  const rand = seededRand(dateSeed)
  return {
    '8:00': jitterSlotWith(BASELINE['8:00'], rand),
    '13:00': jitterSlotWith(BASELINE['13:00'], rand),
    '17:00': jitterSlotWith(BASELINE['17:00'], rand),
  }
}

// ---------------------------------------------------------------------------
// Historical data for sparklines (7 days, 3 time slots per day)
// Seeded per KPI key + date so it's stable across refreshes
// ---------------------------------------------------------------------------
export interface SparkSeries {
  slot: TimeSlot
  values: number[] // 7 values, oldest → newest
}

export function generateSparklines(
  key: keyof KPIValues,
  todayData: KPISnapshot,
  todaySeed: string,
): SparkSeries[] {
  const slots: TimeSlot[] = ['8:00', '13:00', '17:00']

  return slots.map((slot) => {
    const todayVal = todayData[slot][key][0]
    // Build 7-day series ending at today's value, ±15% oscillation
    const rand = seededRand(`${key}-${slot}-${todaySeed}`)
    const values: number[] = []

    // Work backwards from todayVal, introducing a smooth walk
    let v = todayVal
    const raw = [v]
    for (let i = 1; i < 7; i++) {
      const delta = (rand() * 2 - 1) * 0.15
      v = v * (1 + delta)
      if (v <= 0) v = todayVal * 0.1
      raw.unshift(Math.round(v * 10) / 10)
    }
    values.push(...raw)

    return { slot, values }
  })
}

// ---------------------------------------------------------------------------
// KPI metadata — direction + display label
// ---------------------------------------------------------------------------
export type KPIDirection = 'higher-better' | 'lower-better' | 'neutral'

export interface KPIMeta {
  key: keyof KPIValues
  label: string
  direction: KPIDirection
  unit?: string
}

export const KPI_META: KPIMeta[] = [
  { key: 'basicService', label: 'Basic Service', direction: 'higher-better' },
  { key: 'damaged', label: 'Damaged', direction: 'lower-better' },
  { key: 'missing', label: 'Missing', direction: 'lower-better' },
  { key: 'unreachable', label: 'Unreachable', direction: 'lower-better' },
  { key: 'batteryLevel', label: 'Battery Level', direction: 'higher-better', unit: '%' },
  { key: 'damageCollect', label: 'Damage Collect', direction: 'higher-better' },
  { key: 'fuelLow', label: 'Fuel Low', direction: 'lower-better' },
  { key: 'active', label: 'Active', direction: 'higher-better' },
  { key: 'greenhouse', label: 'Greenhouse', direction: 'lower-better' },
  { key: 'move', label: 'Move', direction: 'neutral' },
]
