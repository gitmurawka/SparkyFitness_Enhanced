import {
  computeNutrientFoodSources,
  getEntryNutrientAmount,
  getDayNutrientTotal,
  getSupplementNutrientAmount,
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

  it('lists foods by name until Other holds at most 10% of the total', () => {
    // 12 foods: two big ones, then ten at 4% each. The five minimum leave
    // 28% for Other, so it keeps listing until 8% (two foods) remain.
    const entries = [
      makeEntry({ food_id: 'a', food_name: 'A', protein: 30 }),
      makeEntry({ food_id: 'b', food_name: 'B', protein: 30 }),
      ...Array.from({ length: 10 }, (_, index) =>
        makeEntry({
          food_id: `small-${index}`,
          food_name: `Small ${String(index).padStart(2, '0')}`,
          protein: 4,
        })
      ),
    ];

    const result = computeNutrientFoodSources(entries, 'protein');

    expect(result.sources).toHaveLength(10);
    expect(result.other).toEqual({
      amount: 8,
      percent: 8,
      foodCount: 2,
    });
  });

  it('stops once Other sits exactly on the limit', () => {
    const entries = ['a', 'b', 'c', 'd', 'e'].map((id, index) =>
      makeEntry({
        food_id: id,
        food_name: id.toUpperCase(),
        fat: [50, 30, 10, 5, 5][index],
      })
    );

    const result = computeNutrientFoodSources(entries, 'fat', {
      minSources: 2,
    });

    expect(result.sources.map((s) => s.foodName)).toEqual(['A', 'B', 'C']);
    expect(result.other).toEqual({ amount: 10, percent: 10, foodCount: 2 });
  });

  it('honours a custom Other limit', () => {
    const entries = ['a', 'b', 'c', 'd'].map((id, index) =>
      makeEntry({
        food_id: id,
        food_name: id.toUpperCase(),
        fat: 40 - index * 10,
      })
    );

    const result = computeNutrientFoodSources(entries, 'fat', {
      minSources: 2,
      maxOtherPercent: 30,
    });

    expect(result.sources.map((s) => s.foodName)).toEqual(['A', 'B']);
    expect(result.other).toEqual({ amount: 30, percent: 30, foodCount: 2 });
  });

  it('shows a single leftover food by name instead of an Other row', () => {
    const entries = ['a', 'b', 'c'].map((id) =>
      makeEntry({ food_id: id, food_name: id, carbs: 10 })
    );

    const result = computeNutrientFoodSources(entries, 'carbs', {
      minSources: 2,
      maxOtherPercent: 50,
    });

    expect(result.sources).toHaveLength(3);
    expect(result.other).toBeNull();
  });

  it('lists supplement doses as their own source', () => {
    const entries = [
      makeEntry({ food_id: 'milk', food_name: 'Milk', calcium: 300 }),
    ];

    const result = computeNutrientFoodSources(entries, 'calcium', {
      supplementAmount: 500,
    });

    expect(result.total).toBe(800);
    expect(result.sources[0]).toMatchObject({
      key: 'supplements',
      isSupplements: true,
      amount: 500,
    });
    expect(result.sources[1]).toMatchObject({ foodName: 'Milk', amount: 300 });
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

describe('getSupplementNutrientAmount', () => {
  it('reads fixed and custom nutrients from supplement totals', () => {
    const totals = {
      protein: 25,
      custom_nutrients: { Magnesium: 200 },
    };
    expect(getSupplementNutrientAmount(totals, 'protein')).toBe(25);
    expect(getSupplementNutrientAmount(totals, 'Magnesium')).toBe(200);
  });

  it('treats absent totals as nothing', () => {
    expect(getSupplementNutrientAmount(undefined, 'protein')).toBe(0);
    expect(getSupplementNutrientAmount({}, 'Magnesium')).toBe(0);
  });
});

describe('getDayNutrientTotal', () => {
  it('adds supplement doses to the food entries', () => {
    const entries = [
      makeEntry({ sodium: 400, quantity: 200, serving_size: 100 }),
      makeEntry({ sodium: 100 }),
    ];
    expect(getDayNutrientTotal(entries, { sodium: 50 }, 'sodium')).toBe(950);
  });

  it('counts food alone when no supplements were logged', () => {
    const entries = [makeEntry({ sugars: 12 })];
    expect(getDayNutrientTotal(entries, undefined, 'sugars')).toBe(12);
  });
});
