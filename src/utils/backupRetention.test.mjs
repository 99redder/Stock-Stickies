import test from 'node:test'
import assert from 'node:assert/strict'
import { selectBackupsToPrune } from './backupRetention.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-24T12:00:00').getTime()
const at = (daysAgo, hour = 12) => {
  const date = new Date(NOW - daysAgo * DAY)
  date.setHours(hour, 0, 0, 0)
  return date.getTime()
}
// Several backups a day for 500 days.
const history = () => {
  const backups = []
  for (let day = 0; day < 500; day += 1) {
    for (const hour of [9, 13, 18]) backups.push({ id: `d${day}h${hour}`, createdAtMs: at(day, hour), reason: 'autosave' })
  }
  return backups
}

test('keeps everything from the last 14 days', () => {
  const pruned = new Set(selectBackupsToPrune(history(), NOW))
  for (let day = 0; day <= 13; day += 1) {
    for (const hour of [9, 13, 18]) assert.ok(!pruned.has(`d${day}h${hour}`), `day ${day} ${hour}h`)
  }
})

test('keeps only the newest backup per day between 14 and 90 days', () => {
  const pruned = new Set(selectBackupsToPrune(history(), NOW))
  for (const day of [20, 45, 89]) {
    assert.ok(!pruned.has(`d${day}h18`))
    assert.ok(pruned.has(`d${day}h9`))
    assert.ok(pruned.has(`d${day}h13`))
  }
})

test('keeps one backup per week up to a year, nothing older', () => {
  const backups = history()
  const pruned = new Set(selectBackupsToPrune(backups, NOW))
  const kept = backups.filter((b) => !pruned.has(b.id))
  const keptOldTier = kept.filter((b) => b.createdAtMs < NOW - 91 * DAY && b.createdAtMs >= NOW - 365 * DAY)
  assert.ok(keptOldTier.length >= 38 && keptOldTier.length <= 40, `weekly kept ${keptOldTier.length}`)
  assert.equal(kept.filter((b) => b.createdAtMs < NOW - 366 * DAY).length, 0)
})

test('never deletes the newest 30, even for a long-inactive user', () => {
  const stale = Array.from({ length: 40 }, (_, i) => ({ id: `old${i}`, createdAtMs: at(400 + i), reason: 'autosave' }))
  const pruned = new Set(selectBackupsToPrune(stale, NOW))
  for (let i = 0; i < 30; i += 1) assert.ok(!pruned.has(`old${i}`))
  assert.equal(pruned.size, 10)
})

test('protects recent restore backups and ignores undated entries', () => {
  const backups = [
    ...history(),
    { id: 'restore', createdAtMs: at(40, 8), reason: 'restore-backup' },
    { id: 'undated', createdAtMs: null, reason: 'autosave' },
  ]
  const pruned = new Set(selectBackupsToPrune(backups, NOW))
  assert.ok(!pruned.has('restore'))
  assert.ok(!pruned.has('undated'))
})
