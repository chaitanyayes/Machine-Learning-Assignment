# Decisions

One line per non-obvious choice: what was chosen and why. Entries marked *(Qn)* were open questions in `PLAN.md` §1. All of them were approved with the recommended option on 6 Oct 2026.

## Phase 0: planning

- **App location:** the repo root, next to the existing notebooks, so Vercel detects Next.js with zero config. The notebooks are excluded from tsconfig, ESLint and the Vercel upload. *(Q4, approved)*
- **Snapshot dates:** S01–S14 at T0 = 24 Jul 2026 (results season, so S01's results filing is realistic). S15 at T1 = 14 Aug 2026, three weeks later. This removes the S02/S15 contradiction and lets the thesis check quote a reason saved earlier. *(Q2, approved)*
- **Per-scenario `asOf`:** the compute layer always cuts every series at the scenario's `asOf`, so no screen can see "future" prices.
- **`scenarios.json` gets `windowDays`, `surface` and `holding`:** attribution needs an explicit window, the thesis-check scenario needs its holding (quantity, buy date, seeded reason), and each scenario carries its own `asOf` (S11 = 21 Jul because its feed is delayed; S15 = 14 Aug), so no separate override field is needed.
- **Name check:** every fictional name was web-searched. The only near match is Kirti Engineering vs Kriti Industries (NSE: KRITI, a different sector). The name is kept and the ticker is KIRTIENG. *(Q6, approved)*
- **Exchange label "SIM:"** instead of NSE/BSE, so no ticker reads as a real listing. I couldn't check the NSE symbol list because NSE's site is blocked from the build environment.
- **Move decomposition:** additive: market = R_m, sector = R_sector − R_m, residual = R_stock − R_sector. Beginners can follow it and it sums exactly. A regression beta would be noisier and harder to explain.
- **Attribution thresholds** (in config):
  - "Close to" means within max(1.5 pp, 25% of the move).
  - CLEAR needs a residual of at least 3 pp that is at least half the move.
  - Otherwise, with news, the level is PARTIAL.
- **Only fresh `company_event` news inside the window counts as a reason.** Routine notices, price commentary, macro news and stale items never do. This is what keeps S06, S08, S12 and S14 at UNCLEAR.
- **Conflicting company news caps the level at PARTIAL** (S05), since sources that disagree can't give a clear reason.
- **A moderate residual with no news counts as UNCLEAR.** The brief's table doesn't cover this case, and UNCLEAR is the conservative reading.
- **Corporate actions:** attribution, risk and charts use bonus/split-adjusted prices, and the raw move is kept for the explanation. Otherwise S10's halving would read as a crash.
- **Banks' debt/equity is `null` with a "Not usually used for banks" reason.** "Missing" and "not applicable" are different, and the UI should say which.
- **S11:** the status is `delayed` (3 trading days stale). "Check for an update" or `?feed=unavailable` switches it to `unavailable`, which skips the LLM call. *(Q7, approved)*
- **Prompt-injection text** is passed unchanged to the model (a real test) but masked in the UI source sheet with an explanation (§18: no buy instruction may reach the UI). *(Q5, approved)*
- **Structured output:** a "wire" schema without count limits is sent to the API, and counts are enforced by V1. Count violations then go through the single repair call instead of throwing inside the SDK.
- **No `temperature` on any call:** `claude-sonnet-5-5` rejects non-default sampling with a 400. The judge runs on the configured model with default sampling and medium effort; each report records its settings, and `--judge-repeats=N` measures agreement. `JUDGE_MODEL` can override the model. *(Q1, approved)*
- **Effort per call:** medium for briefs, repairs and the judge; low for the router and Ask answers. This keeps cost and latency down on a public link. Each is overridable in config.
- **Refusals and `max_tokens` stops are generation failures** and go to repair, then fallback. Server-side refusal fallbacks are on for live user-facing calls and off for eval runs, so scores reflect the configured model.
- **Prompts are bundled into serverless functions** with `outputFileTracingIncludes`, because they're read from `/prompts` at runtime and Vercel would otherwise omit them.
- **Rate limit:** an in-memory per-IP token bucket. It's a cost brake on a public link, not a guarantee across serverless instances (documented in the README).
- **Cached-mode Ask still runs the deterministic router**, so safety intents and glossary terms work on the public link without a key. *(Q8, approved)*
- **Intent precedence** when several apply: vulnerable money > advice > guarantee/prediction > speculative > out-of-universe > about the stock > explain a term > other. The most protective response wins.
- **Thesis check is deterministic (no LLM):** every line is a computed fact or fixed educational copy. It's the screen most likely to slide into "hold/sell" talk.
- **Self-check nudges are deterministic:** they are fixed copy plus computed spike history.
- **The research `arm=generic` paragraph is LLM-written but validated** (V3, V6, V8), so the comparison arm can't carry hallucinations or advice. It gets its own prompt file, `prompts/generic-explainer.md`.
- **Committed Ask outputs:** `data/answers/` holds suggested-question answers and `evals/cached-outputs/` holds eval queries, so `--mode=cached` grades real model output with no API calls.
- **Eval `Case` gets optional `variant` and `injectedOutput` fields:** S11's two states need `variant`, and EC16 (hallucinated events) needs bad-output fixtures.
- **"Run evals live" on the web runs a subset**, the router and safety cases without the judge, because a full run won't fit in one serverless request. Full runs use the CLI. *(Q9, approved)*
- **Numbers use Indian grouping** (`en-IN`, ₹1,28,450) and a true minus sign, matching Indian brokerage apps. V3 parses the same formats.
- **Fonts:** Anek Latin (interface and numbers) and Literata (brief prose). Both were checked for the ₹ glyph and tabular figures. Hanken Grotesk, Instrument Sans and Onest were rejected because they have no ₹.
- **Colour is never the only signal.** Claim types use label, glyph, rule style and italic; price direction uses sign and arrow.
- **Attribution badges are uncoloured:** "No clear reason found" is an honest answer, not a bad grade.
- **Buy is Ink, not green,** and the three Decide options are visually identical, so no outcome is styled as the "right" one.
- **Light theme only** in the prototype, to keep the scope tight. The tokens are structured so a dark theme could be added.
- **Wordmark "Before you buy"** in plain text, with "A product case study for Groww. Not an official Groww product." This avoids implying an official product or borrowing brand assets.
- **The friend's tip copy** ("Bro Brightpath is flying, get in before it's too late") is the one fixture with buy-pressure language. It's kept because the brief specifies it as the external trigger, and it's shown as a quoted message labelled "Simulated message".

## Phase 1: data and compute

- **Windows count trading sessions; the stock-page periods are calendar-based.** "Up 7% in 5 days" means 5 sessions, which is how the scenarios are phrased. The 1W, 1M and 1Y returns use calendar look-backs, which is how brokerage apps show them.
- **News counts as "inside the window" if dated after the window's base day and on or before `asOf`.** The base day's close already reflects that day's news.
- **Pack news:** company news from the last 180 days (stale items included and flagged, so the freshness rules get exercised), sector news from the last 30 days, and macro news only when it falls inside the window.
- **News tag vocabulary:** `company_event`, `routine`, `disclosure`, `clarification`, `price_commentary`, `macro`, `temporary_event`, `corporate_action`, `sector:<index>`, `conflict:<group>`, `injection_test`. A promoter pledge is a `disclosure` and an exchange-query reply is a `clarification`; neither explains a price rise, so neither counts toward attribution.
- **Fundamentals add `revenueTtmCr` and `marketCapCr`.** "Tiny revenue" (S12) can't be shown from growth rates alone. A test checks that P/E ≈ market cap ÷ (revenue × margin).
- **Price generator:** a seeded random walk on top of the parent index's moves (beta), pinned with Brownian bridges to anchor prices. Scenario windows are exact; half-yearly "shape" anchors keep 3-year histories plausible (bank drawdowns around 20–30%, not a random 57%).
- **Extra corporate actions:** Dhanvi Consumer gets a 5-for-1 split in Sep 2024, so 3-year risk numbers prove that split adjustment works. Two dividends prove dividends are left unadjusted.
- **Dividends are not price-adjusted** in this prototype. Only bonus issues and splits change the share count, so only they distort the quoted price.
- **Holiday calendar:** weekdays minus a list of major Indian market holidays, with 2026 festival dates approximate. The data is simulated; the list only needs to keep prices off obvious holidays.
- **Node 22+ and `@types/node` 22:** vitest 5's peer range requires them, and Vercel's default runtime is Node 22 or newer.

## Phase 2: brief pipeline

- **V3 checks values, not which fact they belong to.** A number passes if any pack value of the same kind (percent, rupee, plain count, date) matches it at the precision the text uses. "Rose 5%" therefore passes in S01 because the bank index's 1-month move is 4.8%. The faithfulness judge is what catches a real number attached to the wrong fact. The two checks are designed to work together.
- **Number kinds don't cross:** a percentage must match a percentage, a ₹ amount a ₹ amount (lakh/crore normalised), a count a count. "5 trading days" never grounds "5%".
- **V5 also applies to the headline**, with the INTERPRETATION standard (a causal word needs a hedge). The headline is the most visible sentence on the page, and the brief's V5 list didn't cover it.
- **Hedge list matches word forms** of the brief's list (appear/appears/appeared, possible/possibly, coincide/coincides/coincided/coinciding). This is the same list, not a looser one.
- **Causal connectors** add clear synonyms to the brief's list ("as a result of", "owing to", "triggered by", "fuelled by", "leading to", "causing"). This makes V5 stricter, not looser.
- **Wire schema enums aren't enforced by the API.** The SDK's zod helper turns enums into descriptions, so a bad claim type reaches our parser; V1 catches it and the repair call fixes it.
- **The raw (unadjusted) move appears only when a bonus or split is in the window.** Dividends don't move the quoted price mechanically, so "before adjusting for the dividend" would be misleading.
