# Savvy Spend

Expense Tracking System — Full Product Prompt

🧾 Project Overview

Build a personal expense tracking web application that allows users to upload their bank statements, automatically parse and categorize transactions, visualize their cash flow, and manage monthly budgets — all within a clean, modern UI.

🗄️ Tech Stack (Recommended)

LayerTechFrontendNext.js 14 (App Router) + Tailwind CSS + shadcn/uiBackend/APINext.js API Routes or FastAPI (Python)DatabasePostgreSQL (via Supabase or Neon) + Prisma ORMFile StorageSupabase Storage or AWS S3AuthSupabase Auth or NextAuth.jsAI CategorizationOpenAI GPT-4o or Claude claude-sonnet-4-6 (via Anthropic API)ChartsRecharts or Chart.jsParsingPapa Parse (CSV) + pdf-parse (PDF)

🗃️ Database Schema

users

sql

id (uuid, PK)
email (text, unique)
name (text)
avatar_url (text)
created_at (timestamp)

bank_statements

sql

id (uuid, PK)
user_id (uuid, FK → users)
file_name (text)
file_url (text)
file_type (text)          -- 'csv' | 'pdf' | 'xlsx'
bank_name (text)
period_start (date)
period_end (date)
total_debit (decimal)
total_credit (decimal)
status (text)             -- 'processing' | 'done' | 'error'
uploaded_at (timestamp)

transactions

sql

id (uuid, PK)
user_id (uuid, FK → users)
statement_id (uuid, FK → bank_statements)
date (date)
description (text)
merchant_name (text)      -- cleaned/parsed merchant
amount (decimal)
type (text)               -- 'debit' | 'credit'
category_id (uuid, FK → categories)
is_manually_categorized (boolean, default false)
notes (text)
tags (text[])
created_at (timestamp)

categories

sql

id (uuid, PK)
user_id (uuid, FK → users, nullable)  -- null = system default
name (text)
icon (text)               -- emoji or icon name
color (text)              -- hex color
is_default (boolean)
created_at (timestamp)

budgets

sql

id (uuid, PK)
user_id (uuid, FK → users)
category_id (uuid, FK → categories)
month (date)              -- first day of the month
limit_amount (decimal)
alert_threshold (int)     -- % at which to warn (e.g. 80)
created_at (timestamp)

alerts

sql

id (uuid, PK)
user_id (uuid, FK → users)
budget_id (uuid, FK → budgets)
triggered_at (timestamp)
percentage_used (int)
is_read (boolean)

📁 File Upload & Parsing Pipeline

Supported Formats

.csv — most banks export this

.pdf — bank statement PDFs

.xlsx / .xls — Excel exports

Upload Flow

User drags & drops or selects file on the Upload page

File is validated (type, size ≤ 20MB)

File is uploaded to cloud storage (S3/Supabase) and a bank_statement record is created with status: 'processing'

A background job (or API route) parses the file:

CSV: Papa Parse extracts rows → map columns to transactions

PDF: pdf-parse extracts text → regex + LLM to extract structured rows

XLSX: SheetJS reads cells → map to transactions

Each transaction description is sent to an AI categorization endpoint (Claude/GPT) in a batch call to auto-assign categories

Transactions are bulk-inserted into the DB; statement status → 'done'

Dashboard refreshes with new data

Smart Column Mapping

On first upload, show a column mapper UI where user maps their bank's columns (Date, Amount, Description, etc.) to our schema fields

Save the mapping per bank so future uploads skip this step

🖥️ Pages & Features

1. 🔐 Auth Pages

Sign Up / Login / Forgot Password

Google OAuth option

Onboarding flow for first-time users (set name, base currency, first budget)

2. 📊 Dashboard (Main Page)

Top Summary Bar

Total Spent This Month

Total Income This Month

Net Cash Flow (Income − Expenses)

Savings Rate (%)

Cash Flow Chart (line or area chart)

X-axis: days of the month

Two lines: cumulative income vs cumulative expense

Spending by Category (donut chart + legend)

Shows % and amount per category

Click a slice → drill into that category's transactions

Budget Progress Cards

One card per budget with a progress bar

Color: green → yellow → red as limit approaches

Shows: spent / limit, % used, days remaining

Recent Transactions Feed

Last 10–20 transactions

Each row: merchant icon, name, category chip, amount, date

Inline category edit button for uncategorized items

