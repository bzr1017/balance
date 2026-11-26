import { useState } from 'react';
import type { Settings } from '../lib/types';
import { DEFAULT_SETTINGS } from '../lib/types';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  count: number;
  onClearAll: () => void;
}

const FIELDS: { key: keyof Settings; label: string }[] = [
  { key: 'targetSys', label: 'Cél SYS (ideális)' },
  { key: 'targetDia', label: 'Cél DIA (ideális)' },
  { key: 'limitSys', label: 'Felső határ SYS' },
  { key: 'limitDia', label: 'Felső határ DIA' },
];

export function SettingsPanel({ settings, onChange, count, onClearAll }: Props) {
  const [confirm, setConfirm] = useState(false);

  return (
    <section className="card">
      <div className="card-head"><h2>Beállítások</h2></div>
      <div className="settings-grid">
        {FIELDS.map((f) => (
          <label key={f.key} className="field">
            <span>{f.label}</span>
            <input inputMode="numeric" value={settings[f.key]}
              onChange={(e) => {
                const v = Number(e.target.value.replace(/\D/g, ''));
                if (v > 0 && v < 300) onChange({ ...settings, [f.key]: v });
              }} />
          </label>
        ))}
      </div>
      <div className="actions spread">
        <button className="btn ghost" onClick={() => onChange(DEFAULT_SETTINGS)}>Alapértékek (130/80, 135/85)</button>
        {confirm ? (
          <span className="inline-confirm">
            Biztosan törlöd mind a(z) {count} mérést?
            <button className="btn danger" onClick={() => { onClearAll(); setConfirm(false); }}>Igen, törlés</button>
            <button className="btn ghost" onClick={() => setConfirm(false)}>Mégse</button>
          </span>
        ) : (
          <button className="btn ghost danger" disabled={!count} onClick={() => setConfirm(true)}>Összes adat törlése</button>
        )}
      </div>
    </section>
  );
}
