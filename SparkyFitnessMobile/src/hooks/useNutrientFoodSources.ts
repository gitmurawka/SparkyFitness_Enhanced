import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFoodEntriesRange } from '../services/api/foodEntriesApi';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { foodEntriesRangeQueryKey } from './queryKeys';
import { trendRangeBounds, type TrendRange } from '../utils/trendRange';
import { computeNutrientFoodSources } from '../utils/nutrientFoodSources';

interface UseNutrientFoodSourcesOptions {
  range: TrendRange;
  nutrientKey: string;
  enabled?: boolean;
}

/**
 * Ranks the foods a nutrient came from over a trend range, from the same diary
 * entries the nutrition trends are summed from.
 */
export function useNutrientFoodSources({
  range,
  nutrientKey,
  enabled = true,
}: UseNutrientFoodSourcesOptions) {
  const { startDate, endDate } = trendRangeBounds(range);

  const query = useQuery({
    queryKey: foodEntriesRangeQueryKey(startDate, endDate),
    queryFn: () => fetchFoodEntriesRange(startDate, endDate),
    enabled,
  });

  useRefetchOnFocus(query.refetch, enabled);

  const breakdown = useMemo(
    () =>
      query.data ? computeNutrientFoodSources(query.data, nutrientKey) : null,
    [query.data, nutrientKey]
  );

  return {
    breakdown,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
