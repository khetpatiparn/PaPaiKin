// Question1
export const FOOD_CATEGORIES = {
    SINGLE_DISH: "SINGLE_DISH",
    NOODLE: "NOODLE",
    SIDE_DISH: "SIDE_DISH",
    APPETIZER: "APPETIZER",
    BEVERAGE: "BEVERAGE",
    DESSERT: "DESSERT",
  } as const;

export type FoodCategory = typeof FOOD_CATEGORIES[keyof typeof FOOD_CATEGORIES];

// Question 2
export const INGREDIENTS = {
    PORK: "PORK",
    CHICKEN: "CHICKEN",
    BEEF: "BEEF",
    SEAFOOD: "SEAFOOD",
    VEGETARIAN: "VEGETARIAN",
  } as const;

export type Ingredients = typeof INGREDIENTS[keyof typeof INGREDIENTS];

// Question 3
export const COOKING_METHOD = {
    DRY: "DRY",
    SOUP: "SOUP",
  } as const;

export type CookingMethod = typeof COOKING_METHOD[keyof typeof COOKING_METHOD];

export interface ListAnswer {
  q1?: FoodCategory;
  q2?: Ingredients;
  q3?: CookingMethod;
}
