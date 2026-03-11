/* ============================================
   My Dida — 应用逻辑（含循环规则 + 多点提醒）
   ============================================ */

// ╔═══════════════════════════════════════════════════╗
// ║  👇👇👇  在这里填入你的 Supabase 配置  👇👇👇     ║
// ║                                                   ║
// ║  1. 登录 https://supabase.com                     ║
// ║  2. 打开你的项目 → Settings → API                 ║
// ║  3. 复制 Project URL 和 Publishable key           ║
// ╚═══════════════════════════════════════════════════╝

const SUPABASE_URL = window.CONFIG?.SUPABASE_URL || '___SUPABASE_URL___';
const SUPABASE_ANON_KEY = window.CONFIG?.SUPABASE_ANON_KEY || '___SUPABASE_ANON_KEY___';

// ──────────────────────────────────────────────

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM Elements
const taskForm = document.getElementById('add-task-form');
const taskInput = document.getElementById('task-input');
const taskList = document.getElementById('task-list');
const emptyState = document.getElementById('empty-state');
const loadingState = document.getElementById('loading-state');
const errorState = document.getElementById('error-state');
const statsText = document.getElementById('stats-text');
const retryBtn = document.getElementById('retry-btn');
const enableNotifBtn = document.getElementById('enable-notifications-btn');

const addTaskModal = document.getElementById('add-task-modal');
const fabAddBtn = document.getElementById('fab-add-btn');
const pageTitle = document.getElementById('page-title');
const navItems = document.querySelectorAll('.nav-item');
const settingsTab = document.getElementById('settings-tab');

// Recurrence panel elements
const recurrenceToggleBtn = document.getElementById('recurrence-toggle-btn');
const recurrencePanel = document.getElementById('recurrence-panel');
const recurrenceCloseBtn = document.getElementById('recurrence-close-btn');
const recurrenceTabs = document.getElementById('recurrence-tabs');

// Reminders panel elements
const remindersToggleBtn = document.getElementById('reminders-toggle-btn');
const remindersPanel = document.getElementById('reminders-panel');
const remindersCloseBtn = document.getElementById('reminders-close-btn');
const reminderCardsList = document.getElementById('reminder-cards-list');
const addReminderCardBtn = document.getElementById('add-reminder-card-btn');

// Countdown toggle
const countdownToggleBtn = document.getElementById('countdown-toggle-btn');
let isCountdownEnabled = false;

// VAPID 公钥
const VAPID_PUBLIC_KEY = 'BJ4hyMVsCzUuUWz4uFdpjdU5gubSyOvvtHJqm5gFpelUZtAQpWvb5ls3Iw2YzsPnmg708UcQaxSMI9sbCZrcjmE';

// ──────────────────── State ────────────────────
let todos = [];
let reminderTimers = {};
let currentTab = 'today';
let editingTodoId = null;

// ──────────────────── Init ────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadTodos();
  taskForm.addEventListener('submit', handleAddTask);
  retryBtn.addEventListener('click', loadTodos);

  // 手动刷新按钮
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.classList.add('spinning');
      loadTodos().finally(() => {
        setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
      });
    });
  }

  // FAB 绑定
  if (fabAddBtn) {
    fabAddBtn.addEventListener('click', () => {
      openModal();
    });
  }

  // Modal 点击背景关闭
  if (addTaskModal) {
    addTaskModal.addEventListener('click', (e) => {
      if (e.target === addTaskModal) closeModal();
    });
  }

  // Tab 切换
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      const tab = item.getAttribute('data-tab');
      currentTab = tab;
      const tabNames = { today: '今天', all: '全部', countdown: '倒数日', settings: '配置' };
      if (pageTitle) pageTitle.textContent = tabNames[tab] || '今天';
      renderTodos();
    });
  });

  // 📌 Recurrence panel toggle
  recurrenceToggleBtn.addEventListener('click', () => {
    const open = recurrencePanel.style.display !== 'none';
    recurrencePanel.style.display = open ? 'none' : 'flex';
    recurrenceToggleBtn.classList.toggle('active', !open);
    if (!open) initRecurrenceStartDate();
  });
  recurrenceCloseBtn.addEventListener('click', () => {
    recurrencePanel.style.display = 'none';
    recurrenceToggleBtn.classList.remove('active');
  });

  // Recurrence mode tabs (单次 vs 循环)
  const recurrenceModeTabs = document.getElementById('recurrence-mode-tabs');
  recurrenceModeTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.type-tab');
    if (!tab) return;
    recurrenceModeTabs.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const mode = tab.dataset.mode;
    if (mode === 'recurring') {
      recurrenceTabs.style.display = 'flex';
      // Activate the first sub-type if none is active
      if (!recurrenceTabs.querySelector('.type-tab.active')) {
        recurrenceTabs.querySelector('.type-tab').classList.add('active');
      }
      const activeSubTab = recurrenceTabs.querySelector('.type-tab.active');
      updateRecurrenceSubOptions(activeSubTab ? activeSubTab.dataset.type : 'daily');
    } else {
      recurrenceTabs.style.display = 'none';
      updateRecurrenceSubOptions('none');
    }
  });

  // Recurrence sub-type tabs (每天/每周/每月/每年)
  recurrenceTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.type-tab');
    if (!tab) return;
    recurrenceTabs.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    updateRecurrenceSubOptions(tab.dataset.type);
  });

  // Weekday buttons toggle
  document.getElementById('weekday-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('.weekday-btn');
    if (!btn) return;
    btn.classList.toggle('selected');
  });

  // 📅 History Calendar
  document.getElementById('open-history-btn').addEventListener('click', () => {
    const panel = document.getElementById('task-history-panel');
    if (panel._todo) openHistoryCalendar(panel._todo);
  });
  document.getElementById('close-history-btn').addEventListener('click', () => {
    document.getElementById('history-calendar-overlay').style.display = 'none';
  });
  document.getElementById('history-calendar-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'history-calendar-overlay') {
      e.target.style.display = 'none';
    }
  });
  document.getElementById('cal-prev-month').addEventListener('click', () => {
    calendarState.month--;
    if (calendarState.month < 0) { calendarState.month = 11; calendarState.year--; }
    renderCalendarMonth();
  });
  document.getElementById('cal-next-month').addEventListener('click', () => {
    calendarState.month++;
    if (calendarState.month > 11) { calendarState.month = 0; calendarState.year++; }
    renderCalendarMonth();
  });

  // ⏰ Reminders panel toggle
  remindersToggleBtn.addEventListener('click', () => {
    const open = remindersPanel.style.display !== 'none';
    remindersPanel.style.display = open ? 'none' : 'flex';
    remindersToggleBtn.classList.toggle('active', !open);
    if (!open && reminderCardsList.children.length === 0) addReminderCard();
  });
  remindersCloseBtn.addEventListener('click', () => {
    remindersPanel.style.display = 'none';
    remindersToggleBtn.classList.remove('active');
  });
  addReminderCardBtn.addEventListener('click', addReminderCard);

  // 📅 History panel elements
  const taskHistoryPanel = document.getElementById('task-history-panel');
  const taskHistoryList = document.getElementById('task-history-list');
  const taskHistoryEmpty = document.getElementById('task-history-empty');

  // ⭐ Countdown toggle
  countdownToggleBtn.addEventListener('click', () => {
    isCountdownEnabled = !isCountdownEnabled;
    countdownToggleBtn.classList.toggle('active', isCountdownEnabled);
  });

  document.getElementById('clear-end-date-btn').addEventListener('click', () => {
    const el = document.getElementById('rec-end-date');
    el.value = '';
    el.type = 'text';
  });

  // 推送通知
  initPushUI();

  // iOS PWA 从后台恢复时自动刷新
  let lastRefresh = Date.now();
  function refreshIfNeeded() {
    const now = Date.now();
    if (now - lastRefresh > 2000) {
      lastRefresh = now;
      loadTodos();
    }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshIfNeeded();
  });
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) refreshIfNeeded();
  });
  window.addEventListener('focus', refreshIfNeeded);
});

