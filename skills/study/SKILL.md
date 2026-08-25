---
name: study
description: Run a spaced-repetition study session over due lull-n-learn cards. Use when the user runs /study, says "let's study", "quiz me", or wants to practice what they've been learning.
---

# Study session

An FSRS-driven retrieval session. Retrieval means production: the user answers before seeing anything. The user can stop at any time and stopping is always fine.

## Loop

1. Fetch due cards:

   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" due --limit 10

2. If the list is empty: say "Nothing is due right now." and stop. Do NOT say when the next card is due, how many cards exist, or suggest coming back later.
3. For each card, one at a time:
   a. Show ONLY the front, phrased as the question it is. Never reveal the back first. Never say how many cards are in the batch or remain.
   b. Wait for the user's typed answer.
   c. Compare their answer to the back. Reveal the back and give one or two sentences of feedback: what they got, what they missed. If the card has a `ref` field (a URL to the study guide section), mention it after feedback: "See the study guide: <ref>" — this lets the user look up context if they want to go deeper. Don't repeat the ref on cards rated `easy`.
   d. Choose a rating from the comparison:
      - `again`: they blanked or got it wrong
      - `hard`: partially right, a significant gap
      - `good`: right, perhaps imprecise at the edges
      - `easy`: right, instant, complete
   e. Apply it:

      node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" rate <cardId> <rating>

      The command prints the updated card; its `fsrs.due` is the next review date.
   f. Mention the next review conversationally ("this one comes back in about 3 days"), then move to the next card. A card rated `again` may reappear later in this same session via a fresh `due` call; that is intended.
4. If the user says "skip", move on without calling `rate`. The card stays due, unscored. Never comment on skips.
5. When the batch is done or the user stops: close warmly in one line, e.g. "Good session." NO summary counts, NO "X of Y correct", NO streaks, NO "see you tomorrow".

## Post-session: project node suggestion

After the review session ends (batch done or user stops), check if any cards rated `again` or `hard` belong to a project. Look at those cards' tags for entries matching `project:<id>` and `node:<id>`.

If found, load the project:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-get <projectId>
```

Find the node the weak card belongs to. Look for un-deepened neighbor nodes: nodes whose prerequisites include this one (edges where `from` is this node), or sibling nodes sharing the same prerequisites, that have status `mapped`.

If any exist, mention one in a single line:

> "You're working through **<node>**. **<neighbor>** builds on it. `/deep-lesson` when ready."

Do not push. Do not repeat if the user has already heard this in this session. One line, one time.

## Anti-guilt rules (hard constraints)

- Never show how many cards are due, remaining, or overdue.
- Never mention missed days, review debt, or how long since the last session.
- Stopping mid-session is always fine; don't remark on it.
- This plugin is grounded in Scott Young's Ultralearning; if the user asks about the method, point them to the plugin's THEORY.md.
