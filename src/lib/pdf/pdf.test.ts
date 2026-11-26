import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildBpPdf } from './bpReport';
import { buildFootballPdf } from './footballReport';
import { DEFAULT_PDF_OPTIONS, type FontData } from './report';
import { parseImport, SAMPLE_MEASUREMENTS } from '../io';
import { SAMPLE_FOOTBALL } from '../footballIo';
import { DEFAULT_SETTINGS } from '../types';

const fonts: FontData = {
  regular: readFileSync('public/fonts/DejaVuSans.ttf').toString('base64'),
  bold: readFileSync('public/fonts/DejaVuSans-Bold.ttf').toString('base64'),
};
const isPdf = (b: Uint8Array) => new TextDecoder().decode(b.slice(0, 5)) === '%PDF-';
const OUT = process.env.BALANCE_PDF_OUT;

describe('PDF riport', () => {
  it('vérnyomás – minden rész, üres és kikapcsolt opciókkal is', () => {
    expect(isPdf(buildBpPdf(SAMPLE_MEASUREMENTS, DEFAULT_SETTINGS, DEFAULT_PDF_OPTIONS, 'Összes mérés', fonts))).toBe(true);
    expect(isPdf(buildBpPdf([], DEFAULT_SETTINGS, DEFAULT_PDF_OPTIONS, 'Összes mérés', fonts))).toBe(true);
    expect(isPdf(buildBpPdf(SAMPLE_MEASUREMENTS, DEFAULT_SETTINGS, { summary: false, chart: false, table: true }, 'x', fonts))).toBe(true);
  });
  it('foci', () => {
    expect(isPdf(buildFootballPdf(SAMPLE_FOOTBALL, DEFAULT_PDF_OPTIONS, 'Összes', fonts))).toBe(true);
    expect(isPdf(buildFootballPdf([], DEFAULT_PDF_OPTIONS, 'Összes', fonts))).toBe(true);
  });
  it.skipIf(!OUT)('minta PDF-ek kiírása (BALANCE_PDF_OUT)', () => {
    const xl = process.env.BALANCE_SAMPLE_XLSX;
    const ms = xl && existsSync(xl) ? parseImport(readFileSync(xl).buffer as ArrayBuffer, 'v.xlsx').items : SAMPLE_MEASUREMENTS;
    writeFileSync(`${OUT}/vernyomas-osszes.pdf`, buildBpPdf(ms, DEFAULT_SETTINGS, DEFAULT_PDF_OPTIONS, 'Összes mérés', fonts));
    const jan = ms.filter((m) => m.takenAt.startsWith('2026-01'));
    writeFileSync(`${OUT}/vernyomas-januar.pdf`, buildBpPdf(jan, DEFAULT_SETTINGS, DEFAULT_PDF_OPTIONS, '2026. január', fonts));
    const fb = JSON.parse(readFileSync(`${OUT}/football.json`, 'utf8'));
    writeFileSync(`${OUT}/foci.pdf`, buildFootballPdf(fb, DEFAULT_PDF_OPTIONS, 'Összes', fonts));
  });
});
