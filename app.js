/* ============================================================
   HABIT TRACKER — app.js
   Sections:
     1.  Constants & State
     2.  Utility Functions
     3.  Storage I/O
     4.  Initialization
     5.  Tab Navigation
     6.  Tracker Controls Rendering
     7.  Habit Grid Rendering
     8.  Cell Event Handlers
     9.  Habit CRUD
     10. Month Navigation
     11. Statistics Calculations
     12. Dashboard Rendering
     13. GATE Log Tab
     14. Sleep Log Tab
     15. Cigarette Tracking
     16. Settings Tab
     17. Modal & Confirm Helpers
   ============================================================ */

/* === SECTION 1: CONSTANTS & STATE === */
const SUPABASE_URL = 'https://fbfxbbtfzyfbvqsofwgk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_xU0qdssam7NjY0FAEenb8w_AYXVQjPE';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const SUPABASE_ROW_ID = 'main';


async function syncDataToSupabase() {
  const data = {
    habits: STATE.habits,
    records: STATE.records,
    settings: STATE.settings,
    gateLog: STATE.gateLog,
    sleepLog: STATE.sleepLog,
  };

  const { error } = await supabaseClient
    .from('habit_tracker_data')
    .upsert({
      id: SUPABASE_ROW_ID,
      data,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Supabase sync failed:', error.message);
    return false;
  }

  console.log('Supabase sync successful.');
  return true;
}

async function loadDataFromSupabase() {
  const { data, error } = await supabaseClient
    .from('habit_tracker_data')
    .select('data')
    .eq('id', SUPABASE_ROW_ID)
    .maybeSingle();

  if (error) {
    console.error('Supabase load failed:', error.message);
    return false;
  }

  if (!data || !data.data) {
    return false;
  }

  const cloudData = data.data;

  STATE.habits = cloudData.habits ?? STATE.habits;
  STATE.records = cloudData.records ?? STATE.records;
  STATE.settings = cloudData.settings ?? STATE.settings;
  STATE.gateLog = cloudData.gateLog ?? STATE.gateLog;
  STATE.sleepLog = cloudData.sleepLog ?? STATE.sleepLog;

  return true;
}

const STORAGE_KEYS = {
  habits:   'habitTracker_habits',
  records:  'habitTracker_records',
  settings: 'habitTracker_settings',
  gateLog:  'habitTracker_gateLog',
  sleepLog: 'habitTracker_sleepLog',
};

const CATEGORIES = ['Morning', 'Health', 'Study', 'Personal', 'Finance', 'Evening', 'Other'];

// Default habits — seeded only when localStorage is empty.
// `id` and `createdAt` are assigned at seed time.
const DEFAULT_HABITS = [
  { name: 'Wake up before 4:40 AM',       category: 'Morning',  order: 0  },
  { name: 'Drink 500 ml water after waking up', category: 'Morning', order: 1 },
  { name: 'No nap after office hours',     category: 'Health',   order: 2  },
  { name: 'Complete 1-3-7 revision',       category: 'Study',    order: 3  },
  { name: 'Revise weekly topics',          category: 'Study',    order: 4  },
  { name: 'Solve one LeetCode question',   category: 'Study',    order: 5  },
  { name: 'GATE preparation',              category: 'Study',    order: 6  },
  { name: 'Second face wash',              category: 'Health',   order: 7  },
  { name: 'No PMO',                        category: 'Personal', order: 8  },
  { name: 'No smoking',                    category: 'Personal', order: 9  },
  { name: 'Spend no more than ₹101',       category: 'Finance',  order: 10 },
  { name: 'Spend no more than ₹200',       category: 'Finance',  order: 11 },
  { name: 'No screen time after 10 PM',   category: 'Evening',  order: 12 },
];

// Single mutable state object — all reads and writes go through this.
const STATE = {
  habits:           [],    // Habit[]
  records:          {},    // { [YYYY-MM-DD]: { [habitId]: bool|number|null } }
  settings:         { cigaretteTracking: false, cigaretteBaseline: null, cigaretteCostPerUnit: null },
  gateLog:          [],    // GateEntry[]
  sleepLog:         [],    // SleepEntry[]
  currentYear:      null,
  currentMonth:     null,  // 0-indexed
  showArchived:     false,
  activeTab:        'tracker',
  charts:           { daily: null, monthly: null },
  _confirmCallback: null,  // pending confirm dialog callback
  _numericContext:  null,  // { habitId, dateStr } for the open numeric popup
};

/* === SECTION 2: UTILITY FUNCTIONS === */

/** Returns today's date as YYYY-MM-DD. */
function todayStr() {
  const d = new Date();
  return formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Zero-pads and returns YYYY-MM-DD. month is 1-indexed. */
function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Returns the number of days in a given month. month is 0-indexed. */
function getDaysInMonth(year, month) {
  // new Date(year, month+1, 0) gives the last day of the requested month.
  return new Date(year, month + 1, 0).getDate();
}

/** Returns abbreviated weekday name ('Mon','Tue',...) for a calendar date. month is 1-indexed. */
function getWeekdayAbbr(year, month, day) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[new Date(year, month - 1, day).getDay()];
}

/** Generates a stable, unique id using crypto.randomUUID with a timestamp fallback. */
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random hex
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Returns true if the given YYYY-MM-DD date string is strictly in the future. */
function isFutureDate(dateStr) {
  return dateStr > todayStr();
}

/** Parses 'HH:MM' string into { h, m }. Returns null if invalid. */
function parseHHMM(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return { h, m };
}

/**
 * Calculates sleep duration in minutes.
 * Handles midnight crossing (bedtime 23:30, wake 06:00 = 390 min).
 */
function durationMinutes(bedtime, wakeTime) {
  const bed  = parseHHMM(bedtime);
  const wake = parseHHMM(wakeTime);
  if (!bed || !wake) return 0;
  const bedMins  = bed.h  * 60 + bed.m;
  const wakeMins = wake.h * 60 + wake.m;
  let diff = wakeMins - bedMins;
  if (diff <= 0) diff += 1440; // crossed midnight
  return diff;
}

/** Formats minutes as 'Xh Ym'. */
function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

/**
 * Returns a Monday-based ISO week key like 'YYYY-Www'.
 * Used to group GATE log entries by week.
 */
function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  // Adjust to nearest Monday
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0) ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const start = new Date(y, 0, 1);
  const week = Math.ceil((((d - start) / 86400000) + start.getDay() + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

/** Escapes a string for safe insertion into innerHTML. */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Returns a display-friendly month name + year label. */
function monthLabel(year, month) {
  const names = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
  return `${names[month]} ${year}`;
}

/* === SECTION 3: STORAGE I/O === */

/**
 * Loads all data from localStorage into STATE.
 * Falls back to safe defaults on any error.
 */
function loadAllData() {
  // Habits
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.habits);
    if (raw) {
      const parsed = JSON.parse(raw);
      STATE.habits = Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    STATE.habits = [];
  }

  // Records
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.records);
    if (raw) {
      const parsed = JSON.parse(raw);
      STATE.records = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    }
  } catch (e) {
    STATE.records = {};
  }

  // Settings
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (raw) {
      const parsed = JSON.parse(raw);
      STATE.settings = Object.assign(
        { cigaretteTracking: false, cigaretteBaseline: null, cigaretteCostPerUnit: null },
        parsed
      );
    }
  } catch (e) {
    STATE.settings = { cigaretteTracking: false, cigaretteBaseline: null, cigaretteCostPerUnit: null };
  }

  // GATE log
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.gateLog);
    if (raw) {
      const parsed = JSON.parse(raw);
      STATE.gateLog = Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    STATE.gateLog = [];
  }

  // Sleep log
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.sleepLog);
    if (raw) {
      const parsed = JSON.parse(raw);
      STATE.sleepLog = Array.isArray(parsed) ? parsed : [];
    }
  } catch (e) {
    STATE.sleepLog = [];
  }
}


