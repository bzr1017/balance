import type { Measurement } from './types';
import { formatHu, nowLocalIso, parseDateValue, parseLocalIso, toLocalIso } from './dates';
import { sortByTime } from './stats';
import {
  buildTable, findHeaderRow, guessTimeColumn, isTimeHeader, mergeByKey, newId, norm, readSheets, toNumber,
  type ColumnSpec, type ExportFormat, type ImportResult,
} from './table';

export { newId, parseCsv, MIME, type ExportFormat } from './table';

/** Egy modul import/export leírása – ezt kapja a közös Adatok (import/export/minta) felület. */
export interface DataAdapter<T> {
  /** pl. "mérés" */
  noun: string;
  /** Dátumfelirat az import-előnézethez */
  dateLabel: (item: T) => string;
  filePrefix: string;
  columnsText: string;
  sampleHint: string;
  sample: T[];
  build: (items: T[], format: ExportFormat) => Uint8Array;
  parse: (buf: ArrayBuffer, fileName: string) => ImportResult<T>;
  merge: (existing: T[], incoming: T[]) => { merged: T[]; added: number; duplicates: number };
}

/* ------------------------------------------------------------------ vérnyomás */

export const BP_COLUMNS: ColumnSpec[] = [
  { header: 'Időpont' }, { header: 'Szisztolés', width: 11 }, { header: 'Diasztolés', width: 11 }, { header: 'Pulzus', width: 8 },
];
export const EXPORT_HEADERS = BP_COLUMNS.map((c) => c.header);

export function buildExport(ms: Measurement[], format: ExportFormat): Uint8Array {
  // legfrissebb elöl
  return buildTable('Vérnyomás', BP_COLUMNS, sortByTime(ms).reverse().map((m) => [m.takenAt, m.sys, m.dia, m.pulse]), format);
}

/** Mintasorok a letölthető sablonhoz – megmutatják, milyen formában várja az import az adatokat. */
export const SAMPLE_MEASUREMENTS: Measurement[] = [
  { id: 's1', takenAt: '2026-01-05T07:00', sys: 128, dia: 82, pulse: 62 },
  { id: 's2', takenAt: '2026-01-05T07:01', sys: 125, dia: 80, pulse: 60 },
  { id: 's3', takenAt: '2026-01-05T07:02', sys: 124, dia: 79, pulse: 61 },
  { id: 's4', takenAt: '2026-01-05T21:00', sys: 131, dia: 84, pulse: 66 },
  { id: 's5', takenAt: '2026-01-05T21:01', sys: 127, dia: 81, pulse: 65 },
  { id: 's6', takenAt: '2026-01-05T21:02', sys: 126, dia: 80, pulse: 64 },
];

const isSys = (h: string) => h.includes('szisztol') || h.includes('systol') || h === 'sys' || h.startsWith('sys ');
const isDia = (h: string) => h.includes('diasztol') || h.includes('diastol') || h === 'dia' || h.startsWith('dia ');
const isPulse = (h: string) => h.includes('pulzus') || h.includes('pulse') || h === 'pul' || h === 'hr' || h.includes('heart');

export function isPlausible(sys: number, dia: number, pulse: number | null): boolean {
  return (
    sys >= 50 && sys <= 300 &&
    dia >= 30 && dia <= 200 &&
    sys > dia &&
    (pulse == null || (pulse >= 25 && pulse <= 250))
  );
}

