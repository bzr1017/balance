import { Preferences } from '@capacitor/preferences';
import { DEFAULT_SETTINGS, type MedicalDocument, type Measurement, type Settings } from './types';
import type { FootballEntry } from './football';

// A Capacitor Preferences weben localStorage-t, iOS-en UserDefaults-ot,
// Androidon SharedPreferences-t használ – ugyanaz a kód mindhárom platformon.
// A dokumentumok fájljai nem ide kerülnek (túl nagyok), csak a leíróik – lásd lib/docs.ts.
const KEYS = {
  measurements: 'balance.measurements.v1',
  settings: 'balance.settings.v1',
  documents: 'balance.documents.v1',
  football: 'balance.football.v1',
} as const;

async function getJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const { value } = await Preferences.get({ key });
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

const setJson = (key: string, value: unknown) => Preferences.set({ key, value: JSON.stringify(value) });
const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export const loadMeasurements = async () => asArray<Measurement>(await getJson(KEYS.measurements, []));
export const saveMeasurements = (ms: Measurement[]) => setJson(KEYS.measurements, ms);

export const loadSettings = async (): Promise<Settings> => ({ ...DEFAULT_SETTINGS, ...(await getJson(KEYS.settings, {})) });
export const saveSettings = (s: Settings) => setJson(KEYS.settings, s);

export const loadDocuments = async () => asArray<MedicalDocument>(await getJson(KEYS.documents, []));
export const saveDocuments = (docs: MedicalDocument[]) => setJson(KEYS.documents, docs);

export const loadFootball = async () => asArray<FootballEntry>(await getJson(KEYS.football, []));
export const saveFootball = (xs: FootballEntry[]) => setJson(KEYS.football, xs);
