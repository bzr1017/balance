import * as XLSX from 'xlsx';
import { isoToExcelSerial, parseDateValue } from './dates';
import {
  matchResult, QUALITY_LABEL, RESULT_SHORT, SEVERITY_LABEL, sortFootball, validateEntry,
  type FootballEntry, type InjurySeverity, type TrainingQuality,
} from './football';
import { findHeaderRow, mergeByKey, newId, norm, readSheets, toNumber, type ExportFormat, type ImportResult } from './table';
import type { DataAdapter } from './io';

/*
 * Foci bejegyzések egy táblázatban: mérkőzések és edzések együtt, "Típus" oszloppal.
 * Ami az adott típusnál nem értelmezett, üresen marad. Az "Eredmény" oszlop csak tájékoztató
 * (a végeredményből számolódik), importkor nem olvassuk.
 */

type Cell = string | number | null;

interface Col {
  header: string;
  width: number;
  get: (e: FootballEntry) => Cell;
}

const m = <K extends string>(e: FootballEntry, f: (x: Extract<FootballEntry, { type: 'match' }>) => K | number | null): Cell =>
  e.type === 'match' ? f(e) : null;
const t = (e: FootballEntry, f: (x: Extract<FootballEntry, { type: 'training' }>) => Cell): Cell =>
  e.type === 'training' ? f(e) : null;

export const FOOTBALL_COLUMNS: Col[] = [
  { header: 'Dátum', width: 12, get: (e) => e.date },
  { header: 'Típus', width: 10, get: (e) => (e.type === 'match' ? 'Mérkőzés' : 'Edzés') },
  { header: 'Pontszám', width: 9, get: (e) => e.rating },
  { header: 'Ellenfél', width: 18, get: (e) => m(e, (x) => x.opponent || null) },
  { header: 'Saját gól', width: 9, get: (e) => m(e, (x) => x.scoreFor) },
  { header: 'Ellenfél gól', width: 11, get: (e) => m(e, (x) => x.scoreAgainst) },
  { header: 'Eredmény', width: 9, get: (e) => m(e, (x) => { const r = matchResult(x); return r ? RESULT_SHORT[r] : null; }) },
  { header: 'Játszott percek', width: 14, get: (e) => m(e, (x) => x.minutes) },
  { header: 'Pozíció', width: 18, get: (e) => m(e, (x) => x.position || null) },
  { header: 'Gólok', width: 7, get: (e) => m(e, (x) => x.goals) },
  { header: 'Gólpasszok', width: 10, get: (e) => m(e, (x) => x.assists) },
  { header: 'Szubjektív értékelés', width: 30, get: (e) => m(e, (x) => x.evaluation || null) },
  { header: 'Sérülés helye', width: 14, get: (e) => m(e, (x) => x.injury?.location || null) },
  { header: 'Sérülés súlyossága', width: 16, get: (e) => m(e, (x) => (x.injury ? SEVERITY_LABEL[x.injury.severity] : null)) },
  { header: 'Edzés minősége', width: 14, get: (e) => t(e, (x) => (x.quality ? QUALITY_LABEL[x.quality] : null)) },
  { header: 'Lövések', width: 8, get: (e) => t(e, (x) => x.shots) },
  { header: 'Lövésből gól', width: 12, get: (e) => t(e, (x) => x.shotGoals) },
  { header: 'Megjegyzés', width: 30, get: (e) => e.note || null },
];

export const FOOTBALL_HEADERS = FOOTBALL_COLUMNS.map((c) => c.header);

/* ---------------------------------------------------------------- export */

