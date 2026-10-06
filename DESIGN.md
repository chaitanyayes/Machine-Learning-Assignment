# Before You Buy: design

The visual and interaction rules for the prototype. They follow §10 and §11 of the build brief. Engineering detail is in `PLAN.md`.

## The idea in one line

The app looks like an ordinary Indian brokerage until you open the Decision Brief. There the surface, the typeface and the shape of every sentence change, so you can tell you've stepped out of the market and into a decision.

---

## 1. Colour

There are six named colours. Everything else is a tint of Ink.

| Name | Hex | Used for | Contrast (text) |
|---|---|---|---|
| **Ink** | `#1C2024` | Body text, primary buttons, chart lines. Also the **Fact** treatment. | 16.4:1 on white · 14.6:1 on Paper |
| **Paper** | `#F4F2EC` | The Decision Brief surface only (the sheet, its sections, the self-check) | — |
| **Rise** | `#0B6E4F` | Up moves: the change figure only, always with ▲ and "+" | 6.3:1 on white · 5.6:1 on Paper |
| **Fall** | `#B3261E` | Down moves: the change figure only, always with ▼ and "−" | 6.5:1 on white · 5.8:1 on Paper |
| **Ochre** | `#8A5300` | The **Interpretation** treatment (rule, glyph, label) | 6.3:1 on white · 5.7:1 on Paper |
| **Slate** | `#4A5578` | The **Uncertain** treatment (rule, glyph, label, hatch) | 7.3:1 on white · 6.6:1 on Paper |

Neutrals are Ink tints, not new colours:
- Page background: white `#FFFFFF`.
- Secondary text: Ink at 72% (`#5C5E61`), 6.5:1 on white.
- Control borders and the sector bar: Ink at 55% (`#828487`), 3.75:1, which meets the 3:1 non-text minimum.
- Hairlines: Ink at 14%. These are decorative only.

I computed the ratios in Phase 0 with the WCAG 2.x formula. A Phase 7 test will re-check them from the token file.

Rules:
- **Colour never carries meaning alone.** Price direction is shown by sign, arrow and colour together. Claim type is shown by a text label, a glyph, a rule style and colour. Attribution level is a text badge with no colour code.
- **No red/green flood.** Rise and Fall colour only the change figures. They never fill cards, backgrounds, chart areas or buttons. The chart line is Ink in both directions.
- **The Buy button is Ink, not green.** Buying isn't the "positive" path.
- **Attribution badges aren't colour-coded.** "No clear reason found" isn't a bad grade, so it gets no red. All five levels use the same outline badge.
- **Light theme only for the prototype.** This is noted in `DECISIONS.md`.

## 2. Type

Both typefaces were checked in Phase 0 for the ₹ glyph (U+20B9) and tabular figures, and rendered at 390px.

| Role | Typeface | Why |
|---|---|---|
| Interface and numbers | **Anek Latin** (Ek Type, Mumbai) | Designed by an Indian foundry alongside its Indian-script families. It has a well-drawn ₹, tabular figures (`tnum`), and narrow, compact numerals that fit dense stock rows at 390px. It looks familiar enough for a brokerage without being Inter. |
| Decision Brief prose | **Literata** | A text serif designed for long reading on screens. It stays sturdy on low-end Android displays at 16px, and has true italics and a ₹. The change of typeface is part of the shift into the brief. |

Fallback: if Anek Latin's small cap height (0.64 em) reads poorly at 12–13px in Phase 3 screenshots, the interface face becomes **Figtree**, which also has ₹ and `tnum`. Both are loaded with `next/font/google`, so they're self-hosted with no layout shift.

Type scale, mobile first, at roughly a 1.2 ratio. All text is sentence case. Nothing is set in all caps and nothing in monospace.