/** Egy táblázatlap sorait értelmezi. Exportált és a régi (havi lapos) Excel formátumot is kezeli. */
export function rowsToMeasurements(rows: unknown[][]): { ms: Measurement[]; invalid: number; noTime: boolean } {
  const ms: Measurement[] = [];
  let invalid = 0;

  const headerIdx = findHeaderRow(rows, isSys);
  let sysCol = -1, diaCol = -1, pulseCol = -1, timeCol = -1;
  if (headerIdx >= 0) {
    const h = rows[headerIdx].map(norm);
    sysCol = h.findIndex(isSys);
    diaCol = h.findIndex(isDia);
    pulseCol = h.findIndex(isPulse);
    timeCol = h.findIndex(isTimeHeader);
  } else {
    // Fejléc nélkül: [Időpont, SYS, DIA, Pulzus] vagy [SYS, DIA, Pulzus]
    const first = rows.find((r) => r && r.length);
    const startsWithDate = first ? parseDateValue(first[0]) != null && toNumber(first[1]) != null : false;
    [timeCol, sysCol, diaCol, pulseCol] = startsWithDate ? [0, 1, 2, 3] : [-1, 0, 1, 2];
  }
  if (sysCol < 0 || diaCol < 0) return { ms, invalid: 0, noTime: false };

  const data = rows.slice(headerIdx + 1);
  // pl. a márciusi lapon a fejléc helyén is dátum áll
  if (timeCol < 0) timeCol = guessTimeColumn(data, [sysCol, diaCol, pulseCol]);

  const fallbackStart = parseLocalIso(nowLocalIso());
  let fallbackIdx = 0;

  for (const r of data) {
    if (!r) continue;
    const sysRaw = r[sysCol], diaRaw = r[diaCol];
    if ((sysRaw == null || sysRaw === '') && (diaRaw == null || diaRaw === '')) continue; // üres sor

    const sys = toNumber(sysRaw);
    const dia = toNumber(diaRaw);
    const pulse = pulseCol >= 0 ? toNumber(r[pulseCol]) : null;
    const takenAt = timeCol >= 0
      ? parseDateValue(r[timeCol])
      : toLocalIso(new Date(fallbackStart.getTime() + fallbackIdx++ * 60000));
    if (sys == null || dia == null || !takenAt || !isPlausible(sys, dia, pulse)) {
      invalid++;
      continue;
    }
    ms.push({ id: newId(), takenAt, sys: Math.round(sys), dia: Math.round(dia), pulse: pulse == null ? null : Math.round(pulse) });
  }
  return { ms, invalid, noTime: timeCol < 0 && ms.length > 0 };
}

export function parseImport(buf: ArrayBuffer, fileName: string): ImportResult<Measurement> {
  const warnings: string[] = [];
  const items: Measurement[] = [];
  let invalidRows = 0, sheets = 0, noTime = false;
  for (const rows of readSheets(buf, fileName)) {
    const r = rowsToMeasurements(rows);
    if (r.ms.length || r.invalid) sheets++;
    items.push(...r.ms);
    invalidRows += r.invalid;
    noTime ||= r.noTime;
  }
  if (noTime) warnings.push('A fájlban nem volt időpont oszlop – a mérések a mostani időponttal, percenként kerültek rögzítésre.');
  if (!items.length && !invalidRows) warnings.push('Nem találtam szisztolés/diasztolés oszlopot a fájlban.');
  return { items: sortByTime(items), invalidRows, sheets, warnings };
}

export const dedupeKey = (m: Measurement) => `${m.takenAt}|${m.sys}|${m.dia}|${m.pulse ?? ''}`;

/** Összefésülés: a már meglévő (azonos időpont + értékek) méréseket kihagyja. */
export const mergeMeasurements = (existing: Measurement[], incoming: Measurement[]) =>
  mergeByKey(existing, incoming, dedupeKey, sortByTime);

export const bpAdapter: DataAdapter<Measurement> = {
  noun: 'mérés',
  dateLabel: (m) => formatHu(m.takenAt),
  filePrefix: 'vernyomas',
  columnsText: 'Időpont, Szisztolés, Diasztolés, Pulzus',
  sampleHint: 'Az időpont formátuma: 2026.01.05. 07:00. A pulzus elhagyható.',
  sample: SAMPLE_MEASUREMENTS,
  build: buildExport,
  parse: parseImport,
  merge: mergeMeasurements,
};
