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
const BASELINE: KPISnapshot = {
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

// Jitter a value by ±10% for simulated refresh
function jitter(v: number): number {
  const factor = 1 + (Math.random() * 0.2 - 0.1)
  return Math.round(v * factor * 10) / 10
}

function jitterSlot(slot: KPIValues): KPIValues {
  return Object.fromEntries(
    Object.entries(slot).map(([k, [a, b]]) => [k, [jitter(a), jitter(b)]]),
  ) as KPIValues
}

// ---------------------------------------------------------------------------
// fetchKPIData — swap this body for a real API call when ready
// ---------------------------------------------------------------------------
export async function fetchKPIData(randomize = false): Promise<KPISnapshot> {
  // --- REAL API INTEGRATION POINT ---
  // return await $fetch<KPISnapshot>('/api/kpi/latest')
  // ----------------------------------

  if (!randomize) return BASELINE

  return {
    '8:00': jitterSlot(BASELINE['8:00']),
    '13:00': jitterSlot(BASELINE['13:00']),
    '17:00': jitterSlot(BASELINE['17:00']),
  }
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