| Token | Face | Size / line | Weight | Use |
|---|---|---|---|---|
| `price` | Anek | 32 / 36 | 600, tnum | Stock price |
| `title` | Anek | 22 / 28 | 600 | Company name, screen titles |
| `brief-h` | Literata | 19 / 26 | 600 | Brief section headings |
| `claim` | Literata | 16 / 23 | 400 (Interpretation: italic) | Claim text |
| `body` | Anek | 16 / 24 | 400 | Interface copy, answers |
| `ui` | Anek | 15 / 20 | 500 | Buttons, list rows, stat values (tnum) |
| `label` | Anek | 13 / 18 | 600 | Claim labels, badges, source chips |
| `caption` | Anek | 12 / 16 | 400 | Footer disclaimer, "Not a prediction" notes. Never below 12px. |

Numbers use Indian grouping (`₹1,28,450`), a true minus sign, and tabular figures wherever they line up in columns.

## 3. The signature: the certainty line

This is the one bold element, and it appears on every claim in the brief, in Ask answers and in the thesis check. Each claim has a left rule. **The line gets less solid as certainty drops.**

| | Fact | Interpretation | Uncertain |
|---|---|---|---|
| Text label | "Fact" | "Interpretation" | "Uncertain" |
| Glyph | Filled square ■ | Half-filled square ◧ | Dashed empty square ⬚ |
| Left rule | 3px **solid**, Ink | 3px **dashed**, Ochre | 3px **dotted**, Slate |
| Claim text | Literata roman | Literata *italic* (a reading, in a different voice) | Literata roman |
| Background | None | None | A faint 135° Slate hatch at 7% (Ink on the hatch is 13:1) |
| Sources | Chips, always present | Chips, always present | Chips only when sources conflict |

- **No colour needed.** In greyscale or for colour-blind readers, each type is still identified by its word, glyph, line style, italic and hatch. Colour is only a fourth cue.
- **Trustworthy, not playful.** There are no rounded pills, icons of faces or emoji, and no tinted bubbles. It's a ruled margin, like an annotated document.
- **A legend opens every brief**, in one line: "Facts come straight from a source. Interpretations are a reading of the facts and could be wrong. Uncertain means the data can't tell us." With `labels=off` in research mode, the label, glyph, rule and italic are all removed together, and the legend is hidden.
- **Source chips** follow the claim. They are outlined rectangles with a 4px radius and a border in Ink at 55%. Each chip names its source in plain words, such as "5-day return · computed", "Exchange filing · 22 Jul" or "Market Ledger · 18 Jul", and never shows an internal id. Tapping a chip opens the source sheet: source name, type, date, how many days old, and the summary. Stale items get a "From 20 Mar, 126 days old" line.

Phase 0 sketch, rendered at 390px with the real fonts: [`docs/design/claim-treatment-sketch.png`](docs/design/claim-treatment-sketch.png). One change was made after reviewing it (the striped sector bar; see §7, item 4). The Uncertain hatch stays faint at 7%: Ink on it is 13:1, and anything heavier would compete with the text.

## 4. Other components

- **Surfaces.** Stock pages are white, with information grouped by hairline dividers and spacing in the way brokerage lists usually are, not in cards. The brief, self-check and decide screens sit on Paper. Only one surface is raised at a time: the open sheet, with a 16px top radius and a single soft shadow. There are no shadowed card grids.
- **Buttons.** There are three styles:
  - Primary: filled Ink, white text, 6px radius, 48px tall.
  - Secondary: an Ink outline.
  - Text link: underlined.

  Labels say exactly what happens ("Continue to a quick check", "Skip to order", "Add to watchlist") and don't change wording through the flow. No arrows are added to labels.
- **Decide options.** "Buy", "Add to watchlist" and "Not now" are three identical full-width outline buttons, the same height and in a fixed order, and none is pre-selected. Choosing one reveals the reason box and a single primary "Confirm …" button.
- **Attribution badge.** An outline pill in Ink, 1.5px, with the level's words: Clear reason found / Partly explained / Mostly the whole market / Mostly the sector / No clear reason found. The headline sits underneath in `body`.
- **Move comparison** (the "What happened" visual):
  - Three horizontal bars from a zero line, each labelled in text: this stock, its sector, the whole market.
  - Fills differ by tone and style, not hue: this stock is solid Ink, the sector is Ink at 55%, and the market is an Ink outline.
  - Falls extend left of the zero line.
  - The value is printed at the end of each bar, and the window ("Past 5 trading days") sits under the bars.
