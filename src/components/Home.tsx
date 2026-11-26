import type { Measurement, Profile, Settings, WeightEntry } from '../lib/types';
import { classify, filterByPeriod, mean, sortByTime } from '../lib/stats';
import { ageFromBirthDate, bmi, bmiCategory, changeOverDays, sortWeights } from '../lib/weight';
import { CategoryBadge } from './CategoryBadge';
import { fmtKg, fmtSigned, Icon, ICONS, Sparkline, whenLabel } from './ui';

export type Screen = 'home' | 'bp' | 'weight' | 'profile';

interface Props {
  measurements: Measurement[];
  weights: WeightEntry[];
  profile: Profile;
  settings: Settings;
  onOpen: (s: Screen) => void;
}

const SEX_LABEL = { male: 'férfi', female: 'nő', other: 'egyéb', '': '' } as const;

function greeting() {
  const h = new Date().getHours();
  return h < 9 ? 'Jó reggelt' : h < 18 ? 'Szia' : 'Jó estét';
}

export function Home({ measurements, weights, profile, settings, onOpen }: Props) {
  const bpSorted = sortByTime(measurements);
  const lastBp = bpSorted.at(-1);
  const bp30 = filterByPeriod(bpSorted, 'last30');
  const recentBp = bpSorted.slice(-20);

  const wSorted = sortWeights(weights);
  const lastW = wSorted.at(-1);
  const recentW = wSorted.slice(-20);
  const b = bmi(lastW?.kg, profile.heightCm);
  const change30 = changeOverDays(weights, 30);
  const age = ageFromBirthDate(profile.birthDate);

  const firstName = profile.name.split(' ').at(-1);

  return (
    <>
      <div className="home-head">
        <h1>{greeting()}{firstName ? `, ${firstName}` : ''}!</h1>
        <p className="muted">{new Date().toLocaleDateString('hu-HU', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
      </div>

      <div className="tiles">
        {/* Vérnyomás */}
        <article className="tile" onClick={() => onOpen('bp')} role="button" tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onOpen('bp')}>
          <header>
            <span className="tile-icon bp"><Icon d={ICONS.heart} /></span>
            <h2>Vérnyomás</h2>
            <button className="tile-add" aria-label="Új vérnyomásmérés" onClick={(e) => { e.stopPropagation(); onOpen('bp'); }}>
              <Icon d={ICONS.plus} size={18} />
            </button>
          </header>
          {lastBp ? (
            <>
              <div className="tile-main">
                <span className="tile-value"><span className="v-sys">{lastBp.sys}</span>/<span className="v-dia">{lastBp.dia}</span></span>
                <span className="tile-unit">mmHg{lastBp.pulse != null && ` · ${lastBp.pulse} bpm`}</span>
              </div>
              <div className="tile-meta">
                <span>{whenLabel(lastBp.takenAt)}</span>
                <CategoryBadge category={classify(lastBp, settings)} />
              </div>
              <Sparkline series={[
                { values: recentBp.map((m) => m.sys), color: 'var(--sys)' },
                { values: recentBp.map((m) => m.dia), color: 'var(--dia)' },
              ]} />
              <p className="tile-foot">
                {bp30.length
                  ? <>30 napos átlag: <b>{Math.round(mean(bp30.map((m) => m.sys))!)}/{Math.round(mean(bp30.map((m) => m.dia))!)}</b> ({bp30.length} mérés)</>
                  : `${measurements.length} mérés összesen`}
              </p>
            </>
          ) : (
            <p className="tile-empty">Még nincs mérés. Rögzíts egyet, vagy importáld a meglévő Excel táblázatodat.</p>
          )}
        </article>

        {/* Testsúly */}
        <article className="tile" onClick={() => onOpen('weight')} role="button" tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onOpen('weight')}>
          <header>
            <span className="tile-icon weight"><Icon d={ICONS.scale} /></span>
            <h2>Testsúly</h2>
            <button className="tile-add" aria-label="Új súlymérés" onClick={(e) => { e.stopPropagation(); onOpen('weight'); }}>
              <Icon d={ICONS.plus} size={18} />
            </button>
          </header>
          {lastW ? (
            <>
              <div className="tile-main">
                <span className="tile-value v-weight">{fmtKg(lastW.kg)}</span>
                <span className="tile-unit">kg</span>
              </div>
              <div className="tile-meta">
                <span>{whenLabel(lastW.takenAt)}</span>
                {b != null && <span className={`badge cat-${bmiCategory(b).tone}`}>BMI {fmtKg(b)}</span>}
              </div>
              <Sparkline series={[{ values: recentW.map((w) => w.kg), color: 'var(--weight)' }]} />
              <p className="tile-foot">
                30 nap változás: <b>{fmtSigned(change30)}</b>
                {profile.targetWeightKg ? <> · cél: {fmtKg(profile.targetWeightKg)} kg</> : null}
              </p>
            </>
          ) : (
            <p className="tile-empty">Még nincs súlymérés. Kezdd el követni a testsúlyodat.</p>
          )}
        </article>

        {/* Profil */}
        <article className="tile small" onClick={() => onOpen('profile')} role="button" tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onOpen('profile')}>
          <header>
            <span className="tile-icon profile"><Icon d={ICONS.user} /></span>
            <h2>Személyes adatok</h2>
          </header>
          {profile.birthDate || profile.heightCm || profile.sex ? (
            <ul className="chips">
              {profile.name && <li>{profile.name}</li>}
              {age != null && <li>{age} év</li>}
              {profile.sex && <li>{SEX_LABEL[profile.sex]}</li>}
              {profile.heightCm && <li>{profile.heightCm} cm</li>}
            </ul>
          ) : (
            <p className="tile-empty">Add meg a magasságodat, születési dátumodat és nemedet – ezekből számoljuk a BMI-t.</p>
          )}
        </article>

        {/* Integrációk – később */}
        <article className="tile small soon" aria-disabled="true">
          <header>
            <span className="tile-icon link"><Icon d={ICONS.link} /></span>
            <h2>Kapcsolatok</h2>
            <span className="soon-badge">Hamarosan</span>
          </header>
          <ul className="chips muted-chips">
            <li>Apple Health</li><li>Health Connect</li><li>Coros</li>
          </ul>
        </article>
      </div>
    </>
  );
}