function saveHabits() {
  try {
    localStorage.setItem(STORAGE_KEYS.habits, JSON.stringify(STATE.habits));
  } catch (e) {
    showStorageWarning();
  }
  syncDataToSupabase();
}


function saveRecords() {
  try {
    localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(STATE.records));
  } catch (e) {
    showStorageWarning();
  }
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(STATE.settings));
  } catch (e) {
    showStorageWarning();
  }
}

function saveGateLog() {
  try {
    localStorage.setItem(STORAGE_KEYS.gateLog, JSON.stringify(STATE.gateLog));
  } catch (e) {
    showStorageWarning();
  }
}

function saveSleepLog() {
  try {
    localStorage.setItem(STORAGE_KEYS.sleepLog, JSON.stringify(STATE.sleepLog));
  } catch (e) {
    showStorageWarning();
  }
}

let _storageWarningShown = false;
function showStorageWarning() {
  if (!_storageWarningShown) {
    _storageWarningShown = true;
    alert('Storage full — some data may not have saved. Consider exporting your data from the Settings tab.');
  }
}

/* === SECTION 4: INITIALIZATION === */

// function init() {
//   loadAllData();

//   // Seed default habits if storage is empty
//   if (STATE.habits.length === 0) {
//     const today = todayStr();
//     DEFAULT_HABITS.forEach((h, i) => {
//       STATE.habits.push({
//         id:           generateId(),
//         name:         h.name,
//         category:     h.category,
//         order:        i,
//         archived:     false,
//         trackingType: 'boolean',
//         unit:         '',
//         dailyTarget:  null,
//         createdAt:    today,
//       });
//     });
//     saveHabits();
//   }

//   // Set current month to today
//   const now = new Date();
//   STATE.currentYear  = now.getFullYear();
//   STATE.currentMonth = now.getMonth(); // 0-indexed

//   // Render the tracker
//   renderTrackerControls();
//   renderTracker();

//   // Wire up global event listeners
//   attachGlobalListeners();
// }


async function init() {
  loadAllData();

  // Load cloud data before rendering, keeping local data as fallback
  const cloudLoaded = await loadDataFromSupabase();
  console.log(
    cloudLoaded
      ? 'Loaded tracker data from Supabase.'
      : 'No cloud data loaded; using local data.'
  );

  // Seed default habits if storage is empty
  if (STATE.habits.length === 0) {
    const today = todayStr();
    DEFAULT_HABITS.forEach((h, i) => {
      STATE.habits.push({
        id:           generateId(),
        name:         h.name,
        category:     h.category,
        order:        i,
        archived:     false,
        trackingType: 'boolean',
        unit:         '',
        dailyTarget:  null,
        createdAt:    today,
      });
    });
    saveHabits();
  }

  // Set current month to today
  const now = new Date();
  STATE.currentYear  = now.getFullYear();
  STATE.currentMonth = now.getMonth();

  // Render the tracker
  renderTrackerControls();
  renderTracker();

  // Wire up global event listeners
  attachGlobalListeners();
}


function attachGlobalListeners() {
  // Nav tab buttons
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Modal close button
  document.getElementById('modal-close').addEventListener('click', closeModal);

  // Confirm dialog buttons
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('confirm-ok').addEventListener('click', () => {
    if (typeof STATE._confirmCallback === 'function') {
      STATE._confirmCallback();
    }
    closeConfirm();
  });

  // Numeric popup buttons
  document.getElementById('numeric-cancel').addEventListener('click', closeNumericPopup);
  document.getElementById('numeric-ok').addEventListener('click', submitNumericPopup);
  document.getElementById('numeric-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitNumericPopup();
    if (e.key === 'Escape') closeNumericPopup();
  });

  // Escape key closes modals / popups
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal();
      closeConfirm();
      closeNumericPopup();
    }
  });

  // Click on modal backdrop closes it
  document.getElementById('modal-container').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-container')) closeModal();
  });
  document.getElementById('confirm-dialog').addEventListener('click', e => {
    if (e.target === document.getElementById('confirm-dialog')) closeConfirm();
  });
}

document.addEventListener('DOMContentLoaded', init);

/* === SECTION 5: TAB NAVIGATION === */

function switchTab(tabName) {
  // Hide all sections and deactivate all tab buttons
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });

  // Activate the target section and button
  const section = document.getElementById('tab-' + tabName);
  const button  = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
  if (section) section.classList.add('active');
  if (button) {
    button.classList.add('active');
    button.setAttribute('aria-selected', 'true');
  }

  STATE.activeTab = tabName;

  // Render the appropriate tab content
  switch (tabName) {
    case 'tracker':   renderTracker();    break;
    case 'dashboard': renderDashboard();  break;
    case 'gate':      renderGateTab();    break;
    case 'sleep':     renderSleepTab();   break;
    case 'settings':  renderSettings();   break;
  }
}

/* === SECTION 6: TRACKER CONTROLS RENDERING === */

function renderTrackerControls() {
  const container = document.getElementById('tracker-controls');

  container.innerHTML = `
    <div class="tracker-controls-left">
      <button id="btn-prev-month" class="btn btn-sm" aria-label="Previous month">&#8592; Prev</button>
      <span id="month-display" aria-live="polite"></span>
      <button id="btn-next-month" class="btn btn-sm" aria-label="Next month">Next &#8594;</button>
      <button id="btn-today" class="btn btn-sm btn-outline">Today</button>
    </div>
    <div class="tracker-controls-right">
      <button id="btn-toggle-archived" class="btn btn-sm btn-outline">Show Archived</button>
      <button id="btn-add-habit"       class="btn btn-sm btn-primary">+ Add Habit</button>
    </div>
  `;

  // Attach event listeners
  document.getElementById('btn-prev-month').addEventListener('click', prevMonth);
  document.getElementById('btn-next-month').addEventListener('click', nextMonth);
  document.getElementById('btn-today').addEventListener('click', jumpToToday);
  document.getElementById('btn-add-habit').addEventListener('click', openAddHabitModal);
  document.getElementById('btn-toggle-archived').addEventListener('click', toggleShowArchived);

  // Update month display
  updateMonthDisplay();
}

function updateMonthDisplay() {
  const el = document.getElementById('month-display');
  if (el) el.textContent = monthLabel(STATE.currentYear, STATE.currentMonth);

  const archivedBtn = document.getElementById('btn-toggle-archived');
  if (archivedBtn) {
    archivedBtn.textContent = STATE.showArchived ? 'Hide Archived' : 'Show Archived';
  }
}

/* === SECTION 7: HABIT GRID RENDERING === */

/**
 * Builds the complete habit grid table from STATE.
 * Replaces the entire #tracker-grid-wrap contents.
 * After building, attaches a single delegated event listener for all interactions.
 */
