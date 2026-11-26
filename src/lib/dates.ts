const pad = (n: number) => String(n).padStart(2, '0');

const HU_MONTHS = [
  'január', 'február', 'március', 'április', 'május', 'június',
  'július', 'augusztus', 'szeptember', 'október', 'november', 'december',
];

function build(y: number, mo: number, d: number, h = 0, mi = 0): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const check = new Date(y, mo - 1, d);
  if (check.getMonth() !== mo - 1) return null;
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}`;
}

export function toLocalIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const nowLocalIso = () => toLocalIso(new Date());

export function parseLocalIso(iso: string): Date {
  const [date, time = '00:00'] = iso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
}

/** "2026-01-06T21:06" → "2026.01.06. 21:06" (a csatolt Excel formátuma) */
export function formatHu(iso: string): string {
  const [date, time] = iso.split('T');
  return `${date.replaceAll('-', '.')}. ${time}`;
}

export const formatShort = (iso: string) => {
  const [date, time] = iso.split('T');
  const [, m, d] = date.split('-');
  return `${m}.${d}. ${time}`;
};

export const monthKey = (iso: string) => iso.slice(0, 7);

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${y}. ${HU_MONTHS[m - 1]}`;
}

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Excel dátum-sorszám → helyi ISO (időzóna-független számítás). */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const totalMinutes = Math.round(serial * 1440);
  const days = Math.floor(totalMinutes / 1440);
  const minutes = totalMinutes - days * 1440;
  const d = new Date(EXCEL_EPOCH + days * 86400000);
  return build(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), Math.floor(minutes / 60), minutes % 60);
}

export function isoToExcelSerial(iso: string): number {
  const [date, time = '00:00'] = iso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return (Date.UTC(y, m - 1, d, h, mi) - EXCEL_EPOCH) / 86400000;
}

/**
 * Bármilyen cellaértékből dátumot próbál olvasni:
 * Excel sorszám, Date objektum, "2026.01.08. 21:10", "2026.04.25.  9:07",
 * "2026-01-08 21:10", "2026-01-08T21:10", "08.01.2026 21:10".
 */
export function parseDateValue(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : toLocalIso(v);
  if (typeof v === 'number') return excelSerialToIso(v);
  const s = String(v).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\.?(?:\s*[T ]\s*(\d{1,2})[:.](\d{2})(?::\d{2}(?:\.\d+)?)?)?\s*(?:Z|[+-]\d{2}:?\d{2})?$/);
  if (m) return build(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);

  m = s.match(/^(\d{1,2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{4})\.?(?:\s+(\d{1,2})[:.](\d{2})(?::\d{2})?)?$/);
  if (m) return build(+m[3], +m[2], +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);

  if (/^\d+([.,]\d+)?$/.test(s)) return excelSerialToIso(Number(s.replace(',', '.')));
  return null;
}
