import {
  FOOD_VARIANT_NUTRIENT_FIELDS,
  resolveSupplementTotals,
} from '@workspace/shared';
import type {
  FoodVariantNutrientField,
  SupplementTotals,
} from '@workspace/shared';
import type { FoodEntry } from '../types/foodEntries';

export interface NutrientFoodSource {
  key: string;
  foodName: string;
  brandName?: string;
  amount: number;
  /** Share of the range total, 0–100. */
  percent: number;
  /** The day's logged supplement doses rather than a food. */
  isSupplements?: boolean;
}

export interface NutrientFoodSourceBreakdown {
  total: number;
  sources: NutrientFoodSource[];
  /** Everything outside the top sources, or null when nothing is left over. */
  other: { amount: number; percent: number; foodCount: number } | null;
}

export interface NutrientFoodSourceOptions {
  /** Foods always listed by name before anything is folded into "Other". */
  minSources?: number;
  /** Keep listing foods by name until "Other" holds at most this share. */
  maxOtherPercent?: number;
  /**
   * The nutrient's supplement doses for the period, listed as their own source
   * so the shares add up to totals that count supplements (the daily summary).
   */
  supplementAmount?: number;
}

const DEFAULT_MIN_FOOD_SOURCES = 5;
const DEFAULT_MAX_OTHER_PERCENT = 10;

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

/**
 * The amount of one nutrient a day's logged supplement doses carried, from the
 * daily summary's supplement totals (fixed columns, or `custom_nutrients`).
 */
export function getSupplementNutrientAmount(
  totals: Partial<SupplementTotals> | null | undefined,
  nutrientKey: string
): number {
  const resolved = resolveSupplementTotals(totals);
  const value = isFixedNutrient(nutrientKey)
    ? resolved[nutrientKey]
    : resolved.custom_nutrients[nutrientKey];
  return toNumber(value);
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
 * into the foods it is made of. At least `minSources` foods are listed by name,
 * then more until the rest folded into `other` is at most `maxOtherPercent` of
 * the total; a single leftover food is shown by name instead of as "Other".
 */
export function computeNutrientFoodSources(
  entries: FoodEntry[],
  nutrientKey: string,
  {
    minSources = DEFAULT_MIN_FOOD_SOURCES,
    maxOtherPercent = DEFAULT_MAX_OTHER_PERCENT,
    supplementAmount = 0,
  }: NutrientFoodSourceOptions = {}
): NutrientFoodSourceBreakdown {
  const groups = new Map<
    string,
    {
      foodName: string;
      brandName?: string;
      amount: number;
      isSupplements?: boolean;
    }
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

  if (supplementAmount > 0) {
    groups.set('supplements', {
      foodName: '',
      amount: supplementAmount,
      isSupplements: true,
    });
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

  let visibleCount = Math.min(minSources, ranked.length);
  let restPercent = ranked
    .slice(visibleCount)
    .reduce((sum, source) => sum + source.percent, 0);
  // The small epsilon keeps float drift from the running subtraction from
  // pulling in one more food when the rest sits exactly on the limit.
  while (visibleCount < ranked.length && restPercent > maxOtherPercent + 1e-9) {
    restPercent -= ranked[visibleCount].percent;
    visibleCount += 1;
  }
  if (ranked.length - visibleCount === 1) visibleCount = ranked.length;

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