// ──────────────────── Modal helpers ────────────────────
function openModal(todo = null) {
  resetModalForm();
  
  if (todo) {
    editingTodoId = todo.id;
    taskInput.value = todo.text;
    
    if (todo.recurrence) {
      recurrencePanel.style.display = 'flex';
      recurrenceToggleBtn.classList.add('active');
      // Set top-level mode to "循环"
      const modeTabs = document.getElementById('recurrence-mode-tabs');
      modeTabs.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
      modeTabs.querySelector('[data-mode="recurring"]').classList.add('active');
      recurrenceTabs.style.display = 'flex';
      // Set the correct sub-type
      recurrenceTabs.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
      const activeTab = recurrenceTabs.querySelector(`[data-type="${todo.recurrence.type}"]`);
      if (activeTab) activeTab.classList.add('active');
      updateRecurrenceSubOptions(todo.recurrence.type);
      
      if (todo.recurrence.type === 'daily') {
        document.getElementById('rec-daily-interval').value = todo.recurrence.interval || 1;
      } else if (todo.recurrence.type === 'weekly') {
        const days = todo.recurrence.days || [];
        document.querySelectorAll('.weekday-btn').forEach(b => {
          if (days.includes(parseInt(b.dataset.day))) b.classList.add('selected');
        });
      } else if (todo.recurrence.type === 'monthly') {
        document.getElementById('rec-monthly-days').value = (todo.recurrence.days || []).join(',');
      } else if (todo.recurrence.type === 'yearly') {
        document.getElementById('rec-yearly-month').value = todo.recurrence.month || 1;
        document.getElementById('rec-yearly-day').value = todo.recurrence.day || 1;
      }

      const endDateEl = document.getElementById('rec-end-date');
      if (todo.recurrence.end_date) {
        endDateEl.type = 'date';
        endDateEl.value = todo.recurrence.end_date;
      } else {
        endDateEl.value = '';
        endDateEl.type = 'text';
      }
    }
    
    if (todo.scheduled_date) {
      document.getElementById('rec-start-date').value = todo.scheduled_date;
    }
    
    if (todo.reminders && todo.reminders.length > 0) {
      remindersPanel.style.display = 'flex';
      remindersToggleBtn.classList.add('active');
      todo.reminders.forEach(r => addReminderCard(r.offset_days, r.time));
    } else if (!todo.reminders && todo.remind_at) {
      remindersPanel.style.display = 'flex';
      remindersToggleBtn.classList.add('active');
      const rt = new Date(todo.remind_at);
      const today = new Date(); today.setHours(0,0,0,0);
      const rtBase = new Date(rt); rtBase.setHours(0,0,0,0);
      const diffDays = Math.round((rtBase - today) / 86400000);
      const offset = diffDays <= 0 ? diffDays : 0;
      const hhmm = String(rt.getHours()).padStart(2, '0') + ':' + String(rt.getMinutes()).padStart(2, '0');
      addReminderCard(offset, hhmm);
    }
    
    if (todo.is_countdown) {
      isCountdownEnabled = true;
      countdownToggleBtn.classList.add('active');
    }
  }

  addTaskModal.style.display = 'flex';
  setTimeout(() => addTaskModal.classList.remove('hidden'), 10);
  taskInput.focus();
  fabAddBtn.style.display = 'none';

  // Swap icon: save ✓ when editing, + when creating
  const addBtn = document.getElementById('add-btn');
  if (todo) {
    addBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else {
    addBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
  }

  // Parse emoji from text if editing
  const emojiSelect = document.getElementById('emoji-select');
  emojiSelect.value = '';
  
  if (todo) {
    const emojiMatch = todo.text.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji})\s*/u);
    if (emojiMatch) {
      const emoji = emojiMatch[1];
      // Check if emoji exists in options
      const exists = Array.from(emojiSelect.options).some(opt => opt.value === emoji);
      if (exists) {
        emojiSelect.value = emoji;
        taskInput.value = todo.text.replace(emojiMatch[0], '');
      }
    }
  }

  // Handle task history button visibility
  const taskHistoryPanel = document.getElementById('task-history-panel');
  if (todo && todo.recurrence) {
    taskHistoryPanel.style.display = 'flex';
    // Store current todo for history calendar
    taskHistoryPanel._todo = todo;
  } else {
    taskHistoryPanel.style.display = 'none';
  }
}