- **Price chart.** A hand-rolled SVG with a 1.5px Ink line, no area fill and no gradient.
  - Ranges are 1W, 1M, 1Y and 3Y, as text tabs with an underline on the active one.
  - The period change is shown above the chart in Rise or Fall, with its sign and arrow.
  - When a corporate action falls in range, an "Adjusted for 1:1 bonus on 21 Jul" note appears below the chart.
  - Tapping shows a date and price readout. There is no live ticking.
- **Rupee risk panel.**
  - An amount field: prefilled with ₹5,000, numeric keyboard, Indian grouping.
  - Three rows, each with a label and a ₹ amount in Ink with a minus sign: a typical bad month, its worst month, its biggest fall in 3 years. These aren't coloured red; the words carry the meaning.
  - A caption on every row: "Based on the last 3 years. Not a prediction."
  - With `risk=percent`, the same rows show percentages.
- **Pause card.** Paper surface with an Ink rule on top, a heading "Worth a pause", body text, and two equal secondary buttons, "Continue anyway" and "Not now". There is no warning icon and no red.
- **Simulated markers.** "Fictional company · simulated data" appears as a `caption` line directly above every company name. The global footer reads: "Prototype. Simulated data as of 24 Jul 2026. Not investment advice. No real orders are placed."
- **Wordmark.** "Before you buy" in Literata 600, plain text. The About text in the footer says: "A product case study for Groww. Not an official Groww product." No Groww logo, colours or assets are used.
- **Focus.** A 2px Ink outline with a 2px white or Paper gap, using `:focus-visible` on every interactive element. It is over 3:1 against both surfaces.
- **Motion.** Movement happens only in response to the user: a sheet slides in over 200ms ease-out, a section expands over 150ms, and the self-check nudge fades in over 150ms. With `prefers-reduced-motion`, all of these change instantly. There's no confetti, nothing on Buy, and no animated numbers.
- **Touch targets** are at least 44×44px. Tap-to-explain stat labels (ⓘ) have padded hit areas.

---

## 5. Wireframes at 390px

### Stock page

```
┌──────────────────────────────────────────┐
│ ‹ Explore                Before you buy  │
├──────────────────────────────────────────┤
│ Fictional company · simulated data       │
│ Hindmark Bank                  ☆ Watch   │
│ SIM: HINDMARK · Private bank             │
│                                          │
│ ₹1,284.50                                │
│ ▲ +₹84.20 (+7.0%)  past week             │  ← only this line is coloured
│                                          │
│      ╱╲        ╱‾‾╲     ╱‾               │
│  ╱‾‾╯  ╲__╱‾‾╲╱    ╲__╱                  │  Ink line, no fill
│ ──────────────────────────────────────── │
│  1W    1M    1Y    3Y                    │  text tabs, underline = active
│  ‾‾                                      │
│                                          │
│ ┃ Before you buy                         │  Paper strip, Ink rule
│ ┃ (Clear reason found)                   │
│ ┃ Results came out in the same week      │
│ ┃ Read the brief                         │  text link
│                                          │
│ Key stats                                │
│ P/E ⓘ               18.4                 │
│ Sector median P/E ⓘ 21.0                 │
│ ROE ⓘ               16.2%                │
│ Debt/equity ⓘ       Not used for banks   │
│ Promoter holding ⓘ  41.0%                │
│ Promoter pledge ⓘ   0.0%                 │
│ 52-week range       ₹1,020 – ₹1,301      │
│ ──────────────────────────────────────── │
│ About                                    │
│ A mid-sized private bank focused on …    │
│ Prototype. Simulated data as of          │
│ 24 Jul 2026. Not investment advice.      │
│ No real orders are placed.  Reviewer     │
├──────────────────────────────────────────┤
│ [ Ask about this stock ] [     Buy     ] │  sticky; Buy = Ink fill
└──────────────────────────────────────────┘
```

### Decision Brief (sheet over the stock page, Paper surface)

