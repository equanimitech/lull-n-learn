---
name: learn
description: Metalearning engine that researches a topic, builds a living knowledge map artifact, and deepens nodes one at a time to generate spaced-repetition card candidates. Use when the user runs /learn, says "let's learn about X", "map this topic", "I want to study X", or wants to deepen a concept node.
---

# /learn — Metalearning Engine

Operationalizes Scott Young's Metalearning principle: "First draw a map." Two phases: scout + map (research the territory, produce a concept graph), and deepen (pick one node, research it thoroughly, generate card candidates). The map is a living artifact that grows as the learner progresses.

## Determine the path

Run this first to decide which of the three paths to take:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-list
```

Then check the user's input:

1. **New topic** — the user said `/learn <topic>` and no existing project matches that topic. Go to **Path A**.
2. **Continue with named node** — an active project exists and the user said `/learn <node-title>`. Go to **Path B**.
3. **Continue without node** — an active project exists and the user said `/learn` with no argument. Go to **Path C**.

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
  - `nodes[]`: concept subtopics with `{ id, title, description, status: 'mapped', cardIds: [], research: null }`
  - `edges[]`: prerequisite relationships as `{ from, to }`
  - `existingCoverage`: which nodes are already covered by existing cards
  - `suggestedStart`: the best first node to deepen (prerequisites met, high learning value)
  - `scoutSources`: per-node source citations for Layer 2 transparency

Use a JSON schema for the synthesizer's return value so the output is structured.

### 5. Save the project

Pipe the synthesized graph back into the project:

```bash
echo '<project-json>' | node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-update <projectId>
```

The project JSON must include the `nodes`, `edges`, `sources`, `topic`, `createdAt`, and `artifactUrl` fields.

### 6. Publish the knowledge map artifact

Build and publish the artifact following the design spec in the **Artifact Design** section below.

After publishing, update the project's `artifactUrl` field:

```bash
echo '<updated-project-json>' | node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-update <projectId>
```

### 7. Close

Say: "Your map is ready. Run `/learn` to start deepening a node."

Stop here. Do not generate cards. Do not deepen any node. The map is worth reviewing on its own.

---

## Path B: Deepen a named node

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
- One agent produces card candidates from the research:
  - Atomic facts, conceptual questions, procedural drills
  - Tag with `project:<projectId>`, `node:<nodeId>`, plus topic tags
  - Skip concepts already covered by existing cards
  - For each candidate, note which source it came from
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

### 5. Write candidates to inbox

For each candidate returned by the workflow:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" inbox-add --front "<front>" --back "<back>" --tags "project:<projectId>,node:<nodeId>,<topic-tags>" --source "workflow" --context "<source-note>"
```

### 6. Update the node

Update the project with the node's status set to `deepened` and the `research` object attached:

```bash
echo '<updated-project-json>' | node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" project-update <projectId>
```

### 7. Republish the artifact

Rebuild and republish the artifact to the same URL (same file path). The artifact now shows the deepened node with its research section expanded.

### 8. Close

Say: "**N** candidates in your inbox from '**<node title>**'. Run `/inbox` to triage them."

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
<title>Learn: {topic}</title>

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
      <span class="card-count">0 cards</span>
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
