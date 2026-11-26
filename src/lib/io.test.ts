import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { buildExport, mergeMeasurements, parseCsv, parseImport, SAMPLE_MEASUREMENTS } from './io';
import { excelSerialToIso, isoToExcelSerial, parseDateValue } from './dates';
import { filterByPeriod, stdevP, summarize } from './stats';
import { DEFAULT_SETTINGS, type Measurement } from './types';

const toBuf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

const sample: Measurement[] = [
  { id: 'a', takenAt: '2026-01-06T21:06', sys: 148, dia: 93, pulse: 60 },
  { id: 'b', takenAt: '2026-01-06T21:07', sys: 145, dia: 86, pulse: 61 },
  { id: 'c', takenAt: '2026-02-02T06:00', sys: 125, dia: 83, pulse: null },
];

describe('dátumok', () => {
  it('értelmezi a táblázatban előforduló formátumokat', () => {
    expect(parseDateValue('2026.01.08. 21:10')).toBe('2026-01-08T21:10');
    expect(parseDateValue('2026.04.25.  9:07')).toBe('2026-04-25T09:07');
    expect(parseDateValue('2026-01-08T21:10')).toBe('2026-01-08T21:10');
    expect(parseDateValue('08.01.2026 21:10')).toBe('2026-01-08T21:10');
    expect(parseDateValue('2026.02.30. 10:00')).toBeNull();
  });
  it('Excel sorszám oda-vissza', () => {
    const iso = '2026-03-20T16:23';
    expect(excelSerialToIso(isoToExcelSerial(iso))).toBe(iso);
  });
});

describe('export / import oda-vissza', () => {
  for (const fmt of ['csv', 'xlsx', 'xls'] as const) {
    it(fmt, () => {
      const r = parseImport(toBuf(buildExport(sample, fmt)), `x.${fmt}`);
      expect(r.invalidRows).toBe(0);
      expect(r.items.map(({ id: _, ...m }) => m)).toEqual(sample.map(({ id: _, ...m }) => m));
    });
  }
  it('az export csak a 4 oszlopot tartalmazza', () => {
    const wb = XLSX.read(buildExport(sample, 'xlsx'), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    expect(rows[0]).toEqual(['Időpont', 'Szisztolés', 'Diasztolés', 'Pulzus']);
    expect(rows[1]).toHaveLength(4);
  });
  it('CSV pontosvesszővel és BOM-mal', () => {
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(buildExport(sample, 'csv'));
    expect(text.startsWith('﻿Időpont;Szisztolés;Diasztolés;Pulzus')).toBe(true);
    expect(text).toContain('2026.02.02. 06:00;125;83;');
  });
  it('vesszős CSV, fejléc nélkül is', () => {
    expect(parseCsv('a,b\n"1,5",2')).toEqual([['a', 'b'], ['1,5', '2']]);
    const r = parseImport(new TextEncoder().encode('2026-05-01 07:00,120,80,60\n').buffer as ArrayBuffer, 'x.csv');
    expect(r.items[0]).toMatchObject({ takenAt: '2026-05-01T07:00', sys: 120, dia: 80, pulse: 60 });
  });
  it('a minta fájlok visszaimportálhatók', () => {
    for (const fmt of ['csv', 'xlsx', 'xls'] as const) {
      const r = parseImport(toBuf(buildExport(SAMPLE_MEASUREMENTS, fmt)), `minta.${fmt}`);
      expect(r.invalidRows).toBe(0);
      expect(r.items).toHaveLength(SAMPLE_MEASUREMENTS.length);
    }
  });
  it('duplikátumokat kihagyja', () => {
    const again = sample.map((m) => ({ ...m, id: m.id + '2' }));
    expect(mergeMeasurements(sample, again)).toMatchObject({ added: 0, duplicates: 3 });
  });
});

const ORIGINAL = process.env.BALANCE_SAMPLE_XLSX;
describe.skipIf(!ORIGINAL || !existsSync(ORIGINAL))('eredeti vernyomas.xlsx', () => {
  it('minden havi lapot beolvas, és az Excel statisztikájával egyezik', () => {
    const buf = readFileSync(ORIGINAL!);
    const r = parseImport(toBuf(new Uint8Array(buf)), 'vernyomas.xlsx');
    expect(r.sheets).toBe(10);
    expect(r.invalidRows).toBe(0);

    expect(filterByPeriod(r.items, '2026-01')).toHaveLength(31);
    expect(filterByPeriod(r.items, '2026-03')).toHaveLength(37);
    expect(stdevP([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);

    // Az Excel J2/J3 cellák értékei: ROUND(AVERAGE()) és ROUND(STDEV.P())
    const expected: [string, string, number, string, string][] = [
      ['2026-01', '135/85', 60, '8.28', '5.9'],
      ['2026-02', '133/80', 60, '9.45', '5.8'],
      ['2026-03', '130/81', 61, '10.52', '6.8'],
    ];
    for (const [month, avg, pulse, sdSys, sdDia] of expected) {
      const s = summarize(filterByPeriod(r.items, month), DEFAULT_SETTINGS);
      expect(`${Math.round(s.sys.avg!)}/${Math.round(s.dia.avg!)}`).toBe(avg);
      expect(Math.round(s.pulse.avg!)).toBe(pulse);
      expect(s.sys.sd!.toFixed(2)).toBe(sdSys);
      expect(s.dia.sd!.toFixed(1)).toBe(sdDia);
    }
  });
});
