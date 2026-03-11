const assert = require('assert');

function getNextOccurrence(rule, fromDate) {
  if (!rule) return null;
  const from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);

  if (rule.type === 'daily') {
    let next = new Date(from);
    let interval = rule.interval !== undefined ? rule.interval : 1;
    if (interval <= 0) interval = 1;
    next.setDate(next.getDate() + interval);
    if (rule.end_date && next > new Date(rule.end_date + 'T23:59:59')) return null;
    return next;
  }
}

function matchesRecurrenceOnDate(rule, startDateStr, targetDate) {
  if (!rule) return false;
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  if (startDateStr) {
    const start = new Date(startDateStr + 'T00:00:00');
    if (target < start) return false;
  }
  if (rule.end_date) {
    const end = new Date(rule.end_date + 'T23:59:59');
    if (target > end) return false;
  }
  if (rule.type === 'daily') {
    if (!startDateStr) return true;
    const start = new Date(startDateStr + 'T00:00:00');
    const diffDays = Math.round((target - start) / 86400000);
    let interval = rule.interval !== undefined ? rule.interval : 1;
    if (interval <= 0) interval = 1;
    return diffDays >= 0 && diffDays % interval === 0;
  }
  return false;
}

const rule = { type: 'daily', interval: 0, days: [] };
const startDateStr = '2026-03-09';
const todayDate = new Date('2026-03-10T00:00:00');

console.log("matchesRecurrenceOnDate:", matchesRecurrenceOnDate(rule, startDateStr, todayDate));
console.log("getNextOccurrence:", getNextOccurrence(rule, todayDate));

// Simulate renderTodos display logic:
let displayDateStr = startDateStr;
if (rule) {
    const schedDate = new Date(startDateStr + 'T00:00:00');
    if (schedDate < todayDate) {
         if (matchesRecurrenceOnDate(rule, startDateStr, todayDate)) {
             const y = todayDate.getFullYear();
             const m = String(todayDate.getMonth() + 1).padStart(2, '0');
             const d = String(todayDate.getDate()).padStart(2, '0');
             displayDateStr = `${y}-${m}-${d}`;
         } else {
             const nextDate = getNextOccurrence(rule, todayDate);
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
console.log("displayDateStr:", displayDateStr, "diff:", diff);

