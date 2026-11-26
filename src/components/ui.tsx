import type { Period } from '../lib/types';
import { monthLabel } from '../lib/dates';

export function periodLabel(period: Period): string {
  if (period === 'all') return 'Összes mérés';
  if (period === 'last30') return 'Utolsó 30 nap';
  return monthLabel(period);
}

export function PeriodSelect({ period, onChange, months }: { period: Period; onChange: (p: Period) => void; months: string[] }) {
  return (
    <label className="period">
      <span className="sr-only">Időszak</span>
      <select value={period} onChange={(e) => onChange(e.target.value)}>
        <option value="all">Összes</option>
        <option value="last30">Utolsó 30 nap</option>
        {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
    </label>
  );
}

/** Mérleg logó (zöld négyzet, fehér mérleg) – ugyanaz, mint az app ikon. */
export function ScaleLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <rect width="64" height="64" rx="15" fill="var(--accent)" />
      <g fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 15v32M22 49h20M14 21h36M14 21 8.5 35M14 21l5.5 14M50 21l-5.5 14M50 21l5.5 14" />
      </g>
      <g fill="#fff">
        <circle cx="32" cy="14" r="3" />
        <path d="M6.5 35h15a7.5 6 0 0 1-15 0zM42.5 35h15a7.5 6 0 0 1-15 0z" />
      </g>
    </svg>
  );
}

export const ICONS = {
  log: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10zM5 12h3l2-3 3 6 2-3h4',
  stats: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  data: 'M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3',
  ball: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5l3.8 2.8-1.4 4.5H9.6l-1.4-4.5L12 7.5zM12 3v4.5M15.8 10.3l4.6-1.6M14.4 14.8l2.7 4.2M9.6 14.8l-2.7 4.2M8.2 10.3 3.6 8.7',
  docs: 'M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M9 13h6M9 17h6',
};

export function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
