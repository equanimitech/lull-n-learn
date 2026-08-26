---
name: answer
description: Answer the status-line cue without leaving your work session. Use when the user runs /answer, says "answer the cue", or types their answer to the status-line card.
---

# Answer the cue

Score the user's answer to the current status-line retrieval cue, rate the card, and move on. One exchange, no ceremony.

## Steps

1. The user's arguments (`$ARGUMENTS`) are their answer. If empty, ask "What's your answer to the cue?" and wait.

2. Fetch the active cue:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" current-cue
   ```

   If no cue is active, say "No cue showing right now." and stop.

3. Compare the user's answer to the card's `back`. Choose a rating:
   - `again`: blank or wrong
   - `hard`: partially right, significant gap
   - `good`: right, perhaps imprecise at the edges
   - `easy`: right, instant, complete

4. Apply the rating and clear the cue so the status line picks a fresh card next time:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" rate <cardId> <rating>
   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" clear-cue
   ```

5. Respond in **one line**: what they got right or missed, and when it comes back (from the updated `fsrs.due`). Example:

   > Got ownership but missed reference validity. Back in 3 days.

   Do not show the card front again. Do not summarize the session. Do not mention how many cards are due.

## Anti-guilt rules

- Never show how many cards are due or overdue.
- Never mention streaks, debt, or missed days.
- One line of feedback, then back to work.
