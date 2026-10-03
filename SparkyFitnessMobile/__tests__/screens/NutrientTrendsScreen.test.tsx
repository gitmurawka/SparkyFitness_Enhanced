import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NutrientTrendsScreen from '../../src/screens/NutrientTrendsScreen';
import { useNutritionTrends } from '../../src/hooks/useNutritionTrends';
import { useNutrientFoodSources } from '../../src/hooks/useNutrientFoodSources';
import { useDailySummary } from '../../src/hooks/useDailySummary';
import { addDays, getTodayDate } from '../../src/utils/dateUtils';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'NutrientTrends'>;

jest.mock('../../src/hooks/useNutritionTrends', () => ({
  useNutritionTrends: jest.fn(),
}));

jest.mock('../../src/hooks/useNutrientFoodSources', () => ({
  useNutrientFoodSources: jest.fn(),
}));

jest.mock('../../src/hooks/useDailySummary', () => ({
  useDailySummary: jest.fn(),
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/components/NutrientBarChart', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="nutrient-bar-chart" />,
  };
});

const mockUseNutritionTrends = useNutritionTrends as jest.MockedFunction<
  typeof useNutritionTrends
>;
const mockUseNutrientFoodSources =
  useNutrientFoodSources as jest.MockedFunction<typeof useNutrientFoodSources>;

const mockUseDailySummary = useDailySummary as jest.MockedFunction<
  typeof useDailySummary
>;

const navigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
} as unknown as ScreenProps['navigation'];

const route = {
  key: 'NutrientTrends-1',
  name: 'NutrientTrends',
  params: { nutrientKey: 'sugars', nutrientLabel: 'Sugars', unit: 'g' },
} as unknown as ScreenProps['route'];

const trends = (sugars: number[]) =>
  ({
    data: sugars.map((value, index) => ({
      date: `2026-09-2${index}`,
      sugars: value,
    })),
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }) as unknown as ReturnType<typeof useNutritionTrends>;

const sugarSources = {
  breakdown: {
    total: 100,
    sources: [
      {
        key: 'food:grapefruit',
        foodName: 'Grapefruit',
        amount: 45,
        percent: 45,
      },
      {
        key: 'food:ketchup',
        foodName: 'Ketchup',
        brandName: 'Acme',
        amount: 15,
        percent: 15,
      },
    ],
    other: { amount: 40, percent: 40, foodCount: 6 },
  },
  isLoading: false,
  isError: false,
};

const renderScreen = (screenRoute: ScreenProps['route'] = route) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <NutrientTrendsScreen navigation={navigation} route={screenRoute} />
    </SafeAreaProvider>
  );

describe('NutrientTrendsScreen food sources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseDailySummary.mockReturnValue({
      summary: undefined,
    } as unknown as ReturnType<typeof useDailySummary>);
  });

  it('lists the foods the nutrient came from as shares of the total', () => {
    mockUseNutritionTrends.mockReturnValue(trends([60, 40]));
    mockUseNutrientFoodSources.mockReturnValue(sugarSources);

    renderScreen();

    expect(screen.getByText('Food Sources')).toBeTruthy();
    expect(screen.getByText('Grapefruit')).toBeTruthy();
    expect(screen.getByText('45%')).toBeTruthy();
    expect(screen.getByText('Ketchup')).toBeTruthy();
    expect(screen.getByText('Acme')).toBeTruthy();
    expect(screen.getByText('Other')).toBeTruthy();
    expect(screen.getByText('6 more foods')).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
  });

  it('follows the selected range', () => {
    mockUseNutritionTrends.mockReturnValue(trends([60, 40]));
    mockUseNutrientFoodSources.mockReturnValue(sugarSources);

    const today = getTodayDate();
    renderScreen();
    expect(mockUseNutrientFoodSources).toHaveBeenLastCalledWith({
      startDate: addDays(today, -6),
      endDate: today,
      nutrientKey: 'sugars',
      supplementAmount: 0,
    });
    // Without a date there is no day view to offer.
    expect(screen.queryByText('Today')).toBeNull();

    fireEvent.press(screen.getByText('90d'));
    expect(mockUseNutrientFoodSources).toHaveBeenLastCalledWith({
      startDate: addDays(today, -89),
      endDate: today,
      nutrientKey: 'sugars',
      supplementAmount: 0,
    });
  });

  it('shows no foods when the chart has nothing for the range', () => {
    mockUseNutritionTrends.mockReturnValue(trends([0, 0]));
    mockUseNutrientFoodSources.mockReturnValue(sugarSources);

    renderScreen();

    expect(screen.queryByText('Grapefruit')).toBeNull();
    expect(
      screen.getByText('No logged foods contributed Sugars in this period.')
    ).toBeTruthy();
  });

  it('reports a failed food sources load without hiding the chart', () => {
    mockUseNutritionTrends.mockReturnValue(trends([10]));
    mockUseNutrientFoodSources.mockReturnValue({
      breakdown: null,
      isLoading: false,
      isError: true,
    });

    renderScreen();

    expect(screen.getByTestId('nutrient-bar-chart')).toBeTruthy();
    expect(screen.getByText('Failed to load food sources')).toBeTruthy();
  });
});

describe('NutrientTrendsScreen day view', () => {
  const today = getTodayDate();
  const dayRoute = {
    key: 'NutrientTrends-2',
    name: 'NutrientTrends',
    params: {
      nutrientKey: 'protein',
      nutrientLabel: 'Protein',
      unit: 'g',
      goal: 150,
      date: today,
    },
  } as unknown as ScreenProps['route'];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNutritionTrends.mockReturnValue(trends([]));
    mockUseDailySummary.mockReturnValue({
      summary: {
        supplementTotals: { protein: 25, custom_nutrients: {} },
      },
    } as unknown as ReturnType<typeof useDailySummary>);
    mockUseNutrientFoodSources.mockReturnValue({
      breakdown: {
        total: 100,
        sources: [
          {
            key: 'food:chicken',
            foodName: 'Chicken',
            amount: 75,
            percent: 75,
          },
          {
            key: 'supplements',
            foodName: '',
            amount: 25,
            percent: 25,
            isSupplements: true,
          },
        ],
        other: null,
      },
      isLoading: false,
      isError: false,
    });
  });

  it('opens on the day breakdown, supplements included', () => {
    renderScreen(dayRoute);

    expect(mockUseNutrientFoodSources).toHaveBeenLastCalledWith({
      startDate: today,
      endDate: today,
      nutrientKey: 'protein',
      supplementAmount: 25,
    });
    expect(mockUseNutritionTrends).toHaveBeenLastCalledWith({
      range: '7d',
      enabled: false,
    });
    expect(screen.queryByTestId('nutrient-bar-chart')).toBeNull();
    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('100 g')).toBeTruthy();
    expect(screen.getByText('67% of goal')).toBeTruthy();
    expect(screen.getByText('Share of total Protein on this day')).toBeTruthy();
    expect(screen.getByText('Chicken')).toBeTruthy();
    expect(screen.getByText('Supplements')).toBeTruthy();
  });

  it('switches to the trend ranges from the day view', () => {
    renderScreen(dayRoute);

    fireEvent.press(screen.getByText('30d'));

    expect(mockUseNutritionTrends).toHaveBeenLastCalledWith({
      range: '30d',
      enabled: true,
    });
    expect(screen.getByTestId('nutrient-bar-chart')).toBeTruthy();
    expect(mockUseNutrientFoodSources).toHaveBeenLastCalledWith({
      startDate: addDays(today, -29),
      endDate: today,
      nutrientKey: 'protein',
      supplementAmount: 0,
    });
  });
});
