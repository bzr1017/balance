import { useState, type FormEvent } from 'react';
import type { Profile, Sex, WeightEntry } from '../lib/types';
import { ageFromBirthDate, bmi, bmiCategory, healthyWeightRange, sortWeights } from '../lib/weight';
import { fmtKg } from './ui';

interface Props {
  profile: Profile;
  weights: WeightEntry[];
  onSave: (p: Profile) => void;
}

const SEXES: { id: Sex; label: string }[] = [
  { id: 'male', label: 'Férfi' },
  { id: 'female', label: 'Nő' },
  { id: 'other', label: 'Egyéb' },
];

const numOrNull = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(v) && v > 0 ? v : null;
};

export function ProfileScreen({ profile, weights, onSave }: Props) {
  const [name, setName] = useState(profile.name);
  const [birthDate, setBirthDate] = useState(profile.birthDate);
  const [sex, setSex] = useState<Sex>(profile.sex);
  const [height, setHeight] = useState(profile.heightCm ? String(profile.heightCm) : '');
  const [target, setTarget] = useState(profile.targetWeightKg ? String(profile.targetWeightKg).replace('.', ',') : '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const heightCm = numOrNull(height);
  const lastKg = sortWeights(weights).at(-1)?.kg ?? null;
  const age = ageFromBirthDate(birthDate);
  const b = bmi(lastKg, heightCm);
  const range = healthyWeightRange(heightCm);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const targetKg = numOrNull(target);
    if (height && (!heightCm || heightCm < 50 || heightCm > 250)) return setError('A magasság 50 és 250 cm között lehet.');
    if (target && (!targetKg || targetKg < 20 || targetKg > 400)) return setError('A célsúly 20 és 400 kg között lehet.');
    if (birthDate && age == null) return setError('Érvénytelen születési dátum.');
    setError(null);
    onSave({ name: name.trim(), birthDate, sex, heightCm: heightCm ? Math.round(heightCm) : null, targetWeightKg: targetKg ? Math.round(targetKg * 10) / 10 : null });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <>
      <div className="module-bar"><h1>Személyes adatok</h1></div>
      <div className="grid-log">
        <form className="card" onSubmit={submit} noValidate>
          <div className="card-head"><h2>Profil</h2></div>
          <div className="form-grid">
            <label className="field span-2">
              <span>Név</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="pl. Kiss Péter" autoComplete="name" />
            </label>
            <label className="field">
              <span>Születési dátum</span>
              <input type="date" value={birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirthDate(e.target.value)} />
            </label>
            <div className="field">
              <span>Nem</span>
              <div className="segmented full" role="radiogroup" aria-label="Nem">
                {SEXES.map((s) => (
                  <button type="button" key={s.id} role="radio" aria-checked={sex === s.id} className={sex === s.id ? 'active' : ''}
                    onClick={() => setSex(sex === s.id ? '' : s.id)}>{s.label}</button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Magasság (cm)</span>
              <input inputMode="numeric" value={height} placeholder="175" onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))} />
            </label>
            <label className="field">
              <span>Célsúly (kg) – nem kötelező</span>
              <input inputMode="decimal" value={target} placeholder="75,0" onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, ''))} />
            </label>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="actions">
            <button type="submit" className="btn primary">{saved ? 'Elmentve ✓' : 'Mentés'}</button>
          </div>
        </form>

        <section className="card">
          <div className="card-head"><h2>Számított értékek</h2></div>
          <dl className="facts">
            <div><dt>Életkor</dt><dd>{age != null ? `${age} év` : '–'}</dd></div>
            <div><dt>Legutóbbi testsúly</dt><dd>{lastKg != null ? `${fmtKg(lastKg)} kg` : '–'}</dd></div>
            <div>
              <dt>BMI</dt>
              <dd>{b != null ? <>{fmtKg(b)} <span className={`badge cat-${bmiCategory(b).tone}`}>{bmiCategory(b).label}</span></> : '–'}</dd>
            </div>
            <div><dt>Normál BMI-hez tartozó súly</dt><dd>{range ? `${fmtKg(range[0])}–${fmtKg(range[1])} kg` : '–'}</dd></div>
          </dl>
          <p className="muted small">
            A BMI a felnőtt WHO-kategóriák szerint: 18,5 alatt sovány, 18,5–24,9 normál, 25–29,9 túlsúly, 30 felett elhízás.
            Az adatok csak ezen az eszközön tárolódnak.
          </p>
        </section>
      </div>
    </>
  );
}
