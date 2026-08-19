---
name: create-presentation
description: Create an editable PowerPoint presentation from selected notes, workspace documents, research, outlines, or conversation content. Use when the user asks to make slides, a deck, a presentation, a pitch deck, a report deck, or a .pptx file.
---

# Create presentation

Create the deck with TierNote's shared presentation runtime. Never install a package,
start a separate service, or generate source code for the user to run.

1. Read the selected notes or requested workspace sources before planning the deck.
2. Determine the audience, objective, language, and desired length from the request. Make
   reasonable defaults when they are omitted; do not block on cosmetic choices.
3. Build one narrative: opening promise, supporting sections, evidence or examples, and a
   decisive close. Remove repeated points and unsupported claims.
4. Keep one primary message per slide. Prefer 5–12 slides unless the user specifies another
   length. Use short slide titles and no more than six concise bullets on an ordinary slide.
5. Choose a layout intentionally. Use `title` once at the beginning, `section` only for real
   transitions, `two-column` for comparisons, `quote` for a single strong statement, and
   `content` for most explanatory slides.
6. Call `create_presentation` exactly once with the complete deck. Read
   [deck-spec.md](references/deck-spec.md) before using non-default layouts or images.
7. Return the full absolute saved `.pptx` path, slide count, and any runtime warning. Do not claim that the
   file was visually inspected unless a rendered preview was actually checked.
