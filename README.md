# Lull & Learn

Agent-native spaced repetition for Claude Code.

Cards extracted from your real work sessions, reviewed on your schedule, grounded in [Scott Young's Ultralearning](https://www.scotthyoung.com/blog/2026/04/29/ultralearning-ai/).

Local-first. Anti-guilt. Zero-config.

## Install

Add the equanimitech marketplace to `~/.claude/settings.json` (one-time):

```json
{
  "extraKnownMarketplaces": {
    "equanimitech": {
      "source": {
        "source": "github",
        "repo": "equanimitech/claude-plugins"
      }
    }
  }
}
```

Then in any Claude Code session:

```
/plugin install lull-n-learn
```

## How it works

1. **Work normally.** When a session taught you something, run `/extract`: the agent mines the conversation for learning moments and files card candidates into an inbox.
2. **Triage.** Run `/inbox` to promote candidates to your deck, edit them, or dismiss them. You never keep a card you didn't choose.
3. **Review.** Run `/review` in a dedicated session. The FSRS algorithm picks due cards. You type your answer from memory. The agent scores it and reschedules.
4. **Ambient cues (optional).** Wire the status line script into your settings and one due card's front appears as a retrieval cue. One cue, never a count.

## Commands

| Command | What it does |
|---|---|
| `/review` | FSRS-driven retrieval session |
| `/inbox` | Triage extracted card candidates |
| `/add "front" "back"` | Create a card manually |
| `/extract` | Mine the current session for card candidates |

## Status line (optional)

The plugin ships a composable status line script that shows one due card's front as a retrieval cue while Claude works. If nothing is due, it stays quiet. Wire it into `~/.claude/settings.json`, pointing at your installed plugin directory:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/path/to/lull-n-learn/lib/statusline.mjs\""
  }
}
```

No counter, no streak, no debt. The cue is a gift, not a demand.

## Theory

See [THEORY.md](THEORY.md) for how the plugin maps to Scott Young's 9 Ultralearning principles.

## Data

All data lives in `~/.lull-n-learn/` as plain JSON. No account, no server, no sync. You own your learning state.

Override the data directory with `LULL_N_LEARN_DIR` for testing or custom locations.

## License

MIT. An [EquanimiTech](https://equanimi.tech) project.
