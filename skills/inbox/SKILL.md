---
name: inbox
description: Triage auto-extracted lull-n-learn card candidates. Use when the user runs /inbox, says "triage my inbox", "review the extracted cards", or asks what's waiting in the learning inbox.
---

# Inbox triage

Candidates extracted from work sessions wait here for the user's judgment. The user never keeps a card they didn't choose; choosing what to learn is itself metalearning (Scott Young's principle #1).

## Steps

1. List candidates:

   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" inbox-list

2. If empty: say the inbox is empty and mention that /extract at the end of a rich session fills it. Stop.
3. Say how many candidates are waiting (a triage queue count is fine; due-card counts are not), then present them ONE at a time: front, back, and context. Offer three moves:
   - **keep**: node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" inbox-promote <id>
   - **edit**: agree on better wording with the user, then
     node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" inbox-promote <id> --front "..." --back "..."
   - **skip**: node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" inbox-dismiss <id>
4. Honor batch instructions ("keep all", "dismiss the rest") without walking through each one.
5. When done, confirm what entered the deck in one line. Do not mention when the new cards are due or how many cards the deck now holds.

## Judgment help

If the user asks whether a candidate is worth keeping, apply the filter: keep concepts, distinctions, and debugging insights; dismiss project-specific trivia and things better looked up than memorized.
