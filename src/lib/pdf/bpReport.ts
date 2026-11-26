import type { Measurement, Settings } from '../types';
import { classify, dailyAverages, fmt, sortByTime, summarize, type Category } from '../stats';
import { formatHu, monthKey, monthLabel } from '../dates';
import { COLORS, niceRange, Report, today, type FontData } from './report';
import type { PdfOptions } from './options';

const CAT_LABEL: Record<Category, string> = { ideal: 'Ideális', ok: 'Célon belül', high: 'Cél felett' };
const CAT_COLOR = { ideal: COLORS.ideal, ok: COLORS.ok, high: COLORS.high };
const r0 = (v: number | null) => (v == null ? '–' : String(Math.round(v)));

/** Vérnyomás PDF: összesítő (+ havi bontás), grafikon, mérések táblázata – mindegyik ki/bekapcsolható. */
export function buildBpPdf(measurements: Measurement[], settings: Settings, opts: PdfOptions, periodLabel: string, fonts: FontData): Uint8Array {
  const ms = sortByTime(measurements);
  const rep = new Report(fonts, `Balance · Vérnyomásnapló · készült: ${today()}`);
  const range = ms.length ? `${formatHu(ms[0].takenAt).slice(0, 11)} – ${formatHu(ms.at(-1)!.takenAt).slice(0, 11)}` : 'nincs adat';
  rep.header('Vérnyomásnapló', `${periodLabel} · ${range} · ${ms.length} mérés`);

  if (!ms.length) {
    rep.note('A kiválasztott időszakban nincs mérés.');
    return rep.finish();
  }

  const s = summarize(ms, settings);

  if (opts.summary) {
    rep.heading('Összesítő');
    rep.kpis([
      { label: 'Átlag', value: `${r0(s.sys.avg)}/${r0(s.dia.avg)}`, sub: 'Hgmm (SYS/DIA)' },
      { label: 'Pulzus átlag', value: r0(s.pulse.avg), sub: '/perc' },
      { label: 'Szórás', value: `${fmt(s.sys.sd, 1)} / ${fmt(s.dia.sd, 1)}`, sub: `SYS / DIA · pulzus ${fmt(s.pulse.sd, 1)}` },
      { label: 'Min – max', value: `${fmt(s.sys.min)}–${fmt(s.sys.max)}`, sub: `SYS · DIA ${fmt(s.dia.min)}–${fmt(s.dia.max)}` },
    ]);
    rep.note(`Céltartomány: < ${settings.limitSys}/${settings.limitDia} Hgmm (ideálisan < ${settings.targetSys}/${settings.targetDia}). A szórás populációs szórás (Excel: STDEV.P), ugyanúgy, mint a táblázatban.`);
    rep.distribution((['ideal', 'ok', 'high'] as const).map((c) => ({ label: CAT_LABEL[c], count: s.counts[c], color: CAT_COLOR[c] })));

    const months = [...new Set(ms.map((m) => monthKey(m.takenAt)))].sort().reverse(); // legfrissebb hónap elöl
    if (months.length > 1) {
      rep.y += 2;
      rep.heading('Havi bontás');
      rep.table({
        head: [['Hónap', 'Mérés', 'Átlag', 'Pulzus', 'Szórás SYS', 'Szórás DIA', 'SYS min–max', 'Cél felett']],
        body: months.map((mk) => {
          const g = summarize(ms.filter((m) => monthKey(m.takenAt) === mk), settings);
          return [
            monthLabel(mk), g.count, `${r0(g.sys.avg)}/${r0(g.dia.avg)}`, r0(g.pulse.avg),
            fmt(g.sys.sd, 2), fmt(g.dia.sd, 1), `${g.sys.min}–${g.sys.max}`, `${Math.round((g.counts.high / g.count) * 100)}%`,
          ];
        }),
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
      });
    }
  }

  if (opts.chart) {
    const daily = ms.length > 62;
    const pts = daily
      ? dailyAverages(ms).map((d) => ({ label: `${d.day.slice(5).replace('-', '.')}.`, sys: d.sys, dia: d.dia, pulse: d.pulse }))
      : ms.map((m) => ({ label: `${m.takenAt.slice(5, 10).replace('-', '.')}.`, sys: m.sys, dia: m.dia, pulse: m.pulse }));
    const all = pts.flatMap((p) => [p.sys, p.dia, ...(p.pulse != null ? [p.pulse] : [])]);
    const [lo, hi] = niceRange(all, 5, 20, 40, settings.limitSys + 10);
    rep.y += 2;
    rep.chart({
      title: daily ? 'Napi átlagok' : 'Mérések',
      labels: pts.map((p) => p.label),
      series: [
        { label: 'Szisztolés', values: pts.map((p) => p.sys), color: COLORS.sys, kind: 'bar' },
        { label: 'Diasztolés', values: pts.map((p) => p.dia), color: COLORS.dia, kind: 'bar' },
        { label: 'Pulzus', values: pts.map((p) => p.pulse), color: COLORS.pulse, kind: 'line', dashed: true },
      ],
      yMin: lo, yMax: hi, yStep: 20,
      refLines: [
        { y: settings.targetSys, color: COLORS.sys, label: `Cél SYS ${settings.targetSys}` },
        { y: settings.targetDia, color: COLORS.dia, label: `Cél DIA ${settings.targetDia}` },
      ],
      height: 78,
    });
  }

  if (opts.table) {
    rep.y += 2;
    rep.heading('Mérések');
    const rows = [...ms].reverse(); // legfrissebb elöl
    const cats = rows.map((m) => classify(m, settings));
    rep.table({
      head: [['Dátum', 'Idő', 'Szisztolés', 'Diasztolés', 'Pulzus', 'Besorolás']],
      body: rows.map((m, i) => [
        formatHu(m.takenAt).slice(0, 11), m.takenAt.slice(11, 16), m.sys, m.dia, m.pulse ?? '–', CAT_LABEL[cats[i]],
      ]),
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const c = cats[data.row.index];
        if (data.column.index === 5) data.cell.styles.textColor = CAT_COLOR[c];
        if (data.column.index === 2 && rows[data.row.index].sys >= settings.limitSys) data.cell.styles.textColor = COLORS.high;
        if (data.column.index === 3 && rows[data.row.index].dia >= settings.limitDia) data.cell.styles.textColor = COLORS.high;
      },
    });
  }

  return rep.finish();
}
