---
name: config
description: Configure lull-n-learn settings — status line theme, grace period, cue toggle. Use when the user says "show me cooking cards", "turn off the cue", "change the delay", "only code cards", "lull config", or asks to adjust how the status line cue behaves.
---

# Configure lull-n-learn

Read or update `~/.lull-n-learn/config.json` via CLI.

## Show current config

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-get
```

## Available keys

| Key | Type | Default | What it does |
|-----|------|---------|--------------|
| `cueEnabled` | boolean | `true` | Master toggle for the status line cue |
| `cueDelayMinutes` | number | `5` | Grace period after session start before cues appear |
| `cueTags` | comma-separated | all | Only show cards matching these tags (e.g. `code-de-la-route`, `italian-cooking`) |

## Set a value

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-set <key> <value>
```

Examples:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-set cueTags code-de-la-route
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-set cueTags italian-cooking,code-de-la-route
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-set cueDelayMinutes 10
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" config-set cueEnabled false
```

After changing `cueTags`, clear the pinned cue so the new filter takes effect:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" clear-cue
```

## Response

After updating, confirm in one line what changed. Example: "Status line now shows code-de-la-route cards only."
