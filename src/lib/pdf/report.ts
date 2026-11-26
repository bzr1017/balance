import { jsPDF } from 'jspdf';
import { autoTable, type UserOptions } from 'jspdf-autotable';

/*
 * Közös PDF-riport motor (A4, álló). A modul (vérnyomás, foci) ebből építi fel a saját riportját.
 * A jsPDF beépített betűtípusai nem tartalmazzák az ő/ű betűket, ezért egy beágyazott
 * DejaVu Sans részhalmazt használunk (public/fonts).
 */

export { DEFAULT_PDF_OPTIONS, type PdfOptions } from './options';

/** base64 kódolt TTF-ek */
export interface FontData {
  regular: string;
  bold: string;
}

type RGB = [number, number, number];

export const COLORS = {
  ink: [21, 36, 28] as RGB,
  muted: [95, 111, 102] as RGB,
  line: [223, 232, 226] as RGB,
  soft: [244, 248, 245] as RGB,
  accent: [30, 138, 90] as RGB,
  sys: [196, 60, 79] as RGB,
  dia: [47, 106, 163] as RGB,
  pulse: [154, 116, 23] as RGB,
  ideal: [30, 138, 90] as RGB,
  ok: [192, 138, 12] as RGB,
  high: [201, 57, 43] as RGB,
};

const FONT = 'DejaVu';

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

let fontCache: Promise<FontData> | null = null;

