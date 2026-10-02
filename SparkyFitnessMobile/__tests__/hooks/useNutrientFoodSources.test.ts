import { renderHook, waitFor } from '@testing-library/react-native';
import { useNutrientFoodSources } from '../../src/hooks/useNutrientFoodSources';
import { fetchFoodEntriesRange } from '../../src/services/api/foodEntriesApi';
import { getTodayDate, addDays } from '../../src/utils/dateUtils';
import type { FoodEntry } from '../../src/types/foodEntries';
import {
  createTestQueryClient,
  createQueryWrapper,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/foodEntriesApi', () => ({
  fetchFoodEntriesRange: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => {
    callback();
  }),
}));

const mockFetchFoodEntriesRange = fetchFoodEntriesRange as jest.MockedFunction<
  typeof fetchFoodEntriesRange
>;

const entry = (overrides: Partial<FoodEntry>): FoodEntry => ({
  id: String(Math.random()),
  meal_type: 'lunch',
  quantity: 100,
  unit: 'g',
  entry_date: getTodayDate(),
  serving_size: 100,
  calories: 0,
  ...overrides,
});

describe('useNutrientFoodSources', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
  });

  test('fetches the selected range and ranks foods for the nutrient', async () => {
    const today = getTodayDate();
    mockFetchFoodEntriesRange.mockResolvedValue([
      entry({ food_id: 'chicken', food_name: 'Chicken', protein: 45 }),
      entry({ food_id: 'egg', food_name: 'Egg', protein: 15, sugars: 1 }),
    ]);

    const { result } = renderHook(
      () => useNutrientFoodSources({ range: '30d', nutrientKey: 'protein' }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.breakdown).not.toBeNull());

    expect(mockFetchFoodEntriesRange).toHaveBeenCalledWith(
      addDays(today, -29),
      today
    );
    expect(
      result.current.breakdown?.sources.map((s) => [s.foodName, s.percent])
    ).toEqual([
      ['Chicken', 75],
      ['Egg', 25],
    ]);
  });

  test('reports an error when the range cannot be fetched', async () => {
    mockFetchFoodEntriesRange.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(
      () => useNutrientFoodSources({ range: '7d', nutrientKey: 'sugars' }),
      { wrapper: createQueryWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.breakdown).toBeNull();
  });
});
