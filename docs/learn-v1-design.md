# /learn v1: Metalearning Engine

## TL;DR

- **Goal:** A `/learn <topic>` skill backed by multi-agent workflows that researches a topic, builds a living knowledge map as an artifact, and lets the user deepen nodes one at a time to generate spaced-repetition card candidates.
- **Key decisions:** Plan-first (the map is the primary output, cards are the byproduct); gap-aware (reads existing cards, focuses on uncovered ground); iterative (nodes deepen on demand, not all at once); research process visible in the artifact (Layer 2 / Franklin fix); artifact uses the equanimitech design system.
- **Open questions:** Whether Context7 and WebSearch are available in all plugin execution contexts; PDF reading depth limits in workflow agents.
- **Cascades:** Updates `projects.json` schema in the data layer; modifies `/review` skill to add node suggestions.

---

## 1. Theoretical Grounding

Young's Principle #1 (Metalearning): "First draw a map." Before learning a skill, research how it works, what subtopics exist, and what order to tackle them.

The `/learn` skill operationalizes this as a two-phase loop:

1. **Scout + Map:** research the territory, produce a concept graph showing what exists and how pieces relate.
2. **Deepen:** pick one node, research it thoroughly, generate card candidates.

The map is a living artifact that grows as the learner progresses. It teaches metalearning by modeling metalearning: the user sees how a topic decomposes, what depends on what, and where their existing knowledge sits. After several projects, the user internalizes the decomposition pattern itself.

This addresses the Franklin / Layer 2 concern: the research process is visible in the artifact (sources consulted, reasoning behind the graph structure), so the tool builds the user's metalearning skill rather than replacing it.

---

## 2. Concept Model

### Project

```
Project {
  id: string,                    // crypto.randomUUID()
  topic: string,                 // "rust ownership", "FSRS algorithm"
  createdAt: string,             // ISO8601
  artifactUrl: string | null,    // artifact URL once published
  sources: string[],             // user-provided file paths
  nodes: Node[],
  edges: Edge[]
}
```

### Node

```
Node {
  id: string,
  title: string,                 // "borrowing basics", "lifetime elision"
  description: string,           // one-line until deepened
  status: 'unmapped' | 'mapped' | 'deepened' | 'learning' | 'mastered',
  cardIds: string[],             // cards generated from this node
  research: Research | null      // filled on deepen, visible in artifact
}
```

### Research (Layer 2 / Franklin transparency)

```
Research {
  sources: SourceCitation[],     // what was consulted
  synthesis: string,             // how the sources were combined
  excluded: string[],            // what was considered and dropped, with reasons
  generatedAt: string            // ISO8601
}

SourceCitation {
  type: 'user-file' | 'web' | 'context7' | 'agent-knowledge',
  reference: string,             // file path, URL, or library name
  contribution: string           // what this source added to the node
}
```

### Edge

```
Edge {
  from: string,     // prerequisite node ID
  to: string        // dependent node ID
}
```

### Status Progression

- **unmapped**: title only, placed during scout phase
- **mapped**: title + description + prerequisites placed
- **deepened**: fully researched, cards generated, research visible
- **learning**: at least one linked card in active review (computed from FSRS)
- **mastered**: all linked cards at high FSRS stability (computed from FSRS)

The `learning` and `mastered` transitions are computed from card FSRS state, not set manually. The CLI computes them when reading the project.

---

## 3. Workflow Phases

### Phase 1: Scout + Map

Triggered by `/learn <topic>` when no project exists for this topic.

**Interaction before dispatch:**

1. The skill greets: "Let's map <topic>."
2. Asks: "Do you have any source material? PDFs, markdown files, docs you'd like me to work from?"
3. User provides paths or says no.
4. Skill dispatches the workflow.

**Workflow: `scout-and-map`**