function renderTracker() {
  updateMonthDisplay();

  const year  = STATE.currentYear;
  const month = STATE.currentMonth; // 0-indexed
  const days  = getDaysInMonth(year, month);
  const today = todayStr();

  // Get habits sorted by order, optionally including archived
  const habits = STATE.habits
    .filter(h => !h.archived || STATE.showArchived)
    .sort((a, b) => a.order - b.order);

  const wrap = document.getElementById('tracker-grid-wrap');

  if (habits.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <strong>No habits yet.</strong>
        <p>Click <em>+ Add Habit</em> to get started.</p>
      </div>`;
    return;
  }

  // Build header cells for each day
  let headerCells = '';
  for (let d = 1; d <= days; d++) {
    const dateStr   = formatDate(year, month + 1, d);
    const isToday   = (dateStr === today);
    const isFuture  = isFutureDate(dateStr);
    const classes   = ['col-day'];
    if (isToday)  classes.push('col-today');
    if (isFuture) classes.push('col-future');

    headerCells += `
      <th class="${classes.join(' ')}" data-date="${dateStr}">
        <div class="day-header">
          <span class="day-name">${getWeekdayAbbr(year, month + 1, d)}</span>
          <span class="day-num">${d}</span>
        </div>
      </th>`;
  }

  // Build rows for each habit
  let rows = '';
  habits.forEach(habit => {
    const isArchived = habit.archived;

    // Action buttons in the habit name cell
    const actions = `
      <span class="row-actions" aria-hidden="true">
        ${isArchived ? '<span class="archived-badge">Archived</span>' : ''}
        <button class="icon-btn" data-action="move-up"   data-id="${habit.id}" aria-label="Move ${escapeHtml(habit.name)} up" title="Move up">↑</button>
        <button class="icon-btn" data-action="move-down" data-id="${habit.id}" aria-label="Move ${escapeHtml(habit.name)} down" title="Move down">↓</button>
        <button class="icon-btn" data-action="edit"      data-id="${habit.id}" aria-label="Edit ${escapeHtml(habit.name)}" title="Edit">✏️</button>
        <button class="icon-btn" data-action="archive"   data-id="${habit.id}"
          aria-label="${isArchived ? 'Unarchive' : 'Archive'} ${escapeHtml(habit.name)}"
          title="${isArchived ? 'Unarchive' : 'Archive'}">${isArchived ? '📤' : '📦'}</button>
        <button class="icon-btn btn-danger-icon" data-action="delete" data-id="${habit.id}"
          aria-label="Delete ${escapeHtml(habit.name)}" title="Delete">🗑️</button>
      </span>`;

    let dayCells = '';
    for (let d = 1; d <= days; d++) {
      const dateStr  = formatDate(year, month + 1, d);
      const isToday  = (dateStr === today);
      const isFuture = isFutureDate(dateStr);
      const beforeCreation = habit.createdAt > dateStr;

      // Classes for the today column
      const todayClass = isToday ? ' col-today' : '';

      if (isFuture || beforeCreation) {
        // Disabled / non-interactive cell
        const stateClass = isFuture ? 'cell-future' : 'cell-pre-creation';
        dayCells += `<td class="col-day ${stateClass}${todayClass}" data-date="${dateStr}" data-habit-id="${habit.id}">`;
        if (habit.trackingType === 'boolean') {
          dayCells += `<input type="checkbox" disabled aria-label="${escapeHtml(habit.name)} on ${dateStr}">`;
        } else {
          dayCells += `<span class="numeric-val">—</span>`;
        }
        dayCells += `</td>`;

      } else if (habit.trackingType === 'boolean') {
        // Boolean checkbox cell
        const record  = STATE.records[dateStr] ? STATE.records[dateStr][habit.id] : undefined;
        const isDone  = (record === true);
        const cellCls = isDone ? 'cell-done' : 'cell-miss';
        dayCells += `
          <td class="col-day ${cellCls}${todayClass}" data-date="${dateStr}" data-habit-id="${habit.id}">
            <input type="checkbox" ${isDone ? 'checked' : ''}
              data-habit-id="${habit.id}" data-date="${dateStr}"
              aria-label="${escapeHtml(habit.name)} on ${dateStr}">
          </td>`;

      } else {
        // Numeric cell — click opens value popup
        const record   = STATE.records[dateStr] ? STATE.records[dateStr][habit.id] : undefined;
        const val      = (record !== undefined && record !== null) ? record : null;
        const target   = habit.dailyTarget;
        const isDone   = val !== null && (target === null || val >= target);
        const cellCls  = val !== null ? (isDone ? 'cell-done' : 'cell-miss') : '';
        const unit     = habit.unit ? ` ${escapeHtml(habit.unit)}` : '';
        const display  = val !== null ? `${val}${unit}` : '—';
        dayCells += `
          <td class="col-day ${cellCls}${todayClass}" data-date="${dateStr}" data-habit-id="${habit.id}"
              data-action="numeric-click" title="Click to record value">
            <span class="numeric-val">${display}</span>
          </td>`;
      }
    }

    rows += `
      <tr class="habit-row${isArchived ? ' is-archived' : ''}" data-habit-id="${habit.id}">
        <td class="col-habit">
          <div class="habit-cell">
            <div class="habit-name-block">
              <span class="habit-name">${escapeHtml(habit.name)}</span>
              <span class="habit-category">${escapeHtml(habit.category)}</span>
            </div>
            ${actions}
          </div>
        </td>
        ${dayCells}
      </tr>`;
  });

  wrap.innerHTML = `
    <table class="habit-table" id="habit-table" role="grid">
      <thead>
        <tr>
          <th class="col-habit sticky-corner" scope="col">Habit</th>
          ${headerCells}
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;

  // Attach a single delegated event listener on the table
  const table = document.getElementById('habit-table');

  table.addEventListener('change', e => {
    const cb = e.target;
    if (cb.type === 'checkbox' && cb.dataset.habitId) {
      handleCellToggle(cb.dataset.habitId, cb.dataset.date, cb.checked);
    }
  });

  table.addEventListener('click', e => {
    // Numeric cell click
    const td = e.target.closest('td[data-action="numeric-click"]');
    if (td) {
      handleNumericClick(td);
      return;
    }

    // Row action buttons
    const btn = e.target.closest('button[data-action]');
    if (btn) {
      const action = btn.dataset.action;
      const id     = btn.dataset.id;
      switch (action) {
        case 'move-up':   moveHabitUp(id);        break;
        case 'move-down': moveHabitDown(id);       break;
        case 'edit':      openEditHabitModal(id);  break;
        case 'archive':   toggleArchiveHabit(id);  break;
        case 'delete':    deleteHabit(id);         break;
      }
    }
  });
}

/* === SECTION 8: CELL EVENT HANDLERS === */

/**
 * Handles boolean checkbox toggle.
 * Updates STATE, saves, and updates only the single affected <td> — no full re-render.
 */
function handleCellToggle(habitId, dateStr, checked) {
  // Safety guard: never allow future-date writes
  if (isFutureDate(dateStr)) return;

  if (!STATE.records[dateStr]) STATE.records[dateStr] = {};
  STATE.records[dateStr][habitId] = checked; // true or false
  saveRecords();

  // Update only the affected cell — avoids full table re-render
  const td = document.querySelector(`td[data-habit-id="${habitId}"][data-date="${dateStr}"]`);
  if (td) {
    td.classList.toggle('cell-done', checked);
    td.classList.toggle('cell-miss', !checked);
    // Preserve the today column highlight
    if (dateStr === todayStr()) td.classList.add('col-today');
  }
}

/**
 * Opens the numeric value popup near the clicked cell.
 */
function handleNumericClick(td) {
  const habitId = td.dataset.habitId;
  const dateStr = td.dataset.date;

  if (isFutureDate(dateStr)) return;

  // Pre-fill existing value
  const existing = STATE.records[dateStr] ? STATE.records[dateStr][habitId] : undefined;
  const input    = document.getElementById('numeric-input');
  input.value    = (existing !== undefined && existing !== null) ? existing : '';

  // Find the unit for placeholder
  const habit = STATE.habits.find(h => h.id === habitId);
  if (habit && habit.unit) {
    input.placeholder = habit.unit;
  } else {
    input.placeholder = '';
  }

  // Store context for submission
  STATE._numericContext = { habitId, dateStr };

  // Position the popup
  const popup = document.getElementById('numeric-popup');
  popup.classList.remove('hidden');

  const rect = td.getBoundingClientRect();
  const popupW = 180;
  const popupH = 46;
  let top  = rect.bottom + window.scrollY + 4;
  let left = rect.left   + window.scrollX;

  // Keep within viewport
  if (left + popupW > window.innerWidth) left = window.innerWidth - popupW - 8;
  if (top + popupH  > window.innerHeight + window.scrollY) {
    top = rect.top + window.scrollY - popupH - 4;
  }

  popup.style.top  = `${top}px`;
  popup.style.left = `${left}px`;

  input.focus();
  input.select();
}

/**
 * Submits the numeric popup value, updates STATE and the cell display.
 */
function submitNumericPopup() {
  const ctx = STATE._numericContext;
  if (!ctx) return;

  const { habitId, dateStr } = ctx;
  const rawVal = document.getElementById('numeric-input').value.trim();
  const val    = rawVal === '' ? null : parseFloat(rawVal);
  const numVal = (val === null || isNaN(val)) ? null : val;

  if (!STATE.records[dateStr]) STATE.records[dateStr] = {};
  STATE.records[dateStr][habitId] = numVal;
  saveRecords();

  // Update cell display in place
  const td = document.querySelector(`td[data-habit-id="${habitId}"][data-date="${dateStr}"]`);
  if (td) {
    const habit   = STATE.habits.find(h => h.id === habitId);
    const target  = habit ? habit.dailyTarget : null;
    const isDone  = numVal !== null && (target === null || numVal >= target);

    const span = td.querySelector('.numeric-val');
    if (span) span.textContent = numVal !== null ? `${numVal}${habit && habit.unit ? ' '+habit.unit : ''}` : '—';

    td.classList.remove('cell-done', 'cell-miss');
    if (numVal !== null) {
      td.classList.add(isDone ? 'cell-done' : 'cell-miss');
    }
    if (dateStr === todayStr()) td.classList.add('col-today');
  }

  closeNumericPopup();
}

function closeNumericPopup() {
  document.getElementById('numeric-popup').classList.add('hidden');
  STATE._numericContext = null;
}

/* === SECTION 9: HABIT CRUD === */

/**
 * Renders the habit form inside the modal (used for both add and edit).
 * Returns the HTML string.
 */
function habitFormHTML(habit) {
  const cats = CATEGORIES.map(c =>
    `<option value="${c}" ${habit && habit.category === c ? 'selected' : ''}>${c}</option>`
  ).join('');

  const isNumeric  = habit && habit.trackingType === 'numeric';
  const name       = habit ? escapeHtml(habit.name)         : '';
  const unit       = habit ? escapeHtml(habit.unit || '')    : '';
  const target     = habit && habit.dailyTarget !== null ? habit.dailyTarget : '';

  return `
    <form id="habit-form" novalidate>
      <div class="form-group">
        <label for="hf-name">Habit Name <span style="color:var(--danger)">*</span></label>
        <input type="text" id="hf-name" value="${name}" maxlength="120" required autocomplete="off">
        <div id="hf-name-error" class="form-error" role="alert"></div>
      </div>
      <div class="form-group">
        <label for="hf-category">Category</label>
        <select id="hf-category">${cats}</select>
      </div>
      <div class="form-group">
        <label>Tracking Type</label>
        <div class="radio-group">
          <label>
            <input type="radio" name="hf-type" value="boolean" ${!isNumeric ? 'checked' : ''}>
            Yes/No (checkbox)
          </label>
          <label>
            <input type="radio" name="hf-type" value="numeric" ${isNumeric ? 'checked' : ''}>
            Numeric value
          </label>
        </div>
      </div>
      <div id="hf-numeric-section" style="${isNumeric ? '' : 'display:none'}">
        <div class="form-row">
          <div class="form-group">
            <label for="hf-unit">Unit (optional)</label>
            <input type="text" id="hf-unit" value="${unit}" maxlength="20" placeholder="e.g. ml, mins">
          </div>
          <div class="form-group">
            <label for="hf-target">Daily Target (optional)</label>
            <input type="number" id="hf-target" value="${target}" min="0" placeholder="e.g. 500">
            <div class="form-hint">Leave blank if any entry counts as done.</div>
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" id="hf-cancel" class="btn">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Habit</button>
      </div>
    </form>`;
}

function openAddHabitModal() {
  showModal('Add New Habit', habitFormHTML(null));
  document.getElementById('hf-name').focus();

  // Show/hide numeric section on radio change
  wireHabitFormRadio();

  document.getElementById('hf-cancel').addEventListener('click', closeModal);
  document.getElementById('habit-form').addEventListener('submit', e => {
    e.preventDefault();
    submitAddHabit();
  });
}

function submitAddHabit() {
  const nameEl  = document.getElementById('hf-name');
  const errEl   = document.getElementById('hf-name-error');
  const name    = nameEl.value.trim();

  if (!name) {
    errEl.textContent = 'Habit name is required.';
    nameEl.focus();
    return;
  }
  errEl.textContent = '';

  const category    = document.getElementById('hf-category').value;
  const typeVal     = document.querySelector('input[name="hf-type"]:checked').value;
  const unit        = (document.getElementById('hf-unit').value || '').trim();
  const targetRaw   = document.getElementById('hf-target').value.trim();
  const dailyTarget = targetRaw !== '' ? parseFloat(targetRaw) : null;

  const maxOrder = STATE.habits.reduce((max, h) => Math.max(max, h.order), -1);

  const newHabit = {
    id:           generateId(),
    name,
    category,
    order:        maxOrder + 1,
    archived:     false,
    trackingType: typeVal,
    unit:         typeVal === 'numeric' ? unit : '',
    dailyTarget:  typeVal === 'numeric' ? (isNaN(dailyTarget) ? null : dailyTarget) : null,
    createdAt:    todayStr(),
  };

  STATE.habits.push(newHabit);
  saveHabits();
  closeModal();
  renderTracker();
}

function openEditHabitModal(habitId) {
  const habit = STATE.habits.find(h => h.id === habitId);
  if (!habit) return;

  showModal('Edit Habit', habitFormHTML(habit));
  document.getElementById('hf-name').focus();

  wireHabitFormRadio();

  document.getElementById('hf-cancel').addEventListener('click', closeModal);
  document.getElementById('habit-form').addEventListener('submit', e => {
    e.preventDefault();
    submitEditHabit(habitId);
  });
}

function submitEditHabit(habitId) {
  const nameEl = document.getElementById('hf-name');
  const errEl  = document.getElementById('hf-name-error');
  const name   = nameEl.value.trim();

  if (!name) {
    errEl.textContent = 'Habit name is required.';
    nameEl.focus();
    return;
  }
  errEl.textContent = '';

  const habit    = STATE.habits.find(h => h.id === habitId);
  if (!habit) return;

  const category    = document.getElementById('hf-category').value;
  const typeVal     = document.querySelector('input[name="hf-type"]:checked').value;
  const unit        = (document.getElementById('hf-unit').value || '').trim();
  const targetRaw   = document.getElementById('hf-target').value.trim();
  const dailyTarget = targetRaw !== '' ? parseFloat(targetRaw) : null;

  habit.name         = name;
  habit.category     = category;
  habit.trackingType = typeVal;
  habit.unit         = typeVal === 'numeric' ? unit : '';
  habit.dailyTarget  = typeVal === 'numeric' ? (isNaN(dailyTarget) ? null : dailyTarget) : null;

  saveHabits();
  closeModal();
  renderTracker();
}

function deleteHabit(habitId) {
  const habit = STATE.habits.find(h => h.id === habitId);
  const name  = habit ? escapeHtml(habit.name) : 'this habit';
  showConfirm(
    `Delete "${name}" and all its records? This cannot be undone.`,
    () => {
      STATE.habits = STATE.habits.filter(h => h.id !== habitId);
      // Remove all records for this habit from every date
      Object.keys(STATE.records).forEach(date => {
        if (STATE.records[date]) delete STATE.records[date][habitId];
      });
      saveHabits();
      saveRecords();
      renderTracker();
    }
  );
}

function toggleArchiveHabit(habitId) {
  const habit = STATE.habits.find(h => h.id === habitId);
  if (!habit) return;
  habit.archived = !habit.archived;
  saveHabits();
  renderTracker();
}

function moveHabitUp(habitId) {
  const sorted = [...STATE.habits].sort((a, b) => a.order - b.order);
  const idx    = sorted.findIndex(h => h.id === habitId);
  if (idx <= 0) return; // already at top
  // Swap order values
  const tmp = sorted[idx].order;
  sorted[idx].order     = sorted[idx - 1].order;
  sorted[idx - 1].order = tmp;
  saveHabits();
  renderTracker();
}

function moveHabitDown(habitId) {
  const sorted = [...STATE.habits].sort((a, b) => a.order - b.order);
  const idx    = sorted.findIndex(h => h.id === habitId);
  if (idx < 0 || idx >= sorted.length - 1) return; // already at bottom
  const tmp = sorted[idx].order;
  sorted[idx].order     = sorted[idx + 1].order;
  sorted[idx + 1].order = tmp;
  saveHabits();
  renderTracker();
}

function toggleShowArchived() {
  STATE.showArchived = !STATE.showArchived;
  updateMonthDisplay(); // updates button label too
  renderTracker();
}

/** Wires the tracking-type radio buttons to show/hide the numeric section. */
function wireHabitFormRadio() {
  document.querySelectorAll('input[name="hf-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const numSection = document.getElementById('hf-numeric-section');
      if (numSection) {
        numSection.style.display = (radio.value === 'numeric' && radio.checked) ? '' : 'none';
      }
    });
  });
}

