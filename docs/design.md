# Lull & Learn: Agent-Native Learning for Claude Code

## TL;DR

- **Goal:** A standalone Claude Code plugin that turns real work sessions into spaced-repetition learning, grounded in Scott Young's Ultralearning (9 principles).
- **Key decisions:** Standalone plugin (no zenborg/keel dependency); FSRS algorithm (not SM-2); agent-extracted card funnel (inbox model); browser is unreliable so the learning surface is a dedicated Claude Code session; anti-guilt design (no counters, no streaks, no debt).
- **Open questions:** Whether `SessionEnd` hook receives transcript content for card extraction.
- **Cascades:** None. New standalone project.

---

## Attribution

This plugin is grounded in **Scott Young's Ultralearning** (2019) and his
April 2026 reflection
["I Wrote Ultralearning. This is What I'd Change Because of AI"](https://www.scotthyoung.com/blog/2026/04/29/ultralearning-ai/).

The 9 Ultralearning principles (Metalearning, Focus, Directness, Drill,
Retrieval, Feedback, Retention, Intuition, Experimentation) provide the
theoretical framework. The plugin operationalizes the subset that benefits
from agent delivery. It is inspired by Young's work, not affiliated with or
endorsed by him.

A `THEORY.md` ships with the plugin, citing both the book and the blog post,
mapping each principle to the plugin's features.

---

## 1. What It Is

A Claude Code plugin for self-directed learning. Install it, keep working,
and your Claude sessions become the raw material for spaced-repetition cards.
Review them in a dedicated learning session. No account, no server, no
browser, no guilt.

**What it is not:** Anki in the terminal. A gamified app. A content viewer.
A language-learning tool (though it works for languages). A tool that
demands your attention.

### Accessibility (anyone can use this)

- `claude plugin add lull-n-learn` -- single command install
- Zero config to start. No Python, no build step, no API keys
- Works immediately: extraction happens automatically after sessions
- `/card` lets you create cards before any extraction runs
- Pure JavaScript, no external dependencies beyond Claude Code
- Data is plain JSON files you can read, edit, or back up

### Landscape and differentiation

Researched prior art (August 2026):

| Existing tool | What it does | Gap this plugin fills |
|---|---|---|
| **Unwait** (macOS app) | Shows a card during AI wait time | Closed-source, no card extraction, no Ultralearning |
| **agent-tutor-skill** | Teaching loop in Claude Code with FSRS | Lives inside work sessions, not a separate learning surface |
| **learn-faster-kit** | FASTER framework via Claude Code | Agent-adjacent (Python scripts), not agent-native |
| **Learning Opportunities** (Dr. Cat Hicks) | Post-commit learning exercises | One-shot, not SR-scheduled |
| **FlashTabs / AnkiTab** | New-tab flashcard extensions | No AI, manual decks only, interception fatigue |

Three gaps nobody fills:
1. Nobody auto-extracts cards from Claude sessions into an SR inbox
2. Nobody grounds an agent learning tool in Ultralearning explicitly
3. Nobody combines agent-native delivery with anti-guilt SR design

---

## 2. Theoretical Grounding

Which Ultralearning principles the plugin operationalizes, and how:

| Principle | Plugin feature | Version |
|---|---|---|
| **Metalearning** | `/deep-lesson <topic>` -- workflow maps the territory, sequences subtopics, generates cards straight to deck | v0 |
| **Focus** | Not the plugin's job. It never demands attention, only offers it | -- |
| **Directness** | Cards extracted from real work conversations, not abstract study material | v0 |
| **Drill** | `/drill` generates variations targeting weak cards (AI-generated practice problems) | v1 |
| **Retrieval** | FSRS engine resurfaces cards; review sessions demand production, not recognition | v0 |
| **Feedback** | Agent scores Feynman explanations, reveals gaps, asks pointed follow-ups | v1 |
| **Retention** | FSRS algorithm; mnemonics generation for hard cards | v0/v1 |
| **Intuition** | Feynman Technique sessions: explain, get checked, discover gaps | v1 |
| **Experimentation** | Multiple learning modes; the user experiments with what works | ongoing |

### Anti-guilt design

From Unwait's insight: "The guilt is optional. It was always optional."
People quit Anki because of the implied daily contract, not the algorithm.

- No review debt counter
- No streak
- No daily contract
- No "you missed X cards" message
- Skipped cards reappear later, unscored
- Due cards surface one at a time in the HUD -- never a count
- The plugin never makes you feel behind

---

## 3. Architecture

Three surfaces, one data layer.

```
┌──────────────────────────────────────────────────┐
│                Local JSON (~/.lull-n-learn/)        │
│  cards.json  inbox.json  projects.json           │
│  fsrs-state.json  config.json                    │
└──────────┬───────────────┬───────────────┬───────┘
           |               |               |
     ┌─────┴──────┐  ┌────┴─────┐  ┌──────┴───────┐
     |  Learning   |  |  Work    |  |  Workflow    |
     |  Session    |  |  Session |  |  (bg)        |
     |             |  |  Hook    |  |              |
     |  /study     |  |  HUD:    |  |  Deep        |
     |  /read  NEW |  |  one cue |  |  Research    |
     |  /lesson NEW|  |  during  |  |  lesson      |
     |  /deep-les  |  |  process |  |  plans       |
     |  /drill     |  |          |  |              |
     |  /sift      |  |          |  |              |
     |  /card      |  |          |  |              |
     └─────────────┘  └──────────┘  └──────────────┘
```

### Teaching Surface (v0.6)

`/read` and `/lesson` fill the acquisition gap between `/deep-lesson` (mapping) and `/study` (retrieval). They teach deepened nodes conversationally via Socratic walk-through — explain, check comprehension, adjust. A light trace (`readTrace`) on each node records what was covered and how it went, feeding `/study`'s card prioritization. See `docs/teaching-surface-design.md` for the full spec.

### Surface 1: The Learning Session (primary)

A dedicated Claude Code session with the plugin loaded. The user opens it
deliberately. Reward, not interception.

- `/study` -- FSRS picks due cards, presents one at a time. User types
  their answer (production). Agent scores (correct / partial / missed).
  FSRS updates scheduling. Optionally escalates to Feynman (v1).
- `/deep-lesson <topic>` -- metalearning. Workflow maps the territory, sequences
  subtopics, generates cards straight to deck.
- `/drill <card-or-topic>` -- generates practice variations targeting
  weak spots. Variable input/output (v1).
- `/sift` -- shows auto-harvested candidates. User promotes, edits, or
  dismisses. Choosing what to learn is itself metalearning.
- `/card "front" "back"` -- manual card creation, straight to deck.
- `/progress` -- retention picture. No guilt metrics (v1).

### Surface 2: The Work Session Hook (ambient)

A lightweight hook installed in any Claude Code session. Does one thing:

Each time Claude starts processing, the status line shows one due card's
front as a retrieval cue:

```
↻ What does the borrow checker enforce?
```

No count. No pressure. One cue per processing cycle, different card each
time. If nothing is due, the status line stays quiet. It fades when Claude
finishes.

The user mentally retrieves or doesn't. The cue is a gift, not a demand.

### Surface 3: Workflows (metalearning engine)

`/deep-lesson <topic>` dispatches a background workflow:

1. Fans out agents to research the topic (Context7, WebSearch, etc.)
2. Maps subtopics, prerequisites, sequencing
3. Generates cards (atomic facts, conceptual questions, procedural
   drills)
4. Writes straight to `cards.json` (no inbox triage for deliberate study)

Young's Principle #1 (Metalearning): the map before the walk.

### Data layer: `~/.lull-n-learn/`

All local JSON. No server, no account, no sync.

| File | Contents |
|---|---|
| `cards.json` | The deck. Each card: id, front, back, tags, source (session/manual/workflow), FSRS state |
| `inbox.json` | Auto-extracted candidates awaiting triage |
| `projects.json` | Learning projects: topic + lesson plan + associated card ids |
| `fsrs-state.json` | FSRS scheduling state per card (difficulty, stability, retrievability, due date) |
| `config.json` | Preferences: review batch size, Feynman depth, status-line on/off |

### Algorithm: FSRS

Free Spaced Repetition Scheduler. Open-source, trained on 700M reviews,
20-30% fewer reviews than SM-2. Now default in Anki.

State per card: difficulty, stability, retrievability, due date. Pure math,
no network, no service. Implementation is a single JS module.

---

## 4. Card Extraction (the inbox funnel)

The novel piece. No existing tool does this.

### How cards get born from work sessions

A `SessionEnd` hook runs when a Claude Code work session ends. It sends the
session transcript to a background agent with a focused prompt:

> Extract learning moments from this session. A learning moment is: a
> concept the user asked about, a mistake that was corrected, a technique
> that was explained, a pattern that was demonstrated for the first time.
> For each, produce a card candidate: front (question), back (answer),
> source (brief context). Aim for atomic facts -- one idea per card. Skip
> anything the user clearly already knew.

### What makes a good candidate

- "What does the borrow checker enforce?" -- concept question
- "What's the difference between `clone` and `Copy`?" -- distinction
- "Why did the N+1 query happen here?" -- debugging insight
- "What does `@cached_property` do vs `@property`?" -- API knowledge

### What gets filtered out

- Project-specific trivia ("what's the name of the config file?")
- Things the user already demonstrated mastery of
- Implementation details better looked up than memorized

### The funnel

```
Session transcript
       |
  SessionEnd hook -> background agent extracts candidates
       |
  inbox.json (unreviewed)
       |
  /sift -> user promotes, edits, or dismisses
       |
  cards.json (active deck, FSRS-scheduled)
```

The user never sees a card they didn't choose to keep. Extraction is
generous (catch more, not fewer); triage is deliberate.

**Open question:** Whether the `SessionEnd` hook receives the session
transcript or just metadata. If it doesn't, extraction may need a different
mechanism (e.g., a `Stop` hook, or a skill that the user invokes before
ending a session).

---

## 5. The Review Experience

### Basic loop

1. FSRS picks the next due card
2. Agent shows the front (the question)
3. User types their answer (production, not recognition)
4. Agent reveals the back, scores the answer (correct / partial / missed)
5. FSRS updates the card's scheduling state
6. Next card, or stop whenever

### Feynman escalation (v1)

On cards missed more than once, the agent escalates:

1. "Explain this concept as if teaching someone."
2. User writes their explanation
3. Agent checks against the correct answer, points out gaps or misconceptions
4. "What part are you least sure about?" -- targeted follow-up
5. Nailed it? The card gets a stability boost

Maps to Young's Principles #5 (Retrieval), #6 (Feedback), #8 (Intuition).

### Drill mode (v1)

For procedural knowledge, the agent generates variations:

- "You know `Array.map()`. What about `Array.flatMap()`?"
- "You got the happy path. What happens when the input is `null`?"
- "Same pattern, but in Rust instead of TypeScript."

Variable input/output -- Young's Principle #4.

### Session shape

A review session is a conversation. Stop any time. No minimum, no streak.
The agent tracks what was reviewed and adjusts FSRS state, but never guilts
about what wasn't reviewed.

Example interaction:

```
/study

What does the borrow checker enforce?
> It ensures single ownership of data and prevents data races at compile time

Close. Two things: (1) each value has exactly one owner at a time,
(2) references must always be valid (no dangling pointers).
You got ownership but missed the reference validity half.
Rating: partial -> next review in 3 days

What's the difference between impl Trait and dyn Trait?
> ...
```

---

## 6. v0 Scope

Smallest thing that proves the core loop: study, harvest, sift, recall, schedule.

### v0 ships

1. **`SessionEnd` hook** -- extracts card candidates, writes to `inbox.json`
2. **`/deep-lesson <topic>`** -- metalearning engine: map, deepen, generate cards
3. **`/sift`** -- triage harvested candidates, promote to deck or dismiss
4. **`/study`** -- FSRS-driven retrieval session (production + scoring)
5. **`/card`** -- manual card creation
6. **`/harvest`** -- mine the current session for card candidates
7. **Status line hook** -- one due card cue during processing in work sessions
8. **Local JSON** at `~/.lull-n-learn/`
9. **`THEORY.md`** -- Scott Young attribution and principle mapping

### v0 does not ship

- `/drill` (variation generation)
- Feynman escalation
- `/progress` (retention curves)
- PushNotification nudge

### v0 success criteria

After a week of normal Claude Code work sessions:

- The inbox has 20+ meaningful card candidates (harvesting works)
- Running `/study` for 5 minutes produces genuine retrieval moments on
  things you encountered in real work (the loop is valuable)
- `/deep-lesson` maps a topic and produces cards that hit the right level
- The status line cue during processing feels like a gift, not an
  interruption (the ambient surface is right)

If the extraction is too noisy or the reviews feel pointless, the core
thesis is wrong.

### v0 file structure

```
lull-n-learn/
+-- .claude-plugin/
|   +-- plugin.json
+-- hooks/
|   +-- session-end-extract.md       # SessionEnd: extract candidates
|   +-- status-line-cue.sh           # StatusLine: show one due card
+-- skills/
|   +-- deep-lesson/SKILL.md          # /deep-lesson command
|   +-- study/SKILL.md               # /study command
|   +-- sift/SKILL.md                # /sift command
|   +-- card/SKILL.md                # /card command
|   +-- harvest/SKILL.md             # /harvest command
+-- lib/
|   +-- fsrs.mjs                     # FSRS algorithm (pure JS)
+-- THEORY.md                        # Scott Young attribution
+-- README.md
```

---

## 7. Equanimitech Alignment

The plugin fits the equanimitech pyramid:

- **Sovereignty:** All data local. No account, no server, no tracking. You
  own your learning state. You choose what to learn (inbox triage). You
  choose when to review (no daily contract).
- **Awareness:** The status line cue surfaces what's due without demanding
  action. The extraction funnel surfaces what you encountered without
  deciding what matters. Awareness, not prescription.
- **Equanimity:** Anti-guilt design. No debt, no streak, no score. The tool
  is a place you want to be, not a wall you hit. Reward, not interception.

Ships as an equanimitech open-source project. MIT license.
