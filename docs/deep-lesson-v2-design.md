# Deep Lesson v2: Autonomous Workflow

## TL;DR

- **Goal:** Reshape `/deep-lesson` from a 3-path skill into a thin skill + autonomous workflow, modeled on deep research's fire-and-report pattern.
- **Key decisions:** Single flow (no path A/B/C routing); calibration reads work context + existing cards to decide scope and depth autonomously; the workflow owns all research/mapping/deepening decisions; the skill is a thin dispatch-and-persist layer (~50 lines).
- **Open questions:** Whether budget-awareness should cap the number of nodes deepened per run.
- **Cascades:** Replaces `skills/deep-lesson/SKILL.md` and adds a workflow script. No data layer or CLI changes — the same project/card primitives are used.

---

## 1. Why the Reshape

The current deep-lesson skill is 372 lines of instructions that the main-loop agent follows. It has three paths:

- **Path A** (new topic): greet → ask for sources → create project → dispatch scout workflow → add starter cards → publish artifact → suggest deepening
- **Path B** (deepen a node): load project → find node → check prerequisites → dispatch deepen workflow → add cards → update project → republish → suggest next
- **Path C** (continue): load project → find ready nodes → suggest → hand off to Path B

The problems:

1. **The skill is the brain.** Path routing, node selection, prerequisite checking, "what to do next" — all live in the skill instructions. The agent follows orders rather than making decisions.
2. **Mid-flow interaction that isn't needed.** "Do you have source material?" and "Shall I deepen this node?" are interactive gates in a flow that could be autonomous.
3. **Three paths for one thing.** New/deepen/continue are the same operation (make the learner's map better) at different starting points. The workflow should figure out where to start.
4. **Context cost.** 372 lines of instructions sit in the main loop's context for the entire run. A workflow script moves the logic out.

### The model: deep research

Claude's deep research is fire-and-report: you give it a question, it fans out agents, it comes back with results. No mid-flow interaction. The user's only decision is what to ask.

Deep-lesson should work the same way: you say "learn X" and get back a knowledge map with cards. The workflow decides what to research, how deep to go, and which nodes to prioritize.

---

## 2. Architecture

```
User: /deep-lesson <topic> [--sources file1,file2] [--node "specific node"]
  │
  ▼
┌─────────────────────────────────┐
│  Skill (thin dispatch layer)    │
│                                 │
│  1. Parse input                 │
│  2. Read project state (CLI)    │
│  3. Read existing cards (CLI)   │
│  4. Read work context (git log) │
│  5. Dispatch workflow with args │
│  6. On return:                  │
│     - Add cards via CLI         │
│     - Update project via CLI    │
│     - Publish/update artifact   │
│     - Report to user            │
└────────────┬────────────────────┘
             │ args: { topic, sources, existingProject,
             │         existingCards, workContext, targetNode }
             ▼
┌─────────────────────────────────┐
│  Workflow (autonomous)          │
│                                 │
│  Calibrate → Scout → Map →     │
│  Deepen (pipeline) → return    │
│                                 │
│  Returns: { project, cards,    │
│    guideContent, artifact }     │
└─────────────────────────────────┘
```

### What each layer owns

**Skill owns:**
- Input parsing (topic, sources, target node)
- Reading current state from the CLI
- Reading work context (git log, working directory)
- Dispatching the workflow
- Persisting results (CLI calls to add cards, update project)
- Publishing the artifact
- Reporting to the user

**Workflow owns:**
- Calibration (assessing the learner's level)
- Scouting (researching the topic)
- Mapping (synthesizing a knowledge graph)
- Deciding which nodes to deepen
- Deepening (research → cards + guide content)
- All decision-making about scope, depth, and priority

---

## 3. Workflow Phases

### Phase 1: Calibrate

One structured-output agent. Reads everything the skill passed in and produces a plan.

**Inputs:**
- `existingCards[]` — fronts, tags, FSRS state (what's been learned, what's weak)
- `existingProject` — nodes, edges, statuses, which are deepened (null if new topic)
- `workContext` — recent git log entries, working directory file list (what the user has been building with)
- `topic` — the requested topic
- `sources[]` — user-provided source file paths
- `targetNode` — specific node to focus on (optional)

**Outputs (structured):**
```json
{
  "knownConcepts": ["ownership", "borrowing"],
  "gaps": ["lifetime elision", "trait objects"],
  "needsScout": true,
  "nodesToDeepen": [
    { "id": "node-1", "title": "lifetime elision", "reason": "gap + prerequisite met" }
  ],
  "maxDepth": 3,
  "levelAssessment": "intermediate — understands ownership basics from work context, hasn't studied lifetimes"
}
```

**Decision rules:**
- `needsScout = true` when no project exists, or when the existing map is stale (topic has evolved since creation)
- `nodesToDeepen` — prioritized by: gap severity × prerequisite readiness × centrality in graph. If `targetNode` is set, that node goes first.
- `maxDepth` — how many nodes to deepen this run. Defaults to 3 for new topics (starter cards only for the rest), all ready nodes for continuations.

### Phase 2: Scout (parallel, conditional)

Skipped if `!calibration.needsScout`.

Parallel agents:
- **Survey agent** — broad topic survey using agent knowledge
- **Context7 agent** — documentation lookup (if topic is a library/framework; resolve library ID first)
- **WebSearch agent** — concept landscape, prerequisites, authoritative sources
- **Source agents** — one per user-provided file, reads and summarizes

Each returns a structured summary: key concepts found, relationships identified, sources cited.

### Phase 3: Map (sequential)

One synthesizer agent. Receives scout outputs (if scouted) + calibration + existing project state.

**If new topic:** Produces a fresh knowledge graph:
- `nodes[]` with `{ id, title, description, status: 'mapped', cardIds: [], research: null, guide: null }`
- `edges[]` with `{ from, to }` prerequisite relationships
- `suggestedStart` — best first node to deepen
- `scoutSources` — per-node source citations

**If continuation:** Updates the existing graph:
- Adds new nodes discovered during re-calibration
- Updates edges if new relationships found
- Preserves existing node states and card associations

### Phase 4: Deepen (pipeline)

Pipelines over `calibration.nodesToDeepen`:

**Stage 1 — Research** (per node, parallel across nodes):
- Deep research on the specific subtopic
- Context7/WebSearch targeted at this node's concepts
- Re-read user sources for content relevant to this node

**Stage 2 — Generate** (per node, sequential after its research):
Two outputs per node:

1. **Cards**, layered by the node's position in the learner's journey:
   - **Starter cards** (for newly mapped nodes): definitional + relational (2-3 cards)
   - **Comprehension cards** (for deepening): paraphrase, explain, identify components
   - **Application cards**: procedural drills, "given X, what happens?"
   - **Analysis cards**: compare/contrast, edge cases, "why not Y?"
   - Each card: `{ front, back, tags, ref, layer }`
   - Skips concepts already covered by existing cards

2. **Guide content**: markdown study guide section for the artifact
   - Key concepts and relationships
   - Visual aids (mermaid diagrams, tables, Unicode art)
   - Worked examples
   - Links to authoritative sources
   - Common mistakes
   - 200-500 words per node

Returns per node:
```json
{
  "nodeId": "...",
  "cards": [{ "front": "...", "back": "...", "tags": [], "ref": "...", "layer": "starter" }],
  "guide": "markdown string",
  "research": {
    "sources": [{ "type": "web", "reference": "...", "contribution": "..." }],
    "synthesis": "...",
    "excluded": ["..."],
    "generatedAt": "ISO8601"
  }
}
```

### Workflow return value

The workflow returns the full result set. The skill handles all persistence.

```json
{
  "calibration": { "levelAssessment": "...", "knownConcepts": [], "gaps": [] },
  "project": { "nodes": [], "edges": [], "topic": "..." },
  "deepened": [
    {
      "nodeId": "...",
      "cards": [],
      "guide": "...",
      "research": {}
    }
  ],
  "isNew": true
}
```

---

## 4. Skill Spec

### Input parsing

```
/deep-lesson <topic>                    → new or continue
/deep-lesson <topic> --sources f1,f2    → new with sources
/deep-lesson <topic>: <node title>      → target a specific node
/deep-lesson                            → continue most recent project
```

### Pre-dispatch steps

1. `node cli.mjs project-list` — find existing project for this topic
2. `node cli.mjs list` — read all cards (for calibration)
3. `git log --oneline -20` + `ls` — work context snapshot
4. If project exists: `node cli.mjs project-get <id>`

Bundle everything into workflow args.

### Post-dispatch steps

1. If new project: `node cli.mjs project-create --topic "<topic>"`
2. For each card in the workflow result:
   ```
   node cli.mjs add --front "..." --back "..." --tags "..." --source "deep-lesson" --ref "..."
   ```
3. Link cards to nodes: `node cli.mjs project-add-cards <projectId> <nodeId> --cards id1,id2`
4. Update project with map + research + guide:
   ```
   echo '<json>' | node cli.mjs project-update <projectId>
   ```
5. Publish/update artifact (follow artifact-design skill, same design spec as today)
6. Report: "**<topic>** — N nodes mapped, M cards added, K nodes deepened. [artifact link]"

### What the skill does NOT do

- Decide which nodes to deepen (workflow decides)
- Ask for sources interactively (passed as args or omitted)
- Route between paths (one path)
- Suggest next steps conversationally (the artifact is the map; the user comes back when ready)

---

## 5. What Changes

### Files modified

| File | Change |
|------|--------|
| `skills/deep-lesson/SKILL.md` | Rewritten from 372 lines to ~50 lines (thin dispatch) |

### Files added

| File | Purpose |
|------|---------|
| `workflows/deep-lesson.md` | Workflow instructions (the skill tells the agent to write and dispatch a Workflow script based on these) |

### Files unchanged

| File | Why |
|------|-----|
| `lib/cli.mjs` | Same CLI commands, no new subcommands needed |
| `lib/store.mjs` | Same data layer |
| `lib/fsrs.mjs` | Same algorithm |
| All other skills | No cross-skill dependencies |
| `docs/design.md` | Original design doc stays as historical reference |

### Data layer

No schema changes. The same `projects.json` structure works — nodes, edges, research, guide content, card associations. The workflow just populates them differently (all at once instead of incrementally across invocations).

---

## 6. Artifact Design

Unchanged from v1. The study guide artifact is the same — mermaid graph at top, node list below, deepened nodes expand with guide content and research transparency. Same palette (stone + clay + sage), same anti-guilt rules, same typography.

The only difference: the artifact may show more deepened nodes after a single invocation, since the workflow deepens multiple nodes per run.

---

## 7. Equanimitech Alignment

All v1 alignment holds. The reshape strengthens two principles:

- **Bounded Experiences** — one invocation = one complete run, not an ongoing conversation with multiple prompts
- **Downstream Allocation** — the user's choice is the topic and optional sources. The workflow handles the how. Less decision fatigue, same sovereignty over what to learn.

Anti-guilt unchanged: no progress bars, no completion percentages, no streaks.

---

## 8. Migration

No data migration needed. Existing projects in `projects.json` work with the new flow — the calibration phase reads them and decides what to do next. Cards tagged with `project:<id>` are already in the right format.

The old skill is simply replaced. No backwards compatibility concern — it's a plugin skill, not a public API.
