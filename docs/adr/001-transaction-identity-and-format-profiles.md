# ADR-001: Transaction identity across sources, and format-agnostic import

**Status:** Proposed
**Date:** 2026-08-15
**Deciders:** Repository owner

---

## Context

Osh.it now reads two file formats: the bank's "פירוט עסקאות — כרטיסי אשראי" and CAL's
"פירוט עסקאות וזיכויים". These are not disjoint sources. **They describe the same purchases.**
A household holding a CAL-issued card can download the same August from either, and most
people eventually will — the bank file is what they started with, the CAL file is what carries
long history.

Two problems follow, and they are independent.

### Problem 1 — the same purchase gets two identities

Transaction identity is currently a hash over:

```
card | merchantKey | date | currency | amount | installmentNumber
```

`merchantKey` is derived from the merchant string. **That string is source-dependent.** The
bank truncates merchant names to 14 characters; CAL does not. So the same purchase hashes
differently depending on which file it arrived in.

This is not hypothetical. Replaying the live database (105 transactions, bank file) against
the CAL export for the same card:

| Measure | Value |
|---|---|
| Same purchase present in both sources | 72 of 73 |
| Deduplicates correctly today | 23 |
| **Double counts today** | **49 (68%)** |

```
2026-07-21  ₪378.81
  bank: "klook travel t"         key=klook travel t         id=textah7_5947
  cal : "Klook Travel Tech Ltd"  key=klook travel tech ltd  id=t1ld5d8x_6865

2026-07-28  ₪66.36
  bank: "אחים סרור - ב."          key=אחים סרור - ב.         id=t1v4i0p9_3710
  cal : "אחים סרור - ב.ה. בע״מ"   key=אחים סרור - ב.ה. בעמ   id=t96niac_3617
```

The 23 that do match are simply merchants whose bank name happened to fit in 14 characters.

There is a second, quieter gap: `source` is a single filename, overwritten on re-import. The
system cannot answer "where did this transaction come from?" or "was this seen in both files?"

### Problem 2 — every new format means editing the parser

`parseExcel.ts` now carries two hard-coded column maps, two header detectors, and
format-specific branching for dates, card identity, instalments and foreign currency. Adding
Isracard, Max, a different bank, or a changed export layout means editing that file again.
The logic is correct but the shape does not scale, and each edit risks the code path that
every shekel in the system flows through.

The stated wish is an "LLM Excel parser" that handles any format. That goal is right; the
literal implementation conflicts with a promise the project makes in its own README:

> There is no telemetry, no analytics, and no outbound call to any third-party service.

Sending 1,100 rows of someone's bank statement to a hosted model is precisely the thing the
project tells users it does not do. Any design here has to reconcile those.

### Forces

- **Money must be reproducible.** Importing the same file twice must produce identical totals.
- **Silent wrongness is the failure mode that matters.** Both a duplicate and a false merge
  produce a plausible number nobody notices.
- **Single maintainer, evenings.** Complexity has to pay for itself.
- **Privacy is the product's reason to exist**, not a feature.
- **There are no automated tests yet**, so changes to the money path carry real risk.

---

## Decision

Two changes, deliberately separable and independently shippable.

**A. Make identity source-independent, and record provenance as a set of sightings.**

Identity becomes the *financial fingerprint* — the facts every source agrees on:

```
cardLast4 | transactionDate | currency | amount(original for FX) | occurrenceIndex
```

Merchant name drops out of identity and becomes an attribute. `cardLast4` replaces the raw
card string (`"ויזה 9687"` → `"9687"`) so issuer-specific labelling cannot fragment identity.
`occurrenceIndex` — already implemented — distinguishes genuinely repeated identical rows and
is computed per file, so both sources arrive at the same sequence.

`source: string` becomes `sightings: Sighting[]`, appending rather than overwriting:

```ts
interface Sighting {
  file: string
  format: 'bank' | 'cal' | string   // profile id
  importedAt: string
}
```

Merchant names merge by preferring the longest observed variant, so `"klook travel t"` is
upgraded to `"Klook Travel Tech Ltd"` when the better source arrives — a side benefit that
removes manual aliasing work.

**B. Replace hard-coded parsers with declarative format profiles, and use an LLM to author a
profile — never to parse rows.**

A profile is data, not code:

