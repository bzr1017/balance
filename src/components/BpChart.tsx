import { useMemo, useState } from 'react';
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Measurement, Settings } from '../lib/types';
import { dailyAverages, sortByTime } from '../lib/stats';
import { formatShort } from '../lib/dates';

interface Props {
  measurements: Measurement[];
  settings: Settings;
}

type Mode = 'each' | 'daily';

/**
 * Az Excel grafikonjának megfelelője: oszlop a szisztolés és diasztolés értékekre,
 * szaggatott célvonal a "Cél SYS" és "Cél DIA" értékeknél, opcionálisan a pulzus vonala.
 */
export function BpChart({ measurements, settings }: Props) {
  const [mode, setMode] = useState<Mode>(measurements.length > 60 ? 'daily' : 'each');
  const [showPulse, setShowPulse] = useState(false);

  const data = useMemo(() => {
    if (mode === 'daily') {
      return dailyAverages(measurements).map((d) => ({
        label: d.day.slice(5).replace('-', '.') + '.',
        sys: d.sys, dia: d.dia, pulse: d.pulse, n: d.n,
      }));
    }
    return sortByTime(measurements).map((m) => ({ label: formatShort(m.takenAt), sys: m.sys, dia: m.dia, pulse: m.pulse, n: 1 }));
  }, [measurements, mode]);

  if (!measurements.length) return null;

  const minWidth = Math.max(320, data.length * (mode === 'daily' ? 22 : 16));

  return (
    <section className="card">
      <div className="card-head">
        <h2>Grafikon</h2>
        <div className="chart-controls">
          <div className="segmented" role="group" aria-label="Megjelenítés">
            <button className={mode === 'each' ? 'active' : ''} onClick={() => setMode('each')}>Mérések</button>
            <button className={mode === 'daily' ? 'active' : ''} onClick={() => setMode('daily')}>Napi átlag</button>
          </div>
          <label className="check">
            <input type="checkbox" checked={showPulse} onChange={(e) => setShowPulse(e.target.checked)} /> Pulzus
          </label>
        </div>
      </div>

      <div className="chart-scroll">
        <div style={{ minWidth, height: 340 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 4 }} barCategoryGap="18%">
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false}
                axisLine={{ stroke: 'var(--grid)' }} interval="preserveStartEnd" minTickGap={18} />
              <YAxis domain={[40, (max: number) => Math.max(160, Math.ceil(max / 10) * 10)]}
                tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={{ fill: 'var(--hover)' }}
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 13 }}
                labelStyle={{ color: 'var(--ink)', fontWeight: 600 }}
                formatter={(v, name) => [v ?? '–', name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
              <Bar dataKey="sys" name="Szisztolés" fill="var(--sys)" radius={[3, 3, 0, 0]} maxBarSize={18} />
              <Bar dataKey="dia" name="Diasztolés" fill="var(--dia)" radius={[3, 3, 0, 0]} maxBarSize={18} />
              {showPulse && (
                <Line dataKey="pulse" name="Pulzus" stroke="var(--pulse)" strokeWidth={2} dot={{ r: 2 }} connectNulls />
              )}
              <ReferenceLine y={settings.targetSys} stroke="var(--sys)" strokeDasharray="5 4" strokeWidth={1.5}
                label={{ value: `Cél SYS ${settings.targetSys}`, position: 'insideTopRight', fontSize: 11, fill: 'var(--sys)' }} />
              <ReferenceLine y={settings.targetDia} stroke="var(--dia)" strokeDasharray="5 4" strokeWidth={1.5}
                label={{ value: `Cél DIA ${settings.targetDia}`, position: 'insideTopRight', fontSize: 11, fill: 'var(--dia)' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
