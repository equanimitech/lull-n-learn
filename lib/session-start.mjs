#!/usr/bin/env node
// @ts-check
import { readSessionStart, writeSessionStart, clearStudyLock, clearCueCooldown } from './store.mjs';

const existing = readSessionStart();
const GRACE_MS = 10 * 60_000;
if (!existing || Date.now() - new Date(existing).getTime() > GRACE_MS) {
  writeSessionStart();
}
clearStudyLock();
clearCueCooldown();
