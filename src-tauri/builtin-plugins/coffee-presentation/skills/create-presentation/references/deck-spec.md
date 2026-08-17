# Presentation specification

The `create_presentation` tool accepts a complete deck in one call.

## Deck fields

- `title`: Required presentation title.
- `fileName`: Optional workspace-root filename ending in `.pptx`.
- `theme`: Optional `minimal`, `business`, or `dark`; default `minimal`.
- `slides`: Required array containing 1–30 slides.

## Slide fields

- `layout`: `title`, `section`, `content`, `two-column`, or `quote`.
- `title`: Required concise slide title.
- `subtitle`: Optional supporting line or attribution.
- `body`: Optional array of concise bullets or the quote text.
- `rightBody`: Required only for the right side of `two-column`.
- `imagePath`: Optional workspace-relative PNG or JPEG path. Use with `content` when the
  image supports the message; the runtime keeps its aspect ratio.

## Content limits

- Keep titles under 80 characters when possible.
- Use at most 8 items in each body column; 3–6 is preferred.
- Keep each item under 180 characters.
- Put evidence in the slide text rather than inventing citations.
- Do not include Markdown syntax; supply plain text only.