```
phase('Scout')
  parallel([
    agent: read existing cards from cards.json, extract related fronts
    agent: broad survey of the topic using agent knowledge
    agent: Context7 for library/framework documentation (if applicable)
    agent: WebSearch for concept landscape and prerequisites
    agent(s): read user-provided files (one agent per file)
  ])

phase('Map')
  agent: synthesize all scout outputs into a knowledge graph
    - identify concept nodes (subtopics, techniques, distinctions)
    - place prerequisite edges between nodes
    - mark nodes already covered by existing cards
    - write a one-line description per node
    - suggest a starting node (prerequisites met, high learning value)
    - record which scout sources informed each node (Layer 2)

return { nodes, edges, existingCoverage, suggestedStart, scoutSources }
```

**After the workflow returns:**

1. Save the project to `projects.json` via CLI
2. Publish the knowledge map artifact (see Section 4)
3. Tell the user: "Your map is ready. Run `/learn` to start deepening a node."
4. Stop. Card generation is a separate invocation.

### Phase 2: Deepen

Triggered by `/learn` (no topic) or `/learn <node-title>` when an active project exists.

**Interaction before dispatch:**

1. If no node specified: the skill reads the project, finds "ready" nodes (all prerequisites met or mastered, status is `mapped`), and suggests the best one. User confirms or picks a different node.
2. If node specified: the skill confirms the node exists and prerequisites are met.

**Workflow: `deepen-node`**

```
phase('Research')
  parallel([
    agent: deep research on this specific subtopic
    agent: Context7 / WebSearch targeted at this node's concepts
    agent(s): re-read user sources, extract sections relevant to this node
  ])

phase('Generate')
  agent: produce card candidates from research
    - atomic facts, conceptual questions, procedural drills
    - tag with project ID + node ID
    - skip concepts already covered by existing cards
    - for each candidate, note which source it came from

return { research: Research, candidates: Candidate[] }
```

**After the workflow returns:**

1. Write candidates to inbox via `inbox-add` (tagged with project and node)
2. Update the node: set status to `deepened`, attach the `Research` object
3. Update the artifact to reflect the new state
4. Tell the user: "N candidates in your inbox from '<node title>'. Run `/inbox` to triage them."

### Phase 3: Review-driven suggestions (no workflow)

Logic added to the existing `/review` skill. After a review session ends:

1. Check if any cards rated `again` or `hard` belong to a project node.
2. If that node has un-deepened neighbors (nodes whose prerequisites include this one, or sibling nodes), suggest deepening.
3. One line, no pressure: "You're working through <node>. The next piece, <neighbor>, builds on it. `/learn` when you're ready."

---

## 4. The Artifact

### Purpose

A living knowledge map that serves as the learner's orientation tool. Read-only. All actions flow through `/learn`, `/review`, and `/inbox` in the terminal.

### Visual Design

The artifact follows the equanimitech design system (`DESIGN.md`).

**Palette:**

| Token | OKLCH | Role |
|---|---|---|
| stone-50 | `oklch(0.985 0.003 60)` | Page ground (light) |
| stone-200 | `oklch(0.923 0.005 60)` | Hairline rules, node borders |
| stone-400 | `oklch(0.709 0.008 60)` | Faint text, unmapped nodes |
| stone-600 | `oklch(0.444 0.010 60)` | Muted text, labels |
| stone-900 | `oklch(0.216 0.007 60)` | Body text, ink |
| stone-950 | `oklch(0.147 0.005 60)` | Dark-mode ground |
| clay | `oklch(0.62 0.100 60)` | Brand accent, "your move" state, suggested node |
| enso-sage | `oklch(0.66 0.033 142)` | Mastered nodes, completion |

**Node status colors:**

| Status | Light mode | Dark mode |
|---|---|---|
| unmapped | stone-400 text, stone-200 border | stone-400 text, stone-600 border |
| mapped | stone-900 text, stone-200 border | stone-50 text, stone-600 border |
| deepened | stone-900 text, clay border | stone-50 text, clay border |
| learning | stone-900 text, clay fill at 10% | stone-50 text, clay fill at 10% |
| mastered | stone-900 text, sage border | stone-50 text, sage border |
| suggested | clay border, clay text label | clay border, clay text label |

