// Retention policy for a user's automatic backups (users/{uid}/snapshots).
//
// Backups are the safety net (they recovered the owner's portfolio after the
// Sep 2026 wipe), so pruning is deliberately conservative:
//   - never delete the newest KEEP_NEWEST backups, whatever their age
//   - keep every backup from the last KEEP_ALL_DAYS days
//   - keep the newest backup of each day for DAILY_DAYS days
//   - keep the newest backup of each week for WEEKLY_DAYS days
//   - keep 'restore-backup' backups for PROTECTED_DAYS days
//   - delete anything else, including everything older than WEEKLY_DAYS

export const BACKUP_RETENTION = {
  KEEP_NEWEST: 30,
  KEEP_ALL_DAYS: 14,
  DAILY_DAYS: 90,
  WEEKLY_DAYS: 365,
  PROTECTED_REASONS: ['restore-backup'],
  PROTECTED_DAYS: 90,
}

const DAY_MS = 24 * 60 * 60 * 1000

const localDayKey = (ms) => {
  const date = new Date(ms)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

// Weeks start on Monday (local time).
const localWeekKey = (ms) => {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
  return localDayKey(date.getTime())
}

/**
 * @param {{ id: string, createdAtMs: number, reason?: string }[]} backups
 * @param {number} nowMs
 * @returns {string[]} ids of backups to delete
 */
export function selectBackupsToPrune(backups, nowMs, policy = BACKUP_RETENTION) {
  const dated = backups
    .filter((backup) => backup?.id && Number.isFinite(backup.createdAtMs))
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
  const keep = new Set(dated.slice(0, policy.KEEP_NEWEST).map((backup) => backup.id))
  const seenDays = new Set()
  const seenWeeks = new Set()

  for (const backup of dated) {
    const ageDays = (nowMs - backup.createdAtMs) / DAY_MS
    const dayKey = localDayKey(backup.createdAtMs)
    const weekKey = localWeekKey(backup.createdAtMs)
    // Newest-first, so the first backup seen for a day/week is that period's latest.
    const firstOfDay = !seenDays.has(dayKey)
    const firstOfWeek = !seenWeeks.has(weekKey)
    seenDays.add(dayKey)
    seenWeeks.add(weekKey)

    if (ageDays <= policy.KEEP_ALL_DAYS) keep.add(backup.id)
    else if (ageDays <= policy.DAILY_DAYS && firstOfDay) keep.add(backup.id)
    else if (ageDays <= policy.WEEKLY_DAYS && firstOfWeek) keep.add(backup.id)
    if (policy.PROTECTED_REASONS.includes(backup.reason) && ageDays <= policy.PROTECTED_DAYS) keep.add(backup.id)
  }

  return dated.filter((backup) => !keep.has(backup.id)).map((backup) => backup.id)
}
