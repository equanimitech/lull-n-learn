// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_WEIGHTS,
  initDifficulty,
  initStability,
  retrievability,
  nextInterval,
  nextDifficulty,
  stabilityAfterSuccess,
  stabilityAfterLapse,
  newCardState,
  review,
} from './fsrs.mjs';

test('DEFAULT_WEIGHTS has the 19 FSRS-5 defaults', () => {
  assert.equal(DEFAULT_WEIGHTS.length, 19);
  assert.equal(DEFAULT_WEIGHTS[0], 0.40255);
  assert.equal(DEFAULT_WEIGHTS[18], 0.6621);
});

test('initStability returns w[rating-1], floored at 0.1', () => {
  assert.equal(initStability(1), DEFAULT_WEIGHTS[0]);
  assert.equal(initStability(2), DEFAULT_WEIGHTS[1]);
  assert.equal(initStability(3), DEFAULT_WEIGHTS[2]);
  assert.equal(initStability(4), DEFAULT_WEIGHTS[3]);
});

test('initDifficulty is higher for Again than Easy and stays in [1,10]', () => {
  assert.ok(initDifficulty(1) > initDifficulty(2));
  assert.ok(initDifficulty(2) > initDifficulty(3));
  assert.ok(initDifficulty(3) > initDifficulty(4));
  for (const rating of /** @type {const} */ ([1, 2, 3, 4])) {
    const d = initDifficulty(rating);
    assert.ok(d >= 1 && d <= 10, `initDifficulty(${rating}) = ${d} out of range`);
  }
});

test('retrievability is 1 at t=0 and 0.9 when elapsed equals stability', () => {
  assert.equal(retrievability(0, 3.0), 1);
  assert.ok(Math.abs(retrievability(3.0, 3.0) - 0.9) < 1e-9);
  assert.ok(retrievability(30, 3.0) < retrievability(3, 3.0));
});

test('nextInterval equals stability (rounded, min 1 day) at retention 0.9', () => {
  assert.equal(nextInterval(3.173), 3);
  assert.equal(nextInterval(15.7), 16);
  assert.equal(nextInterval(0.2), 1);
});

test('nextDifficulty rises on Again, falls on Easy, clamps to [1,10]', () => {
  assert.ok(nextDifficulty(5, 1) > 5);
  assert.ok(nextDifficulty(5, 4) < 5);
  assert.equal(nextDifficulty(5, 3) < 5, true);
  let d = 5;
  for (let i = 0; i < 50; i += 1) d = nextDifficulty(d, 1);
  assert.ok(d <= 10);
});

test('stabilityAfterSuccess grows stability; Easy > Good > Hard', () => {
  const d = 5;
  const s = 3.173;
  const r = 0.9;
  const hard = stabilityAfterSuccess(d, s, r, 2);
  const good = stabilityAfterSuccess(d, s, r, 3);
  const easy = stabilityAfterSuccess(d, s, r, 4);
  assert.ok(good > s);
  assert.ok(easy > good);
  assert.ok(good > hard);
});

test('stabilityAfterLapse shrinks stability and never goes below 0.1', () => {
  const dropped = stabilityAfterLapse(5, 20, 0.9);
  assert.ok(dropped < 20);
  assert.ok(stabilityAfterLapse(10, 0.1, 0.5) >= 0.1);
});

// --- Card-state transitions ---

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-24T12:00:00.000Z');

test('newCardState is due immediately with no review history', () => {
  const s = newCardState(NOW);
  assert.equal(s.reps, 0);
  assert.equal(s.lapses, 0);
  assert.equal(s.lastReview, null);
  assert.equal(s.due, NOW.toISOString());
  assert.equal(s.difficulty, 5.0);
  assert.equal(s.stability, 1.0);
});

test('first Good review seeds state from the init formulas', () => {
  const s = review(newCardState(NOW), 3, NOW);
  assert.equal(s.stability, initStability(3));
  assert.equal(s.difficulty, initDifficulty(3));
  assert.equal(s.reps, 1);
  assert.equal(s.lapses, 0);
  assert.equal(s.lastReview, NOW.toISOString());
  const dueDays = (new Date(s.due).getTime() - NOW.getTime()) / DAY_MS;
  assert.equal(dueDays, 3);
});

test('review does not mutate the input state', () => {
  const before = newCardState(NOW);
  const frozen = JSON.stringify(before);
  review(before, 3, NOW);
  assert.equal(JSON.stringify(before), frozen);
});

test('second review: Easy schedules further out than Good, Good further than Hard', () => {
  const base = review(newCardState(NOW), 3, NOW);
  const later = new Date(NOW.getTime() + 3 * DAY_MS);
  const hard = review(base, 2, later);
  const good = review(base, 3, later);
  const easy = review(base, 4, later);
  assert.ok(easy.stability > good.stability);
  assert.ok(good.stability > hard.stability);
  assert.ok(good.stability > base.stability);
  assert.ok(new Date(easy.due) > new Date(good.due));
  assert.equal(good.reps, 2);
});

test('Again on a learned card is a lapse: stability drops, lapses increment, due within minutes', () => {
  const base = review(newCardState(NOW), 3, NOW);
  const later = new Date(NOW.getTime() + 3 * DAY_MS);
  const s = review(base, 1, later);
  assert.equal(s.lapses, 1);
  assert.ok(s.stability < base.stability);
  const dueMs = new Date(s.due).getTime() - later.getTime();
  assert.ok(dueMs > 0 && dueMs <= 15 * 60 * 1000);
});

test('Again on the very first review is not counted as a lapse', () => {
  const s = review(newCardState(NOW), 1, NOW);
  assert.equal(s.lapses, 0);
  assert.equal(s.stability, initStability(1));
});

test('review rejects invalid ratings', () => {
  assert.throws(() => review(newCardState(NOW), /** @type {any} */ (0), NOW), RangeError);
  assert.throws(() => review(newCardState(NOW), /** @type {any} */ (5), NOW), RangeError);
});