```
┌──────────────────────────────────────────┐
│               ────                Close  │
│ Hindmark Bank           As of 24 Jul 2026│
│ ( Clear reason found )                   │
│ Results came out in the same week        │  headline ≤ 12 words
│ Facts come straight from a source.       │
│ Interpretations are a reading … could be │  legend
│ wrong. Uncertain means the data can't …  │
│                                          │
│ What happened                            │  Literata 19
│  This stock   ██████████████████  +7.0%  │
│  Bank stocks  ▓▓▓▓▓▓▓▓            +3.0%  │
│  Whole market ▭▭                  +0.8%  │
│  Past 5 trading days                     │
│ ┃ ■ Fact                                 │
│ ┃ Hindmark Bank rose 7.0% over 5 trading │
│ ┃ days, while bank stocks rose 3.0%.     │
│ ┃ [5-day return · computed] [Bank index] │
│ ╏ ◧ Interpretation                       │
│ ╏ About half the rise matches other …    │  italic
│ ╏ [Exchange filing · 22 Jul]             │
│ ┊ ⬚ Uncertain                    ░░░░░░  │  hatch
│ ┊ We can't tell how much of the move …   │
│                                          │
│ Where sources disagree                   │  only when conflicts exist
│                                          │
│ What it might mean                       │
│ ╏ ◧ Interpretation …                     │
│                                          │
│ What could go wrong                      │
│ ┃ ■ Fact  Promoter pledge is 0.0% …      │
│ ╏ ◧ Interpretation  Gains this fast …    │
│ ┌──────────────────────────────────────┐ │
│ │ If you put in   ₹ [ 5,000        ]   │ │
│ │ A typical bad month       −₹410      │ │
│ │ Its worst month           −₹1,050    │ │
│ │ Biggest fall in 3 years   −₹1,640    │ │
│ │ Based on the last 3 years.           │ │
│ │ Not a prediction.                    │ │
│ └──────────────────────────────────────┘ │
│                                          │
│ Before you decide, check                 │
│ ☐ The full results filing from 22 Jul    │
│   Why: one quarter can be unusual.       │
│ ☐ …                                      │
│                                          │
│ What we can't tell you                   │
│ · Whether the rise will last.            │
│ · …                                      │
│                                          │
│ Questions you could ask                  │
│ [ Why did it rise more than other banks? ]│
│ [ What does ROE mean here? ]             │
│ [ How much has it fallen before? ]       │
├──────────────────────────────────────────┤
│ [    Continue to a quick check    ]      │  sticky primary
│            Skip to order                 │  only when opened from Buy
└──────────────────────────────────────────┘
```

### Self-check (Paper surface, one scrolling page, every question skippable)

```
┌──────────────────────────────────────────┐
│ ‹ Back to the brief         Quick check  │
│ Three questions. Skip any of them.       │
│                                          │
│ 1. When might you need this money?       │
│ ( ) Within 6 months                      │
│ (•) 6 months to 2 years                  │
│ ( ) More than 2 years                    │
│ ( ) Not sure                             │
│                             Skip         │
│ ──────────────────────────────────────── │
│ 2. If this fell 25% next month, how      │
│    would that affect you?                │
│ ( ) I'd be fine                          │
│ ( ) It would hurt but I'd manage         │
│ (•) I'd need that money                  │
│ ( ) This is my emergency fund or         │
│     borrowed money                       │
│ ┌──────────────────────────────────────┐ │
│ │ Worth a pause                        │ │  appears after the answer
│ │ Money you may need soon is usually   │ │
│ │ kept somewhere that doesn't swing    │ │
│ │ 25% in a few months. This is common  │ │
│ │ guidance, not a rule for you.        │ │
│ │ [ Continue anyway ]  [ Not now ]     │ │
│ └──────────────────────────────────────┘ │
│ ──────────────────────────────────────── │
│ 3. What's the main reason you're looking │
│    at it?                                │
│ ( ) A friend or influencer mentioned it  │
│ (•) I saw it rising                      │
│ ( ) I've looked into the business        │
│ ( ) I believe in the sector long term    │
│ ( ) Other  [_______________________]     │
│ ┃ ■ Fact                                 │
│ ┃ After its 5 previous weeks with a rise │
│ ┃ of more than 10%, the next month was   │
│ ┃ positive 2 times.                      │
│ ┃ [Price history · computed]             │
│ A past move says little on its own.      │
├──────────────────────────────────────────┤
│ [        Continue to decide        ]     │
└──────────────────────────────────────────┘
```

