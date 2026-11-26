import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { DOC_KINDS, type DocKind, type MedicalDocument } from '../lib/types';
import {
  DOC_ACCEPT, deleteDocFile, formatSize, isImage, isPdf, loadDocFile, MAX_DOC_BYTES, openDoc, saveDocFile, titleFromFileName,
} from '../lib/docs';
import { newId } from '../lib/table';
import { nowLocalIso } from '../lib/dates';
import { Capacitor } from '@capacitor/core';

// Az Android WebView nem jelenít meg PDF-et beágyazva – ott a rendszer PDF-nézőjével nyitjuk meg.
const canInlinePdf = Capacitor.getPlatform() !== 'android';

interface Props {
  docs: MedicalDocument[];
  onChange: (docs: MedicalDocument[]) => void;
}

const kindLabel = (k: DocKind) => DOC_KINDS.find((d) => d.id === k)?.label ?? 'Egyéb';
const today = () => nowLocalIso().slice(0, 10);
const fmtDate = (d: string) => (d ? `${d.replaceAll('-', '.')}.` : '–');

export const sortDocs = (docs: MedicalDocument[]) =>
  [...docs].sort((a, b) => b.date.localeCompare(a.date) || b.addedAt.localeCompare(a.addedAt));

export function Documents({ docs, onChange }: Props) {
  const [editing, setEditing] = useState<MedicalDocument | null>(null);
  const [kindFilter, setKindFilter] = useState<DocKind | 'all'>('all');
  const [query, setQuery] = useState('');
  const [viewing, setViewing] = useState<MedicalDocument | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortDocs(docs).filter((d) =>
      (kindFilter === 'all' || d.kind === kindFilter) &&
      (!q || `${d.title} ${d.note} ${d.fileName}`.toLowerCase().includes(q)));
  }, [docs, kindFilter, query]);

  const usedKinds = DOC_KINDS.filter((k) => docs.some((d) => d.kind === k.id));
  const totalSize = docs.reduce((a, d) => a + d.size, 0);

  const save = (doc: MedicalDocument) => {
    const exists = docs.some((d) => d.id === doc.id);
    onChange(exists ? docs.map((d) => (d.id === doc.id ? doc : d)) : [...docs, doc]);
    setEditing(null);
  };

  const remove = async (doc: MedicalDocument) => {
    await deleteDocFile(doc.id);
    onChange(docs.filter((d) => d.id !== doc.id));
    setConfirmId(null);
    if (viewing?.id === doc.id) setViewing(null);
  };

  const open = async (doc: MedicalDocument) => {
    setMessage(null);
    try { await openDoc(doc); } catch (e) { setMessage(`Nem sikerült megnyitni: ${(e as Error).message}`); }
  };

  return (
    <>
      <div className="grid-log">
        <UploadForm key={editing?.id ?? 'new'} editing={editing} onSave={save} onCancel={() => setEditing(null)} />

        <section className="card list">
          <div className="card-head">
            <h2>Dokumentumaim</h2>
            <span className="muted">{docs.length} db · {formatSize(totalSize)}</span>
          </div>

          {docs.length > 0 && (
            <div className="doc-filters">
              <input className="search" type="search" placeholder="Keresés címben, megjegyzésben…" value={query}
                onChange={(e) => setQuery(e.target.value)} />
              {usedKinds.length > 1 && (
                <div className="chip-row">
                  <button className={`chip ${kindFilter === 'all' ? 'active' : ''}`} onClick={() => setKindFilter('all')}>Mind</button>
                  {usedKinds.map((k) => (
                    <button key={k.id} className={`chip ${kindFilter === k.id ? 'active' : ''}`} onClick={() => setKindFilter(k.id)}>{k.label}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {!docs.length ? (
            <div className="empty">
              <p>Még nincs feltöltött dokumentum.</p>
              <p className="muted small">Leletek, 24 órás vérnyomásmérés eredménye, laborleletek, zárójelentések, receptek – PDF-ben vagy fotóként.</p>
            </div>
          ) : !visible.length ? (
            <p className="muted">Nincs a szűrésnek megfelelő dokumentum.</p>
          ) : (
            <ul className="doc-list">
              {visible.map((d) => (
                <li key={d.id} className="doc-row">
                  <button className="doc-main" onClick={() => setViewing(d)} aria-label={`${d.title} megtekintése`}>
                    <span className={`doc-icon ${isPdf(d.mime, d.fileName) ? 'pdf' : isImage(d.mime) ? 'img' : 'file'}`}>
                      {isPdf(d.mime, d.fileName) ? 'PDF' : isImage(d.mime) ? 'KÉP' : 'FÁJL'}
                    </span>
                    <span className="doc-text">
                      <b>{d.title}</b>
                      <small>{fmtDate(d.date)} · {kindLabel(d.kind)} · {formatSize(d.size)}</small>
                      {d.note && <small className="doc-note">{d.note}</small>}
                    </span>
                  </button>
                  <span className="row-actions">
                    {confirmId === d.id ? (
                      <>
                        <button className="link danger" onClick={() => remove(d)}>Törlés</button>
                        <button className="link" onClick={() => setConfirmId(null)}>Mégse</button>
                      </>
                    ) : (
                      <>
                        <button className="icon" aria-label="Megnyitás / megosztás" onClick={() => open(d)}>
                          <svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
                        </button>
                        <button className="icon" aria-label="Adatok szerkesztése" onClick={() => { setEditing(d); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                          <svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></svg>
                        </button>
                        <button className="icon" aria-label="Törlés" onClick={() => setConfirmId(d.id)}>
                          <svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" /></svg>
                        </button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {message && <p className="error">{message}</p>}
        </section>
      </div>

      {viewing && <Viewer doc={viewing} onClose={() => setViewing(null)} onOpen={() => open(viewing)} />}
    </>
  );
}

/* ---------------------------------------------------------------- feltöltés / szerkesztés */

function UploadForm({ editing, onSave, onCancel }: {
  editing: MedicalDocument | null; onSave: (d: MedicalDocument) => void; onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [date, setDate] = useState(editing?.date ?? today());
  const [kind, setKind] = useState<DocKind>(editing?.kind ?? 'lelet');
  const [note, setNote] = useState(editing?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (f.size > MAX_DOC_BYTES) { setError('A fájl túl nagy (legfeljebb 50 MB).'); return; }
    setFile(f);
    if (!title) setTitle(titleFromFileName(f.name));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing && !file) return setError('Válassz ki egy fájlt.');
    if (!title.trim()) return setError('Adj címet a dokumentumnak.');
    if (!date) return setError('Add meg a dokumentum dátumát.');
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        onSave({ ...editing, title: title.trim(), date, kind, note: note.trim() });
      } else if (file) {
        const id = newId();
        await saveDocFile(id, file);
        onSave({
          id, title: title.trim(), date, kind, note: note.trim(),
          fileName: file.name, mime: file.type || 'application/octet-stream', size: file.size, addedAt: nowLocalIso(),
        });
        setFile(null); setTitle(''); setNote(''); setDate(today());
        if (inputRef.current) inputRef.current.value = '';
        setSaved(true);
        setTimeout(() => setSaved(false), 1600);
      }
    } catch (err) {
      setError(`A mentés nem sikerült: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card entry" onSubmit={submit} noValidate>
      <div className="card-head"><h2>{editing ? 'Dokumentum adatai' : 'Új dokumentum'}</h2></div>

      {!editing && (
        <>
          <input ref={inputRef} id="doc-file" type="file" accept={DOC_ACCEPT} className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])} />
          <label htmlFor="doc-file" className={`dropzone ${file ? 'has-file' : ''}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
            {file ? (
              <>
                <b>{file.name}</b>
                <small>{formatSize(file.size)} · koppints a cseréhez</small>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>
                <b>Fájl kiválasztása vagy fotó készítése</b>
                <small>PDF vagy kép, legfeljebb 50 MB</small>
              </>
            )}
          </label>
        </>
      )}

      <div className="form-stack">
        <label className="field">
          <span>Cím</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="pl. Kardiológiai lelet" />
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Dátum</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Típus</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>
              {DOC_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Megjegyzés – nem kötelező</span>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="pl. Dr. Kovács, új gyógyszer beállítása" />
        </label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions">
        {editing && <button type="button" className="btn ghost" onClick={onCancel}>Mégse</button>}
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? 'Mentés…' : saved ? 'Feltöltve ✓' : editing ? 'Mentés' : 'Feltöltés'}
        </button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- előnézet */

function Viewer({ doc, onClose, onOpen }: { doc: MedicalDocument; onClose: () => void; onOpen: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let u: string | null = null;
    loadDocFile(doc)
      .then((blob) => { u = URL.createObjectURL(blob); setUrl(u); })
      .catch((e) => setError((e as Error).message));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { if (u) URL.revokeObjectURL(u); window.removeEventListener('keydown', onKey); };
  }, [doc, onClose]);

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={doc.title} onClick={onClose}>
      <div className="viewer-panel" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <b>{doc.title}</b>
            <small>{fmtDate(doc.date)} · {kindLabel(doc.kind)}</small>
          </div>
          <button className="btn ghost" onClick={onOpen} aria-label="Megnyitás / megosztás">
            <svg viewBox="0 0 24 24" className="ico" width="18" height="18"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
            <span className="hide-narrow">Megnyitás / megosztás</span>
          </button>
          <button className="icon" aria-label="Bezárás" onClick={onClose}>
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className="viewer-body">
          {error ? <p className="error">{error}</p>
            : !url ? <p className="muted">Betöltés…</p>
            : isImage(doc.mime) ? <img src={url} alt={doc.title} />
            : isPdf(doc.mime, doc.fileName) && canInlinePdf ? <iframe src={url} title={doc.title} />
            : (
              <div className="viewer-empty">
                <p className="muted">Ehhez a fájlhoz itt nincs előnézet.</p>
                <button className="btn primary" onClick={onOpen}>Megnyitás</button>
              </div>
            )}
        </div>
        {doc.note && <p className="viewer-note">{doc.note}</p>}
      </div>
    </div>
  );
}
