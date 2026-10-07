// Additive split of a window move (see DECISIONS.md, "Move decomposition"):
// the whole market's move, what the sector did on top of the market, and what
// the stock did on top of its sector. The three parts sum to the stock's move.

export type MoveDecomposition = {
  /** The stock's own move, R_stock. */
  total: number;
  /** R_market. */
  market: number;
  /** R_sector − R_market. */
  sector: number;
  /** Company-specific part, R_stock − R_sector. */
  residual: number;
};

/** All inputs are window returns as fractions over the same window. */
export function decomposeMove(stock: number, sector: number, market: number): MoveDecomposition {
  return {
    total: stock,
    market,
    sector: sector - market,
    residual: stock - sector,
  };
}
