import type { Measurement, Settings } from '../lib/types';
import { fmt, summarize } from '../lib/stats';
import { CATEGORY_LABEL } from './CategoryBadge';

interface Props {
  title: string;
  measurements: Measurement[];
  settings: Settings;
}

export function StatsPanel({ title, measurements, settings }: Props) {
  const s = summarize(measurements, settings);
  const r = (v: number | null) => (v == null ? '–' : String(Math.round(v)));

  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="muted">
          Céltartomány: &lt; {settings.limitSys}/{settings.limitDia} (ideálisan &lt; {settings.targetSys}/{settings.targetDia})
        </span>
      </div>

      {s.count === 0 ? (
        <p className="muted">Nincs adat a kiválasztott időszakban.</p>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi hero">
              <span className="kpi-label">Átlag</span>
              <span className="kpi-value">
                <span className="v-sys">{r(s.sys.avg)}</span>/<span className="v-dia">{r(s.dia.avg)}</span>
              </span>
              <span className="kpi-sub">Pulzus: {r(s.pulse.avg)} · {s.count} mérés</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Szórás</span>
              <span className="kpi-line">SYS <b>{fmt(s.sys.sd, 2)}</b></span>
              <span className="kpi-line">DIA <b>{fmt(s.dia.sd, 1)}</b></span>
              <span className="kpi-line">Pulzus <b>{fmt(s.pulse.sd, 1)}</b></span>
            </div>
            <div className="kpi">
              <span className="kpi-label">Min – max</span>
              <span className="kpi-line">SYS <b>{fmt(s.sys.min)}–{fmt(s.sys.max)}</b></span>
              <span className="kpi-line">DIA <b>{fmt(s.dia.min)}–{fmt(s.dia.max)}</b></span>
              <span className="kpi-line">Pulzus <b>{fmt(s.pulse.min)}–{fmt(s.pulse.max)}</b></span>
            </div>
          </div>

          <div className="dist" aria-label="Mérések megoszlása">
            <div className="dist-bar">
              {(['ideal', 'ok', 'high'] as const).map((c) =>
                s.counts[c] ? <span key={c} className={`cat-${c}`} style={{ flexGrow: s.counts[c] }} /> : null,
              )}
            </div>
            <div className="dist-legend">
              {(['ideal', 'ok', 'high'] as const).map((c) => (
                <span key={c}>
                  <i className={`dot cat-${c}`} /> {CATEGORY_LABEL[c]}{' '}
                  <b>{Math.round((s.counts[c] / s.count) * 100)}%</b> <span className="muted">({s.counts[c]})</span>
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
