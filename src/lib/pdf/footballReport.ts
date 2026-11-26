import {
  matchResult, QUALITY_LABEL, RESULT_LABEL, RESULT_SHORT, SEVERITY_LABEL, sortFootball, summarizeMatches, summarizeTrainings,
  type FootballEntry, type MatchEntry, type TrainingEntry,
} from '../football';
import { fmt } from '../stats';
import { COLORS, Report, today, type FontData } from './report';
import type { PdfOptions } from './options';

const d = (s: string) => `${s.replaceAll('-', '.')}.`;

/** Foci PDF: összesítő (mérkőzés + edzés), pontszám-grafikon, mérkőzések és edzések táblázata. */
export function buildFootballPdf(entries: FootballEntry[], opts: PdfOptions, periodLabel: string, fonts: FontData): Uint8Array {
  const all = sortFootball(entries);
  const matches = all.filter((e): e is MatchEntry => e.type === 'match');
  const trainings = all.filter((e): e is TrainingEntry => e.type === 'training');
  const rep = new Report(fonts, `Balance · Foci napló · készült: ${today()}`);
  const range = all.length ? `${d(all[0].date)} – ${d(all.at(-1)!.date)}` : 'nincs adat';
  rep.header('Foci napló', `${periodLabel} · ${range} · ${matches.length} mérkőzés, ${trainings.length} edzés`);

  if (!all.length) {
    rep.note('A kiválasztott időszakban nincs bejegyzés.');
    return rep.finish();
  }

  if (opts.summary) {
    const ms = summarizeMatches(all);
    const ts = summarizeTrainings(all);
    if (ms.count) {
      rep.heading('Mérkőzések');
      rep.kpis([
        { label: 'Gól / gólpassz', value: `${ms.goals} / ${ms.assists}`, sub: `G+A 90 percenként: ${fmt(ms.gaPer90, 2)}` },
        { label: 'Játszott percek', value: String(ms.minutes), sub: `${ms.count} mérkőzés` },
        { label: 'Mérleg (GY-D-V)', value: `${ms.wins}-${ms.draws}-${ms.losses}` },
        { label: 'Átlag pontszám', value: fmt(ms.avgRating, 1), sub: `Sérülés: ${ms.injuries}` },
      ]);
      if (ms.positions.length) rep.note(`Pozíciók: ${ms.positions.map((p) => `${p.position} (${p.count})`).join(', ')}`);
      rep.distribution([
        { label: RESULT_LABEL.W, count: ms.wins, color: COLORS.ideal },
        { label: RESULT_LABEL.D, count: ms.draws, color: COLORS.ok },
        { label: RESULT_LABEL.L, count: ms.losses, color: COLORS.high },
      ]);
      rep.y += 2;
    }
    if (ts.count) {
      rep.heading('Edzések');
      rep.kpis([
        { label: 'Edzések', value: String(ts.count) },
        { label: 'Átlag pontszám', value: fmt(ts.avgRating, 1) },
        { label: 'Lövésből gól', value: `${ts.shotGoals}/${ts.shots}`, sub: `${ts.shootingSessions} edzésen` },
        { label: 'Hatékonyság', value: ts.conversion == null ? '–' : `${fmt(ts.conversion)}%` },
      ]);
      rep.distribution([
        { label: 'Jó', count: ts.quality.good, color: COLORS.ideal },
        { label: 'Közepes', count: ts.quality.ok, color: COLORS.ok },
        { label: 'Rossz', count: ts.quality.bad, color: COLORS.high },
      ]);
      rep.y += 2;
    }
  }

  if (opts.chart && all.length > 1) {
    rep.chart({
      title: 'Pontszámok alakulása',
      labels: all.map((e) => `${e.date.slice(5).replace('-', '.')}.`),
      series: [
        { label: 'Mérkőzés', values: all.map((e) => (e.type === 'match' ? e.rating : null)), color: COLORS.accent, kind: 'line' },
        { label: 'Edzés', values: all.map((e) => (e.type === 'training' ? e.rating : null)), color: COLORS.dia, kind: 'line', dashed: true },
      ],
      yMin: 0, yMax: 10, yStep: 2,
      height: 64,
    });
  }

  if (opts.table) {
    if (matches.length) {
      rep.y += 2;
      rep.heading('Mérkőzések részletesen');
      rep.table({
        head: [['Dátum', 'Ellenfél', 'Eredmény', 'Perc', 'Pozíció', 'G', 'GP', 'Pont', 'Sérülés', 'Értékelés / megjegyzés']],
        body: matches.map((m) => {
          const r = matchResult(m);
          return [
            d(m.date), m.opponent || '–', r ? `${m.scoreFor}–${m.scoreAgainst} ${RESULT_SHORT[r]}` : '–', m.minutes ?? '–',
            m.position || '–', m.goals, m.assists, m.rating,
            m.injury ? `${m.injury.location} (${SEVERITY_LABEL[m.injury.severity].toLowerCase()})` : '–',
            [m.evaluation, m.note].filter(Boolean).join(' · ') || '–',
          ];
        }),
        styles: { fontSize: 7.5 },
        headStyles: { fontSize: 7.5 },
        columnStyles: {
          0: { cellWidth: 19 }, 2: { cellWidth: 19 }, 3: { halign: 'right', cellWidth: 10.5 }, 5: { halign: 'right', cellWidth: 7 },
          6: { halign: 'right', cellWidth: 9 }, 7: { halign: 'right', cellWidth: 10.5 }, 9: { cellWidth: 44 },
        },
        didParseCell: (data) => {
          if (data.section !== 'body') return;
          const m = matches[data.row.index];
          if (data.column.index === 2) {
            const r = matchResult(m);
            if (r) data.cell.styles.textColor = r === 'W' ? COLORS.ideal : r === 'D' ? COLORS.ok : COLORS.high;
          }
          if (data.column.index === 8 && m.injury) data.cell.styles.textColor = COLORS.high;
        },
      });
    }
    if (trainings.length) {
      rep.y += 2;
      rep.heading('Edzések részletesen');
      rep.table({
        head: [['Dátum', 'Pont', 'Minőség', 'Lövés', 'Gól', 'Hatékonyság', 'Megjegyzés']],
        body: trainings.map((t) => [
          d(t.date), t.rating, t.quality ? QUALITY_LABEL[t.quality] : '–', t.shots ?? '–', t.shots != null ? (t.shotGoals ?? 0) : '–',
          t.shots ? `${Math.round(((t.shotGoals ?? 0) / t.shots) * 100)}%` : '–', t.note || '–',
        ]),
        columnStyles: { 0: { cellWidth: 20 }, 1: { halign: 'right', cellWidth: 12 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { cellWidth: 70 } },
        didParseCell: (data) => {
          if (data.section !== 'body' || data.column.index !== 2) return;
          const q = trainings[data.row.index].quality;
          if (q) data.cell.styles.textColor = q === 'good' ? COLORS.ideal : q === 'ok' ? COLORS.ok : COLORS.high;
        },
      });
    }
  }

  return rep.finish();
}
