// @ts-check
/**
 * Persistence for lull-n-learn: plain JSON collections keyed by id,
 * living in ~/.lull-n-learn/ (override with LULL_N_LEARN_DIR).
 * No server, no account, no sync. The user owns these files.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Resolved lazily on every call so tests can point it at a temp dir.
 * @returns {string}
 */
export const dataDir = () =>
  process.env.LULL_N_LEARN_DIR ?? join(homedir(), '.lull-n-learn');

/** @param {string} name */
const filePath = (name) => join(dataDir(), `${name}.json`);

/**
 * Read a collection; a missing file is an empty collection.
 * @param {string} name e.g. "cards", "inbox"
 * @returns {Record<string, any>}
 */
export function readCollection(name) {
  try {
    return JSON.parse(readFileSync(filePath(name), 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return {};
    throw err;
  }
}

/**
 * Write a collection atomically (tmp file + rename), creating the
 * data directory on first use. Pretty-printed so users can edit it.
 * @param {string} name
 * @param {Record<string, any>} data
 */
export function writeCollection(name, data) {
  mkdirSync(dataDir(), { recursive: true });
  const target = filePath(name);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, target);
}

/** @returns {Record<string, any>} */
export const readCards = () => readCollection('cards');
/** @param {Record<string, any>} cards */
export const writeCards = (cards) => writeCollection('cards', cards);
/** @returns {Record<string, any>} */
export const readInbox = () => readCollection('inbox');
/** @param {Record<string, any>} inbox */
export const writeInbox = (inbox) => writeCollection('inbox', inbox);
/** @returns {Record<string, any>} */
export const readProjects = () => readCollection('projects');
/** @param {Record<string, any>} projects */
export const writeProjects = (projects) => writeCollection('projects', projects);