/* === SECTION 10: MONTH NAVIGATION === */

function prevMonth() {
  if (STATE.currentMonth === 0) {
    STATE.currentMonth = 11;
    STATE.currentYear--;
  } else {
    STATE.currentMonth--;
  }
  renderTracker();
}

function nextMonth() {
  if (STATE.currentMonth === 11) {
    STATE.currentMonth = 0;
    STATE.currentYear++;
  } else {
    STATE.currentMonth++;
  }
  renderTracker();
}

function jumpToToday() {
  const now = new Date();
  STATE.currentYear  = now.getFullYear();
  STATE.currentMonth = now.getMonth();
  renderTracker();
}

/* === SECTION 11: STATISTICS CALCULATIONS (pure functions) === */

/**
 * Returns true if a habit was completed on a given date.
 * For boolean: record must be true.
 * For numeric: any non-null entry counts (or >= dailyTarget if set).
 */
function isHabitCompletedOn(habit, dateStr) {
  if (habit.trackingType === 'boolean') {
    return STATE.records[dateStr] ? STATE.records[dateStr][habit.id] === true : false;
  }
  // Numeric
  const val = STATE.records[dateStr] ? STATE.records[dateStr][habit.id] : undefined;
  if (val === undefined || val === null) return false;
  if (habit.dailyTarget === null || habit.dailyTarget === undefined) return true;
  return val >= habit.dailyTarget;
}

