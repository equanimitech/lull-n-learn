---
name: deep-lesson
description: Metalearning engine that researches a topic, builds a living knowledge map artifact with starter cards at every node, and deepens progressively. Use when the user runs /deep-lesson, says "let's learn about X", "map this topic", "I want to study X", or wants to deepen a concept node.
---

# /deep-lesson — Metalearning Engine

Operationalizes Scott Young's Metalearning principle: "First draw a map." The map is a living artifact that grows as the learner progresses. Every node arrives with starter cards so the learner has something to practice immediately; deepening adds richer, harder cards as understanding grows.

## Determine the path

Run this first to decide which of the three paths to take:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-list
```

Then check the user's input:

1. **New topic** — the user said `/deep-lesson <topic>` and no existing project matches that topic. Go to **Path A**.
2. **Continue with named node** — an active project exists and the user said `/deep-lesson <node-title>`. Go to **Path B**.
3. **Continue without node** — an active project exists and the user said `/deep-lesson` with no argument. Go to **Path C**.

If multiple projects exist and no topic is specified, ask the user which project to continue.

---

## Path A: Scout + Map (new topic)

### 1. Greet and gather sources

Say: "Let's map **<topic>**."

Ask: "Do you have any source material? PDFs, markdown files, docs you'd like me to work from?"

Wait for the user's answer. If they provide file paths, note them. If they say no, proceed without sources.

### 2. Create the project

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-create --topic "<topic>" --sources "<comma-separated-paths>"
```

Save the returned project ID.

### 3. Read existing cards

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" list
```

Extract fronts and tags from existing cards to identify what the user already knows.

### 4. Dispatch the scout-and-map workflow

Use the Workflow tool with the following structure. Adapt the prompt details to the specific topic.

**Scout phase** (parallel):
- One agent reads existing cards and extracts related fronts/tags
- One agent does a broad survey of the topic using its own knowledge
- If the topic is a library/framework, one agent uses Context7 (via ToolSearch for `mcp__context7__resolve-library-id` then `mcp__context7__query-docs`) to get current documentation
- One agent uses WebSearch to survey the concept landscape and prerequisites
- One agent per user-provided file reads and summarizes it

**Map phase** (sequential, after scout):
- One synthesizer agent receives all scout outputs and produces:
  - `nodes[]`: concept subtopics with `{ id, title, description, status: 'mapped', cardIds: [], research: null, starterCards: [] }`
  - `edges[]`: prerequisite relationships as `{ from, to }`
  - `existingCoverage`: which nodes are already covered by existing cards
  - `suggestedStart`: the best first node to deepen (prerequisites met, high learning value)
  - `scoutSources`: per-node source citations for Layer 2 transparency

**Starter card phase** (sequential, after map):
- One agent receives the full map and generates **2–3 starter cards per node**:
  - One definitional card ("What is X?") — the concept's identity
  - One relational card ("How does X relate to Y?") — ties the node to its neighbors in the graph
  - Optionally one "why does it matter?" card — when the node's significance isn't obvious from its title
  - Tag each with `project:<projectId>,node:<nodeId>,starter,<topic-tags>`
  - Skip nodes already covered by existing cards
  - Return `{ nodeId, cards: [{ front, back, tags }] }` per node

Use a JSON schema for the synthesizer's and card generator's return values so the output is structured.

### 5. Add starter cards to the deck

Starter cards go straight to the deck — they are simple, definitional, and don't need triage.

For each starter card returned by the workflow:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" add --front "<front>" --back "<back>" --tags "<tags>" --source "deep-lesson"
```