Monthly Comparison Bar Chart

Last 6 months side-by-side spending

Uncategorized Alert Banner

If N transactions are uncategorized, show a prominent banner: "You have 12 transactions that need categorization" with a CTA button

3. 📤 Upload Page

Drag-and-drop zone with file type icons

Upload history table (filename, bank, period, # transactions, status, date)

Progress indicator during processing

Error reporting if parsing fails (with raw preview of file)

Re-upload / delete option per statement

4. 💸 Transactions Page

Filters & Search

Date range picker

Category multi-select

Type: debit / credit

Amount range slider

Free-text search (description/merchant)

Table View

Sortable columns: Date, Merchant, Category, Amount

Inline category dropdown (editable)

Bulk select → bulk re-categorize

Add notes / tags per transaction

Export filtered transactions as CSV

Split Transaction

Split one transaction into multiple categories (e.g. a supermarket bill split between Groceries and Household)

5. 🗂️ Categories Page

Default Categories (pre-seeded)

🍔 Food & Dining

🚗 Transport

🛒 Groceries

🏠 Housing & Rent

💊 Health & Medical

🎬 Entertainment

👗 Shopping

📱 Subscriptions

✈️ Travel

🎓 Education

💼 Business

❓ Uncategorized

Custom Categories

Create category: name, emoji picker, color picker

Edit / delete custom categories

Merge categories (move all transactions from A → B)

Keyword Rules (Auto-categorization)

User defines rules: "if description contains 'NETFLIX' → Subscriptions"

Rules run automatically on future uploads

Shown as a table with add/edit/delete

6. 💰 Budgets Page

Set monthly budget per category (amount + alert threshold %)

Toggle budgets on/off without deleting

View budget history: how each past month performed vs limit

Global monthly spending cap (optional)

Budget rollover toggle: unused budget carries to next month

7. 📈 Reports & Insights Page

AI Insights Panel (powered by Claude)

"You spent 34% more on dining this month vs last month"

"Your top merchant was Amazon (₹12,400 across 8 transactions)"

"You're on track to exceed your Shopping budget by ₹2,000"

Reports

Monthly summary report (exportable as PDF)

Category trend report (12-month view per category)

Top merchants report (ranked by spend)

Recurring payments detector (subscriptions auto-identified)

Day-of-week spending heatmap

8. ⚙️ Settings Page

Profile (name, email, avatar)

Base currency selector

Date format preference

Notification preferences (email alerts for budget overruns)

Connected banks / statement templates

Data export (all transactions as CSV)

Delete account / data

🤖 AI Features

FeatureHowAuto-categorizationBatch send transaction descriptions → Claude returns category per itemMerchant name cleaningRaw bank descriptions like POS/AMZN*MKT/DEBIT → cleaned to AmazonSmart insightsMonthly summary prompt → Claude returns 3–5 bullet insightsRecurring detectionPattern analysis → flag subscriptions/EMIsPDF parsing assistComplex PDFs → Claude extracts table rows as JSON

🎨 UI/UX Guidelines

Theme: Dark-first with a light mode toggle; deep navy/slate backgrounds, vibrant accent colors per category

Typography: Inter or Geist font; clear hierarchy

Motion: Subtle Framer Motion animations on chart loads and card transitions

Mobile: Fully responsive; bottom nav on mobile

Empty States: Illustrated empty states with clear CTAs (e.g., upload first statement)

Toasts: Non-intrusive success/error notifications

Loading: Skeleton loaders on all data tables and charts

🔔 Notifications & Alerts

In-app notification bell (alerts feed)

Email notification when budget crosses alert threshold

Weekly digest email: "Your week in spending"

Monthly report email on 1st of each month

🔒 Security

All routes protected by auth middleware

RLS (Row Level Security) on all DB tables so users only see their own data

File uploads scanned for malicious content

Sensitive data encrypted at rest

Rate limiting on upload and AI endpoints

🚀 Suggested Build Order

Auth + DB schema + Supabase setup

File upload + CSV parsing pipeline

Transactions page (view, filter, categorize)

Dashboard charts (category donut, cash flow line)

Budget management + progress bars

AI categorization + insights

PDF/XLSX parsing

Reports page + PDF export

Notifications + email alerts

Polish: animations, mobile, empty states

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c8531f3b-b1b4-460a-a83a-e4a7c97be56c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
