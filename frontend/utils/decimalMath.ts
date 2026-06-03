import { Decimal } from 'decimal.js';

/**
 * High-precision mathematical operations for the client interface to eliminate rounding drift.
 * Matches backend precision settings using decimal.js.
 */
export const decimalMath = {
  /**
   * Sums two decimal strings/numbers.
   */
  add: (a: string | number, b: string | number): string => {
    return new Decimal(a.toString()).add(new Decimal(b.toString())).toFixed(2);
  },

  /**
   * Subtracts b from a, clamped at a minimum of 0.
   */
  subtract: (a: string | number, b: string | number): string => {
    return Decimal.max(0, new Decimal(a.toString()).sub(new Decimal(b.toString()))).toFixed(2);
  },

  /**
   * Multiplies two decimal strings/numbers.
   */
  multiply: (a: string | number, b: string | number): string => {
    return new Decimal(a.toString()).mul(new Decimal(b.toString())).toFixed(2);
  },

  /**
   * Divides a by b, returning '0.00' if divisor is zero.
   */
  divide: (a: string | number, b: string | number): string => {
    const divisor = new Decimal(b.toString());
    if (divisor.isZero()) return '0.00';
    return new Decimal(a.toString()).div(divisor).toFixed(2);
  },

  /**
   * Calculates fractional tax exactly (retaining 4 decimal places to prevent truncation drift).
   */
  calculateTax: (subtotal: string | number, taxRate: string | number): string => {
    return new Decimal(subtotal.toString())
      .mul(new Decimal(taxRate.toString()))
      .toFixed(4);
  },

  /**
   * Standardizes high-precision decimal representation to currency layout format.
   */
  formatCurrency: (value: string | number | Decimal): string => {
    return new Decimal(value.toString()).toFixed(2);
  }
};
