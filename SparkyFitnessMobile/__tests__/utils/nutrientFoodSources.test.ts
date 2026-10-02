import {
  computeNutrientFoodSources,
  getEntryNutrientAmount,
} from '../../src/utils/nutrientFoodSources';
import type { FoodEntry } from '../../src/types/foodEntries';

let nextId = 0;
const makeEntry = (overrides: Partial<FoodEntry>): FoodEntry => ({
  id: `entry-${nextId++}`,
  meal_type: 'lunch',
  quantity: 100,
  unit: 'g',
  entry_date: '2024-06-15',
  serving_size: 100,
  calories: 0,
  ...overrides,
});

describe('getEntryNutrientAmount', () => {
  it('scales fixed nutrients by quantity / serving_size', () => {
    const entry = makeEntry({ protein: 20, quantity: 150, serving_size: 100 });
    expect(getEntryNutrientAmount(entry, 'protein')).toBeCloseTo(30);
  });

  it('reads custom nutrients and parses string values', () => {
    const entry = makeEntry({
      quantity: 50,
      serving_size: 100,
      custom_nutrients: { Omega3: '2.4' },
    });
    expect(getEntryNutrientAmount(entry, 'Omega3')).toBeCloseTo(1.2);
  });

  it('returns 0 for a missing serving size, value, or unknown nutrient', () => {
    expect(
      getEntryNutrientAmount(
        makeEntry({ protein: 20, serving_size: 0 }),
        'protein'
      )
    ).toBe(0);
    expect(getEntryNutrientAmount(makeEntry({}), 'sugars')).toBe(0);
    expect(getEntryNutrientAmount(makeEntry({}), 'Omega3')).toBe(0);
  });

  it('does not read non-nutrient entry fields as custom nutrients', () => {
    expect(getEntryNutrientAmount(makeEntry({}), 'quantity')).toBe(0);
  });
});

describe('computeNutrientFoodSources', () => {
  it('groups entries by food and ranks them by share of the total', () => {
    const entries = [
      makeEntry({ food_id: 'chicken', food_name: 'Chicken', protein: 30 }),
      makeEntry({ food_id: 'egg', food_name: 'Egg', protein: 12 }),
      makeEntry({ food_id: 'chicken', food_name: 'Chicken', protein: 15 }),
      makeEntry({ food_id: 'rice', food_name: 'Rice', protein: 3 }),
    ];

    const result = computeNutrientFoodSources(entries, 'protein');

    expect(result.total).toBeCloseTo(60);
    expect(result.other).toBeNull();
    expect(result.sources.map((s) => s.foodName)).toEqual([
      'Chicken',
      'Egg',
      'Rice',
    ]);
    expect(result.sources[0].amount).toBeCloseTo(45);
    expect(result.sources[0].percent).toBeCloseTo(75);
    expect(result.sources[1].percent).toBeCloseTo(20);
    expect(result.sources[2].percent).toBeCloseTo(5);
  });

  it('counts meal components as their individual foods', () => {
    const entries = [
      makeEntry({
        food_id: 'egg',
        food_name: 'Egg',
        food_entry_meal_id: 'meal-1',
        protein: 13,
      }),
      makeEntry({
        food_id: 'toast',
        food_name: 'Toast',
        food_entry_meal_id: 'meal-1',
        protein: 7,
      }),
      makeEntry({ food_id: 'egg', food_name: 'Egg', protein: 13 }),
    ];

    const result = computeNutrientFoodSources(entries, 'protein');

    expect(result.sources.map((s) => [s.foodName, s.amount])).toEqual([
      ['Egg', 26],
      ['Toast', 7],
    ]);
  });

  it('groups foods deleted from the library by name and brand', () => {
    const entries = [
      makeEntry({ food_name: 'Ketchup', brand_name: 'Acme', sugars: 20 }),
      makeEntry({ food_name: ' ketchup ', brand_name: 'acme', sugars: 10 }),
      makeEntry({ food_name: 'Ketchup', brand_name: 'Other', sugars: 5 }),
    ];

    const result = computeNutrientFoodSources(entries, 'sugars');

    expect(result.sources).toHaveLength(2);
    expect(result.sources[0]).toMatchObject({
      foodName: 'Ketchup',
      brandName: 'Acme',
      amount: 30,
    });
  });

  it('folds foods past the limit into Other', () => {
    const entries = ['a', 'b', 'c', 'd'].map((id, index) =>
      makeEntry({
        food_id: id,
        food_name: id.toUpperCase(),
        fat: 40 - index * 10,
      })
    );

    const result = computeNutrientFoodSources(entries, 'fat', 2);

    expect(result.sources.map((s) => s.foodName)).toEqual(['A', 'B']);
    expect(result.other).toEqual({
      amount: 30,
      percent: 30,
      foodCount: 2,
    });
  });

  it('shows a single leftover food by name instead of an Other row', () => {
    const entries = ['a', 'b', 'c'].map((id) =>
      makeEntry({ food_id: id, food_name: id, carbs: 10 })
    );

    const result = computeNutrientFoodSources(entries, 'carbs', 2);

    expect(result.sources).toHaveLength(3);
    expect(result.other).toBeNull();
  });

  it('ignores entries that contributed nothing', () => {
    const entries = [
      makeEntry({ food_id: 'water', food_name: 'Water', calories: 0 }),
      makeEntry({ food_id: 'apple', food_name: 'Apple', calories: 52 }),
    ];

    const result = computeNutrientFoodSources(entries, 'calories');

    expect(result.sources.map((s) => s.foodName)).toEqual(['Apple']);
    expect(result.sources[0].percent).toBe(100);
  });

  it('returns an empty breakdown when nothing contributed', () => {
    expect(
      computeNutrientFoodSources([makeEntry({ food_id: 'x' })], 'iron')
    ).toEqual({ total: 0, sources: [], other: null });
  });
});
