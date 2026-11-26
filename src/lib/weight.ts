import type { Period, Profile, WeightEntry } from './types';
import { nowLocalIso, parseDateValue, parseLocalIso, toLocalIso } from './dates';
import { filterByPeriod, mean, stdevP } from './stats';
import {
  buildTable, findHeaderRow, guessTimeColumn, isTimeHeader, mergeByKey, newId, norm, readSheets, toNumber,
  type ColumnSpec, type ExportFormat, type ImportResult,
} from './table';
import type { DataAdapter } from './io';

export const sortWeights = (ws: WeightEntry[]) =>
  [...ws].sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.id.localeCompare(b.id));

export const isPlausibleWeight = (kg: number) => kg >= 20 && kg <= 400;
export const roundKg = (kg: number) => Math.round(kg * 10) / 10;

/* ------------------------------------------------------------------ BMI, életkor */

export function bmi(kg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!kg || !heightCm) return null;
  const m = heightCm / 100;
  return kg / (m * m);
}

/** WHO felnőtt BMI kategóriák. */
export function bmiCategory(v: number): { label: string; tone: 'ideal' | 'ok' | 'high' } {
  if (v < 18.5) return { label: 'Sovány', tone: 'ok' };
  if (v < 25) return { label: 'Normál', tone: 'ideal' };
  if (v < 30) return { label: 'Túlsúly', tone: 'ok' };
  return { label: 'Elhízás', tone: 'high' };
}

/** A normál BMI (18,5–24,9) tartománynak megfelelő testsúly az adott magassághoz. */
export function healthyWeightRange(heightCm: number | null): [number, number] | null {
  if (!heightCm) return null;
  const m2 = (heightCm / 100) ** 2;
  return [roundKg(18.5 * m2), roundKg(24.9 * m2)];
}

export function ageFromBirthDate(birthDate: string, today = new Date()): number | null {
  const m = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < mo || (today.getMonth() + 1 === mo && today.getDate() < d)) age--;
  return age >= 0 && age < 130 ? age : null;
}

/* ------------------------------------------------------------------ statisztika */

export interface WeightSummary {
  count: number;
  last: WeightEntry | null;
  first: WeightEntry | null;
  change: number | null;
  avg: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
}

export function summarizeWeights(ws: WeightEntry[]): WeightSummary {
  const sorted = sortWeights(ws);
  const kgs = sorted.map((w) => w.kg);
  const first = sorted[0] ?? null;
  const last = sorted.at(-1) ?? null;
  return {
    count: sorted.length,
    first, last,
    change: first && last && first !== last ? roundKg(last.kg - first.kg) : null,
    avg: mean(kgs),
    sd: stdevP(kgs),
    min: kgs.length ? Math.min(...kgs) : null,
    max: kgs.length ? Math.max(...kgs) : null,
  };
}

/** Változás az elmúlt `days` napban: a legutóbbi mérés és az időszak előtti/eleji mérés különbsége. */
export function changeOverDays(ws: WeightEntry[], days: number): number | null {
  const sorted = sortWeights(ws);
  const last = sorted.at(-1);
  if (!last) return null;
  const from = parseLocalIso(last.takenAt);
  from.setDate(from.getDate() - days);
  const fromIso = toLocalIso(from);
  const before = [...sorted].reverse().find((w) => w.takenAt <= fromIso) ?? sorted.find((w) => w.takenAt >= fromIso);
  return before && before !== last ? roundKg(last.kg - before.kg) : null;
}

export const filterWeights = (ws: WeightEntry[], period: Period) => filterByPeriod(ws, period);

export const profileComplete = (p: Profile) => Boolean(p.birthDate && p.heightCm && p.sex);

/* ------------------------------------------------------------------ import / export */

export const WEIGHT_COLUMNS: ColumnSpec[] = [{ header: 'Időpont' }, { header: 'Testsúly (kg)', decimals: 1, width: 14 }];

