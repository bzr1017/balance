import * as XLSX from 'xlsx';
import { buildFootballExport, FOOTBALL_HEADERS, mergeFootball, parseFootballImport, SAMPLE_FOOTBALL } from './footballIo';
import { describe, expect, it } from 'vitest';
import { matchResult, summarizeMatches, summarizeTrainings, validateEntry, type FootballEntry, type MatchEntry } from './football';

const match = (p: Partial<MatchEntry>): MatchEntry => ({
  id: Math.random().toString(36), type: 'match', date: '2026-11-01', rating: 7, note: '', opponent: 'Kőszeg',
  scoreFor: 2, scoreAgainst: 1, minutes: 90, goals: 0, assists: 0, position: 'Csatár', evaluation: '', injury: null, ...p,
});

const entries: FootballEntry[] = [
  match({ goals: 1, assists: 1, rating: 8 }),
  match({ scoreFor: 0, scoreAgainst: 0, minutes: 45, rating: 6, position: 'Szélső' }),
  match({ scoreFor: 1, scoreAgainst: 3, minutes: 45, goals: 1, rating: 5, injury: { location: 'Boka', severity: 'mild' } }),
  { id: 't1', type: 'training', date: '2026-11-03', rating: 7, note: '', quality: 'good', shots: 10, shotGoals: 4 },
  { id: 't2', type: 'training', date: '2026-11-05', rating: 5, note: '', quality: 'bad', shots: null, shotGoals: null },
  { id: 't3', type: 'training', date: '2026-11-07', rating: 9, note: '', quality: 'good', shots: 6, shotGoals: 2 },
];

describe('foci', () => {
  it('mérkőzés eredménye', () => {
    expect(matchResult(match({}))).toBe('W');
    expect(matchResult(match({ scoreFor: 1, scoreAgainst: 1 }))).toBe('D');
    expect(matchResult(match({ scoreFor: null, scoreAgainst: null }))).toBeNull();
  });

  it('mérkőzés összesítő', () => {
    const s = summarizeMatches(entries);
    expect(s).toMatchObject({ count: 3, wins: 1, draws: 1, losses: 1, minutes: 180, goals: 2, assists: 1, injuries: 1 });
    expect(s.gaPer90).toBe(1.5);
    expect(s.avgRating).toBeCloseTo(19 / 3);
    expect(s.positions[0]).toEqual({ position: 'Csatár', count: 2 });
  });

  it('edzés összesítő', () => {
    const s = summarizeTrainings(entries);
    expect(s).toMatchObject({ count: 3, shots: 16, shotGoals: 6, shootingSessions: 2, quality: { bad: 1, ok: 0, good: 2 } });
    expect(s.conversion).toBe(37.5);
    expect(s.avgRating).toBe(7);
  });

  it('validálás', () => {
    expect(validateEntry(match({}))).toBeNull();
    expect(validateEntry(match({ rating: 11 }))).toMatch(/pontszám/);
    expect(validateEntry(match({ scoreAgainst: null }))).toMatch(/végeredmény/);
    expect(validateEntry(match({ injury: { location: ' ', severity: 'mild' } }))).toMatch(/sérülés/);
    expect(validateEntry({ ...entries[3], shotGoals: 11 } as FootballEntry)).toMatch(/lövéseké/);
  });
});


const toBuf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
const strip = (xs: FootballEntry[]) => xs.map(({ id: _, ...rest }) => rest);

describe('foci export / import', () => {
  const withTricky: FootballEntry[] = [
    ...SAMPLE_FOOTBALL,
    match({ id: 'x', date: '2026-10-01', opponent: 'Pinkafő; "B" csapat', evaluation: 'Első félidő jó,\nmásodik gyenge', note: 'a;b' }),
  ];
  for (const fmt of ['csv', 'xlsx', 'xls'] as const) {
    it(`oda-vissza: ${fmt}`, () => {
      const r = parseFootballImport(toBuf(buildFootballExport(withTricky, fmt)), `foci.${fmt}`);
      expect(r.invalidRows).toBe(0);
      expect(strip(r.items)).toEqual(strip(sortedCopy(withTricky)));
    });
  }
  it('fejléc és eredmény oszlop', () => {
    const wb = XLSX.read(buildFootballExport(SAMPLE_FOOTBALL, 'xlsx'), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.Foci, { header: 1 });
    expect(rows[0]).toEqual(FOOTBALL_HEADERS);
    const csv = new TextDecoder().decode(buildFootballExport(SAMPLE_FOOTBALL, 'csv'));
    expect(csv).toContain('2026.09.06.;Mérkőzés;8;Kőszeg FC;3;1;GY;90;Csatár;2;0;');
    expect(csv).toContain('2026.09.09.;Edzés;7;;;;;;;;;;;;Jó;20;9;');
  });
  it('hibás sorok és duplikátumok', () => {
    const csv = 'Dátum;Típus;Pontszám\n2026.01.01.;Edzés;7\n2026.01.02.;Valami;7\n2026.01.03.;Mérkőzés;12\n';
    const r = parseFootballImport(new TextEncoder().encode(csv).buffer as ArrayBuffer, 'x.csv');
    expect(r.items).toHaveLength(1);
    expect(r.invalidRows).toBe(2);
    expect(mergeFootball(SAMPLE_FOOTBALL, SAMPLE_FOOTBALL.map((e) => ({ ...e, id: e.id + 'z' }))).added).toBe(0);
  });
});

function sortedCopy(xs: FootballEntry[]) {
  return [...xs].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
