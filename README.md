# 🪙 Osh.it

> **Osh-it.** The exact syllable that escapes you when you open the statement at the end of the month.

A self-hosted household expense tracker for **Israeli households**, in Hebrew and English.
It answers three questions:

**What are we paying for? How much of it is genuinely unavoidable? And where can we cut?**

You feed it the Excel file your bank or credit-card issuer already lets you download.
There is no hosted service and no account with us — you run the container, and the data
stays on your machine.

---

## Why "for Israeli households"

This is not a generic budgeting app with a Hebrew skin. The parts that took the most work
are specific to how money moves in Israel, and they are the reason the numbers come out right:

- **Israeli utilities bill every two months.** Electricity, water and city tax (arnona)
  arrive on a bi-monthly cycle, which wrecks month-to-month comparison — the month with the
  bill looks like an overspend, the next like a windfall. Mark a merchant's frequency once
  and Osh.it shows the true monthly cost and predicts the next charge.
- **Bank merchant names are truncated to 14 characters.** `מרכבה a45 (חצי` tells you nothing.
  Give it a name you recognise once, and it replaces the truncated one everywhere — every
  month, and every file you import later.
- **Instalments (תשלומים).** Israeli cards split purchases across months. Osh.it tracks what
  you have already committed to but not yet paid.
- **Money that never touches the card.** Cash, a bank standing order, a cheque, or the
  transfer to your mother who pays the electricity. There is a "paid via" field for exactly this.
- **Shekels, Hebrew dates, RTL layout** throughout — with an English interface available.

If you bank outside Israel, the import step will not work for you as-is. The parser targets
specific Hebrew column headers. Everything downstream is generic, so a new parser is the
main thing a different country would need.

---

## Supported files

Two formats, detected automatically from the file contents rather than the filename:

| Source | File | Notes |
|---|---|---|
| **Your bank** | "פירוט עסקאות — כרטיסי אשראי" | Several tables in one sheet, one month at a time |
| **CAL (כאל)** | "פירוט עסקאות וזיכויים" | **Long history in one download** — often a year or more |

The CAL export is the fastest way to get started: a single file can carry 1,000+ transactions
across 20 months, which is what makes trends, averages and recurring-charge detection actually
meaningful.

**Each card has its own file.** If you and your partner each hold a card, download one file
per cardholder and drag both in — the card identity is read from the file header, so they
stay distinct and never merge.

Re-importing the same period later is safe. Osh.it compares against what it already has and
reports exactly what happened: how many transactions were **added**, how many were **updated**
(a foreign-currency purchase that finally received its final shekel amount), and how many were
already there and unchanged. Nothing is duplicated, and your notes, references and goal links
survive.

---

## The core idea: necessity

Every transaction lands in a category, and every category carries a necessity level:

- **Essential** — rent, bills, insurance, health, basic food. You do not cut here.
- **Semi-essential** — fuel, parking, everyday shopping. Needed, but it can be made cheaper.
- **Discretionary** — restaurants, subscriptions, going out. This is where real saving lives.

Savings suggestions never touch anything marked essential. The automatic classification will
not always get it right — **changing it applies to every transaction from that merchant,
including future imports**, so you fix each merchant exactly once.

---

## What's in the app

| Tab | What it answers |
|---|---|
| **Overview** | Monthly total, breakdown by category and merchant, trend across months, and the essential/semi/discretionary split. Enter income and you also get what's left at month end and your savings rate |
| **Income & goals** | Recurring and one-off income, big expenses coming up with the required monthly set-aside, and planned changes to recurring costs |
| **Budgets** | A monthly ceiling per category with a usage bar and overspend warnings |
| **Recurring** | Subscriptions and standing orders detected automatically, the annual cost of each, and open instalments that keep charging you |
| **Where to save** | Concrete suggestions with the monthly and yearly saving attached |
| **Transactions** | Everything, with search and filters, reclassification, manual payments, and per-merchant billing frequency |
| **Merchants** | Every merchant in one place — give each a name you recognise, fix its category and necessity |
| **Categories** | Fully editable per household: name, emoji, colour, necessity, order, keywords |
| **Import** | Drag files, export a backup, delete data |

---

## Language

The interface ships in **Hebrew (default, RTL)** and **English (LTR)**. Switch from the menu
under **Language**; the choice is stored per browser and flips the entire layout direction.

Two things deliberately stay in Hebrew regardless of interface language, because they are
your data rather than the app's text: **category names** (which you can rename freely) and
**merchant names** (which come from the bank).

---

## Accounts and sharing

The first visit to a fresh server creates the first account, and that account owns the data.
**Registration then closes permanently** — anyone arriving without an invite cannot create an
account. That is the right default for a home server exposed through a tunnel.