// ──────────── Calendar History ────────────
let calendarState = { year: 0, month: 0, todo: null, completedDates: new Set() };

function openHistoryCalendar(todo) {
  const now = new Date();
  calendarState.year = now.getFullYear();
  calendarState.month = now.getMonth();
  calendarState.todo = todo;
  calendarState.completedDates = new Set();

  document.getElementById('history-calendar-overlay').style.display = 'flex';
  loadCalendarData(todo);
}

async function loadCalendarData(todo) {
  try {
    // Re-fetch the master record's latest recurrence from DB
    const { data: freshData, error: freshError } = await supabaseClient
      .from('todos')
      .select('recurrence')
      .eq('id', todo.id)
      .single();
    if (!freshError && freshData) {
      todo.recurrence = freshData.recurrence;
      calendarState.todo = todo;
    }

    // Use checkin_dates as the single source of truth
    const checkinDates = todo.recurrence?.checkin_dates || [];
    calendarState.completedDates = new Set(checkinDates);
  } catch (err) {
    console.error('Failed to load history:', err);
    calendarState.completedDates = new Set();
  }
  renderCalendarMonth();
}

function renderCalendarMonth() {
  const { year, month, todo } = calendarState;
  const grid = document.getElementById('cal-grid');
  const label = document.getElementById('cal-month-label');
  const summary = document.getElementById('cal-summary');

  label.textContent = `${year}年${month + 1}月`;
  grid.innerHTML = '';

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = getTodayStr();
  const todayDate = new Date(todayStr + 'T00:00:00');

  // Add empty cells for alignment
  for (let i = 0; i < firstDay; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-cell empty';
    grid.appendChild(cell);
  }

  let completedCount = 0;
  let missedCount = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dateObj = new Date(dateStr + 'T00:00:00');

    // Check if this date is a recurrence date
    const isDueDate = todo.recurrence && todo.scheduled_date
      ? matchesRecurrenceOnDate(todo.recurrence, todo.scheduled_date, dateObj)
      : (todo.scheduled_date === dateStr);

    const isCompleted = calendarState.completedDates.has(dateStr);
    const isFuture = dateObj > todayDate;
    const isToday = dateStr === todayStr;

    if (!isDueDate) {
      cell.className = 'cal-cell inactive';
      cell.textContent = day;
    } else if (isCompleted) {
      cell.className = 'cal-cell completed';
      cell.textContent = '✅';
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => toggleCalendarCheckin(dateStr, true));
      completedCount++;
    } else if (isFuture) {
      cell.className = 'cal-cell due';
      cell.textContent = day;
    } else {
      // Past or today, due but not completed = missed
      cell.className = 'cal-cell due';
      cell.textContent = '☐';
      cell.style.cursor = 'pointer';
      cell.addEventListener('click', () => toggleCalendarCheckin(dateStr, false));
      missedCount++;
    }

    if (isToday) cell.classList.add('today-marker');

    grid.appendChild(cell);
  }

  summary.innerHTML = `
    <span>✅ 已完成 <span class="completed-count">${completedCount}</span></span>
    <span>☐ 未打卡 <span class="missed-count">${missedCount}</span></span>
  `;
}

/**
 * Toggle check-in for a specific date.
 * All dates (including today) use recurrence.checkin_dates as the single source of truth.
 */
async function toggleCalendarCheckin(dateStr, currentlyCompleted) {
  const todo = calendarState.todo;
  if (!todo) return;

  try {
    const recurrence = { ...todo.recurrence };
    let checkinDates = recurrence.checkin_dates || [];

    if (currentlyCompleted) {
      checkinDates = checkinDates.filter(d => d !== dateStr);
    } else {
      if (!checkinDates.includes(dateStr)) checkinDates.push(dateStr);
    }
    recurrence.checkin_dates = checkinDates;

    const { error } = await supabaseClient
      .from('todos')
      .update({ recurrence })
      .eq('id', todo.id);
    if (error) throw error;
    todo.recurrence = recurrence;

    // Update local state
    if (currentlyCompleted) {
      calendarState.completedDates.delete(dateStr);
    } else {
      calendarState.completedDates.add(dateStr);
    }

    renderCalendarMonth();
    await loadTodos();
  } catch (err) {
    console.error('Toggle checkin failed:', err);
    alert('操作失败，请重试');
  }
}

function closeModal() {
  addTaskModal.classList.add('hidden');
  setTimeout(() => {
    addTaskModal.style.display = 'none';
  }, 300);
  fabAddBtn.style.display = 'flex';
}

function resetModalForm() {
  editingTodoId = null;
  taskInput.value = '';
  // Recurrence: always visible, reset to "单次"
  recurrencePanel.style.display = 'flex';
  // Reset mode tabs to "单次"
  const modeTabs = document.getElementById('recurrence-mode-tabs');
  modeTabs.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
  modeTabs.querySelector('[data-mode="once"]').classList.add('active');
  // Hide sub-type tabs and reset
  recurrenceTabs.style.display = 'none';
  recurrenceTabs.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
  recurrenceTabs.querySelector('[data-type="daily"]').classList.add('active');
  updateRecurrenceSubOptions('none');
  document.getElementById('rec-daily-interval').value = 1;
  document.getElementById('rec-monthly-days').value = '';
  document.getElementById('rec-yearly-month').value = 1;
  document.getElementById('rec-yearly-day').value = 1;
  document.querySelectorAll('.weekday-btn').forEach(b => b.classList.remove('selected'));
  const endDateEl = document.getElementById('rec-end-date');
  endDateEl.value = '';
  endDateEl.type = 'text';
  initRecurrenceStartDate();
  // Reminders: reset
  remindersPanel.style.display = 'none';
  remindersToggleBtn.classList.remove('active');
  reminderCardsList.innerHTML = '';
  // Countdown: reset
  isCountdownEnabled = false;
  countdownToggleBtn.classList.remove('active');
}

