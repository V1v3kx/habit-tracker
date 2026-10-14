# Habit Tracker

A personal, offline-first habit tracker that runs entirely in your browser. No account, no server, no build tools required — just open `index.html`.

## How to Open

1. Download or clone this folder to your computer.
2. Open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).
3. That's it. Your data is saved automatically in the browser's localStorage.

No internet connection is needed after the first load (Chart.js is cached by the browser).

## Tabs

| Tab | What it does |
|-----|-------------|
| **Tracker** | The main habit grid. Rows are habits; columns are days of the current month. Click a checkbox to mark a habit done. |
| **Dashboard** | Completion stats (today, week, month, overall), per-habit streaks, and two charts (daily bar + monthly trend). |
| **GATE Log** | Log daily study sessions: minutes studied, topics, questions attempted, correct answers, notes. Shows weekly totals. |
| **Sleep** | Log bedtime and wake-up time. Duration is calculated automatically, including midnight crossings. Sleepiness rating 1–10. |
| **Settings** | Export/import data as JSON, clear all data, and configure cigarette tracking. |

## Adding, Editing, and Deleting Habits

- **Add:** Click the `+ Add Habit` button above the grid. Fill in the name, category, and tracking type (Yes/No checkbox or numeric value).
- **Edit (rename):** Hover over a habit row and click the ✏️ pencil icon.
- **Archive:** Hover and click the 📦 icon. Archived habits are hidden from the grid but their history is preserved. Click `Show Archived` to view them again.
- **Delete:** Hover and click the 🗑️ icon. A confirmation dialog appears before anything is deleted.
- **Reorder:** Hover and click ↑ or ↓ to move a habit up or down in the list.

### Month Navigation

- Use `← Prev` and `Next →` to browse other months.
- Click `Today` to jump back to the current month.
- All historical records are preserved when navigating — nothing is lost.

## Data Persistence

Data is stored in **this browser's localStorage** on this device. It is:

- Saved automatically after every change.
- Loaded automatically when you open the page.
- **Not synced** to other devices, browsers, or accounts.
- **Not accessible** if you open the page in a different browser or a private/incognito window.

To move data between devices, use Export and Import (see below).

## Export and Import

**Export:** Go to `Settings` → click `⬇ Export Data`. A JSON file is downloaded to your computer. Keep this file as a backup.

**Import:** Go to `Settings` → click `⬆ Import Data` → select a previously exported `.json` file. You will be asked to confirm before your current data is replaced.

Note: importing replaces all current data. Export first if you want to keep it.

## Resetting All Data

Go to `Settings` → click `🗑 Clear All Data`. You will be warned and asked to click again to confirm. After clearing, the 13 default habits are reloaded with today as their start date.

## Folder Structure

```
d:\PT\
├── index.html      HTML shell: navigation, tab sections, modal containers
├── styles.css      All styling, color palette, responsive breakpoints
├── app.js          All logic: state, storage, rendering, calculations
└── README.md       This file
```

Planning artifacts live in `d:\PT\.agents\tasks\` and are not part of the deployed app.

## Chart.js

Charts (Dashboard tab) use [Chart.js](https://www.chartjs.org/) loaded from the jsDelivr CDN:

```
https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js
```

After the first load the script is cached by the browser, so charts work offline. If the CDN is unreachable on first load, a fallback message is shown instead of a blank canvas.

## Keyboard and Accessibility

- All checkboxes have `aria-label` attributes describing the habit and date.
- All icon-only buttons have `aria-label` attributes.
- The modal and confirm dialog have `role="dialog"` / `role="alertdialog"` with `aria-modal="true"`.
- Press `Escape` to close any open modal or popup.
- Tab navigation works with the keyboard; all interactive elements are focusable.
