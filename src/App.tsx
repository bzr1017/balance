import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MedicalDocument, Measurement, Period, Settings } from './lib/types';
import type { FootballEntry } from './lib/football';
import { DEFAULT_SETTINGS } from './lib/types';
import {
  loadDocuments, loadFootball, loadMeasurements, loadSettings, saveDocuments, saveFootball, saveMeasurements, saveSettings,
} from './lib/storage';
import { availableMonths, filterByPeriod, sortByTime } from './lib/stats';
import { bpAdapter } from './lib/io';
import { EntryForm } from './components/EntryForm';
import { MeasurementList } from './components/MeasurementList';
import { StatsPanel } from './components/StatsPanel';
import { BpChart } from './components/BpChart';
import { ImportExport } from './components/ImportExport';
import { SettingsPanel } from './components/SettingsPanel';
import { Documents } from './components/Documents';
import { Football } from './components/Football';
import { Icon, ICONS, PeriodSelect, periodLabel, ScaleLogo } from './components/ui';

type Tab = 'log' | 'stats' | 'football' | 'docs' | 'data';

const TABS: { id: Tab; label: string; short: string; title: string; icon: string }[] = [
  { id: 'log', label: 'Vérnyomás', short: 'Vérnyomás', title: 'Vérnyomásnapló', icon: ICONS.log },
  { id: 'stats', label: 'Elemzés', short: 'Elemzés', title: 'Vérnyomás elemzés', icon: ICONS.stats },
  { id: 'football', label: 'Foci', short: 'Foci', title: 'Foci', icon: ICONS.ball },
  { id: 'docs', label: 'Dokumentumok', short: 'Leletek', title: 'Orvosi dokumentumok', icon: ICONS.docs },
  { id: 'data', label: 'Adatok', short: 'Adatok', title: 'Vérnyomás adatok', icon: ICONS.data },
];

export default function App() {
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [docs, setDocs] = useState<MedicalDocument[]>([]);
  const [football, setFootball] = useState<FootballEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('log');
  const [period, setPeriod] = useState<Period>('all');
  const [editing, setEditing] = useState<Measurement | null>(null);

  useEffect(() => {
    Promise.all([loadMeasurements(), loadSettings(), loadDocuments(), loadFootball()]).then(([ms, s, d, f]) => {
      setMeasurements(sortByTime(ms));
      setSettings(s);
      setDocs(d);
      setFootball(f);
      setLoaded(true);
    });
  }, []);

  const updateMeasurements = useCallback((next: Measurement[]) => {
    const sorted = sortByTime(next);
    setMeasurements(sorted);
    void saveMeasurements(sorted);
  }, []);
  const updateSettings = useCallback((s: Settings) => { setSettings(s); void saveSettings(s); }, []);
  const updateDocs = useCallback((d: MedicalDocument[]) => { setDocs(d); void saveDocuments(d); }, []);
  const updateFootball = useCallback((f: FootballEntry[]) => { setFootball(f); void saveFootball(f); }, []);

  const months = useMemo(() => availableMonths(measurements), [measurements]);
  const filtered = useMemo(() => filterByPeriod(measurements, period), [measurements, period]);
  useEffect(() => {
    if (period !== 'all' && period !== 'last30' && !months.includes(period)) setPeriod('all');
  }, [months, period]);

  const saveMeasurement = (m: Measurement) => {
    const exists = measurements.some((x) => x.id === m.id);
    updateMeasurements(exists ? measurements.map((x) => (x.id === m.id ? m : x)) : [...measurements, m]);
    setEditing(null);
  };
  const deleteMeasurement = (id: string) => {
    updateMeasurements(measurements.filter((m) => m.id !== id));
    if (editing?.id === id) setEditing(null);
  };

  const go = (t: Tab) => { setTab(t); window.scrollTo({ top: 0 }); };
  const label = periodLabel(period);
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <ScaleLogo size={30} />
          <span>Balance</span>
        </div>
        <nav className="tabs-top" aria-label="Fő navigáció">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => go(t.id)}>{t.label}</button>
          ))}
        </nav>
      </header>

      <main className="content">
        <div className="module-bar">
          <h1>{current.title}</h1>
          {(tab === 'log' || tab === 'stats') && <PeriodSelect period={period} onChange={setPeriod} months={months} />}
        </div>

        {!loaded ? null : tab === 'log' ? (
          <div className="grid-log">
            <EntryForm key={editing?.id ?? 'new'} editing={editing} settings={settings} onSave={saveMeasurement} onCancel={() => setEditing(null)} />
            <MeasurementList title={label} measurements={filtered} settings={settings}
              onEdit={(m) => { setEditing(m); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              onDelete={deleteMeasurement} onGoToData={() => go('data')} />
          </div>
        ) : tab === 'stats' ? (
          <div className="stack">
            <StatsPanel title={label} measurements={filtered} settings={settings} />
            <BpChart measurements={filtered} settings={settings} />
          </div>
        ) : tab === 'data' ? (
          <div className="stack">
            <ImportExport adapter={bpAdapter} items={measurements} filtered={filtered} periodLabel={label} onImport={updateMeasurements} />
            <SettingsPanel settings={settings} onChange={updateSettings} count={measurements.length} onClearAll={() => updateMeasurements([])} />
          </div>
        ) : tab === 'football' ? (
          <Football entries={football} onChange={updateFootball} />
        ) : (
          <Documents docs={docs} onChange={updateDocs} />
        )}
      </main>

      <nav className="tabs-bottom" aria-label="Fő navigáció">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => go(t.id)}>
            <Icon d={t.icon} />
            <span>{t.short}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
