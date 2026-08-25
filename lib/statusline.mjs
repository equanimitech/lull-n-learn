#!/usr/bin/env node
// @ts-check
/**
 * lull-n-learn status line: one due card's front as a retrieval cue.
 * One cue, never a count. Quiet when nothing is due. Silent on any error;
 * a status line must never crash or demand attention.
 *
 * Wire into ~/.claude/settings.json:
 *   { "statusLine": { "type": "command", "command": "node <path-to>/lib/statusline.mjs" } }
 */
import { readCards, writeCue } from './store.mjs';

try {
  const now = new Date();
  const due = Object.values(readCards()).filter(
    (card) => new Date(card.fsrs.due) <= now,
  );
  if (due.length > 0) {
    const pick = due[Math.floor(Math.random() * due.length)];
    writeCue(pick.id);
    process.stdout.write(`↻ ${pick.front}`);
  }
} catch {
  // Stay quiet. The cue is a gift, not a demand; an error is nobody's problem.
}
