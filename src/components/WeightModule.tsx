import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Period, Profile, WeightEntry } from '../lib/types';
import { availableMonths } from '../lib/stats';
import { formatShort, nowLocalIso } from '../lib/dates';
import { newId } from '../lib/table';
import {
  bmi, bmiCategory, changeOverDays, filterWeights, healthyWeightRange, isPlausibleWeight, roundKg, sortWeights,
  summarizeWeights, weightAdapter,
} from '../lib/weight';
import { ImportExport } from './ImportExport';
import { fmtKg, fmtSigned, ModuleBar, periodLabel, type SubTab } from './ui';

interface Props {
  weights: WeightEntry[];
  profile: Profile;
  onChange: (ws: WeightEntry[]) => void;
  onGoToProfile: () => void;
  initialTab?: SubTab;
}

export function WeightModule({ weights, profile, onChange, onGoToProfile, initialTab = 'log' }: Props) {
  const [tab, setTab] = useState<SubTab>(initialTab);
  const [period, setPeriod] = useState<Period>('all');
  const [editing, setEditing] = useState<WeightEntry | null>(null);

  const months = useMemo(() => availableMonths(weights), [weights]);
  const filtered = useMemo(() => filterWeights(weights, period), [weights, period]);
  useEffect(() => {
    if (period !== 'all' && period !== 'last30' && !months.includes(period)) setPeriod('all');
  }, [months, period]);

  const save = (w: WeightEntry) => {
    const exists = weights.some((x) => x.id === w.id);
    onChange(exists ? weights.map((x) => (x.id === w.id ? w : x)) : [...weights, w]);
    setEditing(null);
  };
  const remove = (id: string) => {
    onChange(weights.filter((w) => w.id !== id));
    if (editing?.id === id) setEditing(null);
  };
  const label = periodLabel(period);

  return (
    <>
      <ModuleBar title="Testsúly" tab={tab} onTab={setTab} period={period} onPeriod={setPeriod} months={months} />
      {tab === 'log' ? (
        <div className="grid-log">
          <WeightForm key={editing?.id ?? 'new'} editing={editing} profile={profile} onSave={save}
            onCancel={() => setEditing(null)} onGoToProfile={onGoToProfile} />
          <WeightList title={label} weights={filtered} onEdit={(w) => { setEditing(w); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            onDelete={remove} onGoToData={() => setTab('data')} />
        </div>
      ) : tab === 'stats' ? (
        <div className="stack">
          <WeightStats title={label} weights={filtered} all={weights} profile={profile} onGoToProfile={onGoToProfile} />
          <WeightChart weights={filtered} profile={profile} />
        </div>
      ) : (
        <div className="stack">
          <ImportExport adapter={weightAdapter} items={weights} filtered={filtered} periodLabel={label} onImport={onChange} />
          <ClearCard count={weights.length} onClear={() => onChange([])} />
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ rögzítés */

function WeightForm({ editing, profile, onSave, onCancel, onGoToProfile }: {
  editing: WeightEntry | null; profile: Profile; onSave: (w: WeightEntry) => void; onCancel: () => void; onGoToProfile: () => void;
}) {
  const [kg, setKg] = useState(editing ? String(editing.kg).replace('.', ',') : '');
  const [takenAt, setTakenAt] = useState(editing?.takenAt ?? nowLocalIso());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const value = Number(kg.replace(',', '.'));
  const b = kg && value > 0 ? bmi(value, profile.heightCm) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!kg || Number.isNaN(value)) return setError('Add meg a testsúlyt.');
    if (!isPlausibleWeight(value)) return setError('A testsúly 20 és 400 kg között lehet.');
    if (!takenAt) return setError('Add meg az időpontot.');
    onSave({ id: editing?.id ?? newId(), takenAt: takenAt.slice(0, 16), kg: roundKg(value) });
    setError(null);
    if (!editing) {
      setKg(''); setTakenAt(nowLocalIso()); setSaved(true);
      setTimeout(() => setSaved(false), 1600);
      ref.current?.focus();
    }
  };

  return (
    <form className="card entry" onSubmit={submit} noValidate>
      <div className="card-head">
        <h2>{editing ? 'Mérés szerkesztése' : 'Új mérés'}</h2>
        {b != null && <span className={`badge cat-${bmiCategory(b).tone}`}>BMI {fmtKg(b)} · {bmiCategory(b).label}</span>}
      </div>
      <label className="bp-field weight">
        <span>Testsúly</span>
        <div className="unit-input">
          <input ref={ref} inputMode="decimal" placeholder="80,0" value={kg} autoFocus={!editing}
            onChange={(e) => setKg(e.target.value.replace(/[^\d.,]/g, ''))} />
          <b>kg</b>
        </div>
      </label>
      <label className="field">
        <span>Időpont</span>
        <input type="datetime-local" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
      </label>
      {!profile.heightCm && (
        <p className="hint">A BMI-hez add meg a magasságodat a <button type="button" className="link inline" onClick={onGoToProfile}>Profilban</button>.</p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        {editing && <button type="button" className="btn ghost" onClick={onCancel}>Mégse</button>}
        <button type="submit" className="btn primary">{saved ? 'Elmentve ✓' : 'Mentés'}</button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ lista */

function WeightList({ title, weights, onEdit, onDelete, onGoToData }: {
  title: string; weights: WeightEntry[]; onEdit: (w: WeightEntry) => void; onDelete: (id: string) => void; onGoToData: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);
  const sorted = useMemo(() => sortWeights(weights), [weights]);
  const rows = useMemo(() => sorted.map((w, i) => ({ w, delta: i > 0 ? roundKg(w.kg - sorted[i - 1].kg) : null })).reverse(), [sorted]);

  return (
    <section className="card list">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="muted">{weights.length} mérés</span>
      </div>
      {!weights.length ? (
        <div className="empty">
          <p>Még nincs súlymérés ebben az időszakban.</p>
          <button className="btn ghost" onClick={onGoToData}>Meglévő Excel / CSV importálása</button>
        </div>
      ) : (
        <>
          <ul className="wlist">
            {rows.slice(0, limit).map(({ w, delta }) => (
              <li key={w.id} className="row wrow">
                <span className="time">{w.takenAt.slice(0, 10).replaceAll('-', '.')}. <small>{w.takenAt.slice(11)}</small></span>
                <span className="kg"><b>{fmtKg(w.kg)}</b> <small>kg</small></span>
                <span className={`delta ${delta == null ? '' : delta < 0 ? 'down' : delta > 0 ? 'up' : ''}`}>
                  {delta == null ? '' : fmtSigned(delta, '')}
                </span>
                <span className="row-actions">
                  {confirmId === w.id ? (
                    <>
                      <button className="link danger" onClick={() => { onDelete(w.id); setConfirmId(null); }}>Törlés</button>
                      <button className="link" onClick={() => setConfirmId(null)}>Mégse</button>
                    </>
                  ) : (
                    <>
                      <button className="icon" aria-label="Szerkesztés" onClick={() => onEdit(w)}>
                        <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></svg>
                      </button>
                      <button className="icon" aria-label="Törlés" onClick={() => setConfirmId(w.id)}>
                        <svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg>
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {rows.length > limit && (
            <button className="btn ghost wide" onClick={() => setLimit((l) => l + 120)}>Továbbiak ({rows.length - limit})</button>
          )}
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ elemzés */

function WeightStats({ title, weights, all, profile, onGoToProfile }: {
  title: string; weights: WeightEntry[]; all: WeightEntry[]; profile: Profile; onGoToProfile: () => void;
}) {
  const s = summarizeWeights(weights);
  const lastAll = sortWeights(all).at(-1);
  const b = bmi(lastAll?.kg, profile.heightCm);
  const range = healthyWeightRange(profile.heightCm);
  const toTarget = lastAll && profile.targetWeightKg ? roundKg(lastAll.kg - profile.targetWeightKg) : null;

  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {range && <span className="muted">Normál BMI-hez tartozó súly: {fmtKg(range[0])}–{fmtKg(range[1])} kg</span>}
      </div>
      {!s.count ? (
        <p className="muted">Nincs adat a kiválasztott időszakban.</p>
      ) : (
        <div className="kpis">
          <div className="kpi hero">
            <span className="kpi-label">Legutóbbi</span>
            <span className="kpi-value v-weight">{fmtKg(s.last?.kg)} <small>kg</small></span>
            <span className="kpi-sub">
              Változás az időszakban: <b className={s.change != null && s.change < 0 ? 'good' : ''}>{fmtSigned(s.change)}</b>
              {' · '}30 nap: {fmtSigned(changeOverDays(all, 30))}
            </span>
          </div>
          <div className="kpi">
            <span className="kpi-label">BMI</span>
            {b != null ? (
              <>
                <span className="kpi-big">{fmtKg(b)}</span>
                <span className={`badge cat-${bmiCategory(b).tone}`}>{bmiCategory(b).label}</span>
              </>
            ) : (
              <span className="kpi-line">Add meg a magasságod a <button className="link inline" onClick={onGoToProfile}>Profilban</button>.</span>
            )}
          </div>
          <div className="kpi">
            <span className="kpi-label">Statisztika</span>
            <span className="kpi-line">Átlag <b>{fmtKg(s.avg)} kg</b></span>
            <span className="kpi-line">Szórás <b>{fmtKg(s.sd, 2)}</b></span>
            <span className="kpi-line">Min–max <b>{fmtKg(s.min)}–{fmtKg(s.max)}</b></span>
            {toTarget != null && <span className="kpi-line">Célig <b>{fmtSigned(-toTarget)}</b></span>}
          </div>
        </div>
      )}
    </section>
  );
}

function WeightChart({ weights, profile }: { weights: WeightEntry[]; profile: Profile }) {
  const data = useMemo(() => sortWeights(weights).map((w) => ({ label: formatShort(w.takenAt), kg: w.kg })), [weights]);
  if (data.length < 2) return null;
  const range = healthyWeightRange(profile.heightCm);
  const target = profile.targetWeightKg;
  const kgs = data.map((d) => d.kg);
  const lo = Math.floor(Math.min(...kgs, target ?? Infinity) - 2);
  const hi = Math.ceil(Math.max(...kgs, target ?? -Infinity) + 2);
  const minWidth = Math.max(320, data.length * 14);

  return (
    <section className="card">
      <div className="card-head"><h2>Grafikon</h2>
        {range && <span className="legend-chip"><i className="area" /> normál BMI tartomány</span>}
      </div>
      <div className="chart-scroll">
        <div style={{ minWidth, height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              {range && <ReferenceArea y1={Math.max(lo, range[0])} y2={Math.min(hi, range[1])} fill="var(--accent)" fillOpacity={0.08} ifOverflow="hidden" />}
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={{ stroke: 'var(--grid)' }}
                interval="preserveStartEnd" minTickGap={18} />
              <YAxis domain={[lo, hi]} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false}
                tickFormatter={(v: number) => v.toLocaleString('hu-HU')} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 13 }}
                labelStyle={{ color: 'var(--ink)', fontWeight: 600 }} formatter={(v) => [`${fmtKg(Number(v))} kg`, 'Testsúly']} />
              {target && (
                <ReferenceLine y={target} stroke="var(--accent)" strokeDasharray="5 4"
                  label={{ value: `Cél ${fmtKg(target)} kg`, position: 'insideTopRight', fontSize: 11, fill: 'var(--accent)' }} />
              )}
              <Line dataKey="kg" name="Testsúly" stroke="var(--weight)" strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function ClearCard({ count, onClear }: { count: number; onClear: () => void }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="card">
      <div className="actions spread" style={{ marginTop: 0 }}>
        <span className="muted">{count} súlymérés tárolva ezen az eszközön.</span>
        {confirm ? (
          <span className="inline-confirm">
            Biztosan törlöd?
            <button className="btn danger" onClick={() => { onClear(); setConfirm(false); }}>Igen, törlés</button>
            <button className="btn ghost" onClick={() => setConfirm(false)}>Mégse</button>
          </span>
        ) : (
          <button className="btn ghost danger" disabled={!count} onClick={() => setConfirm(true)}>Összes súlyadat törlése</button>
        )}
      </div>
    </section>
  );
}
