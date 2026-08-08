import { Decimal } from 'decimal.js';

const MoneyDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 40
});

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;

function decimal(value: string): Decimal {
  if (!DECIMAL_PATTERN.test(value)) {
    throw new TypeError(`Invalid decimal string: ${value}`);
  }

  return new MoneyDecimal(value);
}

function assertScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 8) {
    throw new RangeError('scale must be an integer between 0 and 8');
  }
}

export function normalizeMoney(value: string, scale = 2): string {
  assertScale(scale);
  return decimal(value).toDecimalPlaces(scale).toFixed(scale);
}

export function addMoney(values: readonly string[], scale = 2): string {
  assertScale(scale);
  const total = values.reduce(
    (sum, value) => sum.plus(decimal(value)),
    new MoneyDecimal(0)
  );
  return total.toDecimalPlaces(scale).toFixed(scale);
}

export function subtractMoney(
  minuend: string,
  subtrahend: string,
  scale = 2
): string {
  assertScale(scale);
  return decimal(minuend)
    .minus(decimal(subtrahend))
    .toDecimalPlaces(scale)
    .toFixed(scale);
}

export function calculateGrossMarginPercent(
  revenue: string,
  costOfGoodsSold: string,
  scale = 2
): string | null {
  assertScale(scale);
  const revenueValue = decimal(revenue);
  if (revenueValue.lte(0)) {
    return null;
  }

  return revenueValue
    .minus(decimal(costOfGoodsSold))
    .dividedBy(revenueValue)
    .times(100)
    .toDecimalPlaces(scale)
    .toFixed(scale);
}

export function calculateRunwayMonths(
  cashBalance: string,
  monthlyNetBurn: string,
  scale = 2
): string | null {
  assertScale(scale);
  const burn = decimal(monthlyNetBurn);
  if (burn.lte(0)) {
    return null;
  }

  return decimal(cashBalance)
    .dividedBy(burn)
    .toDecimalPlaces(scale)
    .toFixed(scale);
}