**Typography:**

- Inter for prose (body, descriptions, synthesis text)
- JetBrains Mono for labels (node status, source types, card counts)
- Google Fonts for Inter and JetBrains Mono (artifact CSP allows `fonts.googleapis.com`)
- Prose capped at 62ch

**Layout:**

- Single centered track at 79ch structural measure
- Mermaid graph at the top showing the concept graph with prerequisite edges
- Below: a node list, each node as a hairline-bordered cell in a 1px-gap grid
- Each deepened node expands (native `<details>`) to show its Research section: sources consulted, synthesis, what was excluded
- Spacing from the phi ladder: `1.618rem` between nodes, `2.618rem` between sections
- Square corners (0 radius), hairline rules (1px stone-200)
- Flat at rest, no shadows, no gradients

**Theme-aware:**

- Light palette on `:root`, dark overrides under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`, and under `:root[data-theme="dark"]`
- Body background explicitly set to stone-50 (light) / stone-950 (dark)

**Anti-guilt:**

- No completion percentages
- No progress bars
- No "X of Y mastered" counts
- Node statuses are visible but not scored or ranked
- The mastered state uses sage (completion), never a celebratory animation

### Structure

```html
<title>Learn: {topic}</title>

<!-- Mermaid knowledge graph -->
<pre class="mermaid">
  graph TD
    A[borrowing basics] --> B[references & lifetimes]
    A --> C[ownership transfer]
    B --> D[lifetime elision]
    ...
</pre>

<!-- Node list -->
<section>
  <details> <!-- one per node -->
    <summary>
      <span class="status-badge">mapped</span>
      <span class="node-title">Borrowing Basics</span>
      <span class="card-count">0 cards</span>
    </summary>
    <p class="description">...</p>
    <!-- If deepened: research transparency section -->
    <div class="research">
      <h3>Sources & reasoning</h3>
      <ul class="sources">
        <li><span class="source-type">user-file</span> rust-book-ch4.pdf: ownership rules and move semantics</li>
        <li><span class="source-type">web</span> Rust Reference, Section 10.3: lifetime syntax</li>
      </ul>
      <p class="synthesis">...</p>
      <details class="excluded">
        <summary>What was considered and excluded</summary>
        <ul>...</ul>
      </details>
    </div>
  </details>
