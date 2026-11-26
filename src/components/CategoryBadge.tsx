import type { Category } from '../lib/stats';

export const CATEGORY_LABEL: Record<Category, string> = {
  ideal: 'Ideális',
  ok: 'Célon belül',
  high: 'Cél felett',
};

export function CategoryBadge({ category }: { category: Category }) {
  return <span className={`badge cat-${category}`}>{CATEGORY_LABEL[category]}</span>;
}
