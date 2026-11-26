import type { Measurement, Period, Settings } from './types';
import { monthKey, nowLocalIso, parseLocalIso, toLocalIso } from './dates';

export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Populációs szórás – megegyezik az Excel STDEV.P függvényével (ezt használja a csatolt táblázat). */
export function stdevP(xs: number[]): number | null {
  const m = mean(xs);
  if (m == null) return null;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
}

export interface SeriesStats {
  avg: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
}

function seriesStats(xs: number[]): SeriesStats {
  return {
    avg: mean(xs),
    sd: stdevP(xs),
    min: xs.length ? Math.min(...xs) : null,
    max: xs.length ? Math.max(...xs) : null,
  };
}

export type Category = 'ideal' | 'ok' | 'high';

export function classify(m: Pick<Measurement, 'sys' | 'dia'>, s: Settings): Category {
  if (m.sys < s.targetSys && m.dia < s.targetDia) return 'ideal';
  if (m.sys < s.limitSys && m.dia < s.limitDia) return 'ok';
  return 'high';
}

export interface Summary {
  count: number;
  sys: SeriesStats;
  dia: SeriesStats;
  pulse: SeriesStats;
  counts: Record<Category, number>;
}

export function summarize(ms: Measurement[], s: Settings): Summary {
  const counts: Record<Category, number> = { ideal: 0, ok: 0, high: 0 };
  for (const m of ms) counts[classify(m, s)]++;
  return {
    count: ms.length,
    sys: seriesStats(ms.map((m) => m.sys)),
    dia: seriesStats(ms.map((m) => m.dia)),
    pulse: seriesStats(ms.flatMap((m) => (m.pulse == null ? [] : [m.pulse]))),
    counts,
  };
}

export const sortByTime = (ms: Measurement[]) =>
  [...ms].sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.id.localeCompare(b.id));

export function filterByPeriod<T extends { takenAt: string }>(ms: T[], period: Period): T[] {
  if (period === 'all') return ms;
  if (period === 'last30') {
    const from = parseLocalIso(nowLocalIso());
    from.setDate(from.getDate() - 30);
    const fromIso = toLocalIso(from);
    return ms.filter((m) => m.takenAt >= fromIso);
  }
  return ms.filter((m) => monthKey(m.takenAt) === period);
}

export function availableMonths(ms: { takenAt: string }[]): string[] {
  return [...new Set(ms.map((m) => monthKey(m.takenAt)))].sort().reverse();
}

export interface DailyPoint {
  day: string;
  sys: number;
  dia: number;
  pulse: number | null;
  n: number;
}

export function dailyAverages(ms: Measurement[]): DailyPoint[] {
  const groups = new Map<string, Measurement[]>();
  for (const m of sortByTime(ms)) {
    const day = m.takenAt.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), m]);
  }
  return [...groups].map(([day, g]) => {
    const pulses = g.flatMap((m) => (m.pulse == null ? [] : [m.pulse]));
    return {
      day,
      sys: Math.round(mean(g.map((m) => m.sys))!),
      dia: Math.round(mean(g.map((m) => m.dia))!),
      pulse: pulses.length ? Math.round(mean(pulses)!) : null,
      n: g.length,
    };
  });
}

export const fmt = (v: number | null, digits = 0) =>
  v == null ? '–' : v.toLocaleString('hu-HU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
