import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import type { MedicalDocument } from './types';
import { downloadBlob, shareOnMobileWeb } from './files';

/**
 * Dokumentumfájlok tárolása.
 * - iOS / Android: az app saját, privát Data könyvtárában (docs/<id>) – az app törléséig megmarad.
 * - Web: a böngésző IndexedDB adatbázisában (Blob-ként) – a böngészőadatok törléséig megmarad.
 * A leírók (cím, dátum, típus…) a storage.ts-ben, Preferences-ben vannak.
 */

export const MAX_DOC_BYTES = 50 * 1024 * 1024;
export const DOC_ACCEPT = 'application/pdf,image/*,.pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.txt';

const isNative = () => Capacitor.isNativePlatform();
const nativePath = (id: string) => `docs/${id}`;

/* ---------------------------------------------------------------- IndexedDB (web) */

const DB_NAME = 'balance-docs';
const STORE = 'files';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('A művelet megszakadt (lehet, hogy betelt a tárhely).'));
    });
  } finally {
    db.close();
  }
}

/* ---------------------------------------------------------------- base64 segédek */

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',', 2)[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* ---------------------------------------------------------------- publikus API */

export async function saveDocFile(id: string, file: Blob): Promise<void> {
  if (isNative()) {
    await Filesystem.writeFile({ path: nativePath(id), data: await blobToBase64(file), directory: Directory.Data, recursive: true });
    return;
  }
  await idb('readwrite', (s) => s.put(file, id));
  // Kérjük a böngészőt, hogy tárhelyhiány esetén se törölje automatikusan az adatokat.
  try { await navigator.storage?.persist?.(); } catch { /* nem kötelező */ }
}

export async function loadDocFile(doc: MedicalDocument): Promise<Blob> {
  if (isNative()) {
    const { data } = await Filesystem.readFile({ path: nativePath(doc.id), directory: Directory.Data });
    return typeof data === 'string' ? base64ToBlob(data, doc.mime) : data;
  }
  const blob = await idb<Blob | undefined>('readonly', (s) => s.get(doc.id));
  if (!blob) throw new Error('A fájl nem található ezen az eszközön.');
  return blob;
}

export async function deleteDocFile(id: string): Promise<void> {
  if (isNative()) {
    try { await Filesystem.deleteFile({ path: nativePath(id), directory: Directory.Data }); } catch { /* már nincs meg */ }
    return;
  }
  await idb('readwrite', (s) => s.delete(id));
}

/**
 * Megnyitás / megosztás.
 * Web: új lapon (a böngésző PDF- és képnézőjével). Mobil: a rendszer megosztás menüje,
 * ahonnan megnyitható, a Fájlokba menthető vagy elküldhető (pl. az orvosnak).
 */
export async function openDoc(doc: MedicalDocument): Promise<void> {
  const blob = await loadDocFile(doc);
  if (isNative()) {
    const { uri } = await Filesystem.writeFile({
      path: safeFileName(doc.fileName),
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    });
    await Share.share({ title: doc.title, files: [uri] });
    return;
  }
  // Telefonon (böngésző vagy kezdőképernyős PWA) a megosztás menü a legkényelmesebb.
  if (await shareOnMobileWeb(blob, doc.fileName, doc.mime)) return;
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener');
  if (!w) {
    // felugró ablak tiltva → letöltés
    downloadBlob(blob, doc.fileName);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 120) || 'dokumentum';

export const isImage = (mime: string) => mime.startsWith('image/');
export const isPdf = (mime: string, name = '') => mime === 'application/pdf' || /\.pdf$/i.test(name);

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('hu-HU', { maximumFractionDigits: 1 })} MB`;
}

/** Fájlnévből javasolt cím: kiterjesztés és aláhúzások nélkül. */
export const titleFromFileName = (name: string) =>
  name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'Dokumentum';
