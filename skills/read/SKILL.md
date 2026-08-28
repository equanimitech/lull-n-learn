---
name: read
description: Teach a deepened node from a lull-n-learn project conversationally via Socratic walk-through. Use when the user runs /read, says "teach me about X", "explain this node", "walk me through X", or wants to learn a concept before studying cards.
---

# /read — Socratic teaching for one node

Teach a single deepened node conversationally. You are a tutor, not a lecturer. Use the node's guide and research as source material — teach from them, don't read them aloud. Match the language of the node content (French nodes → teach in French).

## Parse input

`$ARGUMENTS` follows one of these patterns:
- `<topic>: <node title>` → teach one specific node
- `<topic>` → pick the best unread deepened node (most prerequisite dependencies met, highest learning value)

Split on `:` to separate topic from node title. Both are case-insensitive substring matches.

## Load the project

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-list
```

Find the project whose topic matches (case-insensitive substring). If no match: "No project found for that topic. Run `/deep-lesson <topic>` first." and stop.

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-get <projectId>
```

## Find the node

If a node title was provided: find it by case-insensitive substring match on the node's `title` field.

If no node title: find the best unread deepened node:
1. Collect nodes with status `deepened`, `learning`, or `mastered` that have a `guide` field
2. Prefer nodes without a `readTrace` (unread)
3. Among those, prefer nodes whose prerequisite nodes (from `edges`) are already deepened/learning/mastered
4. Pick the first one. If all deepened nodes have been read, pick the one with the weakest `readTrace.comprehension`.

## Guards

- If the node status is `unmapped` or `mapped`: "**<node title>** hasn't been researched yet. `/deep-lesson <topic>: <node title>` to deepen it first." Stop.
- If the node has no `guide` field (empty string or null): "**<node title>** was deepened but has no study guide. `/deep-lesson <topic>: <node title>` to regenerate." Stop.

## Lock the status line

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-lock
```

## Teach — the Socratic walk-through

You have these materials (DO NOT show them raw to the user):
- `node.guide` — markdown study guide content (primary teaching material)
- `node.research.sources` — what was consulted and what each contributed
- `node.research.synthesis` — how the sources were combined
- `node.research.references` — visual references (images, videos, diagrams) if available
- `node.description` — one-line summary

### Step 1: Hook

Open with ONE concrete scenario or question that makes the concept feel necessary. Pick the most surprising or counterintuitive point from the guide. This is an invitation to think, not a quiz.

### Step 2: Explain a chunk

Present one chunk (2-3 paragraphs max) from the guide, rewritten conversationally. Use tables, formulas, and examples from the guide but weave them into the conversation. If the node has visual references (`node.research.references`), mention them: "Open the study guide to see the diagram."

### Step 3: Comprehension check

Ask ONE question that demands thinking — not yes/no, not pure recall. Test whether the learner built the right mental model.

Good: "What happens if you try X?" / "Tu es en situation Y — que fais-tu ?"
Bad: "Does that make sense?" / "What's the definition of X?"

Wait for the user's response. Do NOT use `AskUserQuestion` — the user must type freely.

### Step 4: Adjust

- **Solid:** Acknowledge briefly, bridge to the next chunk.
- **Partial:** Re-explain from a different angle with a new example. Don't repeat louder.
- **Misconception:** Name it directly, explain why it's wrong, provide the correct model.

Track internally:
- How many chunks you covered
- Whether checks passed on first attempt (strong), needed re-explanation (partial), or struggled (weak)
- Specific concepts that needed re-explanation (these become gaps)

### Step 5: Repeat steps 2-4

A typical node (200-500 word guide) breaks into 2-4 chunks. Cover all the guide material.

### Step 6: Bridge

Connect to what comes next in the graph. Check the project's `edges` to find nodes that depend on this one (edges where `from` is this node's id). Mention the next node in one sentence.

If standalone (no dependent nodes): "Your cards from **<node title>** are primed for `/study`."

## Record the trace

After the walk-through (or if the user stops mid-way), assess and write the trace:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" read-trace <projectId> <nodeId> \
  --comprehension <strong|partial|weak> \
  --gaps "<comma-separated specific concepts>" \
  --chunks <number of chunks covered>
```

Comprehension assessment:
- `strong` — all checks passed on first attempt
- `partial` — needed re-explanation on some chunks but got there
- `weak` — struggled throughout, multiple re-explanations needed

Gaps are SPECIFIC concepts, not categories. "non-cumul probatoire+pluie" yes. "speed limits" no.

## Unlock and close

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" study-unlock
```

Close: "Your cards from **<node title>** are primed for `/study`." One line. No summary stats, no "you covered N chunks", no score.

## Anti-guilt rules (hard constraints)

- Never show how many chunks remain or were covered
- Never score the session ("you got 3/4")
- Stopping mid-way is always fine; don't remark on it
- Never mention what hasn't been read yet
- Re-reading a node is always fine — don't comment on it
