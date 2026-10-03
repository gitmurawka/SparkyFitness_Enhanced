import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { getAppLocale, formatLocalizedNumber } from '../localization';
import { useNutritionTrends } from '../hooks/useNutritionTrends';
import { useNutrientFoodSources } from '../hooks/useNutrientFoodSources';
import { useDailySummary } from '../hooks/useDailySummary';
import {
  trendRangeBounds,
  trendRangeSegments,
  type TrendRange,
} from '../utils/trendRange';
import {
  addDays,
  formatDateLabel,
  formatShortDate,
  getTodayDate,
} from '../utils/dateUtils';
import { getSupplementNutrientAmount } from '../utils/nutrientFoodSources';
import type { Segment } from '../components/SegmentedControl';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import SegmentedControl from '../components/SegmentedControl';
import StatusView from '../components/StatusView';
import NutrientBarChart from '../components/NutrientBarChart';
import NutrientFoodSourcesCard from '../components/NutrientFoodSourcesCard';
import type { RootStackScreenProps } from '../types/navigation';

type NutrientTrendsScreenProps = RootStackScreenProps<'NutrientTrends'>;

/** A single day's breakdown, offered when the screen is opened for a date. */
type TrendView = 'day' | TrendRange;

const formatAmount = (value: number): string =>
  value % 1 !== 0
    ? formatLocalizedNumber(value, { maximumFractionDigits: 1 })
    : formatLocalizedNumber(value);

