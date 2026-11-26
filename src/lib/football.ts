import { mean } from './stats';

/* ---------------------------------------------------------------- típusok */

export type TrainingQuality = 'bad' | 'ok' | 'good';
export type InjurySeverity = 'mild' | 'moderate' | 'severe';

interface FootballBase {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** 1–10 */
  rating: number;
  note: string;
}

export interface MatchEntry extends FootballBase {
  type: 'match';
  opponent: string;
  scoreFor: number | null;
  scoreAgainst: number | null;
  minutes: number | null;
  goals: number;
  assists: number;
  position: string;
  /** Szubjektív értékelés (szabad szöveg) */
  evaluation: string;
  injury: { location: string; severity: InjurySeverity } | null;
}

export interface TrainingEntry extends FootballBase {
  type: 'training';
  quality: TrainingQuality | null;
  /** Kapura lövések száma (ha volt) */
  shots: number | null;
  /** Ebből gól */
  shotGoals: number | null;
}

export type FootballEntry = MatchEntry | TrainingEntry;

/* ---------------------------------------------------------------- feliratok */

export const POSITIONS = [
  'Kapus', 'Belső védő', 'Szélső védő', 'Védekező középpályás', 'Középpályás',
  'Támadó középpályás', 'Szélső', 'Csatár',
];

export const QUALITY_LABEL: Record<TrainingQuality, string> = { bad: 'Rossz', ok: 'Közepes', good: 'Jó' };
export const SEVERITY_LABEL: Record<InjurySeverity, string> = { mild: 'Enyhe', moderate: 'Közepes', severe: 'Súlyos' };
export const INJURY_LOCATIONS = [
  'Boka', 'Térd', 'Comb hátsó', 'Comb első', 'Ágyék', 'Vádli', 'Achilles', 'Lábfej', 'Csípő', 'Hát', 'Váll', 'Fej', 'Csukló / kéz',
];

export type MatchResult = 'W' | 'D' | 'L';
export const RESULT_LABEL: Record<MatchResult, string> = { W: 'Győzelem', D: 'Döntetlen', L: 'Vereség' };
export const RESULT_SHORT: Record<MatchResult, string> = { W: 'GY', D: 'D', L: 'V' };

export function matchResult(m: MatchEntry): MatchResult | null {
  if (m.scoreFor == null || m.scoreAgainst == null) return null;
  return m.scoreFor > m.scoreAgainst ? 'W' : m.scoreFor < m.scoreAgainst ? 'L' : 'D';
}

/* ---------------------------------------------------------------- rendezés, validálás */

export const sortFootball = (xs: FootballEntry[]) =>
  [...xs].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

export function validateEntry(e: FootballEntry): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return 'Add meg a dátumot.';
  if (!Number.isInteger(e.rating) || e.rating < 1 || e.rating > 10) return 'Adj pontszámot 1 és 10 között.';
  if (e.type === 'match') {
    if (e.minutes != null && (e.minutes < 0 || e.minutes > 150)) return 'A játszott percek 0 és 150 között lehetnek.';
    if (e.goals < 0 || e.assists < 0 || e.goals > 20 || e.assists > 20) return 'Ellenőrizd a gólok és gólpasszok számát.';
    if ((e.scoreFor == null) !== (e.scoreAgainst == null)) return 'A végeredményhez mindkét csapat góljait add meg.';
    if (e.injury && !e.injury.location.trim()) return 'Add meg a sérülés helyét.';
  } else {
    if (e.shots != null && e.shots < 0) return 'A lövések száma nem lehet negatív.';
    if (e.shots != null && e.shotGoals != null && e.shotGoals > e.shots) return 'A gólok száma nem lehet több, mint a lövéseké.';
  }
  return null;
}

/* ---------------------------------------------------------------- összesítő */

export interface MatchSummary {
  count: number;
  wins: number; draws: number; losses: number;
  minutes: number;
  goals: number;
  assists: number;
  /** (gól + gólpassz) / 90 perc – csak ha van rögzített perc */
  gaPer90: number | null;
  avgRating: number | null;
  injuries: number;
  positions: { position: string; count: number }[];
}

export interface TrainingSummary {
  count: number;
  avgRating: number | null;
  quality: Record<TrainingQuality, number>;
  shots: number;
  shotGoals: number;
  /** gól / lövés, % */
  conversion: number | null;
  shootingSessions: number;
}

export function summarizeMatches(xs: FootballEntry[]): MatchSummary {
  const ms = xs.filter((x): x is MatchEntry => x.type === 'match');
  const res = ms.map(matchResult);
  const minutes = ms.reduce((a, m) => a + (m.minutes ?? 0), 0);
  const goals = ms.reduce((a, m) => a + m.goals, 0);
  const assists = ms.reduce((a, m) => a + m.assists, 0);
  const posCount = new Map<string, number>();
  for (const m of ms) if (m.position) posCount.set(m.position, (posCount.get(m.position) ?? 0) + 1);
  return {
    count: ms.length,
    wins: res.filter((r) => r === 'W').length,
    draws: res.filter((r) => r === 'D').length,
    losses: res.filter((r) => r === 'L').length,
    minutes, goals, assists,
    gaPer90: minutes > 0 ? ((goals + assists) / minutes) * 90 : null,
    avgRating: mean(ms.map((m) => m.rating)),
    injuries: ms.filter((m) => m.injury).length,
    positions: [...posCount].map(([position, count]) => ({ position, count })).sort((a, b) => b.count - a.count),
  };
}

export function summarizeTrainings(xs: FootballEntry[]): TrainingSummary {
  const ts = xs.filter((x): x is TrainingEntry => x.type === 'training');
  const quality: Record<TrainingQuality, number> = { bad: 0, ok: 0, good: 0 };
  for (const t of ts) if (t.quality) quality[t.quality]++;
  const shooting = ts.filter((t) => t.shots != null && t.shots > 0);
  const shots = shooting.reduce((a, t) => a + (t.shots ?? 0), 0);
  const shotGoals = shooting.reduce((a, t) => a + (t.shotGoals ?? 0), 0);
  return {
    count: ts.length,
    avgRating: mean(ts.map((t) => t.rating)),
    quality,
    shots, shotGoals,
    conversion: shots > 0 ? (shotGoals / shots) * 100 : null,
    shootingSessions: shooting.length,
  };
}

/** Az időszakszűrő ugyanazt a "takenAt" mezőt várja, mint a vérnyomás – a dátumból képezzük. */
export const withTakenAt = <T extends { date: string }>(x: T) => ({ ...x, takenAt: `${x.date}T00:00` });
