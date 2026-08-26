#!/usr/bin/env node
// @ts-check
import { writeSessionStart, clearStudyLock, clearCue, clearCueCooldown } from './store.mjs';

writeSessionStart();
clearStudyLock();
clearCue({ cooldown: false });
clearCueCooldown();
