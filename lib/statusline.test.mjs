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

/** @type {string} */
let dir;

/** @param {string} script @param {string[]} [args] */
const runScript = (script, args = []) =>
  execFileSync(process.execPath, [script, ...args], {
    env: { ...process.env, LULL_N_LEARN_DIR: dir },
    encoding: 'utf8',
  });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lull-n-learn-hud-'));
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
