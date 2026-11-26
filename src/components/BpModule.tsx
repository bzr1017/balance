import { useEffect, useMemo, useState } from 'react';
import type { Measurement, Period, Settings } from '../lib/types';
import { availableMonths, filterByPeriod } from '../lib/stats';
import { bpAdapter } from '../lib/io';
import { EntryForm } from './EntryForm';
import { MeasurementList } from './MeasurementList';
import { StatsPanel } from './StatsPanel';
import { BpChart } from './BpChart';
import { ImportExport } from './ImportExport';
import { SettingsPanel } from './SettingsPanel';
import { ModuleBar, periodLabel, type SubTab } from './ui';

interface Props {
  measurements: Measurement[];
  settings: Settings;
  onChange: (ms: Measurement[]) => void;
  onSettings: (s: Settings) => void;
  initialTab?: SubTab;
}

export function BpModule({ measurements, settings, onChange, onSettings, initialTab = 'log' }: Props) {
  const [tab, setTab] = useState<SubTab>(initialTab);
  const [period, setPeriod] = useState<Period>('all');
  const [editing, setEditing] = useState<Measurement | null>(null);

  const months = useMemo(() => availableMonths(measurements), [measurements]);
  const filtered = useMemo(() => filterByPeriod(measurements, period), [measurements, period]);
  useEffect(() => {
    if (period !== 'all' && period !== 'last30' && !months.includes(period)) setPeriod('all');
  }, [months, period]);

  const save = (m: Measurement) => {
    const exists = measurements.some((x) => x.id === m.id);
    onChange(exists ? measurements.map((x) => (x.id === m.id ? m : x)) : [...measurements, m]);
    setEditing(null);
  };
  const remove = (id: string) => {
    onChange(measurements.filter((m) => m.id !== id));
    if (editing?.id === id) setEditing(null);
  };
  const label = periodLabel(period);

  return (
    <>
      <ModuleBar title="Vérnyomás" tab={tab} onTab={setTab} period={period} onPeriod={setPeriod} months={months} />
      {tab === 'log' ? (
        <div className="grid-log">
          <EntryForm key={editing?.id ?? 'new'} editing={editing} settings={settings} onSave={save} onCancel={() => setEditing(null)} />
          <MeasurementList title={label} measurements={filtered} settings={settings}
            onEdit={(m) => { setEditing(m); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            onDelete={remove} onGoToData={() => setTab('data')} />
        </div>
      ) : tab === 'stats' ? (
        <div className="stack">
          <StatsPanel title={label} measurements={filtered} settings={settings} />
          <BpChart measurements={filtered} settings={settings} />
        </div>
      ) : (
        <div className="stack">
          <ImportExport adapter={bpAdapter} items={measurements} filtered={filtered} periodLabel={label} onImport={onChange} />
          <SettingsPanel settings={settings} onChange={onSettings} count={measurements.length} onClearAll={() => onChange([])} />
        </div>
      )}
    </>
  );
}
