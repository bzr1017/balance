export interface PdfOptions {
  summary: boolean;
  chart: boolean;
  table: boolean;
}

/** Alapból minden rész benne van a PDF-ben. */
export const DEFAULT_PDF_OPTIONS: PdfOptions = { summary: true, chart: true, table: true };