```jsonc
{
  "id": "cal",
  "match": { "headerContains": ["שם בית עסק", "סכום בש\"ח"] },
  "columns": { "date": "תאריך עסקה", "merchant": "שם בית עסק", "amount": "סכום בש\"ח" },
  "cardIdentity": { "from": "titleRow", "pattern": "לכרטיס\\s+(.+)$" },
  "dateFormat": "d/m/yy",
  "derived": [
    { "field": "installmentTotal", "from": "הערות", "pattern": "עסקה ב-(\\d+) תשלומים" }
  ]
}
```

Built-in profiles for the bank and CAL ship in the repo. On an unrecognised file the app
offers to infer a profile: it sends **the header row and sheet title only — no transaction
rows, no amounts** — to a model, shows the proposed mapping for confirmation against a live
preview of the first rows parsed locally, and saves the approved profile. Runtime parsing is
always deterministic, from the profile alone. The feature is opt-in and absent unless a key
is configured.

---

## Options considered

### Problem 1 — identity

#### Option A1: Keep merchant in identity, normalise harder

Strip punctuation, fold case, fuzzy-match prefixes so `"klook travel t"` matches
`"Klook Travel Tech Ltd"`.

| Dimension | Assessment |
|---|---|
| Complexity | High — prefix matching against an unbounded name space |
| Correctness | Probabilistic; no threshold is right for every merchant |
| Determinism | Poor — identity depends on what else is in the dataset |
| Effort | Days |

**Pros:** Preserves merchant as a disambiguator.
**Cons:** A fuzzy identity function is the wrong tool for a primary key. Two different
merchants sharing a 14-character prefix would merge; the failure is silent and unbounded.

#### Option A2: Financial fingerprint, merchant as attribute *(chosen)*

| Dimension | Assessment |
|---|---|
| Complexity | Low — remove one field, normalise card, keep existing occurrence counter |
| Correctness | Measured: 0.10% ambiguity (1 group in 1,048) |
| Determinism | Total — depends only on the row itself |
| Effort | Hours |

**Pros:** Fixes 68% duplication. Simpler than what exists. Enables merchant-name upgrading.
**Cons:** Two different merchants, same card, same day, same amount, same currency merge. The
one real instance found is two Ethiopian Airlines tickets at ₪5,620.24 on one date — sequential
ticket numbers, almost certainly two passengers on one booking. The occurrence counter handles
this correctly *within* a source; it merges only if the two sources disagree on ordering.

#### Option A3: Composite — fingerprint match, merchant as tiebreak confirmation

Match on fingerprint; when a candidate pair disagrees on merchant beyond prefix compatibility,
surface it to the user instead of deciding.

| Dimension | Assessment |
|---|---|
| Complexity | Medium — needs a review queue and UI |
| Correctness | Highest |
| Effort | Days |

**Pros:** No silent merge, no silent duplicate.
**Cons:** Builds a conflict-resolution UI for an event that occurs 0.1% of the time. Worth
revisiting if the false-merge rate rises with more sources; not worth it now.

### Problem 2 — parser extensibility

#### Option B1: Status quo — a hand-written parser per format

| Dimension | Assessment |
|---|---|
| Complexity | Low per format, unbounded in aggregate |
| Privacy | Perfect |
| Determinism | Perfect |
| Cost | Zero |
| Extensibility | Requires the maintainer for every new issuer |

**Pros:** Nothing beats it on correctness or privacy.
**Cons:** Does not answer the question asked. Every new bank is a code change, a build and a
deploy, on the path all money flows through.

#### Option B2: Declarative profiles, hand-authored

Same as chosen, minus the LLM. Users write JSON.

| Dimension | Assessment |
|---|---|
| Complexity | Medium — one profile interpreter |
| Privacy | Perfect |
| Extensibility | Good for developers, poor for everyone else |

**Pros:** All the architectural benefit, none of the LLM risk. A contributed profile is a
reviewable pull request rather than a parser rewrite.
**Cons:** Writing a JSON profile still needs someone who can read a spreadsheet's structure.

#### Option B3: LLM parses every row

The literal reading of the request: hand the sheet to a model, get transactions back.

| Dimension | Assessment |
|---|---|
| Complexity | Low to build, high to trust |
| Privacy | **Breaks the project's core promise** |
| Determinism | **None** — same file, different totals |
| Cost | ~1,100 rows per import, every import |
| Latency | Seconds to minutes |
| Testability | Cannot pin expected output |