</section>
```

---

## 5. CLI Additions

New subcommands in `lib/cli.mjs`, same pattern as existing ones (JSON to stdout, errors to stderr, exit 1 on error).

| Command | Input | Output |
|---|---|---|
| `project-create --topic <str> [--sources path1,path2]` | topic string, optional source paths | Created Project JSON |
| `project-list` | none | Array of Projects (without node research bodies) |
| `project-get <id>` | project ID | Full Project JSON including research |
| `project-update <id>` | reads JSON from stdin | Updated Project JSON |
| `project-add-cards <id> <nodeId> --cards id1,id2` | project ID, node ID, card IDs | Updated Project JSON |

The `project-update` command reads a full project JSON from stdin and replaces the stored version. This handles the complex node/edge graph without cramming it into CLI flags. Workflow agents build the graph in memory, serialize to JSON, and pipe it in.

**Store additions:** `readProjects()` / `writeProjects()` convenience pair in `store.mjs`, mapping to `projects.json`.

**Computed status:** when `project-get` reads a project, it computes `learning` and `mastered` statuses from the linked cards' FSRS state in `cards.json`:

- `learning`: node has cardIds AND at least one card has `reps > 0` AND not all cards meet the mastered threshold
- `mastered`: all linked cards have `stability >= 21` days (three weeks of stable retention -- the card won't come back for at least 21 days at 90% desired retention, meaning the knowledge is durable)

---

## 6. Skill Files

### `skills/learn/SKILL.md`

The main entry point. Three paths:

1. **New topic:** user says `/learn rust ownership`
   - No project exists for "rust ownership"
   - Ask for source material conversationally
   - Dispatch scout-and-map workflow
   - Save project, publish artifact, stop

2. **Continue with named node:** user says `/learn lifetime elision`
   - Active project exists, node found
   - Check prerequisites met
   - Dispatch deepen workflow for that node
   - Update project, update artifact, report inbox candidates

3. **Continue without node:** user says `/learn`
   - Active project exists
   - Compute ready nodes (prerequisites met, status is `mapped`)
   - Suggest the best one (most prerequisites already mastered, central to the graph)
   - User confirms or picks a different one
   - Dispatch deepen workflow

### `skills/review/SKILL.md` (modification)

After the review loop ends, add:

```
After the review session, check if any cards rated again or hard belong
to a project (check the card's tags for a project/node reference). If so,
look up the project and find un-deepened neighbor nodes. If any exist,
mention one in a single line:

  "You're working through <node>. <neighbor> builds on it. /learn when ready."

Do not push. Do not repeat if the user has heard this before in this session.
```

---

## 7. Data Layer Changes

### New file: `~/.lull-n-learn/projects.json`

```json
{
  "project-uuid-1": {
    "id": "project-uuid-1",
    "topic": "rust ownership",
    "createdAt": "2026-08-25T16:00:00.000Z",
    "artifactUrl": null,
    "sources": ["./rust-book-ch4.pdf"],
    "nodes": [
      {
        "id": "node-uuid-1",
        "title": "ownership rules",
        "description": "Each value has exactly one owner; when the owner goes out of scope, the value is dropped.",
        "status": "mapped",
        "cardIds": [],
        "research": null
      }
    ],
    "edges": [
      { "from": "node-uuid-1", "to": "node-uuid-2" }
    ]
  }
}
```

### Card tagging

Cards generated from `/learn` are created with:
- `source: "workflow"`
- `tags: ["project:<projectId>", "node:<nodeId>", ...topic-tags]`

This lets `/review` look up the project/node a card belongs to.

---

## 8. Equanimitech Alignment

### Pyramid

| Principle | Verdict | Evidence |
|---|---|---|
| Local-First Ownership | pass | All data in `~/.lull-n-learn/` as JSON |
| Holistic Control | pass | User controls topic, sources, node selection, card triage |
| Modification Rights | pass | MIT, plain JS, no dependencies |
| Peripheral Presence | pass | Map artifact is pull-only; review nudge is one line |
| Attentional Granularity | pass | Map shows overview; nodes expand to show depth on demand |
| Bounded Experiences | pass | Each workflow run has a natural endpoint |
| Strategic Friction | pass | One node at a time; no batch-dump path |
| Fade-by-Design | pass | Teaches metalearning by modeling it; FSRS retires mastered cards |
| Downstream Allocation | pass | User decides topic, sources, nodes, cards |

### Layer 2 (Franklin) fix

The Research object on each deepened node makes the synthesis process visible: what sources were consulted, what each contributed, how they were combined, and what was excluded. This turns the artifact from "AI researched for you" into "AI shows you how to research."

### Anti-guilt inheritance

All v0 anti-guilt rules carry forward:
- No completion percentages or progress bars on the map
- No "X of Y mastered" counts
- No red for unmapped or incomplete nodes (stone-400, not alarm-red)
- Mastered uses sage (quiet completion), not celebratory animation
- The review nudge is one line, never repeated, never pressuring

---

## 9. Deferred to v2

- `/drill` (variation generation targeting weak cards)
- Feynman escalation in `/review`
- `/progress` (retention curves)
- Cross-project knowledge graph (linking nodes across projects)
- Collaborative maps (sharing artifacts with study partners)
- Per-user FSRS weight optimization
- PushNotification nudge
