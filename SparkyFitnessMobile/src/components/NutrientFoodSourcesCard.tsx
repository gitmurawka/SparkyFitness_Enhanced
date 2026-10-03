import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ActivityIndicator } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { formatLocalizedNumber } from '../localization';
import type { NutrientFoodSourceBreakdown } from '../utils/nutrientFoodSources';

interface NutrientFoodSourcesCardProps {
  breakdown: NutrientFoodSourceBreakdown | null;
  isLoading: boolean;
  isError: boolean;
  nutrientLabel: string;
  unit: string;
  /** Whether the shares are of one day's total or a trend range's. */
  period?: 'day' | 'range';
}

const formatAmount = (value: number): string =>
  formatLocalizedNumber(value, {
    maximumFractionDigits: value < 10 ? 1 : 0,
  });

const formatPercent = (percent: number): string =>
  percent > 0 && percent < 1
    ? '<1'
    : formatLocalizedNumber(Math.round(percent));

interface SourceRowProps {
  name: string;
  detail?: string;
  amount: number;
  percent: number;
  unit: string;
  barColor: string;
}

const SourceRow: React.FC<SourceRowProps> = ({
  name,
  detail,
  amount,
  percent,
  unit,
  barColor,
}) => (
  <View className="py-2.5 border-b border-border-subtle">
    <View className="flex-row justify-between items-center mb-1 gap-3">
      <View className="flex-1">
        <Text
          className="text-text-primary text-sm font-medium"
          numberOfLines={1}
        >
          {name}
        </Text>
        {detail ? (
          <Text className="text-text-muted text-xs" numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
      <View className="items-end">
        <Text className="text-text-primary text-sm font-semibold">
          {formatPercent(percent)}%
        </Text>
        <Text className="text-text-muted text-xs">
          {formatAmount(amount)} {unit}
        </Text>
      </View>
    </View>
    <View className="h-1.5 rounded-full bg-progress-track overflow-hidden">
      <View
        className="h-full rounded-full"
        style={{
          backgroundColor: barColor,
          width: `${Math.max(0, Math.min(percent, 100))}%`,
        }}
      />
    </View>
  </View>
);

/**
 * Lists the foods that made up a nutrient's total over the selected trend
 * range, as a share of that total, with the long tail folded into "Other".
 */
const NutrientFoodSourcesCard: React.FC<NutrientFoodSourcesCardProps> = ({
  breakdown,
  isLoading,
  isError,
  nutrientLabel,
  unit,
  period = 'range',
}) => {
  const { t } = useTranslation();
  const [accentColor, mutedColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <View className="py-4 items-center">
        <ActivityIndicator color={accentColor} />
      </View>
    );
  } else if (isError) {
    body = (
      <Text className="text-text-secondary text-sm">
        {t('nutrientTrends.foodSources.loadFailed', {
          defaultValue: 'Failed to load food sources',
        })}
      </Text>
    );
  } else if (!breakdown || breakdown.sources.length === 0) {
    body = (
      <Text className="text-text-secondary text-sm">
        {period === 'day'
          ? t('nutrientTrends.foodSources.emptyDay', {
              defaultValue:
                'No logged foods contributed {{nutrient}} on this day.',
              nutrient: nutrientLabel,
            })
          : t('nutrientTrends.foodSources.empty', {
              defaultValue:
                'No logged foods contributed {{nutrient}} in this period.',
              nutrient: nutrientLabel,
            })}
      </Text>
    );
  } else {
    body = (
      <>
        {breakdown.sources.map((source) => (
          <SourceRow
            key={source.key}
            name={
              source.isSupplements
                ? t('nutrientTrends.foodSources.supplements', {
                    defaultValue: 'Supplements',
                  })
                : source.foodName ||
                  t('nutrientTrends.foodSources.unnamedFood', {
                    defaultValue: 'Unnamed food',
                  })
            }
            detail={source.brandName}
            amount={source.amount}
            percent={source.percent}
            unit={unit}
            barColor={accentColor}
          />
        ))}
        {breakdown.other ? (
          <SourceRow
            name={t('nutrientTrends.foodSources.other', {
              defaultValue: 'Other',
            })}
            detail={t('nutrientTrends.foodSources.otherCount', {
              defaultValue: '{{count}} more foods',
              defaultValue_one: '{{count}} more food',
              defaultValue_other: '{{count}} more foods',
              count: breakdown.other.foodCount,
            })}
            amount={breakdown.other.amount}
            percent={breakdown.other.percent}
            unit={unit}
            barColor={mutedColor}
          />
        ) : null}
      </>
    );
  }

  return (
    <View
      className="bg-surface rounded-xl p-4 mt-4 shadow-sm"
      testID="nutrient-food-sources"
    >
      <Text className="text-text-primary text-base font-bold">
        {t('nutrientTrends.foodSources.title', {
          defaultValue: 'Food Sources',
        })}
      </Text>
      <Text className="text-text-muted text-xs mt-0.5 mb-2">
        {period === 'day'
          ? t('nutrientTrends.foodSources.subtitleDay', {
              defaultValue: 'Share of total {{nutrient}} on this day',
              nutrient: nutrientLabel,
            })
          : t('nutrientTrends.foodSources.subtitle', {
              defaultValue: 'Share of total {{nutrient}} in this period',
              nutrient: nutrientLabel,
            })}
      </Text>
      {body}
    </View>
  );
};

export default NutrientFoodSourcesCard;