### Decide (for completeness)

```
┌──────────────────────────────────────────┐
│ ‹ Quick check                   Decide   │
│ What would you like to do?               │
│ [            Buy                ]        │  three identical outline buttons
│ [       Add to watchlist        ]        │
│ [           Not now             ]        │
│                                          │
│ Your reason, in one line                 │  appears after a choice
│ [ I saw it rising                    ]   │  prefilled from Q3, editable
│ Not buying is a decision too. Your note  │  (Not now copy)
│ is saved in case you come back to it.    │
├──────────────────────────────────────────┤
│ [          Confirm not now          ]    │
└──────────────────────────────────────────┘
```

---

## 6. What makes this design specific to this brief

Most stock apps treat every sentence the same. Price, news, opinion and guesswork all appear in one font, at one weight, inside one card. This product's whole argument is that a first-time investor needs to see which kind of sentence they're reading, so the design puts its single bold idea there.

The certainty line turns where each claim comes from into its shape: solid for sourced facts, dashed and italic for readings that could be wrong, dotted and hatched for what nobody can know. A 23-year-old scrolling on a ₹12,000 Android phone can tell the three apart at a glance, even in greyscale.

Everything around the brief stays deliberately ordinary, with brokerage conventions they already know (price, arrow, range tabs, a key-stats table, Buy at the bottom). The step into the brief is marked by a real change of surface (white to paper) and typeface (Anek Latin to Literata), not by decoration.

Risk is told in the rupees of a first salary, with Indian digit grouping and a typeface from a Mumbai foundry that draws ₹ properly. The design also refuses the usual reward signals: Buy isn't green, "No clear reason found" isn't red, and three outcomes of equal weight make "Not now" look as legitimate as "Buy". That is the product principle, "the user decides", built into the layout.

---

## 7. Review against §11, and what I changed

I wrote a first draft and then checked it against the §11 list and against my own sense of default generated UI. Changed after review:

1. **Paper everywhere became Paper only on the brief.** My first draft used a warm off-white for the whole app. That's become a default "editorial" look, and it threw away the one meaningful thing the surface could signal. The stock page is now plain white like a brokerage, and Paper marks the decision moment.
2. **Key stats moved from a card grid to a ruled table.** Six identical rounded tiles with grey shadows is exactly the tell §11 names. They're now a two-column list with hairlines, which is also closer to brokerage conventions.
3. **Attribution badges lost their colours.** I had green for "Clear", amber for "Partly" and red for "No clear reason". That turns an honest "we don't know" into a failing grade and nudges people towards "clear" stocks. All five are now the same neutral outline.
4. **The striped sector bar became a solid tint.** In the rendered sketch the striped "Bank stocks" bar looked busy and slightly like a progress meter. It's now solid Ink at 55%, chosen because the 45% I tried first only reached 2.7:1 and failed the 3:1 non-text minimum. The market bar is an outline.
5. **Red risk figures became Ink.** I'd set rupee losses in Fall red. A panel of three red numbers is the "red flood" §11 warns against, and it reads as alarm rather than information. The minus sign and the words carry it.

Checked against the §11 list and kept out on purpose:

- **No eyebrows.** No small all-caps kickers sit over headings. Headings are sentence-case Literata, one level only.
- **No decorative arrows.** Buttons such as "Continue to a quick check" carry no trailing arrows. ▲ and ▼ appear only on price changes, where they carry meaning.
- **Buy isn't green.** The brokerage convention is a green Buy button, but here it's Ink. Sell isn't present, because the user doesn't hold the stock.
- **No monospace.** Tickers and stats use Anek Latin with tabular figures. Monospace appears only in the Reviewer panel's JSON viewer, where it's actually code.
- **No gradient washes, confetti or animated numbers** anywhere, including after Buy.

Still to check in Phase 3, with Playwright screenshots at 390px: Anek Latin at 12–13px, the italic Literata line length, the hatch on low-contrast screens, and whether the sticky footer plus disclaimer crowds the brief.
