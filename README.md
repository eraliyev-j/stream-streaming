# Stream Streaming

An online **descriptive-studies research tool** for urban stream water quality, built for our
sampling campaign on **Geojongcheon** (Portfolio Project #3 — Online Data Collection Tools).

Researchers upload field and lab measurements (CSV/Excel or a form). Everyone on the team
can browse the datasets as **descriptive statistics, a full table, charts and an outlier report**,
and export them as CSV.

## Features

| Area | What it does |
|---|---|
| **Accounts & roles** | Sign in with email. **Researchers** upload data and can edit/delete only their own uploads. The **lab head** can edit/delete everything and change roles. |
| **Upload** | Drag-and-drop CSV / XLSX with automatic column recognition (Site, Date, pH, DO, EC, BOD, COD, TSS, T-N, T-P…), editable column mapping, value checks and a preview. Or type samples into a form (with GPS button). Every upload carries **researcher ID, full name, sampling date and a note**. |
| **Descriptive stats** | n, missing, mean, SD, CV %, min, Q1, median, Q3, max, IQR, skewness, outlier count — for every parameter, including extra columns. |
| **Full table** | Sort, filter, paginate; inline edit and delete (if permitted); outlier cells highlighted. |
| **Charts** | Histogram, box plot by site/dataset/stream, time series, scatter with Pearson r, correlation matrix, river grade by BOD (Korean river standard). |
| **Outliers** | Tukey fences (1.5 × IQR) or z-score with adjustable threshold; per-parameter summary and list of flagged samples. |
| **Explore all** | Pool every dataset, filter by stream, date range and dataset, and run the same analysis. |
| **Export** | CSV of any dataset or of the filtered pool (opens in Excel, SPSS, R, Python). |

All statistics are written by hand in [`src/lib/stats.js`](src/lib/stats.js) so each formula can be explained.

## Tech stack

- **HTML, CSS, JavaScript** with **Vue 3** (Vite build) and Vue Router
- **Supabase** — Postgres database + authentication; permissions enforced with Row Level Security
- **Chart.js** + `chartjs-chart-boxplot` — charts
- **PapaParse** (CSV) and **SheetJS** (Excel) — reading files in the browser

## Project structure

```
stream-streaming/
├─ supabase/schema.sql        tables, roles and security policies (run once in Supabase)
├─ src/
│  ├─ lib/
│  │  ├─ stats.js             mean, SD, quartiles, skewness, outliers, correlation, histogram
│  │  ├─ parameters.js        water-quality parameters, units, header aliases, BOD grade
│  │  ├─ parseFile.js         read CSV/XLSX, map columns, validate values
│  │  ├─ columns.js           helpers for labels, dates, extra columns
│  │  └─ exportCsv.js         CSV download
│  ├─ services/
│  │  ├─ api.js               chooses Supabase or demo backend
│  │  ├─ supabaseBackend.js   real database calls
│  │  ├─ demoBackend.js       browser-only demo with the same permission rules
│  │  └─ demoSeed.js          synthetic demo data (not real measurements)
│  ├─ store/session.js        signed-in user and permission check
│  ├─ components/             tables, charts, analysis tabs, header
│  └─ views/                  Login, Overview, Datasets, Dataset detail, Explore, Upload, Team
├─ netlify.toml / vercel.json SPA routing for deployment
└─ .env.example               Supabase keys template
```

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5173. Without Supabase keys the site runs in **demo mode**: pick one of
the demo accounts (one lab head, three researchers) and try everything. Demo data lives only in
that browser.

## Connect Supabase (shared real data)

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql), click **Run**.
3. **Project Settings → API**: copy the *Project URL* and the *anon public* key.
4. Copy `.env.example` to `.env` and fill them in:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
5. Restart `npm run dev`. The login page now shows **Sign in / Create account**.
6. Each team member creates an account (full name + researcher ID).
   For a classroom project you may turn off email confirmation:
   **Authentication → Sign In / Providers → Email → Confirm email: off**.
7. Make the lab head (SQL Editor):
   ```sql
   update public.profiles set role = 'head' where email = 'head@example.com';
   ```
   After that the head can change other roles from the **Team** page.

The anon key is safe to put in the frontend — every read and write is checked by the RLS
policies in `schema.sql` (owner-or-head for edit/delete, signed-in users for reading).

## Deploy

**Netlify:** New site → import the Git repo → *Base directory* `stream-streaming`,
build command `npm run build`, publish directory `dist` (already in `netlify.toml`).
Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under *Site configuration → Environment variables*.

**Vercel:** New project → import repo → *Root Directory* `stream-streaming`, framework *Vite*.
Add the same two environment variables.

Then in Supabase **Authentication → URL Configuration**, set *Site URL* to your deployed address.

## CSV format

One row per sample. Header names are matched flexibly (case, spaces and units are ignored):

| Field | Recognised headers (examples) |
|---|---|
| Site | `site`, `station`, `point`, `지점` |
| Date/time | `date`, `datetime`, `sampled_at`, `일시` |
| Latitude / Longitude | `lat`, `latitude` / `lon`, `lng`, `longitude` |
| Temperature °C | `temp`, `temperature`, `water temp`, `수온` |
| pH | `pH` |
| DO mg/L | `DO`, `dissolved oxygen` |
| EC µS/cm | `EC`, `conductivity`, `SpC` |
| Turbidity NTU | `turbidity`, `turb`, `NTU` |
| BOD / COD / TSS mg/L | `BOD`, `BOD5` / `COD`, `CODmn` / `TSS`, `SS` |
| T-N / T-P mg/L | `TN`, `T-N`, `총질소` / `TP`, `T-P`, `총인` |

Any other numeric column (e.g. `Chl-a`, `NH3-N`) is kept as an extra parameter and analysed too.
A template can be downloaded from the Upload page.
