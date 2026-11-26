import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  INJURY_LOCATIONS, matchResult, POSITIONS, QUALITY_LABEL, RESULT_LABEL, RESULT_SHORT, SEVERITY_LABEL, sortFootball,
  summarizeMatches, summarizeTrainings, validateEntry, withTakenAt,
  type FootballEntry, type InjurySeverity, type MatchEntry, type TrainingEntry, type TrainingQuality,
} from '../lib/football';
import { availableMonths, filterByPeriod, fmt } from '../lib/stats';
import { nowLocalIso } from '../lib/dates';
import { newId } from '../lib/table';
import type { Period } from '../lib/types';
import { PeriodSelect, periodLabel } from './ui';
import { ImportExport } from './ImportExport';
import { footballAdapter } from '../lib/footballIo';

type View = 'log' | 'summary' | 'data';
type Kind = 'match' | 'training';

interface Props {
  entries: FootballEntry[];
  onChange: (xs: FootballEntry[]) => void;
}

const fmtDate = (d: string) => `${d.replaceAll('-', '.')}.`;
const today = () => nowLocalIso().slice(0, 10);
const intOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

export function Football({ entries, onChange }: Props) {
  const [view, setView] = useState<View>('log');
  const [period, setPeriod] = useState<Period>('all');
  const [editing, setEditing] = useState<FootballEntry | null>(null);

  const months = useMemo(() => availableMonths(entries.map(withTakenAt)), [entries]);
  const filtered = useMemo(() => {
    const ids = new Set(filterByPeriod(entries.map(withTakenAt), period).map((x) => x.id));
    return entries.filter((e) => ids.has(e.id));
  }, [entries, period]);

  const save = (e: FootballEntry) => {
    const exists = entries.some((x) => x.id === e.id);
    onChange(sortFootball(exists ? entries.map((x) => (x.id === e.id ? e : x)) : [...entries, e]));
    setEditing(null);
  };
  const remove = (id: string) => {
    onChange(entries.filter((x) => x.id !== id));
    if (editing?.id === id) setEditing(null);
  };

  return (
    <>
      <div className="sub-bar">
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={view === 'log'} className={view === 'log' ? 'active' : ''} onClick={() => setView('log')}>Napló</button>
          <button role="tab" aria-selected={view === 'summary'} className={view === 'summary' ? 'active' : ''} onClick={() => setView('summary')}>Összesítő</button>
          <button role="tab" aria-selected={view === 'data'} className={view === 'data' ? 'active' : ''} onClick={() => setView('data')}>Adatok</button>
        </div>
        {view !== 'data' && <PeriodSelect period={period} onChange={setPeriod} months={months} />}
      </div>

      {view === 'log' ? (
        <div className="grid-log">
          <FootballForm key={editing?.id ?? 'new'} editing={editing} onSave={save} onCancel={() => setEditing(null)} />
          <FootballList title={periodLabel(period).replace('mérés', 'bejegyzés')} entries={filtered}
            onEdit={(e) => { setEditing(e); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onDelete={remove} />
        </div>
      ) : view === 'summary' ? (
        <FootballSummary title={periodLabel(period).replace('Összes mérés', 'Összes')} entries={filtered} />
      ) : (
        <div className="stack">
          <ImportExport adapter={footballAdapter} items={entries} filtered={filtered}
            periodLabel={periodLabel(period).replace('Összes mérés', 'Összes')} onImport={(xs) => onChange(sortFootball(xs))} />
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- űrlap */

function RatingPicker({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div className="rating" role="radiogroup" aria-label="Pontszám 1–10">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button type="button" key={n} role="radio" aria-checked={value === n}
          className={`r${n <= 4 ? ' low' : n <= 6 ? ' mid' : ' high'}${value === n ? ' active' : ''}`} onClick={() => onChange(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}

function Num({ label, value, onChange, placeholder, suffix }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="num-input">
        <input inputMode="numeric" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="stepper">
        <button type="button" aria-label={`${label} csökkentése`} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
        <b>{value}</b>
        <button type="button" aria-label={`${label} növelése`} onClick={() => onChange(Math.min(20, value + 1))}>+</button>
      </div>
    </div>
  );
}

function Seg<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string }[]; value: T | null; onChange: (v: T | null) => void; label: string;
}) {
  return (
    <div className="segmented full" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'active' : ''}
          onClick={() => onChange(value === o.id ? null : o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

function FootballForm({ editing, onSave, onCancel }: { editing: FootballEntry | null; onSave: (e: FootballEntry) => void; onCancel: () => void }) {
  const m = editing?.type === 'match' ? editing : null;
  const t = editing?.type === 'training' ? editing : null;

  const [kind, setKind] = useState<Kind>(editing?.type ?? 'match');
  const [date, setDate] = useState(editing?.date ?? today());
  const [rating, setRating] = useState<number | null>(editing?.rating ?? null);
  const [note, setNote] = useState(editing?.note ?? '');
  // mérkőzés
  const [opponent, setOpponent] = useState(m?.opponent ?? '');
  const [scoreFor, setScoreFor] = useState(m?.scoreFor != null ? String(m.scoreFor) : '');
  const [scoreAgainst, setScoreAgainst] = useState(m?.scoreAgainst != null ? String(m.scoreAgainst) : '');
  const [minutes, setMinutes] = useState(m?.minutes != null ? String(m.minutes) : '');
  const [goals, setGoals] = useState(m?.goals ?? 0);
  const [assists, setAssists] = useState(m?.assists ?? 0);
  const [position, setPosition] = useState(m?.position ?? '');
  const [evaluation, setEvaluation] = useState(m?.evaluation ?? '');
  const [injured, setInjured] = useState(Boolean(m?.injury));
  const [injLocation, setInjLocation] = useState(m?.injury?.location ?? '');
  const [injSeverity, setInjSeverity] = useState<InjurySeverity | null>(m?.injury?.severity ?? 'mild');
  // edzés
  const [quality, setQuality] = useState<TrainingQuality | null>(t?.quality ?? null);
  const [shooting, setShooting] = useState(t?.shots != null);
  const [shots, setShots] = useState(t?.shots != null ? String(t.shots) : '');
  const [shotGoals, setShotGoals] = useState(t?.shotGoals != null ? String(t.shotGoals) : '');

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const reset = () => {
    setRating(null); setNote(''); setOpponent(''); setScoreFor(''); setScoreAgainst(''); setMinutes('');
    setGoals(0); setAssists(0); setEvaluation(''); setInjured(false); setInjLocation(''); setInjSeverity('mild');
    setQuality(null); setShooting(false); setShots(''); setShotGoals(''); setDate(today());
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (rating == null) return setError('Adj pontszámot 1 és 10 között.');
    const base = { id: editing?.id ?? newId(), date, rating, note: note.trim() };
    const entry: FootballEntry = kind === 'match'
      ? {
          ...base, type: 'match', opponent: opponent.trim(), scoreFor: intOrNull(scoreFor), scoreAgainst: intOrNull(scoreAgainst),
          minutes: intOrNull(minutes), goals, assists, position, evaluation: evaluation.trim(),
          injury: injured ? { location: injLocation.trim(), severity: injSeverity ?? 'mild' } : null,
        }
      : {
          ...base, type: 'training', quality,
          shots: shooting ? intOrNull(shots) : null, shotGoals: shooting ? (intOrNull(shotGoals) ?? 0) : null,
        };
    const err = validateEntry(entry);
    if (err) return setError(err);
    setError(null);
    onSave(entry);
    if (!editing) {
      reset();
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    }
  };

  return (
    <form className="card entry" onSubmit={submit} noValidate>
      <div className="card-head">
        <h2>{editing ? 'Bejegyzés szerkesztése' : 'Új bejegyzés'}</h2>
      </div>

      {!editing && (
        <div className="kind-switch" role="radiogroup" aria-label="Típus">
          <button type="button" role="radio" aria-checked={kind === 'match'} className={kind === 'match' ? 'active' : ''} onClick={() => setKind('match')}>Mérkőzés</button>
          <button type="button" role="radio" aria-checked={kind === 'training'} className={kind === 'training' ? 'active' : ''} onClick={() => setKind('training')}>Edzés</button>
        </div>
      )}

      <div className="form-stack">
        <label className="field">
          <span>Dátum</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>

        {kind === 'match' && (
          <>
            <label className="field">
              <span>Ellenfél</span>
              <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="pl. Kőszeg FC" />
            </label>
            <div className="field">
              <span>Végeredmény (mi – ellenfél)</span>
              <div className="score">
                <input inputMode="numeric" aria-label="Saját gólok" value={scoreFor} placeholder="0" onChange={(e) => setScoreFor(e.target.value.replace(/\D/g, '').slice(0, 2))} />
                <b>–</b>
                <input inputMode="numeric" aria-label="Ellenfél góljai" value={scoreAgainst} placeholder="0" onChange={(e) => setScoreAgainst(e.target.value.replace(/\D/g, '').slice(0, 2))} />
              </div>
            </div>
            <div className="form-grid">
              <Num label="Játszott percek" value={minutes} onChange={setMinutes} placeholder="90" suffix="perc" />
              <label className="field">
                <span>Pozíció</span>
                <select value={position} onChange={(e) => setPosition(e.target.value)}>
                  <option value="">–</option>
                  {POSITIONS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
              <Stepper label="Gólok" value={goals} onChange={setGoals} />
              <Stepper label="Gólpasszok" value={assists} onChange={setAssists} />
            </div>
          </>
        )}

        <div className="field">
          <span>Pontszám (1–10)</span>
          <RatingPicker value={rating} onChange={setRating} />
        </div>

        {kind === 'match' ? (
          <>
            <label className="field">
              <span>Szubjektív értékelés</span>
              <textarea rows={2} value={evaluation} onChange={(e) => setEvaluation(e.target.value)} placeholder="Hogy érezted magad, mi ment jól, min kell javítani?" />
            </label>
            <label className="check big">
              <input type="checkbox" checked={injured} onChange={(e) => setInjured(e.target.checked)} /> Sérülés történt
            </label>
            {injured && (
              <div className="sub-box">
                <label className="field">
                  <span>Sérülés helye</span>
                  <input list="injury-locations" value={injLocation} onChange={(e) => setInjLocation(e.target.value)} placeholder="pl. Boka" />
                  <datalist id="injury-locations">{INJURY_LOCATIONS.map((l) => <option key={l} value={l} />)}</datalist>
                </label>
                <div className="field">
                  <span>Súlyosság</span>
                  <Seg label="Súlyosság" value={injSeverity} onChange={setInjSeverity}
                    options={(['mild', 'moderate', 'severe'] as const).map((id) => ({ id, label: SEVERITY_LABEL[id] }))} />
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="field">
              <span>Edzés minősége</span>
              <Seg label="Edzés minősége" value={quality} onChange={setQuality}
                options={(['bad', 'ok', 'good'] as const).map((id) => ({ id, label: QUALITY_LABEL[id] }))} />
            </div>
            <label className="check big">
              <input type="checkbox" checked={shooting} onChange={(e) => setShooting(e.target.checked)} /> Volt kapura lövés
            </label>
            {shooting && (
              <div className="sub-box form-grid">
                <Num label="Lövések száma" value={shots} onChange={setShots} placeholder="20" />
                <Num label="Ebből gól" value={shotGoals} onChange={setShotGoals} placeholder="8" />
              </div>
            )}
          </>
        )}

        <label className="field">
          <span>Megjegyzés – nem kötelező</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        {editing && <button type="button" className="btn ghost" onClick={onCancel}>Mégse</button>}
        <button type="submit" className="btn primary">{saved ? 'Elmentve ✓' : 'Mentés'}</button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- lista */

function FootballList({ title, entries, onEdit, onDelete }: {
  title: string; entries: FootballEntry[]; onEdit: (e: FootballEntry) => void; onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [limit, setLimit] = useState(50);
  const visible = useMemo(
    () => sortFootball(entries).reverse().filter((e) => filter === 'all' || e.type === filter),
    [entries, filter],
  );
  const nMatch = entries.filter((e) => e.type === 'match').length;

  return (
    <section className="card list">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="muted">{nMatch} mérkőzés · {entries.length - nMatch} edzés</span>
      </div>
      {entries.length > 0 && (
        <div className="chip-row" style={{ marginBottom: 8 }}>
          {([['all', 'Mind'], ['match', 'Mérkőzések'], ['training', 'Edzések']] as const).map(([id, l]) => (
            <button key={id} className={`chip ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{l}</button>
          ))}
        </div>
      )}
      {!entries.length ? (
        <div className="empty"><p>Még nincs rögzített edzés vagy mérkőzés.</p></div>
      ) : (
        <>
          <ul className="fb-list">
            {visible.slice(0, limit).map((e) => (
              <li key={e.id} className="fb-row">
                <span className={`fb-kind ${e.type}`}>{e.type === 'match' ? 'M' : 'E'}</span>
                <div className="fb-body">
                  {e.type === 'match' ? <MatchLine m={e} /> : <TrainingLine t={e} />}
                </div>
                <span className={`fb-rating r${e.rating <= 4 ? 'low' : e.rating <= 6 ? 'mid' : 'high'}`} title="Pontszám">{e.rating}</span>
                <span className="row-actions">
                  {confirmId === e.id ? (
                    <>
                      <button className="link danger" onClick={() => { onDelete(e.id); setConfirmId(null); }}>Törlés</button>
                      <button className="link" onClick={() => setConfirmId(null)}>Mégse</button>
                    </>
                  ) : (
                    <>
                      <button className="icon" aria-label="Szerkesztés" onClick={() => onEdit(e)}>
                        <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></svg>
                      </button>
                      <button className="icon" aria-label="Törlés" onClick={() => setConfirmId(e.id)}>
                        <svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg>
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {visible.length > limit && (
            <button className="btn ghost wide" onClick={() => setLimit((l) => l + 100)}>Továbbiak ({visible.length - limit})</button>
          )}
        </>
      )}
    </section>
  );
}

function MatchLine({ m }: { m: MatchEntry }) {
  const r = matchResult(m);
  const bits: ReactNode[] = [];
  if (m.minutes != null) bits.push(`${m.minutes}'`);
  if (m.position) bits.push(m.position);
  if (m.goals) bits.push(`${m.goals} gól`);
  if (m.assists) bits.push(`${m.assists} gólpassz`);
  return (
    <>
      <b className="fb-title">
        {m.opponent ? `vs. ${m.opponent}` : 'Mérkőzés'}
        {r && <span className={`res res-${r}`}>{m.scoreFor}–{m.scoreAgainst} {RESULT_SHORT[r]}</span>}
      </b>
      <small>{fmtDate(m.date)}{bits.length ? ' · ' : ''}{bits.join(' · ')}</small>
      {m.injury && <small className="injury">Sérülés: {m.injury.location} ({SEVERITY_LABEL[m.injury.severity].toLowerCase()})</small>}
      {(m.evaluation || m.note) && <small className="fb-note">{m.evaluation || m.note}</small>}
    </>
  );
}

function TrainingLine({ t }: { t: TrainingEntry }) {
  return (
    <>
      <b className="fb-title">
        Edzés
        {t.quality && <span className={`q q-${t.quality}`}>{QUALITY_LABEL[t.quality]}</span>}
      </b>
      <small>
        {fmtDate(t.date)}
        {t.shots != null && ` · Lövés: ${t.shotGoals ?? 0}/${t.shots}${t.shots ? ` (${Math.round(((t.shotGoals ?? 0) / t.shots) * 100)}%)` : ''}`}
      </small>
      {t.note && <small className="fb-note">{t.note}</small>}
    </>
  );
}

/* ---------------------------------------------------------------- összesítő */

function FootballSummary({ title, entries }: { title: string; entries: FootballEntry[] }) {
  const ms = summarizeMatches(entries);
  const ts = summarizeTrainings(entries);
  const chart = useMemo(() => sortFootball(entries).map((e) => ({
    label: e.date.slice(5).replace('-', '.') + '.',
    match: e.type === 'match' ? e.rating : null,
    training: e.type === 'training' ? e.rating : null,
  })), [entries]);

  if (!entries.length) {
    return <section className="card"><p className="muted">Nincs adat a kiválasztott időszakban.</p></section>;
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head"><h2>Mérkőzések – {title.toLowerCase()}</h2><span className="muted">{ms.count} mérkőzés</span></div>
        {!ms.count ? <p className="muted">Nincs mérkőzés ebben az időszakban.</p> : (
          <>
            <div className="kpis kpis-4">
              <div className="kpi"><span className="kpi-label">Gól</span><span className="kpi-big">{ms.goals}</span></div>
              <div className="kpi"><span className="kpi-label">Gólpassz</span><span className="kpi-big">{ms.assists}</span></div>
              <div className="kpi"><span className="kpi-label">Percek</span><span className="kpi-big">{ms.minutes}</span>
                <span className="kpi-line">G+A / 90 perc <b>{fmt(ms.gaPer90, 2)}</b></span></div>
              <div className="kpi"><span className="kpi-label">Átlag pontszám</span><span className="kpi-big">{fmt(ms.avgRating, 1)}</span></div>
            </div>
            <div className="fb-facts">
              <span><i className="dot res-W" /> {RESULT_LABEL.W}: <b>{ms.wins}</b></span>
              <span><i className="dot res-D" /> {RESULT_LABEL.D}: <b>{ms.draws}</b></span>
              <span><i className="dot res-L" /> {RESULT_LABEL.L}: <b>{ms.losses}</b></span>
              <span>Sérülés: <b>{ms.injuries}</b></span>
              {ms.positions.length > 0 && <span>Pozíció: <b>{ms.positions.map((p) => `${p.position} (${p.count})`).join(', ')}</b></span>}
            </div>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>Edzések – {title.toLowerCase()}</h2><span className="muted">{ts.count} edzés</span></div>
        {!ts.count ? <p className="muted">Nincs edzés ebben az időszakban.</p> : (
          <>
            <div className="kpis kpis-4">
              <div className="kpi"><span className="kpi-label">Átlag pontszám</span><span className="kpi-big">{fmt(ts.avgRating, 1)}</span></div>
              <div className="kpi"><span className="kpi-label">Kapura lövés</span><span className="kpi-big">{ts.shotGoals}/{ts.shots}</span>
                <span className="kpi-line">{ts.shootingSessions} edzésen</span></div>
              <div className="kpi"><span className="kpi-label">Hatékonyság</span><span className="kpi-big">{ts.conversion == null ? '–' : `${fmt(ts.conversion)}%`}</span></div>
              <div className="kpi"><span className="kpi-label">Minőség</span>
                <span className="kpi-line"><i className="dot q-good" /> Jó <b>{ts.quality.good}</b></span>
                <span className="kpi-line"><i className="dot q-ok" /> Közepes <b>{ts.quality.ok}</b></span>
                <span className="kpi-line"><i className="dot q-bad" /> Rossz <b>{ts.quality.bad}</b></span>
              </div>
            </div>
          </>
        )}
      </section>

      {chart.length > 1 && (
        <section className="card">
          <div className="card-head"><h2>Pontszámok alakulása</h2></div>
          <div className="chart-scroll">
            <div style={{ minWidth: Math.max(320, chart.length * 24), height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 8, right: 12, left: -24, bottom: 4 }}>
                  <CartesianGrid vertical={false} stroke="var(--grid)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} minTickGap={14} />
                  <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, fontSize: 13 }}
                    labelStyle={{ color: 'var(--ink)', fontWeight: 600 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
                  <Line dataKey="match" name="Mérkőzés" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3.5 }} connectNulls isAnimationActive={false} />
                  <Line dataKey="training" name="Edzés" stroke="var(--dia)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
