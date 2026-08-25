---
name: harvest
description: Extract learning moments from the current Claude session into the lull-n-learn inbox. Use when the user runs /harvest, says "extract cards from this session", "mine this conversation for cards", or is wrapping up a session with learnable content.
---

# Harvest learning moments

Analyze the CURRENT conversation (it is already in your context) and produce card candidates for the lull-n-learn inbox. This must run while the session content is in context; it cannot read past sessions.

## What counts as a learning moment

- A concept the user asked about
- A mistake that was corrected
- A technique or pattern that was explained or demonstrated for the first time
- A distinction the user confused (e.g. "clone vs Copy", "@property vs @cached_property")
- A debugging insight (e.g. "why the N+1 query happened here")

## What to skip

- Project-specific trivia (config file names, local paths, ticket numbers)
- Anything the user demonstrated they already knew
- Implementation details better looked up than memorized
- Secrets, credentials, API keys, personal data: never put these in a card

## Steps

1. Re-read the conversation and list the candidate moments. Be generous: catch more, not fewer. The cut happens in /sift triage, not here.
2. For each moment write an atomic candidate: front is a production question carrying ONE idea; back is the shortest complete answer; context is one line on where in the session it came from.
3. Save each candidate:

   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" inbox-add --front "..." --back "..." --tags "topic" --context "..."

4. Tell the user in one line how many candidates went to the inbox and that /sift triages them. No pressure to triage now.

If the session had no learning moments, say so plainly. An empty extraction is a fine outcome, not a failure.
