import { useMemo, useState } from 'react';
import type { Measurement, Settings } from '../lib/types';
import { classify } from '../lib/stats';
import { CATEGORY_LABEL } from './CategoryBadge';

interface Props {
  title: string;
  measurements: Measurement[];
  settings: Settings;
  onEdit: (m: Measurement) => void;
  onDelete: (id: string) => void;
  onGoToData: () => void;
}

const dayLabel = (day: string) => {
  const d = new Date(`${day}T12:00`);
  return d.toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
};

export function MeasurementList({ title, measurements, settings, onEdit, onDelete, onGoToData }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);

  const groups = useMemo(() => {
    const newestFirst = [...measurements].reverse().slice(0, limit);
    const map = new Map<string, Measurement[]>();
    for (const m of newestFirst) {
      const day = m.takenAt.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), m]);
    }
    return [...map];
  }, [measurements, limit]);

  return (
    <section className="card list">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="muted">{measurements.length} mérés</span>
      </div>

      {measurements.length === 0 ? (
        <div className="empty">
          <p>Még nincs mérés ebben az időszakban.</p>
          <button className="btn ghost" onClick={onGoToData}>Meglévő Excel / CSV importálása</button>
        </div>
      ) : (
        <>
          {groups.map(([day, items]) => (
            <div key={day} className="day">
              <h3>{dayLabel(day)}</h3>
              <ul>
                {items.map((m) => {
                  const cat = classify(m, settings);
                  return (
                    <li key={m.id} className="row">
                      <span className={`dot cat-${cat}`} title={CATEGORY_LABEL[cat]} />
                      <span className="time">{m.takenAt.slice(11, 16)}</span>
                      <span className="bp">
                        <b className="v-sys">{m.sys}</b>
                        <span className="sep">/</span>
                        <b className="v-dia">{m.dia}</b>
                      </span>
                      <span className="pulse">{m.pulse ?? '–'} <small>bpm</small></span>
                      <span className="row-actions">
                        {confirmId === m.id ? (
                          <>
                            <button className="link danger" onClick={() => { onDelete(m.id); setConfirmId(null); }}>Törlés</button>
                            <button className="link" onClick={() => setConfirmId(null)}>Mégse</button>
                          </>
                        ) : (
                          <>
                            <button className="icon" aria-label="Szerkesztés" onClick={() => onEdit(m)}>
                              <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></svg>
                            </button>
                            <button className="icon" aria-label="Törlés" onClick={() => setConfirmId(m.id)}>
                              <svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg>
                            </button>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {measurements.length > limit && (
            <button className="btn ghost wide" onClick={() => setLimit((l) => l + 120)}>
              Továbbiak ({measurements.length - limit})
            </button>
          )}
        </>
      )}
    </section>
  );
}
