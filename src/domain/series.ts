// Calendar-style changes to repeating care times. Pure planning: every function returns the list of database operations
// to run, so the rules ("this event", "this and following", "all events") can be tested without a database.
import type { CareBlock, Weekday } from './types'
import { addDays, isoWeekday } from './time'

export type Scope = 'this' | 'following' | 'all'
export type RepeatKind = 'none' | 'weekly' | 'biweekly' | 'weekdays' | 'custom'
export interface Repeat { kind: RepeatKind; days: Weekday[]; until: string | null }
export interface Fields { caregiver_id: string; date: string; start_time: string; end_time: string }

export interface NewBlock { caregiver_id: string; weekday: Weekday; start_time: string; end_time: string; on_date: string | null; valid_from: string | null; valid_until: string | null; interval_weeks: number }
export type Op =
  | { op: 'insert'; row: NewBlock }
  | { op: 'update'; id: string; patch: Partial<NewBlock> }
  | { op: 'delete'; id: string }
  | { op: 'skip'; block_id: string; date: string }

export const isSeries = (b: Pick<CareBlock, 'on_date'>) => !b.on_date

export function repeatDays(r: Repeat, date: string): Weekday[] {
  if (r.kind === 'weekdays') return [1, 2, 3, 4, 5]
  if (r.kind === 'custom') return r.days.length ? [...r.days].sort() as Weekday[] : [isoWeekday(date)]
  return [isoWeekday(date)]
}

/** Rows that create a new care time (or series) starting on `f.date`. */
export function planCreate(f: Fields, r: Repeat): Op[] {
  const base = { caregiver_id: f.caregiver_id, start_time: f.start_time, end_time: f.end_time }
  if (r.kind === 'none') return [{ op: 'insert', row: { ...base, weekday: isoWeekday(f.date), on_date: f.date, valid_from: null, valid_until: null, interval_weeks: 1 } }]
  return repeatDays(r, f.date).map((weekday) => ({
    op: 'insert' as const,
    row: { ...base, weekday, on_date: null, valid_from: f.date, valid_until: r.until, interval_weeks: r.kind === 'biweekly' ? 2 : 1 },
  }))
}

/** Delete one occurrence, this and all following ones, or the whole series. */
export function planDelete(b: CareBlock, date: string, scope: Scope): Op[] {
  if (!isSeries(b) || scope === 'all') return [{ op: 'delete', id: b.id }]
  if (scope === 'this') return [{ op: 'skip', block_id: b.id, date }]
  if (b.valid_from && date <= b.valid_from) return [{ op: 'delete', id: b.id }]
  return [{ op: 'update', id: b.id, patch: { valid_until: addDays(date, -1) } }]
}

/** Change one occurrence (moves/edits only that day), this and following, or all. */
export function planEdit(b: CareBlock, date: string, scope: Scope, f: Fields, r: Repeat): Op[] {
  const base = { caregiver_id: f.caregiver_id, start_time: f.start_time, end_time: f.end_time }
  if (!isSeries(b)) {
    if (r.kind === 'none') return [{ op: 'update', id: b.id, patch: { ...base, weekday: isoWeekday(f.date), on_date: f.date } }]
    return [{ op: 'delete', id: b.id }, ...planCreate(f, r)]
  }
  if (scope === 'this') {
    return [{ op: 'skip', block_id: b.id, date }, ...planCreate(f, { kind: 'none', days: [], until: null })]
  }
  if (scope === 'following' && !(b.valid_from && date <= b.valid_from)) {
    return [{ op: 'update', id: b.id, patch: { valid_until: addDays(date, -1) } }, ...planCreate(f, r)]
  }
  // all events (or "following" from the very first one): keep the series start, apply the new values and repeat rule
  if (r.kind === 'none') return [{ op: 'delete', id: b.id }, ...planCreate(f, r)]
  const days = repeatDays(r, f.date)
  const common = { ...base, valid_until: r.until, interval_weeks: r.kind === 'biweekly' ? 2 : 1, ...(r.kind === 'biweekly' && !b.valid_from ? { valid_from: f.date } : {}) }
  const [first, ...rest] = days
  return [
    { op: 'update', id: b.id, patch: { ...common, weekday: first! } },
    ...rest.map((weekday) => ({ op: 'insert' as const, row: { ...base, weekday, on_date: null, valid_from: b.valid_from ?? null, valid_until: r.until, interval_weeks: 1 } })),
  ]
}
