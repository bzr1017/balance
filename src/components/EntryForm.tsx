import { useRef, useState, type FormEvent } from 'react';
import type { Measurement, Settings } from '../lib/types';
import { nowLocalIso } from '../lib/dates';
import { isPlausible, newId } from '../lib/io';
import { classify } from '../lib/stats';
import { CategoryBadge } from './CategoryBadge';

interface Props {
  editing: Measurement | null;
  settings: Settings;
  onSave: (m: Measurement) => void;
  onCancel: () => void;
}

export function EntryForm({ editing, settings, onSave, onCancel }: Props) {
  const [takenAt, setTakenAt] = useState(editing?.takenAt ?? nowLocalIso());
  const [sys, setSys] = useState(editing ? String(editing.sys) : '');
  const [dia, setDia] = useState(editing ? String(editing.dia) : '');
  const [pulse, setPulse] = useState(editing?.pulse != null ? String(editing.pulse) : '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const sysRef = useRef<HTMLInputElement>(null);

  const s = Number(sys), d = Number(dia);
  const preview = sys && dia && s > 0 && d > 0 ? classify({ sys: s, dia: d }, settings) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = pulse.trim() === '' ? null : Number(pulse);
    if (!takenAt) return setError('Add meg az időpontot.');
    if (!sys || !dia || Number.isNaN(s) || Number.isNaN(d) || (p != null && Number.isNaN(p))) {
      return setError('A szisztolés és diasztolés érték kötelező.');
    }
    if (!isPlausible(s, d, p)) {
      return setError('Ellenőrizd az értékeket (SYS 50–300, DIA 30–200, a SYS nagyobb mint a DIA, pulzus 25–250).');
    }
    onSave({ id: editing?.id ?? newId(), takenAt: takenAt.slice(0, 16), sys: Math.round(s), dia: Math.round(d), pulse: p == null ? null : Math.round(p) });
    setError(null);
    if (!editing) {
      // Új mérés: a mező üres marad a következő (pl. 2–3 egymás utáni) méréshez.
      setSys(''); setDia(''); setPulse(''); setTakenAt(nowLocalIso());
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
      sysRef.current?.focus();
    }
  };

  return (
    <form className="card entry" onSubmit={submit} noValidate>
      <div className="card-head">
        <h2>{editing ? 'Mérés szerkesztése' : 'Új mérés'}</h2>
        {preview && <CategoryBadge category={preview} />}
      </div>

      <div className="bp-inputs">
        <label className="bp-field sys">
          <span>Szisztolés</span>
          <input ref={sysRef} inputMode="numeric" pattern="[0-9]*" placeholder="120" value={sys}
            onChange={(e) => setSys(e.target.value.replace(/\D/g, ''))} autoFocus={!editing} />
          <small>mmHg</small>
        </label>
        <span className="slash" aria-hidden="true">/</span>
        <label className="bp-field dia">
          <span>Diasztolés</span>
          <input inputMode="numeric" pattern="[0-9]*" placeholder="80" value={dia}
            onChange={(e) => setDia(e.target.value.replace(/\D/g, ''))} />
          <small>mmHg</small>
        </label>
        <label className="bp-field pulse">
          <span>Pulzus</span>
          <input inputMode="numeric" pattern="[0-9]*" placeholder="60" value={pulse}
            onChange={(e) => setPulse(e.target.value.replace(/\D/g, ''))} />
          <small>/perc</small>
        </label>
      </div>

      <label className="field">
        <span>Időpont</span>
        <input type="datetime-local" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
      </label>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="actions">
        {editing && <button type="button" className="btn ghost" onClick={onCancel}>Mégse</button>}
        <button type="submit" className="btn primary">{saved ? 'Elmentve ✓' : 'Mentés'}</button>
      </div>
    </form>
  );
}
