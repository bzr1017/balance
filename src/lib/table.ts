import * as XLSX from 'xlsx';
import { formatHu, isoToExcelSerial, parseDateValue } from './dates';

/* Közös táblázat-segédek: minden modul (vérnyomás, súly, …) ezekre épít. */

export type ExportFormat = 'csv' | 'xlsx' | 'xls';

export const MIME: Record<ExportFormat, string> = {
  csv: 'text/csv;charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
};

const DATE_FORMAT = 'yyyy.mm.dd. hh:mm';

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export interface ColumnSpec {
  header: string;
  /** Az első oszlop mindig az időpont (ISO); a többi szám vagy null. */
  decimals?: number;
  width?: number;
}

/** Sorok: [takenAtIso, ...számok]. */
export type TableRow = [string, ...(number | null)[]];

/** CSV: pontosvesszős, UTF-8 BOM-mal, tizedesvesszővel – a magyar Excel így nyitja meg helyesen. */
export function tableToCsv(cols: ColumnSpec[], rows: TableRow[]): string {
  const lines = [cols.map((c) => c.header).join(';')];
  for (const [iso, ...vals] of rows) {
    lines.push([formatHu(iso), ...vals.map((v, i) => (v == null ? '' : v.toFixed(cols[i + 1]?.decimals ?? 0).replace('.', ',')))].join(';'));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function tableToWorkbook(sheetName: string, cols: ColumnSpec[], rows: TableRow[]): XLSX.WorkBook {
  const data = rows.map(([iso, ...vals]) => [isoToExcelSerial(iso), ...vals]);
  const ws = XLSX.utils.aoa_to_sheet([cols.map((c) => c.header), ...data]);
  for (let r = 1; r <= data.length; r++) {
    const dateCell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (dateCell) dateCell.z = DATE_FORMAT;
    cols.forEach((c, ci) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c: ci })];
      if (ci > 0 && cell && c.decimals) cell.z = '0.' + '0'.repeat(c.decimals);
    });
  }
  ws['!cols'] = cols.map((c, i) => ({ wch: c.width ?? (i === 0 ? 18 : 12) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

export function buildTable(sheetName: string, cols: ColumnSpec[], rows: TableRow[], format: ExportFormat): Uint8Array {
  if (format === 'csv') return new TextEncoder().encode(tableToCsv(cols, rows));
  const out = XLSX.write(tableToWorkbook(sheetName, cols, rows), { bookType: format === 'xls' ? 'biff8' : 'xlsx', type: 'array' });
  return new Uint8Array(out as ArrayBuffer);
}

/* ------------------------------------------------------------------ olvasás */

export const norm = (v: unknown) =>
  String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

function decodeText(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buf);
  const text = utf8.includes('�') ? new TextDecoder('windows-1250').decode(buf) : utf8;
  return text.replace(/^﻿/, '');
}

export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = [';', '\t', ','].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best, ';');

  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** CSV/XLSX/XLS fájl → munkalaponként a cellák (nyers értékek, a dátum Excel sorszámként). */
export function readSheets(buf: ArrayBuffer, fileName: string): unknown[][][] {
  if (/\.(csv|txt)$/i.test(fileName)) return [parseCsv(decodeText(buf))];
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: false });
  return wb.SheetNames.map((n) =>
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }),
  );
}

/** Fejlécsor keresése: az első sor (max. 15), amelyben van a `matcher`-nek megfelelő cella. */
export function findHeaderRow(rows: unknown[][], matcher: (h: string) => boolean): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if ((rows[i] ?? []).some((c) => matcher(norm(c)))) return i;
  }
  return -1;
}

export const isTimeHeader = (h: string) => ['idopont', 'datum', 'date', 'time', 'ido'].some((k) => h === k || h.startsWith(k));

/** Ha nincs "Időpont" fejléc, azt az oszlopot választja, amelyben a legtöbb érték dátum. */
export function guessTimeColumn(data: unknown[][], exclude: number[]): number {
  const width = Math.max(0, ...data.map((r) => r?.length ?? 0));
  let best = -1, bestScore = 0;
  for (let c = 0; c < width; c++) {
    if (exclude.includes(c)) continue;
    const score = data.filter((r) => {
      const v = r?.[c];
      return (typeof v === 'string' || v instanceof Date || (typeof v === 'number' && v > 20000)) && parseDateValue(v) != null;
    }).length;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return bestScore >= Math.max(1, data.length / 3) ? best : -1;
}

export interface ImportResult<T> {
  items: T[];
  invalidRows: number;
  sheets: number;
  warnings: string[];
}

export function mergeByKey<T>(existing: T[], incoming: T[], key: (t: T) => string, sort: (xs: T[]) => T[]) {
  const keys = new Set(existing.map(key));
  const added: T[] = [];
  for (const m of incoming) {
    const k = key(m);
    if (keys.has(k)) continue;
    keys.add(k);
    added.push(m);
  }
  return { merged: sort([...existing, ...added]), added: added.length, duplicates: incoming.length - added.length };
}
