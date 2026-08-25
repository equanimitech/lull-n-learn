# Lull & Learn

Agent-native spaced repetition for Claude Code.

Cards extracted from your real work sessions, reviewed on your schedule, grounded in [Scott Young's Ultralearning](https://www.scotthyoung.com/blog/2026/04/29/ultralearning-ai/).

Local-first. Anti-guilt. Zero-config.

## Install

```bash
claude plugin add equanimitech/lull-n-learn
```

## How it works

1. **Work normally.** After each Claude Code session, the plugin extracts learning moments into an inbox.
2. **Triage.** Run `/inbox` to promote candidates to your deck or dismiss them.
3. **Review.** Run `/review` in a dedicated session. The FSRS algorithm picks due cards. You type your answer. The agent scores it.
4. **Ambient cues.** In any session, the status line shows one due card during processing. No counter, no pressure.

## Commands

| Command | What it does |
|---|---|
| `/review` | FSRS-driven retrieval session |
| `/inbox` | Triage auto-extracted card candidates |
| `/add "front" "back"` | Create a card manually |

## Theory

See [THEORY.md](THEORY.md) for how the plugin maps to Scott Young's 9 Ultralearning principles.

## Data

All data lives in `~/.lull-n-learn/` as plain JSON. No account, no server, no sync. You own your learning state.

## License

MIT. An [EquanimiTech](https://equanimi.tech) project.