Collect the returned card IDs. Associate them with their nodes via:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-add-cards <projectId> <nodeId> --cards id1,id2,...
```

### 6. Save the project

Pipe the synthesized graph back into the project:

```bash
echo '<project-json>' | node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-update <projectId>
```

The project JSON must include the `nodes`, `edges`, `sources`, `topic`, `createdAt`, and `artifactUrl` fields.

### 7. Publish the knowledge map artifact

Build and publish the artifact following the design spec in the **Artifact Design** section below. The artifact should show the starter card count per node.

After publishing, update the project's `artifactUrl` field:

```bash
echo '<updated-project-json>' | node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-update <projectId>
```

### 8. Suggest deepening

Say: "Your map has **N** nodes and **M** starter cards across them. **<suggested node>** is a good place to go deeper — shall I?"

List the other ready nodes briefly. If the user confirms, flow directly into **Path B** step 3 for the suggested node. If they want to browse first, stop.

---

## Path B: Deepen a node

Deepening adds richer cards — conceptual questions, procedural drills, edge cases, connections — on top of the starter cards that already exist. Each deepening pass adds a layer of understanding.

### 1. Load the project

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-get <projectId>
```

### 2. Find the node

Search `project.nodes` for a node whose title matches the user's input (case-insensitive, partial match is fine). If not found, show the available node titles and ask the user to pick one.

### 3. Check prerequisites

Look at `project.edges` to find all edges where `to` is this node's id. For each prerequisite (the `from` node), check that its status is `mapped`, `deepened`, `learning`, or `mastered`. If any prerequisite is `unmapped`, warn the user: "**<prerequisite>** hasn't been mapped yet. You might want to deepen that first." Let the user decide whether to proceed.

### 4. Dispatch the deepen workflow

Use the Workflow tool:

**Research phase** (parallel):
- One agent does deep research on this specific subtopic
- One agent uses Context7/WebSearch targeted at this node's concepts
- If user sources exist, one agent per source re-reads it for content relevant to this node

**Generate phase** (sequential, after research):
- One agent produces cards from the research, layered by difficulty:
  - **Comprehension cards** — paraphrase, explain in your own words, identify components
  - **Application cards** — procedural drills, "given X, what happens?", worked examples
  - **Analysis cards** — compare/contrast with related nodes, edge cases, "why not Y instead?"
  - Tag with `project:<projectId>,node:<nodeId>,<topic-tags>`
  - Skip concepts already covered by existing cards (including starter cards)
  - For each card, note which source it came from
  - Return `{ research: Research, candidates: Candidate[] }`

The Research object structure:
```json
{
  "sources": [
    { "type": "user-file|web|context7|agent-knowledge", "reference": "...", "contribution": "..." }
  ],
  "synthesis": "how the sources were combined",
  "excluded": ["what was considered and dropped, with reasons"],
  "generatedAt": "ISO8601"
}
```

### 5. Add cards to the deck

Cards from deepening go straight to the deck — the user chose to study this topic, and the inbox filter adds friction here.

For each card returned by the workflow:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" add --front "<front>" --back "<back>" --tags "project:<projectId>,node:<nodeId>,<topic-tags>" --source "deep-lesson"
```

Collect the returned card IDs.

### 6. Link cards to the node

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-add-cards <projectId> <nodeId> --cards id1,id2,...
```

### 7. Update the node

Update the project with the node's status set to `deepened` and the `research` object attached:

```bash
echo '<updated-project-json>' | node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-update <projectId>
```

### 8. Republish the artifact

Rebuild and republish the artifact to the same URL (same file path). The artifact now shows the deepened node with its research section expanded.

### 9. Suggest the next node

Find the next ready node using the same logic as Path C step 2. If one exists:

Say: "**N** cards added from '**<node title>**'. Next up: **<next node>** — <description>. Continue, or `/recall` to practice what you've got?"

If the user says continue, flow into step 2 of this path with the next node. This creates a natural progression through the graph without the user needing to re-invoke the command.

If no ready nodes remain, say: "That's the last node. Your map is fully deepened — **M** cards total. `/recall` when ready."

---

## Path C: Continue without node (suggest next)

