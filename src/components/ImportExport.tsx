import { useRef, useState } from 'react';
import type { DataAdapter } from '../lib/io';
import { MIME, type ExportFormat, type ImportResult } from '../lib/table';
import { saveFile } from '../lib/files';

interface Props<T> {
  adapter: DataAdapter<T>;
  items: T[];
  filtered: T[];
  periodLabel: string;
  onImport: (next: T[]) => void;
}

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'xlsx', label: 'XLSX', hint: 'Excel 2007+' },
  { id: 'xls', label: 'XLS', hint: 'Régi Excel (97–2003)' },
  { id: 'csv', label: 'CSV', hint: 'Pontosvesszős, UTF-8' },
];

/** Közös import / export / minta felület – a modul a `DataAdapter`-rel adja meg a formátumot. */
export function ImportExport<T>({ adapter, items, filtered, periodLabel, onImport }: Props<T>) {
  const [format, setFormat] = useState<ExportFormat>('xlsx');
  const [scope, setScope] = useState<'all' | 'period'>('all');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{ name: string; result: ImportResult<T> } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasPeriod = filtered.length !== items.length;
  const toExport = scope === 'all' || !hasPeriod ? items : filtered;

  const download = async (data: T[], fmt: ExportFormat, name: string) => {
    setMessage(null);
    try {
      await saveFile(adapter.build(data, fmt), `${name}.${fmt}`, MIME[fmt]);
    } catch (e) {
      setMessage(`A fájl mentése nem sikerült: ${(e as Error).message}`);
    }
  };

  const doExport = async () => {
    setBusy(true);
    const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    await download(toExport, format, `${adapter.filePrefix}-${stamp}`);
    setBusy(false);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    try {
      setPending({ name: file.name, result: adapter.parse(await file.arrayBuffer(), file.name) });
    } catch (e) {
      setMessage(`A fájl nem olvasható: ${(e as Error).message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const preview = pending && adapter.merge(items, pending.result.items);

  const apply = (mode: 'merge' | 'replace') => {
    if (!pending || !preview) return;
    if (mode === 'merge') {
      onImport(preview.merged);
      setMessage(`${preview.added} ${adapter.noun} importálva${preview.duplicates ? `, ${preview.duplicates} már szerepelt` : ''}.`);
    } else {
      onImport(pending.result.items);
      setMessage(`Az adatok lecserélve: ${pending.result.items.length} ${adapter.noun}.`);
    }
    setPending(null);
  };

  const first = pending?.result.items[0];
  const last = pending?.result.items.at(-1);
  // (a sorrendet az adapter parse függvénye adja: időrend)
  const inputId = `import-${adapter.filePrefix}`;

  return (
    <>
      <section className="card">
        <div className="card-head"><h2>Exportálás</h2></div>
        <p className="muted">A fájl csak a táblázatot tartalmazza: {adapter.columnsText}.</p>

        <div className="choice-row" role="radiogroup" aria-label="Formátum">
          {FORMATS.map((f) => (
            <button key={f.id} role="radio" aria-checked={format === f.id}
              className={`choice ${format === f.id ? 'active' : ''}`} onClick={() => setFormat(f.id)}>
              <b>{f.label}</b><small>{f.hint}</small>
            </button>
          ))}
        </div>

        {hasPeriod && (
          <div className="segmented" role="group" aria-label="Tartomány">
            <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>Összes ({items.length})</button>
            <button className={scope === 'period' ? 'active' : ''} onClick={() => setScope('period')}>
              {periodLabel} ({filtered.length})
            </button>
          </div>
        )}

        <div className="actions">
          <button className="btn primary" disabled={busy || !toExport.length} onClick={doExport}>
            {busy ? 'Készül…' : `Exportálás ${format.toUpperCase()}-be`}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Importálás</h2></div>
        <p className="muted">
          CSV, XLSX vagy XLS. Minden munkalapot beolvas, a fejlécek alapján megkeresi a(z) {adapter.columnsText} oszlopokat.
          A már meglévő sorokat kihagyja.
        </p>
        <input ref={fileRef} type="file" id={inputId} className="sr-only"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => onFile(e.target.files?.[0])} />

        {!pending ? (
          <div className="actions">
            <label htmlFor={inputId} className="btn ghost">Fájl kiválasztása…</label>
          </div>
        ) : (
          <div className="import-preview">
            <p><b>{pending.name}</b></p>
            <ul>
              <li>{pending.result.items.length} érvényes {adapter.noun}{pending.result.sheets > 1 ? ` ${pending.result.sheets} munkalapról` : ''}</li>
              {first && last && <li>{adapter.dateLabel(first)} – {adapter.dateLabel(last)}</li>}
              {preview && preview.duplicates > 0 && <li>{preview.duplicates} már szerepel a naplóban (kihagyjuk)</li>}
              {pending.result.invalidRows > 0 && <li>{pending.result.invalidRows} hibás sor kihagyva</li>}
              {pending.result.warnings.map((w) => <li key={w} className="warn">{w}</li>)}
            </ul>
            <div className="actions">
              <button className="btn ghost" onClick={() => setPending(null)}>Mégse</button>
              {items.length > 0 && (
                <button className="btn ghost danger" disabled={!pending.result.items.length} onClick={() => apply('replace')}>
                  Meglévők cseréje
                </button>
              )}
              <button className="btn primary" disabled={!preview?.added} onClick={() => apply('merge')}>
                {preview?.added ?? 0} {adapter.noun} hozzáadása
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>Minta fájl</h2></div>
        <p className="muted">
          Nincs még saját táblázatod? Tölts le egy mintát, töltsd ki (egy sor = egy {adapter.noun}), majd importáld.{' '}
          {adapter.sampleHint}
        </p>
        <div className="choice-row">
          {FORMATS.map((f) => (
            <button key={f.id} className="choice" onClick={() => download(adapter.sample, f.id, `${adapter.filePrefix}-minta`)}>
              <b>Minta {f.label}</b><small>{f.hint}</small>
            </button>
          ))}
        </div>
      </section>

      {message && <p className="toast" role="status">{message}</p>}
    </>
  );
}