export const buildWeightExport = (ws: WeightEntry[], format: ExportFormat) =>
  buildTable('Testsúly', WEIGHT_COLUMNS, sortWeights(ws).map((w) => [w.takenAt, w.kg]), format);

export const SAMPLE_WEIGHTS: WeightEntry[] = [
  { id: 'w1', takenAt: '2026-01-05T07:00', kg: 82.4 },
  { id: 'w2', takenAt: '2026-01-06T07:05', kg: 82.1 },
  { id: 'w3', takenAt: '2026-01-07T06:55', kg: 82.3 },
  { id: 'w4', takenAt: '2026-01-08T07:10', kg: 81.8 },
  { id: 'w5', takenAt: '2026-01-09T07:00', kg: 81.6 },
];

const isWeightHeader = (h: string) => h.includes('suly') || h.includes('weight') || h === 'kg' || h.includes('(kg)') || h.includes('tomeg');

export function rowsToWeights(rows: unknown[][]): { ws: WeightEntry[]; invalid: number; noTime: boolean } {
  const ws: WeightEntry[] = [];
  let invalid = 0;
  const headerIdx = findHeaderRow(rows, isWeightHeader);
  let kgCol = -1, timeCol = -1;
  if (headerIdx >= 0) {
    const h = rows[headerIdx].map(norm);
    kgCol = h.findIndex(isWeightHeader);
    timeCol = h.findIndex(isTimeHeader);
  } else {
    const first = rows.find((r) => r && r.length);
    const startsWithDate = first ? parseDateValue(first[0]) != null && toNumber(first[1]) != null : false;
    [timeCol, kgCol] = startsWithDate ? [0, 1] : [-1, 0];
  }
  if (kgCol < 0) return { ws, invalid: 0, noTime: false };
  const data = rows.slice(headerIdx + 1);
  if (timeCol < 0) timeCol = guessTimeColumn(data, [kgCol]);

  const start = parseLocalIso(nowLocalIso());
  let idx = 0;
  for (const r of data) {
    if (!r) continue;
    const raw = r[kgCol];
    if (raw == null || raw === '') continue;
    const kg = toNumber(raw);
    const takenAt = timeCol >= 0 ? parseDateValue(r[timeCol]) : toLocalIso(new Date(start.getTime() + idx++ * 60000));
    if (kg == null || !takenAt || !isPlausibleWeight(kg)) { invalid++; continue; }
    ws.push({ id: newId(), takenAt, kg: roundKg(kg) });
  }
  return { ws, invalid, noTime: timeCol < 0 && ws.length > 0 };
}

export function parseWeightImport(buf: ArrayBuffer, fileName: string): ImportResult<WeightEntry> {
  const warnings: string[] = [];
  const items: WeightEntry[] = [];
  let invalidRows = 0, sheets = 0, noTime = false;
  for (const rows of readSheets(buf, fileName)) {
    const r = rowsToWeights(rows);
    if (r.ws.length || r.invalid) sheets++;
    items.push(...r.ws);
    invalidRows += r.invalid;
    noTime ||= r.noTime;
  }
  if (noTime) warnings.push('A fájlban nem volt időpont oszlop – a mérések a mostani időponttal kerültek rögzítésre.');
  if (!items.length && !invalidRows) warnings.push('Nem találtam testsúly oszlopot a fájlban.');
  return { items: sortWeights(items), invalidRows, sheets, warnings };
}

export const mergeWeights = (existing: WeightEntry[], incoming: WeightEntry[]) =>
  mergeByKey(existing, incoming, (w) => `${w.takenAt}|${w.kg}`, sortWeights);

export const weightAdapter: DataAdapter<WeightEntry> = {
  noun: 'mérés',
  filePrefix: 'testsuly',
  columnsText: 'Időpont, Testsúly (kg)',
  sampleHint: 'Az időpont formátuma: 2026.01.05. 07:00. A súly tizedesvesszővel vagy ponttal is megadható.',
  sample: SAMPLE_WEIGHTS,
  build: buildWeightExport,
  parse: parseWeightImport,
  merge: mergeWeights,
};