const csvCell = (v: Cell) => {
  if (v == null) return '';
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function buildFootballExport(entries: FootballEntry[], format: ExportFormat): Uint8Array {
  const sorted = sortFootball(entries);
  if (format === 'csv') {
    const lines = [FOOTBALL_HEADERS.join(';')];
    for (const e of sorted) {
      lines.push(FOOTBALL_COLUMNS.map((c, i) => csvCell(i === 0 ? `${e.date.replaceAll('-', '.')}.` : c.get(e))).join(';'));
    }
    return new TextEncoder().encode('﻿' + lines.join('\r\n') + '\r\n');
  }
  const rows = sorted.map((e) => FOOTBALL_COLUMNS.map((c, i) => (i === 0 ? isoToExcelSerial(`${e.date}T00:00`) : c.get(e))));
  const ws = XLSX.utils.aoa_to_sheet([FOOTBALL_HEADERS, ...rows]);
  for (let r = 1; r <= rows.length; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (cell) cell.z = 'yyyy.mm.dd.';
  }
  ws['!cols'] = FOOTBALL_COLUMNS.map((c) => ({ wch: c.width }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Foci');
  return new Uint8Array(XLSX.write(wb, { bookType: format === 'xls' ? 'biff8' : 'xlsx', type: 'array' }) as ArrayBuffer);
}

/* ---------------------------------------------------------------- import */

const KEY_BY_HEADER: Record<string, string> = Object.fromEntries(
  FOOTBALL_HEADERS.map((h) => [norm(h), h]),
);
// angol / rövid alternatívák
Object.assign(KEY_BY_HEADER, {
  datum: 'Dátum', date: 'Dátum', tipus: 'Típus', type: 'Típus', pont: 'Pontszám', rating: 'Pontszám', ertekeles: 'Pontszám',
  opponent: 'Ellenfél', percek: 'Játszott percek', minutes: 'Játszott percek', perc: 'Játszott percek',
  position: 'Pozíció', gol: 'Gólok', goals: 'Gólok', golpassz: 'Gólpasszok', assists: 'Gólpasszok',
  minoseg: 'Edzés minősége', quality: 'Edzés minősége', shots: 'Lövések', loves: 'Lövések', megjegyzes: 'Megjegyzés', note: 'Megjegyzés',
});

const parseType = (v: unknown): 'match' | 'training' | null => {
  const s = norm(v);
  if (!s) return null;
  if (s.startsWith('merk') || s.startsWith('match') || s === 'm' || s.startsWith('meccs')) return 'match';
  if (s.startsWith('edz') || s.startsWith('train') || s === 'e') return 'training';
  return null;
};

const parseQuality = (v: unknown): TrainingQuality | null => {
  const s = norm(v);
  if (!s) return null;
  if (s.startsWith('ross') || s === 'bad') return 'bad';
  if (s.startsWith('koz') || s === 'ok' || s === 'medium') return 'ok';
  if (s === 'jo' || s === 'good') return 'good';
  return null;
};

const parseSeverity = (v: unknown): InjurySeverity => {
  const s = norm(v);
  if (s.startsWith('sul') || s === 'severe') return 'severe';
  if (s.startsWith('koz') || s === 'moderate') return 'moderate';
  return 'mild';
};

const str = (v: unknown) => (v == null ? '' : String(v).trim());
const int = (v: unknown) => { const n = toNumber(v); return n == null ? null : Math.round(n); };

export function rowsToFootball(rows: unknown[][]): { items: FootballEntry[]; invalid: number } {
  const headerIdx = findHeaderRow(rows, (h) => h === 'tipus' || h === 'type');
  if (headerIdx < 0) return { items: [], invalid: 0 };
  const cols = new Map<string, number>();
  rows[headerIdx].forEach((h, i) => {
    const key = KEY_BY_HEADER[norm(h)];
    if (key && !cols.has(key)) cols.set(key, i);
  });
  const get = (r: unknown[], header: string) => (cols.has(header) ? r[cols.get(header)!] : null);

  const items: FootballEntry[] = [];
  let invalid = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    if (!r || r.every((c) => c == null || c === '')) continue;
    const type = parseType(get(r, 'Típus'));
    const dateIso = parseDateValue(get(r, 'Dátum'));
    const rating = int(get(r, 'Pontszám'));
    if (!type || !dateIso || rating == null) { invalid++; continue; }
    const base = { id: newId(), date: dateIso.slice(0, 10), rating, note: str(get(r, 'Megjegyzés')) };
    let entry: FootballEntry;
    if (type === 'match') {
      const injLoc = str(get(r, 'Sérülés helye'));
      entry = {
        ...base, type: 'match',
        opponent: str(get(r, 'Ellenfél')),
        scoreFor: int(get(r, 'Saját gól')),
        scoreAgainst: int(get(r, 'Ellenfél gól')),
        minutes: int(get(r, 'Játszott percek')),
        position: str(get(r, 'Pozíció')),
        goals: int(get(r, 'Gólok')) ?? 0,
        assists: int(get(r, 'Gólpasszok')) ?? 0,
        evaluation: str(get(r, 'Szubjektív értékelés')),
        injury: injLoc ? { location: injLoc, severity: parseSeverity(get(r, 'Sérülés súlyossága')) } : null,
      };
    } else {
      const shots = int(get(r, 'Lövések'));
      entry = {
        ...base, type: 'training',
        quality: parseQuality(get(r, 'Edzés minősége')),
        shots,
        shotGoals: shots != null ? (int(get(r, 'Lövésből gól')) ?? 0) : null,
      };
    }
    if (validateEntry(entry)) { invalid++; continue; }
    items.push(entry);
  }
  return { items, invalid };
}

export function parseFootballImport(buf: ArrayBuffer, fileName: string): ImportResult<FootballEntry> {
  const items: FootballEntry[] = [];
  let invalidRows = 0, sheets = 0;
  for (const rows of readSheets(buf, fileName)) {
    const r = rowsToFootball(rows);
    if (r.items.length || r.invalid) sheets++;
    items.push(...r.items);
    invalidRows += r.invalid;
  }
  const warnings = !items.length && !invalidRows ? ['Nem találtam „Típus” és „Pontszám” oszlopot a fájlban.'] : [];
  return { items: sortFootball(items), invalidRows, sheets, warnings };
}

export const footballKey = (e: FootballEntry) =>
  e.type === 'match'
    ? ['M', e.date, e.rating, e.opponent, e.scoreFor, e.scoreAgainst, e.minutes, e.goals, e.assists].join('|')
    : ['E', e.date, e.rating, e.quality, e.shots, e.shotGoals].join('|');

export const mergeFootball = (existing: FootballEntry[], incoming: FootballEntry[]) =>
  mergeByKey(existing, incoming, footballKey, sortFootball);

export const SAMPLE_FOOTBALL: FootballEntry[] = [
  {
    id: 's1', type: 'match', date: '2026-09-06', rating: 8, note: '', opponent: 'Kőszeg FC', scoreFor: 3, scoreAgainst: 1,
    minutes: 90, position: 'Csatár', goals: 2, assists: 0, evaluation: 'Jól mozogtam, sok helyzetem volt.', injury: null,
  },
  {
    id: 's2', type: 'match', date: '2026-09-13', rating: 5, note: 'Esős idő', opponent: 'Fertőd SE', scoreFor: 0, scoreAgainst: 2,
    minutes: 60, position: 'Szélső', goals: 0, assists: 0, evaluation: 'Fáradt voltam.', injury: { location: 'Boka', severity: 'mild' },
  },
  { id: 's3', type: 'training', date: '2026-09-09', rating: 7, note: '', quality: 'good', shots: 20, shotGoals: 9 },
  { id: 's4', type: 'training', date: '2026-09-11', rating: 6, note: 'Taktikai edzés', quality: 'ok', shots: null, shotGoals: null },
];

export const footballAdapter: DataAdapter<FootballEntry> = {
  noun: 'bejegyzés',
  dateLabel: (e) => `${e.date.replaceAll('-', '.')}.`,
  filePrefix: 'foci',
  columnsText: 'Dátum, Típus (Mérkőzés / Edzés), Pontszám, mérkőzés- és edzésadatok, Megjegyzés',
  sampleHint: 'A „Típus” oszlopba Mérkőzés vagy Edzés kerüljön; ami az adott típusnál nem értelmezett, maradjon üresen. Minőség: Rossz / Közepes / Jó, sérülés súlyossága: Enyhe / Közepes / Súlyos.',
  sample: SAMPLE_FOOTBALL,
  build: buildFootballExport,
  parse: parseFootballImport,
  merge: mergeFootball,
};
