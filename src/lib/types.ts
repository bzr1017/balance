/** Egy vérnyomásmérés. A `takenAt` helyi idő, időzóna nélkül: "YYYY-MM-DDTHH:mm". */
export interface Measurement {
  id: string;
  takenAt: string;
  sys: number;
  dia: number;
  pulse: number | null;
}

export interface Settings {
  /** Cél / ideális érték – ezek a grafikon célvonalai (Excel: "Cél SYS", "Cél DIA"). */
  targetSys: number;
  targetDia: number;
  /** Felső határ (Excel: "Céltartomány < 135/85"). */
  limitSys: number;
  limitDia: number;
}

export const DEFAULT_SETTINGS: Settings = {
  targetSys: 130,
  targetDia: 80,
  limitSys: 135,
  limitDia: 85,
};

/** "all" | "last30" | "YYYY-MM" */
export type Period = string;

export type DocKind = 'lelet' | 'abpm' | 'labor' | 'ambulans' | 'zarojelentes' | 'recept' | 'egyeb';

export const DOC_KINDS: { id: DocKind; label: string }[] = [
  { id: 'lelet', label: 'Szakorvosi lelet' },
  { id: 'abpm', label: '24 órás vérnyomás (ABPM)' },
  { id: 'labor', label: 'Laboreredmény' },
  { id: 'ambulans', label: 'Ambuláns lap' },
  { id: 'zarojelentes', label: 'Zárójelentés' },
  { id: 'recept', label: 'Recept / gyógyszer' },
  { id: 'egyeb', label: 'Egyéb' },
];

/** Feltöltött orvosi dokumentum leírója. Maga a fájl külön tárolódik (lásd lib/docs.ts). */
export interface MedicalDocument {
  id: string;
  title: string;
  /** A dokumentum dátuma, "YYYY-MM-DD" */
  date: string;
  kind: DocKind;
  note: string;
  fileName: string;
  mime: string;
  size: number;
  addedAt: string;
}
