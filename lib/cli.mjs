#!/usr/bin/env node
// @ts-check
/**
 * lull-n-learn CLI. Skills call this as:
 *   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" <subcommand> [args]
 * Every command prints JSON to stdout; errors go to stderr, exit code 1.
 */
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { newCardState, review } from './fsrs.mjs';
import { readCards, writeCards, readInbox, writeInbox } from './store.mjs';

/** @typedef {import('./fsrs.mjs').FsrsState} FsrsState */
/** @typedef {import('./fsrs.mjs').Rating} Rating */

/**
 * @typedef {Object} Card
 * @property {string} id
 * @property {string} front
 * @property {string} back
 * @property {string[]} tags
 * @property {'session' | 'manual' | 'workflow'} source
 * @property {string} createdAt ISO8601
 * @property {FsrsState} fsrs
 */

/**
 * @typedef {Object} Candidate
 * @property {string} id
 * @property {string} front
 * @property {string} back
 * @property {string[]} tags
 * @property {Card['source']} source
 * @property {string} sessionDate ISO8601
 * @property {string} context brief note on where this came from
 */

const RATING_NAMES = /** @type {Record<string, Rating>} */ ({
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
});

/** @param {unknown} value */
const out = (value) => {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
};

/**
 * @param {string} message
 * @returns {never}
 */
const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

/** @param {string | undefined} raw */
const parseTags = (raw) =>
  raw ? raw.split(',').map((t) => t.trim()).filter(Boolean) : [];

/**
 * @param {{ front: string, back: string, tags: string[], source: Card['source'] }} input
 * @param {Date} [now]
 * @returns {Card}
 */
const makeCard = ({ front, back, tags, source }, now = new Date()) => ({
  id: randomUUID(),
  front,
  back,
  tags,
  source,
  createdAt: now.toISOString(),
  fsrs: newCardState(now),
});

/**
 * @param {Record<string, Card>} cards
 * @param {Date} [now]
 * @returns {Card[]}
 */
const dueCards = (cards, now = new Date()) =>
  Object.values(cards)
    .filter((card) => new Date(card.fsrs.due) <= now)
    .sort((a, b) => a.fsrs.due.localeCompare(b.fsrs.due));

// --- Card commands ---

/** @param {string[]} argv */
function cmdAdd(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      front: { type: 'string' },
      back: { type: 'string' },
      tags: { type: 'string' },
      source: { type: 'string' },
    },
  });
  if (!values.front || !values.back) fail('add requires --front and --back');
  const card = makeCard({
    front: values.front,
    back: values.back,
    tags: parseTags(values.tags),
    source: /** @type {Card['source']} */ (values.source ?? 'manual'),
  });
  const cards = readCards();
  cards[card.id] = card;
  writeCards(cards);
  out(card);
}

/** @param {string[]} argv */
function cmdDue(argv) {
  const { values } = parseArgs({
    args: argv,
    options: { limit: { type: 'string' } },
  });
  const limit = values.limit ? Number(values.limit) : Infinity;
  out(dueCards(readCards()).slice(0, limit));
}

/** @param {string[]} argv */
function cmdRate(argv) {
  const [id, ratingArg] = argv;
  if (!id || !ratingArg) fail('usage: rate <cardId> <again|hard|good|easy|1-4>');
  const rating = RATING_NAMES[ratingArg] ?? Number(ratingArg);
  if (![1, 2, 3, 4].includes(rating)) fail(`unknown rating: ${ratingArg}`);
  const cards = readCards();
  const card = cards[id];
  if (!card) fail(`no card with id ${id}`);
  const updated = { ...card, fsrs: review(card.fsrs, /** @type {Rating} */ (rating)) };
  cards[id] = updated;
  writeCards(cards);
  out(updated);
}

function cmdList() {
  out(Object.values(readCards()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
}

// --- Inbox commands ---

/** @param {string[]} argv */
function cmdInboxAdd(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      front: { type: 'string' },
      back: { type: 'string' },
      tags: { type: 'string' },
      context: { type: 'string' },
      source: { type: 'string' },
    },
  });
  if (!values.front || !values.back) fail('inbox-add requires --front and --back');
  /** @type {Candidate} */
  const candidate = {
    id: randomUUID(),
    front: values.front,
    back: values.back,
    tags: parseTags(values.tags),
    source: /** @type {Card['source']} */ (values.source ?? 'session'),
    sessionDate: new Date().toISOString(),
    context: values.context ?? '',
  };
  const inbox = readInbox();
  inbox[candidate.id] = candidate;
  writeInbox(inbox);
  out(candidate);
}

function cmdInboxList() {
  out(
    Object.values(readInbox()).sort((a, b) =>
      a.sessionDate.localeCompare(b.sessionDate),
    ),
  );
}

/** @param {string[]} argv */
function cmdInboxPromote(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      front: { type: 'string' },
      back: { type: 'string' },
    },
    allowPositionals: true,
  });
  const [id] = positionals;
  if (!id) fail('usage: inbox-promote <id> [--front "..."] [--back "..."]');
  const inbox = readInbox();
  const candidate = inbox[id];
  if (!candidate) fail(`no inbox candidate with id ${id}`);
  const card = makeCard({
    front: values.front ?? candidate.front,
    back: values.back ?? candidate.back,
    tags: candidate.tags,
    source: candidate.source,
  });
  const cards = readCards();
  cards[card.id] = card;
  writeCards(cards);
  delete inbox[id];
  writeInbox(inbox);
  out(card);
}

/** @param {string[]} argv */
function cmdInboxDismiss(argv) {
  const [id] = argv;
  if (!id) fail('usage: inbox-dismiss <id>');
  const inbox = readInbox();
  if (!inbox[id]) fail(`no inbox candidate with id ${id}`);
  delete inbox[id];
  writeInbox(inbox);
  out({ dismissed: id });
}

// --- Dispatch ---

/** @type {Record<string, (argv: string[]) => void>} */
const commands = {
  add: cmdAdd,
  due: cmdDue,
  rate: cmdRate,
  list: cmdList,
  'inbox-add': cmdInboxAdd,
  'inbox-list': cmdInboxList,
  'inbox-promote': cmdInboxPromote,
  'inbox-dismiss': cmdInboxDismiss,
};

const [cmd, ...rest] = process.argv.slice(2);
const handler = cmd ? commands[cmd] : undefined;
if (!handler) fail(`usage: cli.mjs <${Object.keys(commands).join('|')}> [args]`);
handler(rest);