Sharing a household with a partner uses an invite link: menu → households → **Share** → *new
invite link*. It is valid for seven days, stops working once someone joins with it, and whoever
joins can see and edit everything in that household — and only that household.

- **Owner** invites, renames and deletes the household.
- **Member** sees and edits the data, and can leave at any time. Leaving deletes nothing.
- One account can hold several households; only members see them.

Upgrading from a version that ran before accounts existed: your existing data is adopted
automatically by the first account created. Nothing to export or re-import.

---

## Running it

```bash
docker compose up -d --build
```

The app comes up on `http://<SERVER_IP>:8082`. The database is a single SQLite file in a
volume named `oshit-data`, which you can back up like any other directory.

### Environment variables

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `8080` | Port the server listens on |
| `DATA_DIR` | `./data` | Directory holding the database |
| `OSHIT_OPEN_REGISTRATION` | `false` | `true` opens registration to anyone who reaches the address. Do not enable it on a server reachable from the internet |

For homelab deployment with automatic updates, see [`deploy/README.md`](deploy/README.md).

### Backups

The database uses SQLite in WAL mode, which means **copying `oshit.db` on its own is not a
backup** — recent writes live in the `-wal` file alongside it and you would silently restore
stale data. Use SQLite's own backup instead:

```bash
docker exec oshit sqlite3 /app/data/oshit.db ".backup '/app/data/backup.db'"
```

The irreplaceable part is not the transactions — you can always re-download those from the
bank. It is the manual work layered on top: merchant names, necessity overrides, billing
frequencies, income, goals and notes.

---

## Where your data lives

This is the reason the project does not offer a hosted service: **whoever runs the container
holds the data.** There is no telemetry, no analytics, and no outbound call to any third-party
service. One SQLite file sits in your volume, and you can copy, back up or delete it without
going through the app at all.

- `GET /api/households/:id/export` downloads everything for a household as JSON.
- `DELETE /api/households/:id` permanently deletes it and everything attached.

Passwords are stored as scrypt hashes with a random salt, and session tokens are stored
hashed as well — a copy of the database file does not hand over passwords or live sessions.

Household access is membership-based. A household you are not a member of does not appear in
your list, and every API route touching it returns 404 rather than 403, so IDs cannot be
enumerated.

---

## Development

Server and client run separately. In one terminal:

```bash
npm --prefix server install && npm --prefix server run dev
```

And in another:

```bash
npm --prefix client install && npm --prefix client run dev
```

The browser opens at `http://localhost:5180`, and `/api` calls are proxied to the server on 8080.

### Architecture

```
oshit/
  client/   React + TypeScript, PWA. All calculations happen here
  server/   Express + SQLite (better-sqlite3). Storage only, no business logic
  Dockerfile          builds both into a single image
  docker-compose.yml  maps /app/data to a volume
```

The server serves both the API and the built client, so there is one container and one port.

```
client/src/
  lib/
    parseExcel.ts    reads the bank and CAL files
    categories.ts    categories, necessity levels, merchant-name matching rules
    analytics.ts     totals, recurring charges, open instalments, savings ideas
    plan.ts          income, goal progress, planned changes
    frequency.ts     billing frequency and normalisation to monthly cost
    format.ts        shekels, dates and month names
    i18n.ts          language switching; translations.ts holds the English dictionary
  components/        one panel per screen, plus charts.tsx
```

Translation keys are the Hebrew strings themselves rather than invented identifiers, so the
code stays readable in the language it was written in, and any string without a translation
simply renders in Hebrew instead of showing a broken key.

---

## Implementation notes

- **Months follow the charge date, not the transaction date** — that is the money actually
  leaving the account, and it is what puts an instalment in the right month.
- **Partial months are marked ⚠** and excluded from averages and comparisons. A single-month
  file also contains a few foreign purchases from earlier months charged immediately; such a
  month does not represent full monthly spending.
- **Duplicate detection** keys on card, merchant, date, currency and instalment number —
  deliberately not on the charge date, which changes between files.
- **CAL instalment rows carry no charge date**, and a ten-payment purchase appears as ten
  identical rows. Osh.it derives the payment number from the row's position and spreads the
  charges one month apart, so a ten-payment purchase does not land entirely in the month it
  was made.
- **Chart colours** were checked against three types of colour blindness and against
  background contrast, in both light and dark mode. The pie is capped at eight slices with
  the rest folded into "Other", and every slice has a legend row with amount and percentage
  so identification never depends on colour alone.
- **Dark mode is not an automatic inversion** of light mode but a separately chosen set of
  values, including chart hues regraded against the dark background.
