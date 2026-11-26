import { useRef, useState } from 'react';
import type { DataAdapter } from '../lib/io';
import { MIME, type ExportFormat, type ImportResult } from '../lib/table';
import { saveFile } from '../lib/files';
import { DEFAULT_PDF_OPTIONS, preloadPdf, type PdfOptions } from '../lib/pdf';

interface Props<T> {
  adapter: DataAdapter<T>;
  items: T[];
  filtered: T[];
  periodLabel: string;
  onImport: (next: T[]) => void;
  /** Ha meg van adva, PDF export is választható (összesítő, grafikon, táblázat). */
  buildPdf?: (items: T[], opts: PdfOptions, periodLabel: string) => Promise<Uint8Array>;
}

type OutFormat = ExportFormat | 'pdf';

const PDF_PARTS: { key: keyof PdfOptions; label: string }[] = [
  { key: 'summary', label: 'Összesítő' },
  { key: 'chart', label: 'Grafikon' },
  { key: 'table', label: 'Táblázat' },
];

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'xlsx', label: 'XLSX', hint: 'Excel 2007+' },
  { id: 'xls', label: 'XLS', hint: 'Régi Excel (97–2003)' },
  { id: 'csv', label: 'CSV', hint: 'Pontosvesszős, UTF-8' },
];

/** Közös import / export / minta felület – a modul a `DataAdapter`-rel adja meg a formátumot. */
export function ImportExport<T>({ adapter, items, filtered, periodLabel, onImport, buildPdf }: Props<T>) {
  const [format, setFormat] = useState<OutFormat>(buildPdf ? 'pdf' : 'xlsx');
  const [pdfOpts, setPdfOpts] = useState<PdfOptions>(DEFAULT_PDF_OPTIONS);
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
    setMessage(null);
    const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    try {
      if (format === 'pdf' && buildPdf) {
        const label = scope === 'all' || !hasPeriod ? 'Összes' : periodLabel;
        await saveFile(await buildPdf(toExport, pdfOpts, label), `${adapter.filePrefix}-${stamp}.pdf`, 'application/pdf');
      } else if (format !== 'pdf') {
        await download(toExport, format, `${adapter.filePrefix}-${stamp}`);
      }
    } catch (e) {
      setMessage(`Az exportálás nem sikerült: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const formats: { id: OutFormat; label: string; hint: string }[] = buildPdf
    ? [{ id: 'pdf', label: 'PDF', hint: 'Riport grafikonnal' }, ...FORMATS]
    : FORMATS;
  const pickFormat = (f: OutFormat) => {
    setFormat(f);
    if (f === 'pdf') preloadPdf();
  };
  const pdfEmpty = format === 'pdf' && !pdfOpts.summary && !pdfOpts.chart && !pdfOpts.table;

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
        <div className={`choice-row ${formats.length === 4 ? 'four' : ''}`} role="radiogroup" aria-label="Formátum">
          {formats.map((f) => (
            <button key={f.id} role="radio" aria-checked={format === f.id}
              className={`choice ${format === f.id ? 'active' : ''}`} onClick={() => pickFormat(f.id)}>
              <b>{f.label}</b><small>{f.hint}</small>
            </button>
          ))}
        </div>

        {format === 'pdf' ? (
          <div className="pdf-parts">
            <span className="muted">A PDF tartalma:</span>
            {PDF_PARTS.map((p) => (
              <label key={p.key} className="check">
                <input type="checkbox" checked={pdfOpts[p.key]} onChange={(e) => setPdfOpts({ ...pdfOpts, [p.key]: e.target.checked })} />
                {p.label}
              </label>
            ))}
          </div>
        ) : (
          <p className="muted">A fájl csak a táblázatot tartalmazza: {adapter.columnsText}.</p>
        )}

        {hasPeriod && (
          <div className="segmented" role="group" aria-label="Tartomány">
            <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>Összes ({items.length})</button>
            <button className={scope === 'period' ? 'active' : ''} onClick={() => setScope('period')}>
              {periodLabel} ({filtered.length})
            </button>
          </div>
        )}

        <div className="actions">
          <button className="btn primary" disabled={busy || !toExport.length || pdfEmpty} onClick={doExport}>
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