function initRecurrenceStartDate() {
  document.getElementById('rec-start-date').value = getTodayStr();
}

// Returns today's date as "YYYY-MM-DD" in local time
function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}


function updateRecurrenceSubOptions(type) {
  document.getElementById('rec-daily-opts').style.display = type === 'daily' ? 'flex' : 'none';
  document.getElementById('rec-weekly-opts').style.display = type === 'weekly' ? 'flex' : 'none';
  document.getElementById('rec-monthly-opts').style.display = type === 'monthly' ? 'flex' : 'none';
  document.getElementById('rec-yearly-opts').style.display = type === 'yearly' ? 'flex' : 'none';
  // Always show the date row; label adapts to context
  const startRow = document.getElementById('rec-start-row');
  const endRow = document.getElementById('rec-end-row');
  startRow.style.display = 'flex';
  startRow.querySelector('.opts-label').textContent = type === 'none' ? '日期' : '开始';
  endRow.style.display = type === 'none' ? 'none' : 'flex';
}


// ──────────────────── Reminder Cards ────────────────────
function addReminderCard(offsetDays = 0, timeVal = '') {
  const card = document.createElement('div');
  card.className = 'reminder-card';

  const offsetSel = document.createElement('select');
  offsetSel.className = 'reminder-offset-select';
  offsetSel.innerHTML = `
    <option value="0">当天</option>
    <option value="-1">前1天</option>
    <option value="-2">前2天</option>
    <option value="-3">前3天</option>
    <option value="-7">前7天</option>
  `;
  offsetSel.value = String(offsetDays);

  const timePick = document.createElement('input');
  timePick.type = 'time';
  timePick.className = 'reminder-time-pick';
  timePick.value = timeVal || '09:00';

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'reminder-card-del';
  delBtn.textContent = '✕';
  delBtn.addEventListener('click', () => card.remove());

  card.appendChild(offsetSel);
  card.appendChild(timePick);
  card.appendChild(delBtn);
  reminderCardsList.appendChild(card);
}

// ──────────────────── Build Rules from UI ────────────────────
function buildRecurrenceRule() {
  // Check if mode is "recurring"
  const modeTabs = document.getElementById('recurrence-mode-tabs');
  const activeMode = modeTabs.querySelector('.type-tab.active');
  if (!activeMode || activeMode.dataset.mode !== 'recurring') return null;

  const activeTab = recurrenceTabs.querySelector('.type-tab.active');
  const type = activeTab ? activeTab.dataset.type : 'daily';

  let rule = null;
  if (type === 'daily') {
    const interval = parseInt(document.getElementById('rec-daily-interval').value) || 1;
    rule = { type: 'daily', interval };
  } else if (type === 'weekly') {
    const days = [...document.querySelectorAll('.weekday-btn.selected')]
      .map(b => parseInt(b.dataset.day));
    if (days.length > 0) rule = { type: 'weekly', days };
  } else if (type === 'monthly') {
    const raw = document.getElementById('rec-monthly-days').value.trim();
    if (raw) {
      const days = raw.split(',')
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n));
      if (days.length > 0) rule = { type: 'monthly', days };
    }
  } else if (type === 'yearly') {
    const month = parseInt(document.getElementById('rec-yearly-month').value);
    const day = parseInt(document.getElementById('rec-yearly-day').value);
    rule = { type: 'yearly', month, day };
  }

  if (rule) {
    const endDateVal = document.getElementById('rec-end-date').value;
    if (endDateVal) rule.end_date = endDateVal;
  }
  return rule;
}

function buildRemindersRule() {
  const cards = reminderCardsList.querySelectorAll('.reminder-card');
  if (cards.length === 0) return null;
  const result = [];
  cards.forEach(card => {
    const offset = parseInt(card.querySelector('.reminder-offset-select').value);
    const time = card.querySelector('.reminder-time-pick').value;
    if (time) result.push({ offset_days: offset, time });
  });
  return result.length > 0 ? result : null;
}

// ──────────────────── Recurrence Logic ────────────────────

/**
 * 从给定日期开始，计算循环规则的下一次（或当次）日期。
 * @param {object} rule - recurrence JSONB
 * @param {Date} fromDate - 从此日期之后（不含）寻找
 * @returns {Date|null}
 */
