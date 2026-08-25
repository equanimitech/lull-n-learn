---
name: card
description: Create a spaced-repetition card manually in the lull-n-learn deck. Use when the user runs /card, says "add a card", "make a card for this", or "I want to remember this".
---

# Add a card

Create one card in the user's lull-n-learn deck.

## Steps

1. Determine the card content:
   - If the user gave front and back explicitly (e.g. `/card "front" "back"`), use them as given.
   - If they pointed at something in the conversation ("make a card for that"), draft an atomic front/back pair yourself: front is a question that demands production (not recognition), back is the shortest complete answer. Show the draft and get a confirmation before saving.
2. Save it:

   node "${CLAUDE_PLUGIN_ROOT}/lib/cli.mjs" add --front "..." --back "..." --tags "tag1,tag2" --ref "url"

   Tags are optional: comma-separated, lowercase, topic-level (e.g. "rust,ownership").
   `--ref` is optional: a URL linking to reference material (a study guide section, documentation page, or file). If the user mentions a source or the card relates to a specific resource, include it.
   Front and back can contain markdown: links with `[text](url)`, inline code, etc.
   The command prints the created card as JSON.
3. Confirm in one line, quoting the card's front. Do not mention deck size, due counts, or review schedules.

## Card quality rules

- One idea per card. Split compound facts into several cards.
- The front asks a question; the back answers it. Never "front: topic X, back: everything about X".
- Prefer conceptual questions ("why", "what distinguishes") over trivia.
- Skip project-specific trivia and anything better looked up than memorized.