const NutrientTrendsScreen: React.FC<NutrientTrendsScreenProps> = ({
  route,
}) => {
  const { t } = useTranslation();
  const { nutrientKey, nutrientLabel, unit, goal, date } = route.params;
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [view, setView] = useState<TrendView>(date ? 'day' : '7d');
  const isDay = view === 'day' && !!date;
  const range: TrendRange = view === 'day' ? '7d' : view;

  const segments = useMemo<Segment<TrendView>[]>(() => {
    const rangeSegments = trendRangeSegments(t);
    if (!date) return rangeSegments;
    const today = getTodayDate();
    const dayLabel =
      date === today || date === addDays(today, -1)
        ? formatDateLabel(date, t, getAppLocale())
        : formatShortDate(date, getAppLocale());
    return [{ key: 'day', label: dayLabel }, ...rangeSegments];
  }, [date, t]);

  const header = useScreenHeader({
    title: t('nutrientTrends.title', {
      defaultValue: '{{nutrient}} Trends',
      nutrient: nutrientLabel,
    }),
    left: { kind: 'back' },
  });

  const { data, isLoading, isError } = useNutritionTrends({
    range,
    enabled: !isDay,
  });

  // A day's totals elsewhere in the app (Dashboard, Nutrition Details) count
  // logged supplement doses, so the day view lists them as their own source.
  // Reuses the daily summary those screens already cached for the date.
  const { summary: daySummary } = useDailySummary({
    date: date ?? getTodayDate(),
    enabled: isDay,
  });
  const supplementAmount = isDay
    ? getSupplementNutrientAmount(daySummary?.supplementTotals, nutrientKey)
    : 0;

  const bounds =
    isDay && date
      ? { startDate: date, endDate: date }
      : trendRangeBounds(range);
  const foodSources = useNutrientFoodSources({
    ...bounds,
    nutrientKey,
    supplementAmount,
  });

  // Map historical trend data to extract values for this specific nutrient
  const chartData = useMemo(() => {
    return data.map((item) => {
      const rawVal = item[nutrientKey];
      const val =
        typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal)) || 0;
      return {
        day: item.date,
        value: val,
      };
    });
  }, [data, nutrientKey]);

  // Compute stats
  const stats = useMemo(() => {
    if (chartData.length === 0) {
      return { average: 0, peak: 0, peakDay: '', sum: 0 };
    }

    const sum = chartData.reduce((acc, point) => acc + point.value, 0);
    const average = sum / chartData.length;

    let peak = 0;
    let peakDay = '';
    chartData.forEach((point) => {
      if (point.value > peak) {
        peak = point.value;
        peakDay = point.day;
      }
    });

    return { average, peak, peakDay, sum };
  }, [chartData]);

  const formattedPeakDay = useMemo(() => {
    if (!stats.peakDay) return '';
    const [year, month, d] = stats.peakDay.split('-').map(Number);
    const date = new Date(year, month - 1, d);
    return date.toLocaleDateString(getAppLocale(), {
      month: 'short',
      day: 'numeric',
    });
  }, [stats.peakDay]);

  if (isLoading) {
    return <StatusView loading className="bg-background" />;
  }

  if (isError) {
    return (
      <View className="flex-1 bg-background justify-center items-center p-4">
        <Text className="text-text-primary text-base font-semibold mb-2">
          {t('nutrientTrends.states.loadFailed', {
            defaultValue: 'Failed to load trend data',
          })}
        </Text>
        <Text className="text-text-secondary text-sm text-center">
          {t('common.connectionRetry', {
            defaultValue: 'Please check your connection and try again.',
          })}
        </Text>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Segmented Range Control */}
        <View className="mb-4">
          <SegmentedControl
            segments={segments}
            activeKey={view}
            onSelect={setView}
          />
        </View>

        {isDay ? (
          <View className="bg-surface rounded-xl p-4 shadow-sm">
            <View className="flex-row justify-between py-2 border-b border-border-subtle">
              <Text className="text-text-secondary text-sm">
                {t('nutrientTrends.labels.dayTotal', {
                  defaultValue: 'Total',
                })}
              </Text>
              <Text className="text-text-primary text-sm font-semibold">
                {/* A dash while loading, rather than a "0 g" that is not true. */}
                {foodSources.breakdown
                  ? `${formatAmount(foodSources.breakdown.total)} ${unit}`
                  : '–'}
              </Text>
            </View>
            {goal && goal > 0 ? (
              <>
                <View className="flex-row justify-between py-2 border-b border-border-subtle">
                  <Text className="text-text-secondary text-sm">
                    {t('nutrientTrends.labels.targetGoal', {
                      defaultValue: 'Target Daily Goal',
                    })}
                  </Text>
                  <Text className="text-text-primary text-sm font-semibold">
                    {formatLocalizedNumber(Math.round(goal))} {unit}
                  </Text>
                </View>
                <View className="flex-row justify-between py-2">
                  <Text className="text-text-secondary text-sm">
                    {t('nutrientTrends.labels.progress', {
                      defaultValue: 'Progress',
                    })}
                  </Text>
                  <Text className="text-text-primary text-sm font-semibold">
                    {t('nutrientTrends.labels.percentOfGoal', {
                      defaultValue: '{{percent}}% of goal',
                      percent: Math.round(
                        ((foodSources.breakdown?.total ?? 0) / goal) * 100
                      ),
                    })}
                  </Text>
                </View>
              </>
            ) : null}
          </View>
        ) : (
          <>
            {/* Nutrient Intake Chart */}
            <NutrientBarChart
              data={chartData}
              isLoading={isLoading}
              isError={isError}
              range={range}
              nutrientLabel={nutrientLabel}
              unit={unit}
              goal={goal}
            />

            {/* Statistics Summary Card */}
            <View className="bg-surface rounded-xl p-4 mt-4 shadow-sm">
              <Text className="text-text-primary text-base font-bold mb-3">
                {t('nutrientTrends.labels.summary', {
                  defaultValue: 'Summary Statistics',
                })}
              </Text>

              <View className="flex-row justify-between py-2 border-b border-border-subtle">
                <Text className="text-text-secondary text-sm">
                  {t('nutrientTrends.labels.dailyAverage', {
                    defaultValue: 'Daily Average',
                  })}
                </Text>
                <Text className="text-text-primary text-sm font-semibold">
                  {stats.average % 1 !== 0
                    ? formatLocalizedNumber(stats.average, {
                        maximumFractionDigits: 1,
                      })
                    : formatLocalizedNumber(stats.average)}{' '}
                  {unit}
                </Text>
              </View>

              <View className="flex-row justify-between py-2 border-b border-border-subtle">
                <Text className="text-text-secondary text-sm">
                  {t('nutrientTrends.labels.highestDay', {
                    defaultValue: 'Highest Intake Day',
                  })}
                </Text>
                <View className="items-end">
                  <Text className="text-text-primary text-sm font-semibold">
                    {stats.peak % 1 !== 0
                      ? formatLocalizedNumber(stats.peak, {
                          maximumFractionDigits: 1,
                        })
                      : formatLocalizedNumber(stats.peak)}{' '}
                    {unit}
                  </Text>
                  {formattedPeakDay ? (
                    <Text className="text-text-muted text-xs mt-0.5">
                      {formattedPeakDay}
                    </Text>
                  ) : null}
                </View>
              </View>

              {goal && goal > 0 ? (
                <>
                  <View className="flex-row justify-between py-2 border-b border-border-subtle">
                    <Text className="text-text-secondary text-sm">
                      {t('nutrientTrends.labels.targetGoal', {
                        defaultValue: 'Target Daily Goal',
                      })}
                    </Text>
                    <Text className="text-text-primary text-sm font-semibold">
                      {formatLocalizedNumber(Math.round(goal))} {unit}
                    </Text>
                  </View>

                  <View className="flex-row justify-between py-2">
                    <Text className="text-text-secondary text-sm">
                      {t('nutrientTrends.labels.averageVsTarget', {
                        defaultValue: 'Average vs. Target',
                      })}
                    </Text>
                    <Text className="text-text-primary text-sm font-semibold">
                      {t('nutrientTrends.labels.percentOfGoal', {
                        defaultValue: '{{percent}}% of goal',
                        percent: Math.round((stats.average / goal) * 100),
                      })}
                    </Text>
                  </View>
                </>
              ) : null}
            </View>
          </>
        )}

        {/* Foods this nutrient came from over the selected day or range */}
        <NutrientFoodSourcesCard
          // The chart only sums nutrients the trends report aggregates; when it
          // has nothing for this range, listing foods would contradict it.
          breakdown={isDay || stats.sum > 0 ? foodSources.breakdown : null}
          period={isDay ? 'day' : 'range'}
          isLoading={foodSources.isLoading}
          isError={foodSources.isError}
          nutrientLabel={nutrientLabel}
          unit={unit}
        />
      </ScrollView>
    </View>
  );
};

export default NutrientTrendsScreen;