/**
 * Returns habits that were eligible (active, created on or before dateStr) for a given date.
 * Archived habits are excluded from future statistics but their historical records are preserved.
 */
function getEligibleHabits(dateStr) {
  return STATE.habits.filter(h => {
    if (h.archived) return false;           // archived = not counted going forward
    return h.createdAt <= dateStr;          // only after the habit was created
  });
}

/**
 * Returns { completed, eligible, pct } for a given date.
 * Returns null for future dates (they should not be counted as missed).
 */
function getDayStats(dateStr) {
  if (isFutureDate(dateStr)) return null;
  const eligible  = getEligibleHabits(dateStr);
  const completed = eligible.filter(h => isHabitCompletedOn(h, dateStr)).length;
  const pct       = eligible.length > 0 ? Math.round(completed / eligible.length * 100) : 0;
  return { completed, eligible: eligible.length, pct };
}

/**
 * Returns stats for the last 7 calendar days ending today.
 */
function getWeekStats() {
  let totalCompleted = 0;
  let totalEligible  = 0;
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const stats   = getDayStats(dateStr);
    if (stats) {
      totalCompleted += stats.completed;
      totalEligible  += stats.eligible;
    }
  }
  const pct = totalEligible > 0 ? Math.round(totalCompleted / totalEligible * 100) : 0;
  return { completed: totalCompleted, eligible: totalEligible, pct };
}

/**
 * Returns stats for all non-future days in a given year/month.
 */
function getMonthStats(year, month) {
  let totalCompleted = 0;
  let totalEligible  = 0;
  const days = getDaysInMonth(year, month);
  for (let d = 1; d <= days; d++) {
    const dateStr = formatDate(year, month + 1, d);
    const stats   = getDayStats(dateStr);
    if (stats) {
      totalCompleted += stats.completed;
      totalEligible  += stats.eligible;
    }
  }
  const pct = totalEligible > 0 ? Math.round(totalCompleted / totalEligible * 100) : 0;
  return { completed: totalCompleted, eligible: totalEligible, pct };
}

/**
 * Returns stats across all days from the earliest habit creation date to today.
 */