function getNextOccurrence(rule, fromDate) {
  if (!rule) return null;

  const from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);

  if (rule.type === 'daily') {
    let next = new Date(from);
    let interval = rule.interval !== undefined ? rule.interval : 1;
    if (interval <= 0) interval = 1; // Fallback for any legacy task saved with 0
    next.setDate(next.getDate() + interval);
    if (rule.end_date && next > new Date(rule.end_date + 'T23:59:59')) return null;
    return next;
  }

  if (rule.type === 'weekly') {
    const days = rule.days || [];
    if (days.length === 0) return null;
    // Try up to 7 days ahead
    for (let i = 1; i <= 7; i++) {
      let candidate = new Date(from);
      candidate.setDate(candidate.getDate() + i);
      if (days.includes(candidate.getDay())) {
        if (rule.end_date && candidate > new Date(rule.end_date + 'T23:59:59')) return null;
        return candidate;
      }
    }
    return null;
  }

  if (rule.type === 'monthly') {
    const days = rule.days || [];
    if (days.length === 0) return null;

    // Helper: resolve a monthly "day value" to actual date in given year/month
    function resolveMonthDay(year, month, dayVal) {
      if (dayVal > 0) return new Date(year, month, dayVal);
      // negative = from end of month: -1 = last day
      const lastDay = new Date(year, month + 1, 0).getDate();
      const actual = lastDay + dayVal + 1;
      return actual >= 1 ? new Date(year, month, actual) : null;
    }

    // Generate candidates for the next 2 months and pick the first after fromDate
    const candidates = [];
    for (let mo = 0; mo <= 2; mo++) {
      const testDate = new Date(from);
      testDate.setMonth(testDate.getMonth() + mo, 1);
      const y = testDate.getFullYear();
      const m = testDate.getMonth();
      days.forEach(d => {
        const resolved = resolveMonthDay(y, m, d);
        if (resolved && resolved > from) candidates.push(resolved);
      });
    }
    candidates.sort((a, b) => a - b);
    if (candidates.length > 0) {
      const candidate = candidates[0];
      if (rule.end_date && candidate > new Date(rule.end_date + 'T23:59:59')) return null;
      return candidate;
    }
    return null;
  }

  if (rule.type === 'yearly') {
    const { month, day } = rule;
    // month is 1-indexed
    let year = from.getFullYear();
    let candidate = new Date(year, month - 1, day);
    if (candidate <= from) candidate = new Date(year + 1, month - 1, day);
    if (rule.end_date && candidate > new Date(rule.end_date + 'T23:59:59')) return null;
    return candidate;
  }

  return null;
}

/**
 * 判断给定日期是否在循环规则的日程内
 * @param {object} rule - recurrence JSONB
 * @param {string} startDateStr - 任务的起始日期 "YYYY-MM-DD"
 * @param {Date} targetDate - 要检查的日期
 * @returns {boolean}
 */
function matchesRecurrenceOnDate(rule, startDateStr, targetDate) {
  if (!rule) return false;

  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);

  // 只匹配起始日期之后（含）的日期
  if (startDateStr) {
    const start = new Date(startDateStr + 'T00:00:00');
    if (target < start) return false;
  }
  
  // 如果有结束日期，超出结束日期的不匹配
  if (rule.end_date) {
    const end = new Date(rule.end_date + 'T23:59:59');
    if (target > end) return false;
  }

  if (rule.type === 'daily') {
    if (!startDateStr) return true; // 没有起始日期, 每天都匹配
    const start = new Date(startDateStr + 'T00:00:00');
    const diffDays = Math.round((target - start) / 86400000);
    let interval = rule.interval !== undefined ? rule.interval : 1;
    if (interval <= 0) interval = 1; // Fallback for any legacy task saved with 0
    return diffDays >= 0 && diffDays % interval === 0;
  }

  if (rule.type === 'weekly') {
    const days = rule.days || [];
    return days.includes(target.getDay());
  }

  if (rule.type === 'monthly') {
    const days = rule.days || [];
    const dayOfMonth = target.getDate();
    // 计算本月最后一天
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return days.some(d => {
      if (d > 0) return d === dayOfMonth;
      // 负数：倒数第几天，如 -1 = 最后一天
      const actual = lastDay + d + 1;
      return actual === dayOfMonth;
    });
  }

  if (rule.type === 'yearly') {
    return (target.getMonth() + 1) === rule.month && target.getDate() === rule.day;
  }

  return false;
}

/**
 * 给定一个任务的 scheduled_date 和 reminders 规则，返回所有实际触发时间戳数组
 * @param {string} scheduledDate - "YYYY-MM-DD"
 * @param {Array} reminders - [{ offset_days, time }, ...]
 * @returns {Date[]}
 */
function computeReminderTimestamps(scheduledDate, reminders) {
  if (!scheduledDate || !reminders || reminders.length === 0) return [];
  const base = new Date(scheduledDate + 'T00:00:00'); // local midnight
  return reminders.map(r => {
    const [hh, mm] = r.time.split(':').map(Number);
    const ts = new Date(base);
    ts.setDate(ts.getDate() + (r.offset_days || 0));
    ts.setHours(hh, mm, 0, 0);
    return ts;
  }).filter(Boolean);
}

// ──────────────────── Human-readable descriptions ────────────────────
const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

function describeRecurrence(rule) {
  if (!rule) return null;
  if (rule.type === 'daily') {
    let interval = rule.interval !== undefined ? rule.interval : 1;
    if (interval <= 0) interval = 1;
    return `每 ${interval} 天`;
  }
  if (rule.type === 'weekly') {
    const names = (rule.days || []).sort((a, b) => a - b).map(d => WEEKDAY_NAMES[d]);
    return `每周${names.join('、')}`;
  }
  if (rule.type === 'monthly') {
    const parts = (rule.days || []).map(d => d < 0 ? `倒数第${-d}天` : `${d}号`);
    return `每月${parts.join('、')}`;
  }
  if (rule.type === 'yearly') {
    return `每年 ${rule.month}/${rule.day}`;
  }
  return null;
}

function describeReminders(reminders) {
  if (!reminders || reminders.length === 0) return null;
  if (reminders.length === 1) {
    const r = reminders[0];
    const prefix = r.offset_days === 0 ? '当天' : `前${-r.offset_days}天`;
    return `${prefix} ${r.time}`;
  }
  return `${reminders.length} 个提醒`;
}

