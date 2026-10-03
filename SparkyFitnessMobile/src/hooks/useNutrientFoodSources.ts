import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFoodEntriesRange } from '../services/api/foodEntriesApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { foodEntriesRangeQueryKey } from './queryKeys';
import { computeNutrientFoodSources } from '../utils/nutrientFoodSources';

interface UseNutrientFoodSourcesOptions {
  /** Inclusive `YYYY-MM-DD` bounds; pass the same day twice for one day. */
  startDate: string;
  endDate: string;
  nutrientKey: string;
  /** Supplement doses for the period, listed as their own source. */
  supplementAmount?: number;
  enabled?: boolean;
}

/**
 * Ranks the foods a nutrient came from over a period, from the same diary
 * entries the nutrition trends and daily totals are summed from.
 */
export function useNutrientFoodSources({
  startDate,
  endDate,
  nutrientKey,
  supplementAmount,
  enabled = true,
}: UseNutrientFoodSourcesOptions) {
  const query = useQuery({
    queryKey: foodEntriesRangeQueryKey(startDate, endDate),
    queryFn: () => fetchFoodEntriesRange(startDate, endDate),
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  const breakdown = useMemo(
    () =>
      query.data
        ? computeNutrientFoodSources(query.data, nutrientKey, {
            supplementAmount,
          })
        : null,
    [query.data, nutrientKey, supplementAmount]
  );

  return {
    breakdown,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