**Pros:** Handles any format with no format-specific work.
**Cons:** Financial totals that change between runs are not acceptable, and this is the one
option that contradicts the README in a way users would reasonably call a breach. Also the
most expensive per import, forever, for a problem that occurs once per format.

#### Option B4: LLM authors a profile from headers only *(chosen)*

| Dimension | Assessment |
|---|---|
| Complexity | Medium — interpreter, inference call, confirmation UI |
| Privacy | Preserved — headers only, opt-in, no transaction data |
| Determinism | Perfect at runtime; inference happens once |
| Cost | One small call per new format, then never again |
| Extensibility | A non-developer can onboard a new issuer |

**Pros:** Gets the stated goal — new formats without touching code — while keeping money
handling deterministic and testable. Failure mode is a bad *mapping*, caught immediately by
the preview, rather than bad *numbers* discovered months later.
**Cons:** More moving parts than B2. Requires the confirmation UI to be genuinely good, or
users will rubber-stamp a wrong mapping.

---

## Trade-off analysis

**On identity**, the decisive numbers are 68% versus 0.10%. Keeping merchant in the identity
protects against a rare ambiguity by guaranteeing a frequent duplication. Removing it inverts
that trade by nearly three orders of magnitude, *and* makes the code simpler. The residual
0.10% is not eliminated but is bounded, and the occurrence counter already covers its
realistic form.

The subtler point: identity should be built from facts the *issuer* asserts (which card, which
day, how much), not from a display string one source happens to truncate. Merchant name is
presentation. It was never a safe key.

**On parsing**, the real question is not "LLM or not" but *what the LLM is asked to produce*.
Asking it for transactions puts a non-deterministic component on the money path and sends
statements off the machine. Asking it for a column mapping puts it on the *configuration*
path, where non-determinism is harmless because a human confirms the result once and the
artefact is then fixed forever.

That reframing is what makes the feature compatible with the project's privacy promise. It
also collapses the cost model from per-import to per-format.

The honest cost is that B4 is strictly more work than B2, and B2 delivers most of the
architectural value. **B2 is the prerequisite for B4 and should ship first**; B4 is an
enhancement on top of a system that already works without it.

---

## Consequences

**Easier**
- Importing from any mix of sources without inflating totals.
- Answering "where did this come from" — and showing it in the import summary.
- Adding a format: contribute JSON, not a parser branch.
- Merchant names improve automatically when a better source arrives.
- The parser becomes testable — profiles are fixtures.

**Harder**
- Identity changes invalidate every stored transaction ID. Requires a one-time migration that
  recomputes IDs and merges resulting collisions, run against a backup.
- Two sources disagreeing on a transaction's amount (FX estimate versus final) now needs an
  explicit precedence rule rather than falling out of separate identities.
- The profile interpreter must cover what the current parsers do — derived fields from notes,
  title-row card identity, instalment spreading. If a format needs logic no profile can express,
  there must be an escape hatch to code.

**To revisit**
- If the false-merge rate rises above ~1% with more sources, implement A3's review queue.
- If profiles accumulate conditional logic, the declarative model is failing and a plugin
  interface is the honest replacement.
- Whether a locally-run model makes B4's privacy caveat moot entirely.

---

## Action items

1. [ ] **Back up the live database first** — this changes every transaction ID. No backup exists today.
2. [ ] Add a parser test fixture and golden-output test, using a synthetic sheet — never real statements in the repo.
3. [ ] Change identity to `cardLast4 | date | currency | amount | occurrenceIndex`; drop `merchantKey`.
4. [ ] Replace `source: string` with `sightings: Sighting[]`; append on re-import.
5. [ ] Write the migration: recompute IDs, merge collisions, union their sightings, keep the longest merchant name. Report what merged.
6. [ ] Surface provenance in the import summary — "48 already seen in CAL.xlsx".
7. [ ] Extract the two hard-coded formats into declarative profiles; make `parseExcel.ts` a profile interpreter (Option B2).
8. [ ] *Then* evaluate B4: header-only inference, confirmation UI with local preview, opt-in behind a configured key.

Items 1–6 address a live correctness bug and should not wait for 7–8.
