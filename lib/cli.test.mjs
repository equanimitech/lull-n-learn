// @ts-check
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.mjs');

/** @type {string} */
let dir;

/**
 * Run the CLI against the temp data dir and parse its JSON output.
 * @param {...string} args
 * @returns {any}
 */
const run = (...args) =>
  JSON.parse(
    execFileSync(process.execPath, [CLI, ...args], {
      env: { ...process.env, LULL_N_LEARN_DIR: dir },
      encoding: 'utf8',
    }),
  );

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lull-n-learn-cli-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// --- Card commands ---

test('add creates a card that is immediately due', () => {
  const card = run(
    'add',
    '--front', 'What does the borrow checker enforce?',
    '--back', 'Single ownership and reference validity, at compile time.',
    '--tags', 'rust,ownership',
  );
  assert.ok(card.id);
  assert.equal(card.source, 'manual');
  assert.deepEqual(card.tags, ['rust', 'ownership']);
  assert.equal(card.fsrs.reps, 0);
  assert.equal(card.fsrs.lastReview, null);
  const due = run('due');
  assert.equal(due.length, 1);
  assert.equal(due[0].id, card.id);
});

test('due respects --limit and sorts oldest due first', () => {
  const first = run('add', '--front', 'q1', '--back', 'a1');
  const second = run('add', '--front', 'q2', '--back', 'a2');
  assert.ok(first.fsrs.due <= second.fsrs.due);
  const limited = run('due', '--limit', '1');
  assert.equal(limited.length, 1);
  assert.equal(limited[0].id, first.id);
});

test('rate good schedules the card out of the due queue', () => {
  const card = run('add', '--front', 'f', '--back', 'b');
  const updated = run('rate', card.id, 'good');
  assert.equal(updated.fsrs.reps, 1);
  assert.ok(new Date(updated.fsrs.due) > new Date());
  assert.deepEqual(run('due'), []);
  assert.equal(run('list').length, 1);
});

test('rate accepts numeric ratings and rejects unknown ones', () => {
  const card = run('add', '--front', 'f', '--back', 'b');
  const updated = run('rate', card.id, '4');
  assert.equal(updated.fsrs.reps, 1);
  assert.throws(() => run('rate', card.id, 'perfect'));
});

test('unknown subcommand exits non-zero', () => {
  assert.throws(() => run('frobnicate'));
});

// --- Inbox commands ---

test('inbox-add creates a candidate with context and session source', () => {
  const candidate = run(
    'inbox-add',
    '--front', 'Why did the N+1 query happen here?',
    '--back', 'Each iteration lazily loaded a relation; batch with a join or prefetch.',
    '--tags', 'orm,performance',
    '--context', 'Debugging slow endpoint in a session about Django',
  );
  assert.ok(candidate.id);
  assert.equal(candidate.source, 'session');
  assert.equal(candidate.context, 'Debugging slow endpoint in a session about Django');
  assert.ok(candidate.sessionDate);
  assert.equal(run('inbox-list').length, 1);
});

test('inbox-promote moves a candidate to the deck, with optional edits', () => {
  const candidate = run('inbox-add', '--front', 'q1', '--back', 'a1', '--tags', 't1');
  const card = run('inbox-promote', candidate.id, '--back', 'a1 (sharpened)');
  assert.equal(card.front, 'q1');
  assert.equal(card.back, 'a1 (sharpened)');
  assert.deepEqual(card.tags, ['t1']);
  assert.equal(card.source, 'session');
  assert.equal(card.fsrs.reps, 0);
  assert.deepEqual(run('inbox-list'), []);
  assert.equal(run('list').length, 1);
  assert.equal(run('due').length, 1);
});

test('inbox-dismiss removes a candidate without touching the deck', () => {
  const keep = run('inbox-add', '--front', 'q1', '--back', 'a1');
  const drop = run('inbox-add', '--front', 'q2', '--back', 'a2');
  const result = run('inbox-dismiss', drop.id);
  assert.deepEqual(result, { dismissed: drop.id });
  const remaining = run('inbox-list');
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, keep.id);
  assert.deepEqual(run('list'), []);
});

test('inbox-promote and inbox-dismiss reject unknown ids', () => {
  assert.throws(() => run('inbox-promote', 'nope'));
  assert.throws(() => run('inbox-dismiss', 'nope'));
});
