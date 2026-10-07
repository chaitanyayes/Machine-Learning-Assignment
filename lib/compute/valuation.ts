// P/E against the sector median, as numbers only. This module never produces
// a label such as "cheap" or "expensive"; any wording is the UI's job.

export type ValuationContext = {
  pe: number | null;
  sectorMedianPe: number | null;
  /** pe − sectorMedianPe, in P/E points. */
  difference: number | null;
  /** pe ÷ sectorMedianPe (1.5 = 50% above the median). */
  ratio: number | null;
};

/**
 * Inputs are passed through unchanged (a loss-making company has `pe: null`).
 * The comparison is null when either input is null or the median is not positive.
 */
export function valuationContext(f: { pe: number | null; sectorMedianPe: number | null }): ValuationContext {
  const { pe, sectorMedianPe } = f;
  if (pe === null || sectorMedianPe === null || sectorMedianPe <= 0) {
    return { pe, sectorMedianPe, difference: null, ratio: null };
  }
  return { pe, sectorMedianPe, difference: pe - sectorMedianPe, ratio: pe / sectorMedianPe };
}