/** A betűtípusok letöltése (egyszer; a service worker offline is kiszolgálja). */
export function fetchFonts(base = import.meta.env?.BASE_URL ?? './'): Promise<FontData> {
  fontCache ??= Promise.all(
    ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf'].map(async (f) => {
      const res = await fetch(`${base}fonts/${f}`);
      if (!res.ok) throw new Error(`A betűtípus nem tölthető be (${f}).`);
      return bufToBase64(await res.arrayBuffer());
    }),
  ).then(([regular, bold]) => ({ regular, bold }))
    .catch((e) => { fontCache = null; throw e; });
  return fontCache;
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}.`;
};

export interface Kpi {
  label: string;
  value: string;
  sub?: string;
  color?: RGB;
}

export interface ChartSeries {
  label: string;
  values: (number | null)[];
  color: RGB;
  kind: 'bar' | 'line';
  dashed?: boolean;
}

export interface ChartSpec {
  title: string;
  labels: string[];
  series: ChartSeries[];
  yMin: number;
  yMax: number;
  yStep: number;
  refLines?: { y: number; color: RGB; label: string }[];
  height?: number;
}

export class Report {
  readonly doc: jsPDF;
  readonly pageW = 210;
  readonly pageH = 297;
  readonly m = 14;
  y = 14;
  private footerText: string;

  constructor(fonts: FontData, footerText: string) {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    this.doc.addFileToVFS('DejaVuSans.ttf', fonts.regular);
    this.doc.addFont('DejaVuSans.ttf', FONT, 'normal');
    this.doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
    this.doc.addFont('DejaVuSans-Bold.ttf', FONT, 'bold');
    this.doc.setFont(FONT, 'normal');
    this.footerText = footerText;
  }

  get contentW() { return this.pageW - 2 * this.m; }

  /** Új oldal, ha nem fér el `h` mm. */
  ensure(h: number) {
    if (this.y + h > this.pageH - 16) {
      this.doc.addPage();
      this.y = this.m;
    }
  }

  private text(s: string, x: number, y: number, size: number, opts: { bold?: boolean; color?: RGB; align?: 'left' | 'right' | 'center' } = {}) {
    this.doc.setFont(FONT, opts.bold ? 'bold' : 'normal');
    this.doc.setFontSize(size);
    this.doc.setTextColor(...(opts.color ?? COLORS.ink));
    this.doc.text(s, x, y, { align: opts.align ?? 'left', baseline: 'alphabetic' });
  }

  /** Fejléc: logó-négyzet, cím, alcím. */
  header(title: string, subtitle: string) {
    const d = this.doc;
    d.setFillColor(...COLORS.accent);
    d.roundedRect(this.m, this.y, 11, 11, 2.2, 2.2, 'F');
    // mérleg ikon
    d.setDrawColor(255, 255, 255);
    d.setLineWidth(0.6);
    const cx = this.m + 5.5, top = this.y + 2.6;
    d.line(cx, top, cx, top + 5.6);
    d.line(cx - 2, top + 6, cx + 2, top + 6);
    d.line(cx - 3.6, top + 1.3, cx + 3.6, top + 1.3);
    d.setFillColor(255, 255, 255);
    d.triangle(cx - 3.6, top + 1.3, cx - 4.8, top + 3.8, cx - 2.4, top + 3.8, 'F');
    d.triangle(cx + 3.6, top + 1.3, cx + 2.4, top + 3.8, cx + 4.8, top + 3.8, 'F');

    this.text(title, this.m + 15, this.y + 5.2, 17, { bold: true });
    this.text(subtitle, this.m + 15, this.y + 10.2, 9.5, { color: COLORS.muted });
    this.y += 17;
    d.setDrawColor(...COLORS.line);
    d.setLineWidth(0.3);
    d.line(this.m, this.y, this.pageW - this.m, this.y);
    this.y += 6;
  }

  heading(s: string) {
    this.ensure(14);
    this.text(s, this.m, this.y + 4, 12.5, { bold: true });
    this.y += 8;
  }

  note(s: string, color: RGB = COLORS.muted) {
    this.doc.setFont(FONT, 'normal');
    this.doc.setFontSize(9);
    const lines = this.doc.splitTextToSize(s, this.contentW) as string[];
    this.ensure(lines.length * 4.2 + 2);
    this.doc.setTextColor(...color);
    this.doc.text(lines, this.m, this.y + 3);
    this.y += lines.length * 4.2 + 2;
  }

  /** Összesítő dobozok egy sorban (2–4 db). */
  kpis(items: Kpi[]) {
    const gap = 3;
    const w = (this.contentW - gap * (items.length - 1)) / items.length;
    const h = items.some((i) => i.sub) ? 21 : 16;
    this.ensure(h + 4);
    items.forEach((k, i) => {
      const x = this.m + i * (w + gap);
      this.doc.setFillColor(...COLORS.soft);
      this.doc.setDrawColor(...COLORS.line);
      this.doc.setLineWidth(0.2);
      this.doc.roundedRect(x, this.y, w, h, 2, 2, 'FD');
      this.text(k.label.toUpperCase(), x + 3.5, this.y + 5.2, 7, { bold: true, color: COLORS.muted });
      this.text(k.value, x + 3.5, this.y + 12.4, 14, { bold: true, color: k.color ?? COLORS.ink });
      if (k.sub) this.text(k.sub, x + 3.5, this.y + 17.6, 7.5, { color: COLORS.muted });
    });
    this.y += h + 4;
  }

  /** Színes megoszlás sáv jelmagyarázattal. */
  distribution(parts: { label: string; count: number; color: RGB }[]) {
    const total = parts.reduce((a, p) => a + p.count, 0);
    if (!total) return;
    this.ensure(14);
    let x = this.m;
    for (const p of parts) {
      if (!p.count) continue;
      const w = (p.count / total) * this.contentW;
      this.doc.setFillColor(...p.color);
      this.doc.rect(x, this.y, w, 3, 'F');
      x += w;
    }
    this.y += 7.5;
    let lx = this.m;
    for (const p of parts) {
      this.doc.setFillColor(...p.color);
      this.doc.circle(lx + 1.2, this.y - 1.1, 1.1, 'F');
      const s = `${p.label}: ${Math.round((p.count / total) * 100)}% (${p.count})`;
      this.text(s, lx + 3.5, this.y, 8.5);
      lx += this.doc.getTextWidth(s) + 10;
    }
    this.y += 5;
  }

  /** Vektoros grafikon: csoportosított oszlopok + vonalak + szaggatott referencia vonalak. */
  chart(spec: ChartSpec) {
    const d = this.doc;
    const height = spec.height ?? 70;
    this.ensure(height + 16);
    this.text(spec.title, this.m, this.y + 4, 10.5, { bold: true });
    this.y += 7;

    const left = this.m + 9, right = this.pageW - this.m, top = this.y + 2, bottom = this.y + height - 8;
    const w = right - left, h = bottom - top;
    const yOf = (v: number) => bottom - ((v - spec.yMin) / (spec.yMax - spec.yMin)) * h;

    // rács + y tengely feliratok
    d.setLineWidth(0.15);
    for (let v = spec.yMin; v <= spec.yMax + 1e-9; v += spec.yStep) {
      d.setDrawColor(...COLORS.line);
      d.line(left, yOf(v), right, yOf(v));
      this.text(String(v), left - 1.5, yOf(v) + 1, 6.5, { color: COLORS.muted, align: 'right' });
    }

    const n = spec.labels.length;
    const slot = w / Math.max(1, n);
    const bars = spec.series.filter((s) => s.kind === 'bar');
    const barW = Math.min(4, (slot * 0.8) / Math.max(1, bars.length));
    const cx = (i: number) => left + slot * (i + 0.5);

    bars.forEach((s, bi) => {
      d.setFillColor(...s.color);
      s.values.forEach((v, i) => {
        if (v == null) return;
        const x = cx(i) - (barW * bars.length) / 2 + bi * barW;
        const yv = yOf(Math.max(spec.yMin, Math.min(spec.yMax, v)));
        d.rect(x, yv, barW * 0.92, bottom - yv, 'F');
      });
    });

    for (const s of spec.series.filter((x) => x.kind === 'line')) {
      d.setDrawColor(...s.color);
      d.setFillColor(...s.color);
      d.setLineWidth(0.5);
      d.setLineDashPattern(s.dashed ? [1.2, 1] : [], 0);
      let prev: [number, number] | null = null;
      s.values.forEach((v, i) => {
        if (v == null) return;
        const p: [number, number] = [cx(i), yOf(v)];
        if (prev) d.line(prev[0], prev[1], p[0], p[1]);
        prev = p;
      });
      d.setLineDashPattern([], 0);
      if (n <= 90) s.values.forEach((v, i) => v != null && d.circle(cx(i), yOf(v), 0.7, 'F'));
    }

    for (const r of spec.refLines ?? []) {
      d.setDrawColor(...r.color);
      d.setLineWidth(0.35);
      d.setLineDashPattern([1.6, 1.2], 0);
      d.line(left, yOf(r.y), right, yOf(r.y));
      d.setLineDashPattern([], 0);
      d.setFontSize(6.5);
      const lw = d.getTextWidth(r.label) + 2;
      d.setFillColor(255, 255, 255);
      d.roundedRect(right - lw - 0.5, yOf(r.y) - 3.6, lw + 0.5, 3.2, 0.8, 0.8, 'F');
      this.text(r.label, right - 1, yOf(r.y) - 1.1, 6.5, { color: r.color, align: 'right' });
    }

    // x tengely feliratok (legfeljebb ~12)
    const every = Math.max(1, Math.ceil(n / 12));
    spec.labels.forEach((l, i) => {
      const regular = i % every === 0 && n - 1 - i >= every * 0.7; // az utolsó előtti ne ütközzön az utolsóval
      if (regular || i === n - 1) this.text(l, cx(i), bottom + 4, 6.2, { color: COLORS.muted, align: 'center' });
    });

    // jelmagyarázat
    let lx = left;
    const ly = bottom + 9;
    for (const s of spec.series) {
      d.setFillColor(...s.color);
      d.setDrawColor(...s.color);
      if (s.kind === 'bar') d.rect(lx, ly - 2.2, 3, 2.4, 'F');
      else { d.setLineWidth(0.6); d.line(lx, ly - 1, lx + 3, ly - 1); }
      this.text(s.label, lx + 4.2, ly, 7.5);
      lx += this.doc.getTextWidth(s.label) + 10;
    }
    this.y = ly + 5;
  }

  table(opts: Omit<UserOptions, 'startY' | 'margin'>) {
    this.ensure(20);
    const { styles, headStyles, ...rest } = opts;
    autoTable(this.doc, {
      startY: this.y,
      margin: { left: this.m, right: this.m, bottom: 18 },
      theme: 'grid',
      rowPageBreak: 'avoid',
      alternateRowStyles: { fillColor: COLORS.soft },
      ...rest,
      // a betűtípust mindig megtartjuk (különben a beépített, ő/ű nélküli Helvetica jönne)
      styles: { fontSize: 8, cellPadding: 1.4, textColor: COLORS.ink, lineColor: COLORS.line, lineWidth: 0.15, overflow: 'linebreak', ...styles, font: FONT },
      headStyles: { fontStyle: 'bold', fillColor: COLORS.accent, textColor: [255, 255, 255], fontSize: 8, ...headStyles, font: FONT },
    });
    this.y = (this.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  }

  /** Lábléc minden oldalra, majd a PDF bájtjai. */
  finish(): Uint8Array {
    const pages = this.doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      this.doc.setPage(i);
      this.doc.setDrawColor(...COLORS.line);
      this.doc.setLineWidth(0.2);
      this.doc.line(this.m, this.pageH - 12, this.pageW - this.m, this.pageH - 12);
      this.text(this.footerText, this.m, this.pageH - 7.5, 7.5, { color: COLORS.muted });
      this.text(`${i} / ${pages}`, this.pageW - this.m, this.pageH - 7.5, 7.5, { color: COLORS.muted, align: 'right' });
    }
    return new Uint8Array(this.doc.output('arraybuffer'));
  }
}

export const niceRange = (values: number[], pad: number, step: number, floor?: number, ceil?: number): [number, number] => {
  const min = Math.min(...values), max = Math.max(...values);
  let lo = Math.floor((min - pad) / step) * step;
  let hi = Math.ceil((max + pad) / step) * step;
  if (floor != null) lo = Math.min(lo, floor);
  if (ceil != null) hi = Math.max(hi, ceil);
  return [lo, hi];
};
