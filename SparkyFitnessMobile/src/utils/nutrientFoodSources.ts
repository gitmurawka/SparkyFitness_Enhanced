import { FOOD_VARIANT_NUTRIENT_FIELDS } from '@workspace/shared';
import type { FoodVariantNutrientField } from '@workspace/shared';
import type { FoodEntry } from '../types/foodEntries';

export interface NutrientFoodSource {
  key: string;
  foodName: string;
  brandName?: string;
  amount: number;
  /** Share of the range total, 0–100. */
  percent: number;
}

export interface NutrientFoodSourceBreakdown {
  total: number;
  sources: NutrientFoodSource[];
  /** Everything outside the top sources, or null when nothing is left over. */
  other: { amount: number; percent: number; foodCount: number } | null;
}

export const DEFAULT_MAX_FOOD_SOURCES = 5;

const isFixedNutrient = (key: string): key is FoodVariantNutrientField =>
  (FOOD_VARIANT_NUTRIENT_FIELDS as readonly string[]).includes(key);

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/**
 * Amount of one nutrient a single diary entry contributed, scaled the same way
 * as the server's nutrition trends (`value * quantity / serving_size`), so the
 * per-food sums add up to the trend chart's totals. Keys outside the fixed
 * nutrient columns are read from `custom_nutrients`.
 */
export function getEntryNutrientAmount(
  entry: FoodEntry,
  nutrientKey: string
): number {
  const servingSize = toNumber(entry.serving_size);
  if (servingSize === 0) return 0;

  const rawValue = isFixedNutrient(nutrientKey)
    ? entry[nutrientKey]
    : entry.custom_nutrients?.[nutrientKey];

  return (toNumber(rawValue) * toNumber(entry.quantity)) / servingSize;
}

const sourceKey = (entry: FoodEntry): string => {
  if (entry.food_id) return `food:${entry.food_id}`;
  // Library deletes null out food_id but keep the snapshot name, so fall back
  // to grouping by what the diary shows.
  const name = (entry.food_name ?? '').trim().toLowerCase();
  const brand = (entry.brand_name ?? '').trim().toLowerCase();
  return `name:${name}|${brand}`;
};

/**
 * Groups diary entries by food and ranks how much each contributed to one
 * nutrient. Meal components are their own entries, so a logged meal is split
 * into the foods it is made of. Foods past `maxSources` are folded into
 * `other`, unless only one would be left, which is then shown by name.
 */
export function computeNutrientFoodSources(
  entries: FoodEntry[],
  nutrientKey: string,
  maxSources: number = DEFAULT_MAX_FOOD_SOURCES
): NutrientFoodSourceBreakdown {
  const groups = new Map<
    string,
    { foodName: string; brandName?: string; amount: number }
  >();

  for (const entry of entries) {
    const amount = getEntryNutrientAmount(entry, nutrientKey);
    if (amount <= 0) continue;

    const key = sourceKey(entry);
    const existing = groups.get(key);
    if (existing) {
      existing.amount += amount;
    } else {
      groups.set(key, {
        foodName: entry.food_name?.trim() || '',
        brandName: entry.brand_name?.trim() || undefined,
        amount,
      });
    }
  }

  const total = Array.from(groups.values()).reduce(
    (sum, group) => sum + group.amount,
    0
  );
  if (total <= 0) return { total: 0, sources: [], other: null };

  const ranked = Array.from(groups.entries())
    .map(([key, group]) => ({
      key,
      ...group,
      percent: (group.amount / total) * 100,
    }))
    .sort(
      (a, b) => b.amount - a.amount || a.foodName.localeCompare(b.foodName)
    );

  const visibleCount =
    ranked.length <= maxSources + 1 ? ranked.length : maxSources;
  const sources = ranked.slice(0, visibleCount);
  const rest = ranked.slice(visibleCount);

  if (rest.length === 0) return { total, sources, other: null };

  const otherAmount = rest.reduce((sum, source) => sum + source.amount, 0);
  return {
    total,
    sources,
    other: {
      amount: otherAmount,
      percent: (otherAmount / total) * 100,
      foodCount: rest.length,
    },
  };
}
