// @ts-check
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = dirname(fileURLToPath(import.meta.url));
const STATUSLINE = join(LIB, 'statusline.mjs');
const CLI = join(LIB, 'cli.mjs');
const SESSION_START = join(LIB, 'session-start.mjs');

/** @type {string} */
let dir;

/** @param {string} script @param {string[]} [args] */
const runScript = (script, args = []) =>
  execFileSync(process.execPath, [script, ...args], {
    env: { ...process.env, LULL_N_LEARN_DIR: dir },
    encoding: 'utf8',
  });

/** Write a session-start timestamp in the past by the given minutes. */
const writeSessionStartAgo = (minutesAgo) => {
  mkdirSync(dir, { recursive: true });
  const ts = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  writeFileSync(join(dir, '.session-start'), ts);
};

/** Write config.json */
const writeConfig = (config) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config));
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lull-n-learn-hud-'));
  writeSessionStartAgo(10);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('prints one due card front with the cue glyph', () => {
  runScript(CLI, ['add', '--front', 'What does the borrow checker enforce?', '--back', 'b']);
  const output = runScript(STATUSLINE);
  assert.equal(output, '↻ What does the borrow checker enforce?');
});

test('prints nothing when nothing is due', () => {
  assert.equal(runScript(STATUSLINE), '');
});

test('prints exactly one cue and never a count, even with many due cards', () => {
  const fronts = ['q one', 'q two', 'q three', 'q four'];
  for (const front of fronts) {
    runScript(CLI, ['add', '--front', front, '--back', 'a']);
  }
  const output = runScript(STATUSLINE);
  assert.match(output, /^↻ q (one|two|three|four)$/);
});

test('statusline stashes the cue card id for /answer', () => {
  runScript(CLI, ['add', '--front', 'What is a monad?', '--back', 'a monoid in the category of endofunctors']);
  runScript(STATUSLINE);
  const cue = JSON.parse(readFileSync(join(dir, '.current-cue.json'), 'utf8'));
  assert.ok(cue.cardId, 'expected a cardId in the cue file');
  assert.ok(cue.ts, 'expected a timestamp in the cue file');
});

test('current-cue CLI returns the stashed card', () => {
  const added = JSON.parse(runScript(CLI, ['add', '--front', 'What is a monad?', '--back', 'endofunctors']));
  runScript(STATUSLINE);
  const cue = JSON.parse(runScript(CLI, ['current-cue']));
  assert.equal(cue.id, added.id);
  assert.equal(cue.front, 'What is a monad?');
  assert.ok(cue.cueTs);
});

test('a corrupt cards.json is silent, not a crash', () => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'cards.json'), 'not json{');
  assert.equal(runScript(STATUSLINE), '');
});

// --- Grace period tests ---

test('suppresses cue during grace period', () => {
  writeSessionStartAgo(2);
  writeConfig({ cueDelayMinutes: 5 });
  runScript(CLI, ['add', '--front', 'hidden during grace', '--back', 'b']);
  assert.equal(runScript(STATUSLINE), '');
});

test('shows cue after grace period', () => {
  writeSessionStartAgo(10);
  writeConfig({ cueDelayMinutes: 5 });
  runScript(CLI, ['add', '--front', 'visible after grace', '--back', 'b']);
  assert.equal(runScript(STATUSLINE), '↻ visible after grace');
});

test('default grace period is 5 minutes', () => {
  writeSessionStartAgo(3);
  runScript(CLI, ['add', '--front', 'too early', '--back', 'b']);
  assert.equal(runScript(STATUSLINE), '');
});

test('no session start marker means no grace enforcement', () => {
  rmSync(join(dir, '.session-start'), { force: true });
  runScript(CLI, ['add', '--front', 'no marker', '--back', 'b']);
  assert.equal(runScript(STATUSLINE), '↻ no marker');
});

// --- Tag filter tests ---

test('cueTags filters to matching cards only', () => {
  writeConfig({ cueTags: ['rust'], cueDelayMinutes: 0 });
  writeSessionStartAgo(1);
  runScript(CLI, ['add', '--front', 'rust q', '--back', 'a', '--tags', 'rust,ownership']);
  runScript(CLI, ['add', '--front', 'js q', '--back', 'a', '--tags', 'javascript,closures']);
  const results = new Set();
  for (let i = 0; i < 20; i++) results.add(runScript(STATUSLINE));
  assert.ok(results.has('↻ rust q'), 'should show rust card');
  assert.ok(!results.has('↻ js q'), 'should not show js card');
});

test('empty cueTags shows all cards', () => {
  writeConfig({ cueTags: [], cueDelayMinutes: 0 });
  writeSessionStartAgo(1);
  runScript(CLI, ['add', '--front', 'any card', '--back', 'a', '--tags', 'misc']);
  assert.equal(runScript(STATUSLINE), '↻ any card');
});

test('session-start.mjs writes the marker file', () => {
  runScript(SESSION_START);
  const content = readFileSync(join(dir, '.session-start'), 'utf8');
  assert.ok(content.match(/^\d{4}-\d{2}/), 'expected an ISO timestamp');
});

// --- Study lock tests ---

test('suppresses cue when study session is active', () => {
  runScript(CLI, ['add', '--front', 'hidden during study', '--back', 'b']);
  runScript(CLI, ['study-lock']);
  assert.equal(runScript(STATUSLINE), '');
});

test('shows cue after study session ends', () => {
  runScript(CLI, ['add', '--front', 'visible after study', '--back', 'b']);
  runScript(CLI, ['study-lock']);
  assert.equal(runScript(STATUSLINE), '');
  runScript(CLI, ['study-unlock']);
  assert.equal(runScript(STATUSLINE), '↻ visible after study');
});

test('suppresses cue during cooldown after answering', () => {
  runScript(CLI, ['add', '--front', 'answered card', '--back', 'b']);
  runScript(STATUSLINE);
  runScript(CLI, ['clear-cue']);
  assert.equal(runScript(STATUSLINE), '');
});

test('session-start clears stale study lock', () => {
  writeConfig({ cueDelayMinutes: 0 });
  runScript(CLI, ['add', '--front', 'cleared by session start', '--back', 'b']);
  runScript(CLI, ['study-lock']);
  assert.equal(runScript(STATUSLINE), '');
  runScript(SESSION_START);
  assert.equal(runScript(STATUSLINE), '↻ cleared by session start');
});
