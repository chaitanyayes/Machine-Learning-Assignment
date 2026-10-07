import { FRESHNESS } from "@/lib/config";
import { daysBetween } from "./dates";

export type NewsAge = { ageDays: number; isStale: boolean };

/**
 * Calendar-day age of a news item relative to `asOf`. Stale when strictly
 * older than `staleAfterDays`, so an item exactly that old is still fresh.
 * Throws for news dated after `asOf`: future news must never reach a pack.
 */
export function newsAge(date: string, asOf: string, staleAfterDays: number = FRESHNESS.staleAfterDays): NewsAge {
  const ageDays = daysBetween(date, asOf);
  if (ageDays < 0) throw new Error(`News dated ${date} is after asOf ${asOf}`);
  return { ageDays, isStale: ageDays > staleAfterDays };
}