function getOverallStats() {
  if (STATE.habits.length === 0) return { completed: 0, eligible: 0, pct: 0 };
  const minDate = STATE.habits.reduce((min, h) => h.createdAt < min ? h.createdAt : min, STATE.habits[0].createdAt);
  const today   = todayStr();

  let totalCompleted = 0;
  let totalEligible  = 0;
  let cursor = new Date(minDate + 'T00:00:00');
  const end  = new Date(today   + 'T00:00:00');

  while (cursor <= end) {
    const dateStr = formatDate(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate());
    const stats   = getDayStats(dateStr);
    if (stats) {
      totalCompleted += stats.completed;
      totalEligible  += stats.eligible;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const pct = totalEligible > 0 ? Math.round(totalCompleted / totalEligible * 100) : 0;
  return { completed: totalCompleted, eligible: totalEligible, pct };
}

/**
 * Calculates current and best streak for a single habit.
 * - Current: consecutive completed days going backwards from today (stops on first miss).
 * - Best: longest ever consecutive run.
 * Days before the habit was created are skipped (don't break the streak).
 */
function getHabitStreak(habitId) {
  const habit = STATE.habits.find(h => h.id === habitId);
  if (!habit) return { current: 0, best: 0 };

  const today     = todayStr();
  const createdAt = habit.createdAt;

  // Gather all eligible dates from createdAt to today
  const dates = [];
  let cursor  = new Date(createdAt + 'T00:00:00');
  const end   = new Date(today     + 'T00:00:00');
  while (cursor <= end) {
    dates.push(formatDate(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate()));
    cursor.setDate(cursor.getDate() + 1);
  }

  if (dates.length === 0) return { current: 0, best: 0 };

  // Calculate best streak (longest consecutive run)
  let best    = 0;
  let running = 0;
  for (const d of dates) {
    if (isHabitCompletedOn(habit, d)) {
      running++;
      if (running > best) best = running;
    } else {
      running = 0;
    }
  }

  // Calculate current streak (count backwards from today)
  let current = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (isHabitCompletedOn(habit, dates[i])) {
      current++;
    } else {
      break; // stop at first miss
    }
  }

  return { current, best };
}

/* === SECTION 12: DASHBOARD RENDERING === */

function renderDashboard() {
  const container = document.getElementById('dashboard-content');
  const today     = todayStr();

  const dayStats     = getDayStats(today) || { completed: 0, eligible: 0, pct: 0 };
  const weekStats    = getWeekStats();
  const monthStats   = getMonthStats(STATE.currentYear, STATE.currentMonth);
  const overallStats = getOverallStats();

  // Habit streak rows
  const activeHabits = STATE.habits
    .filter(h => !h.archived)
    .sort((a, b) => a.order - b.order);

  const streakRows = activeHabits.map(h => {
    const { current, best } = getHabitStreak(h.id);
    return `
      <tr>
        <td>${escapeHtml(h.name)}</td>
        <td>${current} day${current !== 1 ? 's' : ''}</td>
        <td>${best} day${best !== 1 ? 's' : ''}</td>
      </tr>`;
  }).join('');

  // Chart availability check
  const chartAvailable = (typeof Chart !== 'undefined');
  let chartsHTML = '';

  if (!chartAvailable) {
    chartsHTML = `<p class="chart-error">
      📊 Charts unavailable — Chart.js could not be loaded from CDN.
      Try refreshing with an internet connection.
    </p>`;
  } else {
    chartsHTML = `
      <div class="chart-wrap">
        <h4 style="margin-bottom:8px;font-size:0.88em;">Daily Completion % (last 30 days)</h4>
        <canvas id="chart-daily" height="160"></canvas>
      </div>
      <div class="chart-wrap">
        <h4 style="margin-bottom:8px;font-size:0.88em;">Monthly Trend (last 12 months)</h4>
        <canvas id="chart-monthly" height="160"></canvas>
      </div>`;
  }

  container.innerHTML = `
    <div class="section-header">
      <h2>Dashboard</h2>
    </div>

    <div class="dashboard-section">
      <h3>Overview</h3>
      <div class="stat-cards">
        <div class="stat-card">
          <div class="stat-value">${dayStats.pct}%</div>
          <div class="stat-label">Today</div>
          <div class="stat-detail">${dayStats.completed} / ${dayStats.eligible} habits</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${weekStats.pct}%</div>
          <div class="stat-label">This Week</div>
          <div class="stat-detail">${weekStats.completed} / ${weekStats.eligible} entries</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${monthStats.pct}%</div>
          <div class="stat-label">${monthLabel(STATE.currentYear, STATE.currentMonth)}</div>
          <div class="stat-detail">${monthStats.completed} / ${monthStats.eligible} entries</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${overallStats.pct}%</div>
          <div class="stat-label">Overall</div>
          <div class="stat-detail">${overallStats.completed} / ${overallStats.eligible} entries</div>
        </div>
      </div>
    </div>

    <div class="dashboard-section">
      <h3>Streaks</h3>
      ${activeHabits.length === 0
        ? '<p style="color:var(--text-muted)">No active habits.</p>'
        : `<table class="streak-table">
            <thead><tr><th>Habit</th><th>Current Streak</th><th>Best Streak</th></tr></thead>
            <tbody>${streakRows}</tbody>
           </table>`}
    </div>

    <div class="dashboard-section">
      <h3>Charts</h3>
      ${chartsHTML}
    </div>`;

  // Build charts after DOM is ready
  if (chartAvailable) {
    requestAnimationFrame(() => buildCharts());
  }
}

function buildCharts() {
  // Destroy previous chart instances to prevent canvas reuse errors
  if (STATE.charts.daily) {
    STATE.charts.daily.destroy();
    STATE.charts.daily = null;
  }
  if (STATE.charts.monthly) {
    STATE.charts.monthly.destroy();
    STATE.charts.monthly = null;
  }

  // --- Daily bar chart: last 30 days ---
  const dailyLabels = [];
  const dailyData   = [];
  const today       = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const label   = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const stats   = getDayStats(dateStr);
    dailyLabels.push(label);
    dailyData.push(stats ? stats.pct : 0);
  }

  const dailyCtx = document.getElementById('chart-daily');
  if (dailyCtx) {
    STATE.charts.daily = new Chart(dailyCtx, {
      type: 'bar',
      data: {
        labels: dailyLabels,
        datasets: [{
          label: 'Completion %',
          data: dailyData,
          backgroundColor: 'rgba(74,111,165,0.7)',
          borderColor:     'rgba(74,111,165,1)',
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: v => v + '%' } },
          x: { ticks: { maxTicksLimit: 10 } },
        },
      },
    });
  }

  // --- Monthly line chart: last 12 months ---
  const monthlyLabels = [];
  const monthlyData   = [];
  const nowDate       = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth(); // 0-indexed
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const stats = getMonthStats(y, m);
    monthlyLabels.push(label);
    monthlyData.push(stats.pct);
  }

  const monthlyCtx = document.getElementById('chart-monthly');
  if (monthlyCtx) {
    STATE.charts.monthly = new Chart(monthlyCtx, {
      type: 'line',
      data: {
        labels: monthlyLabels,
        datasets: [{
          label: 'Monthly Completion %',
          data: monthlyData,
          borderColor:           'rgba(74,111,165,1)',
          backgroundColor:       'rgba(74,111,165,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: v => v + '%' } },
        },
      },
    });
  }
}

/* === SECTION 13: GATE LOG TAB === */

function renderGateTab() {
  const container = document.getElementById('gate-content');

  // Sort entries descending by date
  const entries = [...STATE.gateLog].sort((a, b) => b.date.localeCompare(a.date));

  // Build weekly-grouped table rows (only when there are entries)
  let historyHTML = '';
  if (entries.length === 0) {
    historyHTML = `
      <div class="empty-state">
        <strong>No entries yet.</strong>
        <p>Log your first study session above to get started.</p>
      </div>`;
  } else {
    // Group by ISO week for summary rows
    const asc = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const weekGroups = {};
    asc.forEach(entry => {
      const wk = isoWeekKey(entry.date);
      if (!weekGroups[wk]) weekGroups[wk] = { mins: 0, qs: 0, monday: null };
      weekGroups[wk].mins += (parseInt(entry.studyMinutes) || 0);
      weekGroups[wk].qs   += (parseInt(entry.questionsAttempted) || 0);
      // Find Monday of this week
      const d = new Date(entry.date + 'T00:00:00');
      const day = d.getDay();
      const diff = (day === 0) ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      weekGroups[wk].monday = formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
    });

    // Render descending, inserting week summary after the last row of each week
    let tableRows = '';
    const weeksSeen = new Set();
    entries.forEach(entry => {
      const wk = isoWeekKey(entry.date);
      tableRows += `
        <tr>
          <td>${entry.date}</td>
          <td>${entry.studyMinutes || 0}</td>
          <td>${escapeHtml(entry.topics || '')}</td>
          <td>${entry.questionsAttempted || 0}</td>
          <td>${entry.correctAnswers || 0}</td>
          <td>${escapeHtml(entry.notes || '')}</td>
          <td><button class="btn btn-sm btn-danger" data-gate-delete="${escapeHtml(entry.id)}" aria-label="Delete entry for ${entry.date}">Delete</button></td>
        </tr>`;
      // After the last occurrence of a week (in descending order, first time we see the week), add summary
      if (!weeksSeen.has(wk)) {
        weeksSeen.add(wk);
        const wg = weekGroups[wk];
        tableRows += `
          <tr class="week-summary-row">
            <td colspan="7">Week of ${wg.monday}: ${wg.mins} min total, ${wg.qs} questions</td>
          </tr>`;
      }
    });

    historyHTML = `
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th><th>Mins</th><th>Topics</th>
              <th>Q.Tried</th><th>Q.Correct</th><th>Notes</th><th>Action</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`;
  }

  container.innerHTML = `
    <div class="section-header">
      <h2>GATE Log</h2>
    </div>

    <div class="settings-section">
      <h3>Log a Study Session</h3>
      <form id="gate-form" novalidate>
        <div class="form-row">
          <div class="form-group">
            <label for="gate-date">Date</label>
            <input type="date" id="gate-date" value="${todayStr()}" max="${todayStr()}" required>
          </div>
          <div class="form-group">
            <label for="gate-mins">Study Minutes</label>
            <input type="number" id="gate-mins" min="0" max="1440" placeholder="e.g. 90">
          </div>
        </div>
        <div class="form-group">
          <label for="gate-topics">Topics Studied</label>
          <textarea id="gate-topics" placeholder="e.g. Discrete Math, Algorithms"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="gate-qtried">Questions Attempted</label>
            <input type="number" id="gate-qtried" min="0" placeholder="0">
          </div>
          <div class="form-group">
            <label for="gate-qcorrect">Correct Answers</label>
            <input type="number" id="gate-qcorrect" min="0" placeholder="0">
          </div>
        </div>
        <div class="form-group">
          <label for="gate-notes">Notes / Difficult Topics</label>
          <textarea id="gate-notes" placeholder="Anything you want to remember..."></textarea>
        </div>
        <div id="gate-error" class="form-error" role="alert"></div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Log Session</button>
        </div>
      </form>
    </div>

    <div class="section-header" style="margin-top:24px">
      <h3>Study History</h3>
    </div>
    <div id="gate-history-area">
    ${historyHTML}
    </div>`;

  document.getElementById('gate-form').addEventListener('submit', e => {
    e.preventDefault();
    submitGateEntry();
  });

  // Delete buttons (event delegation) — attached to rebuilt child, not the persistent container.
  // This prevents listener accumulation when the tab is visited multiple times.
  const historyArea = document.getElementById('gate-history-area');
  if (historyArea) {
    historyArea.addEventListener('click', e => {
      const btn = e.target.closest('[data-gate-delete]');
      if (btn) {
        deleteGateEntry(btn.dataset.gateDelete);
      }
    });
  }
}

