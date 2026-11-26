/*
 * A PDF-motor (jsPDF + betűtípus) csak akkor töltődik le, amikor PDF exportra van szükség,
 * így nem lassítja az app indulását. A `preloadPdf()` már a PDF formátum kiválasztásakor
 * elkezdi a letöltést, hogy a megosztás menü (telefonon) gyorsan megnyíljon.
 */
import type { Measurement, Settings } from '../types';
import type { FootballEntry } from '../football';
import type { PdfOptions } from './options';

export { DEFAULT_PDF_OPTIONS, type PdfOptions } from './options';

const load = () => Promise.all([import('./report'), import('./bpReport'), import('./footballReport')]);

export function preloadPdf(): void {
  void load().then(([r]) => r.fetchFonts()).catch(() => { /* majd exportkor újrapróbáljuk */ });
}

export async function bpPdf(ms: Measurement[], settings: Settings, opts: PdfOptions, periodLabel: string): Promise<Uint8Array> {
  const [r, bp] = await load();
  return bp.buildBpPdf(ms, settings, opts, periodLabel, await r.fetchFonts());
}

export async function footballPdf(entries: FootballEntry[], opts: PdfOptions, periodLabel: string): Promise<Uint8Array> {
  const [r, , fb] = await load();
  return fb.buildFootballPdf(entries, opts, periodLabel, await r.fetchFonts());
}