### 1. Load the project

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-get <projectId>
```

### 2. Find ready nodes

A node is "ready" when:
- Its status is `mapped` (not yet deepened)
- All its prerequisites (nodes with edges pointing to it) have status `mapped`, `deepened`, `learning`, or `mastered`

### 3. Suggest the best one

Pick the ready node with the most prerequisites already in `learning` or `mastered` status. If tied, prefer the node that is most central to the graph (has the most downstream dependents).

Say: "Next up: **<node title>** — <description>. Shall I deepen it, or would you prefer a different node?"

List the other ready nodes briefly so the user can choose.

### 4. When the user confirms

Follow **Path B** from step 3 onward with the chosen node.

---

## Artifact Design

The knowledge map artifact follows the equanimitech design system. Use the `artifact-design` skill before building it.

**Key constraints:**
- Google Fonts for Inter and JetBrains Mono (artifact CSP allows `fonts.googleapis.com`)
- Mermaid graph at the top (`<pre class="mermaid">`) showing concept nodes + prerequisite edges
- Node list below as hairline-bordered cells in a 1px-gap grid
- Deepened nodes expand via native `<details>` to show Research sections
- Theme-aware: light palette on `:root`, dark overrides per the artifact system's convention
- Anti-guilt: no progress bars, no completion percentages, no "X of Y" counts
- Square corners, hairline rules, flat at rest, no shadows

**Palette (OKLCH):**

| Token | Value | Role |
|---|---|---|
| stone-50 | `oklch(0.985 0.003 60)` | Page ground (light) |
| stone-200 | `oklch(0.923 0.005 60)` | Hairline rules, borders |
| stone-400 | `oklch(0.709 0.008 60)` | Faint text, unmapped nodes |
| stone-600 | `oklch(0.444 0.010 60)` | Muted text, labels |
| stone-900 | `oklch(0.216 0.007 60)` | Body text |
| stone-950 | `oklch(0.147 0.005 60)` | Dark-mode ground |
| clay | `oklch(0.62 0.100 60)` | Accent, suggested node |
| enso-sage | `oklch(0.66 0.033 142)` | Mastered nodes |

**Node status styling:**

| Status | Light | Dark |
|---|---|---|
| unmapped | stone-400 text, stone-200 border | stone-400 text, stone-600 border |
| mapped | stone-900 text, stone-200 border | stone-50 text, stone-600 border |
| deepened | stone-900 text, clay border | stone-50 text, clay border |
| learning | stone-900 text, clay fill 10% | stone-50 text, clay fill 10% |
| mastered | stone-900 text, sage border | stone-50 text, sage border |
| suggested | clay border, clay text label | clay border, clay text label |

**Typography:** Inter for prose (body, descriptions, synthesis). JetBrains Mono for labels (status badges, source types, card counts). Prose capped at 62ch.

**Layout:** Single centered track at 79ch. Spacing from the phi ladder: `1.618rem` between nodes, `2.618rem` between sections.

**Structure:**

```html
<title>Deep Lesson: {topic}</title>

<!-- Mermaid knowledge graph -->
<pre class="mermaid">
  graph TD
    node1["Node Title"] --> node2["Node Title"]
    ...
</pre>

<!-- Node list -->
<section>
  <details> <!-- one per node -->
    <summary>
      <span class="status-badge">mapped</span>
      <span class="node-title">Node Title</span>
      <span class="card-count">3 cards</span>
    </summary>
    <p class="description">One-line description...</p>
    <!-- If deepened: research section -->
    <div class="research">
      <h3>Sources & reasoning</h3>
      <ul class="sources">
        <li><span class="source-type">web</span> Reference: contribution</li>
      </ul>
      <p class="synthesis">How sources were combined...</p>
      <details class="excluded">
        <summary>What was considered and excluded</summary>
        <ul>...</ul>
      </details>
    </div>
  </details>
</section>
```

Apply Mermaid node styling via `classDef` to reflect status colors. Mark the suggested starting node distinctly.
