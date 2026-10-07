import { computeScenarioFacts } from "@/lib/compute/scenario";
import { scenarios } from "@/lib/data/load";
import { formatDate, formatPercent, formatRupees } from "@/lib/format";

// Phase 1 acceptance: prints each scenario's computed facts and attribution
// level, and exits non-zero if any level differs from data/scenarios.json.

const pct = (x: number | null) => (x === null ? "n/a" : formatPercent(x, { signed: true }));
let failures = 0;

for (const s of scenarios) {
  const f = computeScenarioFacts(s.id);
  const ok = f.attribution.level === s.expectedAttributionLevel;
  if (!ok) failures++;
  const w = f.window;
  const d = f.attribution.decomposition;
  const lines = [
    `${s.id} ${f.company.name} (SIM: ${f.company.ticker}) · ${s.title}`,
    `  as of ${formatDate(f.asOf)} · data status ${f.dataStatus.status} · window ${s.windowDays} sessions from ${formatDate(w.stock.from)}`,
    `  move: stock ${pct(w.stock.return)}${f.actionsInWindow.some((a) => a.shareMultiplier) ? ` (raw quoted ${pct(w.stockRaw.return)}; ${f.actionsInWindow.map((a) => `${a.type} ex ${formatDate(a.exDate)}`).join(", ")})` : ""} · ${f.sectorName} ${pct(w.sector.return)} · ${f.marketName} ${pct(w.market.return)}`,
    `  split: market ${pct(d.market)} + sector ${pct(d.sector)} + company-specific ${pct(d.residual)}`,
    `  attribution: ${f.attribution.level} (rule ${f.attribution.rule}${f.attribution.qualifyingNewsIds.length ? `; news ${f.attribution.qualifyingNewsIds.join(", ")}` : ""}) — expected ${s.expectedAttributionLevel} ${ok ? "✓" : "✗ MISMATCH"}`,
    `  periods: ${Object.entries(f.periods.stock).map(([k, v]) => `${k} ${pct(v)}`).join(" · ")}`,
    `  risk (${formatDate(f.risk.from)}–${formatDate(f.risk.to)}): vol ${formatPercent(f.risk.annualisedVol)} · max fall ${pct(f.risk.maxDrawdown.depth)} · worst month ${f.risk.worstMonth ? `${f.risk.worstMonth.month} ${pct(f.risk.worstMonth.return)}` : "n/a"} · typical bad month ${pct(f.risk.typicalBadMonth)} · 6-month windows with a 15% fall ${formatPercent(f.risk.rollingFalls.share, { decimals: 0 })}`,
    `  on ${formatRupees(f.rupees.amount)}: typical bad month ${f.rupees.typicalBadMonth === null ? "n/a" : formatRupees(f.rupees.typicalBadMonth)} · worst month ${f.rupees.worstMonth === null ? "n/a" : formatRupees(f.rupees.worstMonth)} · biggest fall ${formatRupees(f.rupees.biggestFall)}`,
    `  past spike weeks (≥10%): ${f.spikes.counted} with a following month, ${f.spikes.positive} positive${f.spikes.excludedRecent ? ` (${f.spikes.excludedRecent} too recent)` : ""}`,
    `  past falls ≥10%: ${f.drawdowns.length ? f.drawdowns.map((e) => `${pct(e.depth)} from ${formatDate(e.peakDate)} ${e.recoveredDate ? `recovered in ${e.sessionsTroughToRecovery} sessions from the low` : "not recovered yet"}`).join("; ") : "none"}`,
    `  valuation: P/E ${f.valuation.pe ?? "n/a"} vs sector median ${f.valuation.sectorMedianPe ?? "n/a"}`,
    `  news in pack: ${f.news.map((n) => `${n.id}${n.isStale ? " (stale)" : ""}${n.inWindow ? " [window]" : ""}`).join(", ") || "none"}`,
  ];
  console.log(lines.join("\n") + "\n");
}

console.log(failures === 0 ? `All ${scenarios.length} scenarios match their expected attribution level.` : `${failures} scenario(s) do not match.`);
process.exit(failures === 0 ? 0 : 1);