function submitGateEntry() {
  const errEl = document.getElementById('gate-error');
  const date  = document.getElementById('gate-date').value;
  const mins  = parseInt(document.getElementById('gate-mins').value) || 0;

  if (!date) { errEl.textContent = 'Date is required.'; return; }
  if (mins < 0) { errEl.textContent = 'Minutes must be 0 or more.'; return; }
  errEl.textContent = '';

  const entry = {
    id:                   generateId(),
    date,
    studyMinutes:         mins,
    topics:               document.getElementById('gate-topics').value.trim(),
    questionsAttempted:   parseInt(document.getElementById('gate-qtried').value)  || 0,
    correctAnswers:       parseInt(document.getElementById('gate-qcorrect').value) || 0,
    notes:                document.getElementById('gate-notes').value.trim(),
  };

  STATE.gateLog.push(entry);
  saveGateLog();
  renderGateTab();
}

function deleteGateEntry(id) {
  STATE.gateLog = STATE.gateLog.filter(e => e.id !== id);
  saveGateLog();
  renderGateTab();
}

/* === SECTION 14: SLEEP LOG TAB === */

function renderSleepTab() {
  const container = document.getElementById('sleep-content');

  const entries = [...STATE.sleepLog].sort((a, b) => b.date.localeCompare(a.date));

  let historyHTML = '';
  if (entries.length === 0) {
    historyHTML = `
      <div class="empty-state">
        <strong>No sleep entries yet.</strong>
        <p>Log your first night above to start tracking.</p>
      </div>`;
  } else {
    let tableRows = '';
    entries.forEach(entry => {
      tableRows += `
        <tr>
          <td>${entry.date}</td>
          <td>${entry.bedtime || '—'}</td>
          <td>${entry.wakeTime || '—'}</td>
          <td>${entry.durationMinutes ? formatDuration(entry.durationMinutes) : '—'}</td>
          <td>${entry.sleepiness !== undefined ? entry.sleepiness + '/10' : '—'}</td>
          <td><button class="btn btn-sm btn-danger" data-sleep-delete="${escapeHtml(entry.id)}" aria-label="Delete sleep entry for ${entry.date}">Delete</button></td>
        </tr>`;
    });
    historyHTML = `
      <div style="overflow-x:auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Wake Date</th><th>Bedtime</th><th>Wake Time</th>
              <th>Duration</th><th>Sleepiness</th><th>Action</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`;
  }

  container.innerHTML = `
    <div class="section-header">
      <h2>Sleep Log</h2>
    </div>

    <div class="settings-section">
      <h3>Log a Night</h3>
      <form id="sleep-form" novalidate>
        <div class="form-row">
          <div class="form-group">
            <label for="sleep-date">Date (wake-up date)</label>
            <input type="date" id="sleep-date" value="${todayStr()}" max="${todayStr()}" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="sleep-bed">Bedtime</label>
            <input type="time" id="sleep-bed" required>
          </div>
          <div class="form-group">
            <label for="sleep-wake">Wake-up Time</label>
            <input type="time" id="sleep-wake" required>
          </div>
        </div>
        <div class="form-group">
          <label for="sleep-sleepiness">Sleepiness (1=alert, 10=very sleepy): <output id="sleep-sleepiness-val" for="sleep-sleepiness">5</output></label>
          <input type="range" id="sleep-sleepiness" min="1" max="10" value="5"
            aria-label="Sleepiness rating from 1 to 10"
            oninput="document.getElementById('sleep-sleepiness-val').textContent=this.value">
        </div>
        <div id="sleep-error" class="form-error" role="alert"></div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Log Sleep</button>
        </div>
      </form>
    </div>

    <div class="section-header" style="margin-top:24px">
      <h3>Sleep History</h3>
    </div>
    <div id="sleep-history-area">
    ${historyHTML}
    </div>`;

  document.getElementById('sleep-form').addEventListener('submit', e => {
    e.preventDefault();
    submitSleepEntry();
  });

  // Delete buttons (event delegation) — attached to rebuilt child, not the persistent container.
  // This prevents listener accumulation when the tab is visited multiple times.
  const sleepHistoryArea = document.getElementById('sleep-history-area');
  if (sleepHistoryArea) {
    sleepHistoryArea.addEventListener('click', e => {
      const btn = e.target.closest('[data-sleep-delete]');
      if (btn) deleteSleepEntry(btn.dataset.sleepDelete);
    });
  }
}

function submitSleepEntry() {
  const errEl   = document.getElementById('sleep-error');
  const date    = document.getElementById('sleep-date').value;
  const bedtime = document.getElementById('sleep-bed').value;
  const wakeTime = document.getElementById('sleep-wake').value;

  if (!date) { errEl.textContent = 'Date is required.'; return; }
  if (!bedtime) { errEl.textContent = 'Bedtime is required.'; return; }
  if (!wakeTime) { errEl.textContent = 'Wake-up time is required.'; return; }

  errEl.textContent = '';

  const mins = durationMinutes(bedtime, wakeTime);
  const entry = {
    id:              generateId(),
    date,
    bedtime,
    wakeTime,
    durationMinutes: mins,
    sleepiness:      parseInt(document.getElementById('sleep-sleepiness').value),
  };

  STATE.sleepLog.push(entry);
  saveSleepLog();
  renderSleepTab();
}

function deleteSleepEntry(id) {
  STATE.sleepLog = STATE.sleepLog.filter(e => e.id !== id);
  saveSleepLog();
  renderSleepTab();
}

/* === SECTION 15: CIGARETTE TRACKING === */

/**
 * Returns the HTML for the cigarette tracking sub-section (used inside Settings).
 */
function renderCigaretteSection() {
  const s = STATE.settings;
  const tracking = s.cigaretteTracking;

  // Compute stats
  const cigDates = Object.keys(STATE.records).filter(d =>
    STATE.records[d] && STATE.records[d]['_cig'] && STATE.records[d]['_cig'].smoked === false
  );
  const daysSmokeFree = cigDates.length;
  const baseline      = s.cigaretteBaseline;
  const cost          = s.cigaretteCostPerUnit;
  const avoided       = baseline ? daysSmokeFree * baseline : null;
  const saved         = (baseline && cost) ? (avoided * cost) : null;

  const statsHTML = tracking && baseline
    ? `<div class="stat-cards" style="margin-top:12px">
        <div class="stat-card">
          <div class="stat-value">${daysSmokeFree}</div>
          <div class="stat-label">Days Smoke-Free</div>
        </div>
        ${avoided !== null ? `<div class="stat-card">
          <div class="stat-value">${avoided}</div>
          <div class="stat-label">Cigarettes Avoided</div>
        </div>` : ''}
        ${saved !== null ? `<div class="stat-card">
          <div class="stat-value">₹${saved.toFixed(0)}</div>
          <div class="stat-label">Money Saved</div>
        </div>` : ''}
      </div>`
    : '';

  const todayCig = STATE.records[todayStr()] ? STATE.records[todayStr()]['_cig'] : null;

  return `
    <div class="settings-section">
      <h3>Cigarette Tracking</h3>
      <div class="form-group">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="cig-toggle" ${tracking ? 'checked' : ''} style="width:auto">
          Track cigarette data
        </label>
      </div>
      ${tracking ? `
        <div class="form-row">
          <div class="form-group">
            <label for="cig-baseline">Cigarettes per day (baseline)</label>
            <input type="number" id="cig-baseline" min="0" value="${baseline !== null ? baseline : ''}"
              placeholder="e.g. 10">
            <div class="form-hint">Your baseline before cutting back.</div>
          </div>
          <div class="form-group">
            <label for="cig-cost">Cost per cigarette (₹)</label>
            <input type="number" id="cig-cost" min="0" step="0.01" value="${cost !== null ? cost : ''}"
              placeholder="e.g. 15">
          </div>
        </div>
        <div class="form-group">
          <strong>Today's Record</strong>
          <label style="display:flex;align-items:center;gap:8px;margin-top:6px;cursor:pointer">
            <input type="checkbox" id="cig-smoked-today" style="width:auto"
              ${todayCig && todayCig.smoked ? 'checked' : ''}>
            I smoked today
          </label>
          <div class="form-group" style="margin-top:8px">
            <label for="cig-count-today">Number of cigarettes (optional)</label>
            <input type="number" id="cig-count-today" min="0"
              value="${todayCig && todayCig.count != null ? todayCig.count : ''}">
          </div>
          <button id="cig-save-today" class="btn btn-primary btn-sm" style="margin-top:8px">Save Today's Record</button>
        </div>
        ${statsHTML}
      ` : ''}
    </div>`;
}