// ──────────────────── Push Notifications ────────────────────
function initPushUI() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('此浏览器不支持推送通知');
    return;
  }

  if (Notification.permission === 'granted') {
    navigator.serviceWorker.ready.then(reg => {
      reg.pushManager.getSubscription().then(sub => {
        if (sub) showNotifBtnSubscribed();
        else subscribePush(reg);
      });
    });
  } else if (Notification.permission === 'default') {
    enableNotifBtn.style.display = 'inline-flex';
    enableNotifBtn.addEventListener('click', handleEnableNotifications);
  }

  const clearSubsBtn = document.getElementById('clear-subs-btn');
  if (clearSubsBtn) {
    clearSubsBtn.addEventListener('click', async () => {
      if (!confirm('确定要清除数据库里所有的推送订阅吗？这个操作不可逆。')) return;
      clearSubsBtn.disabled = true;
      clearSubsBtn.textContent = '清除中...';
      try {
        const url = `${SUPABASE_URL}/functions/v1/send-reminders?clear_all=true`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (res.ok) alert('✅ ' + data.message);
        else alert('❌ 清除失败: ' + (data.error || '未知错误'));
      } catch (err) {
        alert('❌ 请求失败: ' + err.message);
      } finally {
        clearSubsBtn.disabled = false;
        clearSubsBtn.textContent = '🧹 清除所有推送订阅 (Dev)';
      }
    });
  }
}

async function handleEnableNotifications() {
  enableNotifBtn.disabled = true;
  enableNotifBtn.textContent = '正在开启...';
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const reg = await navigator.serviceWorker.ready;
      await subscribePush(reg);
    } else {
      enableNotifBtn.textContent = '通知被拒绝';
      setTimeout(() => { enableNotifBtn.style.display = 'none'; }, 2000);
    }
  } catch (err) {
    console.error('开启通知失败:', err);
    enableNotifBtn.textContent = '开启失败';
    enableNotifBtn.disabled = false;
  }
}

async function subscribePush(registration) {
  try {
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
    await saveSubscription(subscription);
    showNotifBtnSubscribed();
  } catch (err) {
    console.error('推送订阅失败:', err);
    enableNotifBtn.textContent = '订阅失败';
    enableNotifBtn.disabled = false;
  }
}

