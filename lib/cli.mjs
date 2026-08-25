#!/usr/bin/env node
// @ts-check
/**
 * lull-n-learn CLI. Skills call this as:
 *   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" <subcommand> [args]
 * Every command prints JSON to stdout; errors go to stderr, exit code 1.
 */
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { newCardState, review } from './fsrs.mjs';
import { readCards, writeCards, readInbox, writeInbox, readProjects, writeProjects, readCue } from './store.mjs';

/** @typedef {import('./fsrs.mjs').FsrsState} FsrsState */
/** @typedef {import('./fsrs.mjs').Rating} Rating */

/**
 * @typedef {Object} Card
 * @property {string} id
 * @property {string} front
 * @property {string} back
 * @property {string[]} tags
 * @property {'session' | 'manual' | 'workflow'} source
 * @property {string | null} ref URL back to study guide section
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
 * @param {{ front: string, back: string, tags: string[], source: Card['source'], ref?: string | null }} input
 * @param {Date} [now]
 * @returns {Card}
 */
const makeCard = ({ front, back, tags, source, ref }, now = new Date()) => ({
  id: randomUUID(),
  front,
  back,
  tags,
  source,
  ref: ref ?? null,
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
      ref: { type: 'string' },
    },
  });
  if (!values.front || !values.back) fail('add requires --front and --back');
  const card = makeCard({
    front: values.front,
    back: values.back,
    tags: parseTags(values.tags),
    source: /** @type {Card['source']} */ (values.source ?? 'manual'),
    ref: values.ref ?? null,
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
    options: {
      limit: { type: 'string' },
      tag: { type: 'string' },
    },
  });
  const limit = values.limit ? Number(values.limit) : Infinity;
  let due = dueCards(readCards());
  if (values.tag) {
    const needle = values.tag.toLowerCase();
    due = due.filter((card) =>
      card.tags.some((t) => t.toLowerCase().includes(needle)),
    );
  }
  out(due.slice(0, limit));
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

// --- Project commands ---

const MASTERED_STABILITY = 21;

/**
 * Compute dynamic node statuses from linked card FSRS state.
 * Mutates nodes in place for convenience (caller owns the object).
 * @param {any} project
 * @param {Record<string, Card>} cards
 */
function computeNodeStatuses(project, cards) {
  for (const node of project.nodes) {
    if (node.cardIds.length === 0) continue;
    const linkedCards = node.cardIds
      .map((/** @type {string} */ id) => cards[id])
      .filter(Boolean);
    if (linkedCards.length === 0) continue;
    const allMastered = linkedCards.every(
      (/** @type {Card} */ c) => c.fsrs.stability >= MASTERED_STABILITY,
    );
    if (allMastered) {
      node.status = 'mastered';
    } else {
      const anyReviewed = linkedCards.some(
        (/** @type {Card} */ c) => c.fsrs.reps > 0,
      );
      if (anyReviewed) {
        node.status = 'learning';
      }
    }
  }
}

/** @param {string[]} argv */
function cmdProjectCreate(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      topic: { type: 'string' },
      sources: { type: 'string' },
    },
  });
  if (!values.topic) fail('project-create requires --topic');
  /** @type {any} */
  const project = {
    id: randomUUID(),
    topic: values.topic,
    createdAt: new Date().toISOString(),
    artifactUrl: null,
    sources: values.sources ? values.sources.split(',').map((s) => s.trim()).filter(Boolean) : [],
    nodes: [],
    edges: [],
  };
  const projects = readProjects();
  projects[project.id] = project;
  writeProjects(projects);
  out(project);
}

function cmdProjectList() {
  const projects = readProjects();
  const summaries = Object.values(projects).map(
    (/** @type {any} */ p) => ({
      id: p.id,
      topic: p.topic,
      createdAt: p.createdAt,
      artifactUrl: p.artifactUrl,
      nodeCount: p.nodes.length,
    }),
  );
  out(summaries.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
}

/** @param {string[]} argv */
function cmdProjectGet(argv) {
  const [id] = argv;
  if (!id) fail('usage: project-get <id>');
  const projects = readProjects();
  const project = projects[id];
  if (!project) fail(`no project with id ${id}`);
  computeNodeStatuses(project, readCards());
  out(project);
}

/** @param {string[]} argv */
function cmdProjectUpdate(argv) {
  const [id] = argv;
  if (!id) fail('usage: project-update <id> (reads JSON from stdin)');
  const projects = readProjects();
  if (!projects[id]) fail(`no project with id ${id}`);
  let input = '';
  try {
    input = readFileSync(0, 'utf8');
  } catch {
    fail('project-update requires JSON on stdin');
  }
  /** @type {any} */
  let updated;
  try {
    updated = JSON.parse(input);
  } catch {
    fail('invalid JSON on stdin');
  }
  updated.id = id;
  projects[id] = updated;
  writeProjects(projects);
  out(updated);
}

/** @param {string[]} argv */
function cmdProjectAddCards(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { cards: { type: 'string' } },
    allowPositionals: true,
  });
  const [projectId, nodeId] = positionals;
  if (!projectId || !nodeId || !values.cards) {
    fail('usage: project-add-cards <projectId> <nodeId> --cards id1,id2');
  }
  const cardIds = values.cards.split(',').map((s) => s.trim()).filter(Boolean);
  const projects = readProjects();
  const project = projects[projectId];
  if (!project) fail(`no project with id ${projectId}`);
  const node = project.nodes.find((/** @type {any} */ n) => n.id === nodeId);
  if (!node) fail(`no node with id ${nodeId} in project ${projectId}`);
  for (const cid of cardIds) {
    if (!node.cardIds.includes(cid)) {
      node.cardIds.push(cid);
    }
  }
  writeProjects(projects);
  computeNodeStatuses(project, readCards());
  out(project);
}

// --- Cue command ---

function cmdCurrentCue() {
  const cue = readCue();
  if (!cue) fail('no active cue');
  const cards = readCards();
  const card = cards[cue.cardId];
  if (!card) fail('cue card no longer exists');
  out({ ...card, cueTs: cue.ts });
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
  'project-create': cmdProjectCreate,
  'project-list': cmdProjectList,
  'project-get': cmdProjectGet,
  'project-update': cmdProjectUpdate,
  'project-add-cards': cmdProjectAddCards,
  'current-cue': cmdCurrentCue,
};

const [cmd, ...rest] = process.argv.slice(2);
const handler = cmd ? commands[cmd] : undefined;
if (!handler) fail(`usage: cli.mjs <${Object.keys(commands).join('|')}> [args]`);
handler(rest);
