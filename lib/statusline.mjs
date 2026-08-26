#!/usr/bin/env node
// @ts-check
/**
 * lull-n-learn status line: one due card's front as a retrieval cue.
 * One cue, never a count. Quiet when nothing is due. Silent on any error.
 * The chosen card stays pinned until answered (/answer) or the session ends.
 *
 * Respects config.json:
 *   cueEnabled — master toggle (default: true)
 *   cueDelayMinutes — grace period after session start before cues appear (default: 5)
 *   cueTags — only show cards matching at least one of these tags (default: all)
 */
import { readCards, writeCue, readCue, readConfig, readSessionStart, isStudyActive, isCueCoolingDown } from './store.mjs';

try {
  const config = readConfig();
  if (config.cueEnabled === false) process.exit(0);
  if (isStudyActive()) process.exit(0);
  if (isCueCoolingDown()) process.exit(0);

  const delayMinutes = config.cueDelayMinutes ?? 5;
  const sessionStart = readSessionStart();
  if (sessionStart) {
    const elapsed = (Date.now() - new Date(sessionStart).getTime()) / 60_000;
    if (elapsed < delayMinutes) process.exit(0);
  }

  const cards = readCards();
  const existingCue = readCue();
  if (existingCue && cards[existingCue.cardId]) {
    process.stdout.write(`↻ ${cards[existingCue.cardId].front}`);
    process.exit(0);
  }

  const now = new Date();
  let due = Object.values(cards).filter(
    (card) => new Date(card.fsrs.due) <= now,
  );

  const cueTags = config.cueTags;
  if (Array.isArray(cueTags) && cueTags.length > 0) {
    due = due.filter((card) =>
      card.tags.some((t) => cueTags.some((ct) => t.includes(ct))),
    );
  }

  if (due.length > 0) {
    const pick = due[Math.floor(Math.random() * due.length)];
    writeCue(pick.id);
    process.stdout.write(`↻ ${pick.front}`);
  }
} catch {
  // Stay quiet. The cue is a gift, not a demand; an error is nobody's problem.
}
