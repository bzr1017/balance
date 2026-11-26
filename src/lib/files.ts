import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/**
 * Telefonos böngészőben / kezdőképernyőre tett PWA-ban a rendszer megosztás menüjét nyitja meg
 * (Fájlokba mentés, e-mail, AirDrop…). Asztali gépen nem használjuk – ott marad a letöltés.
 * @returns true, ha a megosztás megtörtént (vagy a felhasználó megszakította), false, ha nem elérhető.
 */
export async function shareOnMobileWeb(blob: Blob, fileName: string, mime: string): Promise<boolean> {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (!coarse || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  const file = new File([blob], fileName, { type: mime || blob.type || 'application/octet-stream' });
  if (!navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: fileName });
    return true;
  } catch (e) {
    // A felhasználó bezárta a menüt → kész. Bármi más (pl. lejárt felhasználói gesztus) → letöltésre esünk vissza.
    return (e as Error).name === 'AbortError';
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Fájl mentése/megosztása.
 * - iOS/Android app: ideiglenes fájl + rendszer megosztás menü.
 * - Telefonos böngésző / PWA: Web Share (megosztás menü), ha elérhető.
 * - Egyébként: letöltés.
 */
export async function saveFile(bytes: Uint8Array, fileName: string, mime: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: toBase64(bytes),
      directory: Directory.Cache,
    });
    await Share.share({ title: fileName, files: [uri] });
    return;
  }
  const blob = new Blob([bytes as BlobPart], { type: mime });
  if (await shareOnMobileWeb(blob, fileName, mime)) return;
  downloadBlob(blob, fileName);
}
