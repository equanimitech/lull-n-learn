---
name: lesson
description: Walk a learning path through multiple deepened nodes in prerequisite order, teaching each via Socratic walk-through. Use when the user runs /lesson, says "teach me the full topic", "walk me through the whole thing", or wants a structured learning session across multiple concepts.
---

# /lesson — learning path across nodes

Orchestrate a learning session across multiple deepened nodes. Each node is taught using the same Socratic walk-through as `/read`. Nodes are sequenced by the prerequisite graph. The learner can stop between any two nodes.

## Parse input

`$ARGUMENTS` contains the topic name. Optionally `--all` to re-teach already-read nodes.

```
/lesson <topic>
/lesson <topic> --all
```

## Load the project

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-list
```

Find the project whose topic matches (case-insensitive substring). If no match: "No project found for that topic. Run `/deep-lesson <topic>` first." and stop.

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-get <projectId>
```

## Compute the learning path

1. Collect nodes with status `deepened`, `learning`, or `mastered` that have a `guide` field (non-empty)
2. Unless `--all` was passed, filter out nodes where `readTrace` already exists
3. Also filter out nodes with status `mastered` (unless `--all`)
4. Topologically sort remaining nodes by the prerequisite graph (project `edges`):
   - For each edge `{ from, to }`, `from` must come before `to`
   - Nodes with no prerequisites come first
   - Among nodes at the same depth, order alphabetically by title
5. If no nodes remain: "Everything that's been researched is covered. `/deep-lesson <topic>` to deepen more nodes." and stop.

## Present the path

List the nodes by title with arrows:

"**N nodes** to cover: **Node A** → **Node B** → **Node C**. Ready?"

Wait for the user to confirm. Do NOT use `AskUserQuestion` — let them type freely.

## Lock the status line

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-lock
```

## Teach each node

For each node in the path, run the FULL Socratic walk-through described in `/read`:

1. **Hook** — one concrete scenario from the node's guide
2. **Explain chunks** — 2-3 paragraphs per chunk from the guide, conversational
3. **Comprehension checks** — after each chunk, one thinking question
4. **Adjust** — re-explain if needed
5. **Bridge** — connect to the next node in the path

After each node's walk-through is complete, write its trace:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" read-trace <projectId> <nodeId> \
  --comprehension <strong|partial|weak> \
  --gaps "<comma-separated>" \
  --chunks <n>
```

### Between nodes

If this is NOT the last node in the path:

"That's **<current node>**. Next: **<next node>** — <one-line description from node.description>. Continue?"

Wait for the user's response. If they say stop/no/enough/done: proceed to close. Otherwise continue to the next node.

### If the user stops mid-node

Write the trace for whatever was covered in the current node (partial chunks, comprehension so far). Then proceed to close.

## Unlock and close

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-unlock
```

Close: "You've covered **N nodes**. Your cards are primed for `/study`."

One line. No "N of M" framing. Don't list what wasn't covered.

## Anti-guilt rules (hard constraints)

- Never show "2 of 5 complete" or progress fractions
- Never list un-covered nodes or suggest what's remaining
- Stopping between nodes is always fine; don't remark on it
- Never pressure to continue ("you're so close!" etc.)
- Re-running `/lesson` on a topic where some nodes were already read is fine — it picks up where you left off