/* === SECTION 16: SETTINGS TAB === */

function renderSettings() {
  const container = document.getElementById('settings-content');

  container.innerHTML = `
    <div class="section-header">
      <h2>Settings</h2>
    </div>

    <div class="notice-box">
      ⚠️ Data is stored in this browser's localStorage. It is not synced to other devices or browsers.
      Use <strong>Export</strong> / <strong>Import</strong> to back up or transfer your data.
    </div>

    <div class="settings-section">
      <h3>Data Management</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <button id="btn-export" class="btn btn-primary">⬇ Export Data</button>
        <label class="btn" style="cursor:pointer">
          ⬆ Import Data
          <input type="file" id="import-file" accept=".json" style="display:none">
        </label>
        <button id="btn-clear" class="btn btn-danger">🗑 Clear All Data</button>
      </div>
      <div id="clear-confirm-area"></div>
    </div>

    ${renderCigaretteSection()}`;

  // Export
  document.getElementById('btn-export').addEventListener('click', exportData);

  // Import
  document.getElementById('import-file').addEventListener('change', e => {
    if (e.target.files && e.target.files[0]) {
      importData(e.target.files[0]);
      e.target.value = ''; // reset so same file can be re-selected
    }
  });

  // Clear — two-step
  let clearStep = 0;
  document.getElementById('btn-clear').addEventListener('click', () => {
    clearStep++;
    const area = document.getElementById('clear-confirm-area');
    if (clearStep === 1) {
      area.innerHTML = `
        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:10px 14px;margin-bottom:8px">
          ⚠️ This will delete <strong>all habits, records, and logs</strong>. This cannot be undone.
          <br>Click the button again to confirm.
        </div>`;
    } else {
      clearStep = 0;
      area.innerHTML = '';
      clearAllData();
    }
  });

  // Cigarette tracking toggle
  const cigToggle = document.getElementById('cig-toggle');
  if (cigToggle) {
    cigToggle.addEventListener('change', () => {
      STATE.settings.cigaretteTracking = cigToggle.checked;
      saveSettings();
      renderSettings();
    });
  }

  // Cigarette baseline / cost (blur to save)
  const cigBaseline = document.getElementById('cig-baseline');
  if (cigBaseline) {
    cigBaseline.addEventListener('blur', () => {
      const v = parseFloat(cigBaseline.value);
      STATE.settings.cigaretteBaseline = isNaN(v) ? null : v;
      saveSettings();
    });
  }
  const cigCost = document.getElementById('cig-cost');
  if (cigCost) {
    cigCost.addEventListener('blur', () => {
      const v = parseFloat(cigCost.value);
      STATE.settings.cigaretteCostPerUnit = isNaN(v) ? null : v;
      saveSettings();
    });
  }

  // Save today's cigarette record
  const cigSaveBtn = document.getElementById('cig-save-today');
  if (cigSaveBtn) {
    cigSaveBtn.addEventListener('click', () => {
      const smoked = document.getElementById('cig-smoked-today').checked;
      const countRaw = document.getElementById('cig-count-today').value.trim();
      const count  = countRaw !== '' ? parseInt(countRaw) : null;
      const today  = todayStr();
      if (!STATE.records[today]) STATE.records[today] = {};
      STATE.records[today]['_cig'] = { smoked, count: isNaN(count) ? null : count };
      saveRecords();
      renderSettings(); // refresh stats
    });
  }
}

function exportData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    habits:     STATE.habits,
    records:    STATE.records,
    settings:   STATE.settings,
    gateLog:    STATE.gateLog,
    sleepLog:   STATE.sleepLog,
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `habittracker-export-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    let parsed;
    try {
      parsed = JSON.parse(e.target.result);
    } catch (err) {
      alert('Invalid file — could not parse JSON. Please select a valid export file.');
      return;
    }
    if (!parsed || !Array.isArray(parsed.habits)) {
      alert('Invalid file — missing habits data. Please select a valid export file.');
      return;
    }
    showConfirm(
      'Import this file? All current data will be replaced with the imported data.',
      () => {
        STATE.habits   = parsed.habits   || [];
        STATE.records  = parsed.records  || {};
        STATE.settings = Object.assign(
          { cigaretteTracking: false, cigaretteBaseline: null, cigaretteCostPerUnit: null },
          parsed.settings || {}
        );
        STATE.gateLog  = parsed.gateLog  || [];
        STATE.sleepLog = parsed.sleepLog || [];
        saveHabits();
        saveRecords();
        saveSettings();
        saveGateLog();
        saveSleepLog();
        renderTracker();
        renderSettings();
        alert('Data imported successfully.');
      }
    );
  };
  reader.onerror = function() {
    alert('Failed to read the file. Please try again.');
  };
  reader.readAsText(file);
}

function clearAllData() {
  // Remove all localStorage keys
  Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));

  // Reset STATE
  STATE.habits   = [];
  STATE.records  = {};
  STATE.settings = { cigaretteTracking: false, cigaretteBaseline: null, cigaretteCostPerUnit: null };
  STATE.gateLog  = [];
  STATE.sleepLog = [];

  // Re-seed default habits with fresh IDs and today as createdAt
  const today = todayStr();
  DEFAULT_HABITS.forEach((h, i) => {
    STATE.habits.push({
      id:           generateId(),
      name:         h.name,
      category:     h.category,
      order:        i,
      archived:     false,
      trackingType: 'boolean',
      unit:         '',
      dailyTarget:  null,
      createdAt:    today,
    });
  });

  saveHabits();
  saveRecords();
  saveSettings();
  saveGateLog();
  saveSleepLog();
  jumpToToday();
  switchTab('tracker');
}

/* === SECTION 17: MODAL & CONFIRM HELPERS === */

/**
 * Shows the reusable modal with a given title and body HTML.
 * Attaches the submit handler to any form inside modal-body.
 */
function showModal(title, bodyHTML) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML   = bodyHTML;
  document.getElementById('modal-container').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-container').classList.add('hidden');
  document.getElementById('modal-body').innerHTML = '';
}

/**
 * Shows a confirmation dialog.
 * @param {string}   message    - The question to display.
 * @param {Function} onConfirm  - Called when the user clicks Confirm.
 */
function showConfirm(message, onConfirm) {
  document.getElementById('confirm-message').textContent = message;
  STATE._confirmCallback = onConfirm;
  document.getElementById('confirm-dialog').classList.remove('hidden');
}

function closeConfirm() {
  document.getElementById('confirm-dialog').classList.add('hidden');
  STATE._confirmCallback = null;
}
