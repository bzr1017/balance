import { describe, expect, it } from 'vitest';
import {
  ageFromBirthDate, bmi, bmiCategory, buildWeightExport, changeOverDays, healthyWeightRange, mergeWeights,
  parseWeightImport, SAMPLE_WEIGHTS, summarizeWeights,
} from './weight';

const toBuf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe('testsúly', () => {
  it('BMI és kategória', () => {
    expect(bmi(80, 180)!.toFixed(1)).toBe('24.7');
    expect(bmiCategory(24.7).label).toBe('Normál');
    expect(bmiCategory(31).label).toBe('Elhízás');
    expect(healthyWeightRange(180)).toEqual([59.9, 80.7]);
  });
  it('életkor', () => {
    expect(ageFromBirthDate('1997-10-17', new Date(2026, 10, 8))).toBe(29);
    expect(ageFromBirthDate('1997-12-17', new Date(2026, 10, 8))).toBe(28);
    expect(ageFromBirthDate('rossz')).toBeNull();
  });
  it('összegzés és változás', () => {
    const s = summarizeWeights(SAMPLE_WEIGHTS);
    expect(s.change).toBe(-0.8);
    expect(s.last?.kg).toBe(81.6);
    expect(changeOverDays(SAMPLE_WEIGHTS, 2)).toBe(-0.7);
  });
  for (const fmt of ['csv', 'xlsx', 'xls'] as const) {
    it(`export / import oda-vissza: ${fmt}`, () => {
      const r = parseWeightImport(toBuf(buildWeightExport(SAMPLE_WEIGHTS, fmt)), `x.${fmt}`);
      expect(r.invalidRows).toBe(0);
      expect(r.items.map((w) => [w.takenAt, w.kg])).toEqual(SAMPLE_WEIGHTS.map((w) => [w.takenAt, w.kg]));
    });
  }
  it('CSV tizedesvesszővel', () => {
    const text = new TextDecoder().decode(buildWeightExport(SAMPLE_WEIGHTS, 'csv'));
    expect(text).toContain('Időpont;Testsúly (kg)');
    expect(text).toContain('2026.01.05. 07:00;82,4');
    const r = parseWeightImport(new TextEncoder().encode('Dátum,Weight\n2026-02-01 07:00,"80,5"\n2026-02-02 07:00,5000\n').buffer as ArrayBuffer, 'x.csv');
    expect(r.items).toHaveLength(1);
    expect(r.items[0].kg).toBe(80.5);
    expect(r.invalidRows).toBe(1);
  });
  it('duplikátumok', () => {
    expect(mergeWeights(SAMPLE_WEIGHTS, SAMPLE_WEIGHTS.map((w) => ({ ...w, id: w.id + 'x' }))).added).toBe(0);
  });
});
