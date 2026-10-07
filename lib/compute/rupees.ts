import { RUPEES } from "@/lib/config";
import type { RiskHistory } from "@/lib/compute/risk";

// Turns risk fractions into rupees for an amount the user is thinking of
// investing. Negative values are losses. Formatting (₹1,28,450) happens elsewhere.

/** Rounds |x| to the nearest multiple of `step`, halves away from zero: 415 → 420, −415 → −420. Never returns −0. */
export function roundToNearest(x: number, step: number): number {
  if (!Number.isFinite(x)) throw new Error(`roundToNearest: x must be finite, got ${x}`);
  if (!Number.isFinite(step) || step <= 0) {
    throw new Error(`roundToNearest: step must be a positive number, got ${step}`);
  }
  const rounded = Math.sign(x) * Math.round(Math.abs(x) / step) * step;
  return rounded === 0 ? 0 : rounded;
}

export type RupeeRisk = {
  amount: number;
  typicalBadMonth: number | null;
  worstMonth: number | null;
  biggestFall: number;
};

export function rupeeRisk(
  amount: number,
  risk: Pick<RiskHistory, "typicalBadMonth" | "worstMonth" | "maxDrawdown">,
  roundTo: number = RUPEES.roundTo,
): RupeeRisk {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`rupeeRisk: amount must be a positive number, got ${amount}`);
  }
  const inRupees = (fraction: number) => roundToNearest(amount * fraction, roundTo);
  return {
    amount,
    typicalBadMonth: risk.typicalBadMonth === null ? null : inRupees(risk.typicalBadMonth),
    worstMonth: risk.worstMonth === null ? null : inRupees(risk.worstMonth.return),
    biggestFall: inRupees(risk.maxDrawdown.depth),
  };
}
