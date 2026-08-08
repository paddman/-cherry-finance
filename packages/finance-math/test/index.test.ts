import { describe, expect, it } from 'vitest';
import {
  addMoney,
  calculateGrossMarginPercent,
  calculateRunwayMonths,
  normalizeMoney,
  subtractMoney
} from '../src/index.js';

describe('finance math', () => {
  it('normalizes and adds money without floating-point drift', () => {
    expect(addMoney(['0.10', '0.20'])).toBe('0.30');
    expect(normalizeMoney('12.345')).toBe('12.35');
  });

  it('subtracts money deterministically', () => {
    expect(subtractMoney('1000.00', '275.25')).toBe('724.75');
  });

  it('calculates gross margin', () => {
    expect(calculateGrossMarginPercent('1000', '400')).toBe('60.00');
    expect(calculateGrossMarginPercent('0', '10')).toBeNull();
  });

  it('calculates runway and preserves unknown when burn is not positive', () => {
    expect(calculateRunwayMonths('600000', '100000')).toBe('6.00');
    expect(calculateRunwayMonths('600000', '0')).toBeNull();
  });

  it('rejects non-decimal input instead of guessing', () => {
    expect(() => addMoney(['1,000.00'])).toThrow(TypeError);
  });
});