async function saveSubscription(subscription) {
  const sub = subscription.toJSON();
  const { error } = await supabaseClient
    .from('push_subscriptions')
    .upsert({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { onConflict: 'endpoint' });
  if (error) { console.error('保存订阅失败:', error); throw error; }
}

function showNotifBtnSubscribed() {
  enableNotifBtn.style.display = 'inline-flex';
  enableNotifBtn.classList.add('subscribed');
  enableNotifBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    通知已开启
  `;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'my-dida-reminder', requireInteraction: true });
  } else {
    alert(`⏰ 提醒: ${body}`);
  }
}

// ──────────────────── Reminder Timers ────────────────────
function setupReminderTimers() {
  Object.values(reminderTimers).forEach(ids => ids.forEach(clearTimeout));
  reminderTimers = {};

  todos.forEach(todo => {
    if (todo.completed) return;

    if (todo.reminders && todo.scheduled_date) {
      // New multi-point reminders
      const timestamps = computeReminderTimestamps(todo.scheduled_date, todo.reminders);
      const now = Date.now();
      const timerIds = [];
      timestamps.forEach(ts => {
        const delay = ts.getTime() - now;
        if (delay > 0 && delay <= 2147483647) {
          timerIds.push(setTimeout(() => {
            sendNotification('📝 My Dida 提醒', todo.text);
            renderTodos();
          }, delay));
        }
      });
      if (timerIds.length) reminderTimers[todo.id] = timerIds;
    } else if (todo.remind_at) {
      // Legacy single reminder
      scheduleReminder(todo);
    }
  });
}

function scheduleReminder(todo) {
  const remindTime = new Date(todo.remind_at).getTime();
  const now = Date.now();
  const delay = remindTime - now;
  if (delay <= 0 || delay > 2147483647) return;

  reminderTimers[todo.id] = [setTimeout(() => {
    sendNotification('📝 My Dida 提醒', todo.text);
    delete reminderTimers[todo.id];
    renderTodos();
  }, delay)];
}

function cancelReminders(id) {
  if (reminderTimers[id]) {
    reminderTimers[id].forEach(clearTimeout);
    delete reminderTimers[id];
  }
}

// ──────────────────── Load Todos ────────────────────
async function loadTodos() {
  showLoading();
  try {
    const { data, error } = await supabaseClient
      .from('todos')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    todos = data || [];
    renderTodos();
    setupReminderTimers();
  } catch (err) {
    console.error('加载失败:', err);
    showError('加载失败，请检查网络或 Supabase 配置');
  }
}

// ──────────────────── Add Todo ────────────────────
async function handleAddTask(e) {
  e.preventDefault();
  let text = taskInput.value.trim();
  if (!text) return;

  // Prepend selected emoji
  const emojiSelect = document.getElementById('emoji-select');
  const emoji = emojiSelect.value;
  if (emoji) {
    text = `${emoji} ${text}`;
  }

  const recurrence = buildRecurrenceRule();
  const reminders = buildRemindersRule();
  const startDateVal = document.getElementById('rec-start-date').value;
  const scheduledDate = startDateVal || null;

  taskInput.disabled = true;
  try {
    const upsertData = { 
      text, 
      completed: false,
      is_countdown: isCountdownEnabled 
    };
    if (recurrence) upsertData.recurrence = recurrence;
    else upsertData.recurrence = null;
    if (scheduledDate) upsertData.scheduled_date = scheduledDate;
    else upsertData.scheduled_date = null;
    if (reminders) upsertData.reminders = reminders;
    else upsertData.reminders = null;

    let savedData;
    if (editingTodoId) {
      const { data, error } = await supabaseClient
        .from('todos')
        .update(upsertData)
        .eq('id', editingTodoId)
        .select()
        .single();
      if (error) throw error;
      savedData = data;
      
      const idx = todos.findIndex(t => t.id === editingTodoId);
      if (idx !== -1) todos[idx] = savedData;
      cancelReminders(editingTodoId);
    } else {
      const { data, error } = await supabaseClient
        .from('todos')
        .insert([upsertData])
        .select()
        .single();
      if (error) throw error;
      savedData = data;
      todos.unshift(savedData);
    }

    closeModal();
    renderTodos();

    // Schedule reminders
    if (savedData.reminders && savedData.scheduled_date) {
      setupReminderTimers();
    } else if (savedData.remind_at) {
      scheduleReminder(savedData);
    }

    updateRemoteBadge();
  } catch (err) {
    console.error('添加失败:', err);
    alert('添加失败，请重试');
  } finally {
    taskInput.disabled = false;
  }
}

// ──────────────────── Toggle Todo ────────────────────
async function toggleTodo(id, completed) {
  const idx = todos.findIndex(t => t.id === id);
  if (idx === -1) return;
  const todo = todos[idx];

  // For recurring tasks, use checkin_dates as the source of truth
  if (todo.recurrence) {
    const todayStr = getTodayStr();
    const recurrence = { ...todo.recurrence };
    let checkinDates = recurrence.checkin_dates || [];

    if (completed) {
      if (!checkinDates.includes(todayStr)) checkinDates.push(todayStr);
    } else {
      checkinDates = checkinDates.filter(d => d !== todayStr);
    }
    recurrence.checkin_dates = checkinDates;
    todo.recurrence = recurrence;
    renderTodos();

    if (completed) cancelReminders(id);
    if (!completed && todo.remind_at) scheduleReminder(todo);

    try {
      const { error } = await supabaseClient
        .from('todos')
        .update({ recurrence })
        .eq('id', id);
      if (error) throw error;
      updateRemoteBadge();
    } catch (err) {
      console.error('更新失败:', err);
      // Revert
      if (completed) {
        recurrence.checkin_dates = recurrence.checkin_dates.filter(d => d !== todayStr);
      } else {
        recurrence.checkin_dates.push(todayStr);
      }
      todo.recurrence = recurrence;
      renderTodos();
    }
    return;
  }

  // Non-recurring tasks: use completed field as before
  todo.completed = completed;
  renderTodos();

  if (completed) cancelReminders(id);
  if (!completed && todo.remind_at) scheduleReminder(todo);

  try {
    const { error } = await supabaseClient
      .from('todos')
      .update({ completed })
      .eq('id', id);
    if (error) throw error;
    updateRemoteBadge();
  } catch (err) {
    console.error('更新失败:', err);
    todo.completed = !completed;
    renderTodos();
  }
}

/**
 * 循环任务完成时，计算并插入下一次任务记录
 */
async function createNextOccurrence(todo) {
  const fromDate = todo.scheduled_date ? new Date(todo.scheduled_date) : new Date();
  const nextDate = getNextOccurrence(todo.recurrence, fromDate);
  if (!nextDate) return;

  const yyyy = nextDate.getFullYear();
  const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
  const dd = String(nextDate.getDate()).padStart(2, '0');
  const nextDateStr = `${yyyy}-${mm}-${dd}`;

  const newTodo = {
    text: todo.text,
    completed: false,
    recurrence: todo.recurrence,
    scheduled_date: nextDateStr,
    reminders: todo.reminders || null,
    is_countdown: todo.is_countdown || false
  };

  try {
    const { data, error } = await supabaseClient
      .from('todos')
      .insert([newTodo])
      .select()
      .single();
    if (error) throw error;

    todos.unshift(data);
    renderTodos();
    setupReminderTimers();
  } catch (err) {
    console.error('创建下一次循环任务失败:', err);
  }
}

// ──────────────────── Delete Todo ────────────────────
async function deleteTodo(id) {
  const itemEl = document.querySelector(`[data-id="${id}"]`);
  if (itemEl) {
    itemEl.classList.add('removing');
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  cancelReminders(id);

  const idx = todos.findIndex(t => t.id === id);
  if (idx === -1) return;

  const removed = todos.splice(idx, 1)[0];
  renderTodos();

  try {
    const { error } = await supabaseClient.from('todos').delete().eq('id', id);
    if (error) throw error;
    updateRemoteBadge();
  } catch (err) {
    console.error('删除失败:', err);
    todos.splice(idx, 0, removed);
    renderTodos();
    if (removed.remind_at && !removed.completed) scheduleReminder(removed);
  }
}

// ──────────────────── Render ────────────────────
function renderTodos() {
  hideAll();

  if (currentTab === 'settings') {
    if (settingsTab) settingsTab.style.display = 'block';
    if (statsText && statsText.parentElement) statsText.parentElement.style.display = 'none';
    return;
  }

  if (settingsTab) settingsTab.style.display = 'none';
  if (statsText && statsText.parentElement) statsText.parentElement.style.display = '';

  const todayStr = getTodayStr();
  const todayDate = new Date(todayStr + 'T00:00:00');

  let filtered = [...todos];
  filtered.sort((a, b) => {
    if (a.completed === b.completed) return 0;
    return a.completed ? 1 : -1;
  });

  if (currentTab === 'today') {
    filtered = filtered.filter(t => {
      // scheduled_date 是今天 → 直接显示
      if (t.scheduled_date === todayStr) return true;
      // 有循环规则 → 检查今天是否在循环日程内
      if (t.recurrence && matchesRecurrenceOnDate(t.recurrence, t.scheduled_date, todayDate)) return true;
      // 旧任务（无 scheduled_date 且无 recurrence）兼容显示
      if (!t.scheduled_date && !t.recurrence) return true;
      return false;
    });
  }

  if (currentTab === 'countdown') {
    filtered = filtered.filter(t => t.is_countdown && !t.completed);
  }

  // Handle toggling readonly-mode for the task list
  if (currentTab === 'all') {
    taskList.classList.add('readonly-mode');
  } else {
    taskList.classList.remove('readonly-mode');
  }

  if (filtered.length === 0) {
    emptyState.style.display = 'flex';
    updateStats(filtered);
    return;
  }

  taskList.innerHTML = '';
  taskList.style.display = 'block';

  filtered.forEach(todo => {
    const li = document.createElement('li');
    const isCheckedIn = todo.recurrence
      ? (todo.recurrence.checkin_dates || []).includes(todayStr)
      : todo.completed;
    const isCompletedStyle = isCheckedIn && currentTab !== 'all';
    li.className = `task-item${isCompletedStyle ? ' completed' : ''}`;
    li.dataset.id = todo.id;

    // Build badge HTML
    let badgesHtml = '';

    // Recurrence badge
    const recDesc = describeRecurrence(todo.recurrence);
    if (recDesc) {
      badgesHtml += `<span class="reminder-badge recurrence-badge">↻ ${escapeHtml(recDesc)}</span>`;
    }
    // Countdown badge
    if (todo.is_countdown) {
      badgesHtml += `<span class="reminder-badge date-badge" style="color: #f39c12 !important; background: rgba(243, 156, 18, 0.1) !important;">⭐ 倒数日</span>`;
    }
    // Scheduled date badge
    if (todo.scheduled_date) {
      let displayDateStr = todo.scheduled_date;
      if (todo.recurrence && (currentTab === 'all' || currentTab === 'countdown')) {
          const schedDate = new Date(todo.scheduled_date + 'T00:00:00');
          if (schedDate < todayDate) {
               if (matchesRecurrenceOnDate(todo.recurrence, todo.scheduled_date, todayDate)) {
                   displayDateStr = todayStr;
               } else {
                   const nextDate = getNextOccurrence(todo.recurrence, todayDate);
                   if (nextDate) {
                       const y = nextDate.getFullYear();
                       const m = String(nextDate.getMonth() + 1).padStart(2, '0');
                       const d = String(nextDate.getDate()).padStart(2, '0');
                       displayDateStr = `${y}-${m}-${d}`;
                   }
               }
          }
      }
      
      const d = new Date(displayDateStr + 'T00:00:00');
      const diff = Math.round((d - todayDate) / 86400000);
      let dateLabel = '';
      if (currentTab !== 'today') {
        if (diff === 0) dateLabel = '今天';
        else if (diff === 1) dateLabel = '明天';
        else if (diff > 1) dateLabel = `${diff} 天后`;
        else if (diff < 0) dateLabel = `${-diff} 天前`;
      }
      if (dateLabel) {
        const calIcon = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
        badgesHtml += `<span class="reminder-badge date-badge">${calIcon} ${dateLabel}</span>`;
      }
    }

    // Reminders badge
    const remDesc = describeReminders(todo.reminders);
    if (remDesc) {
      const bellIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;
      badgesHtml += `<span class="reminder-badge">${bellIcon} ${escapeHtml(remDesc)}</span>`;
    }
    // Legacy remind_at
    if (!todo.reminders && todo.remind_at) {
      const isPast = new Date(todo.remind_at) <= new Date();
      const badgeClass = isPast ? 'reminder-badge past' : 'reminder-badge';
      const bellIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;
      badgesHtml += `<span class="${badgeClass}">${bellIcon} ${formatReminderDisplay(todo.remind_at)}</span>`;
    }

    const showCheckbox = (currentTab === 'today');
    li.innerHTML = `
      ${showCheckbox ? `<label class="task-checkbox">
        <input type="checkbox" ${isCheckedIn ? 'checked' : ''}>
        <span class="checkmark">
          <svg class="checkmark-icon" width="14" height="14" viewBox="0 0 24 24"
               fill="none" stroke="#fff" stroke-width="3"
               stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </span>
      </label>` : ''}
      <div class="task-content" title="点击编辑">
        <span class="task-text">${escapeHtml(todo.text)}</span>
        <div class="task-badges">${badgesHtml}</div>
      </div>
      <button class="delete-btn" aria-label="删除任务">
        <svg width="18" height="18" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
          <path d="M10 11v6"></path>
          <path d="M14 11v6"></path>
        </svg>
      </button>
    `;

    if (showCheckbox) {
      const checkbox = li.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', () => toggleTodo(todo.id, checkbox.checked));
    }

    const content = li.querySelector('.task-content');
    content.addEventListener('click', () => openModal(todo));

    const deleteBtn = li.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => deleteTodo(todo.id));

    taskList.appendChild(li);
  });

  taskList.style.display = 'flex';
  updateStats(filtered);
}

// ──────────────────── Stats ────────────────────
function updateStats(visibleTodos) {
  const list = visibleTodos || todos;
  const total = list.length;
  const todayStr = getTodayStr();
  const done = list.filter(t => t.recurrence
    ? (t.recurrence.checkin_dates || []).includes(todayStr)
    : t.completed
  ).length;
  if (total === 0) statsText.textContent = '还没有任务哦';
  else statsText.textContent = `共 ${total} 项 · 已完成 ${done} 项`;
  updateAppBadge();
}

function updateAppBadge() {
  if (!('setAppBadge' in navigator)) return;
  const pending = todos.filter(t => !t.completed).length;
  if (pending > 0) navigator.setAppBadge(pending);
  else navigator.clearAppBadge();
}

function updateRemoteBadge() {
  const url = `${SUPABASE_URL}/functions/v1/send-reminders?badge_only=true`;
  fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  })
  .then(res => res.json())
  .then(data => console.log('badge_only:', data))
  .catch(err => console.error('badge_only 失败:', err));
}

// ──────────────────── UI Helpers ────────────────────
function showLoading() {
  hideAll();
  loadingState.style.display = 'block';
}

function showError(msg) {
  hideAll();
  document.getElementById('error-message').textContent = msg;
  errorState.style.display = 'block';
}

function hideAll() {
  taskList.style.display = 'none';
  emptyState.style.display = 'none';
  loadingState.style.display = 'none';
  errorState.style.display = 'none';
  if (settingsTab) settingsTab.style.display = 'none';
}

// ──────────────────── Legacy date helpers ────────────────────
function formatReminderDisplay(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (isToday) return `今天 ${timeStr}`;
  if (isTomorrow) return `明天 ${timeStr}`;
  return `${date.getMonth() + 1}/${date.getDate()} ${timeStr}`;
}

// ──────────────────── Escape HTML ────────────────────
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
