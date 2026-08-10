# Titlebar Wordmark Alignment

## Goal

Use the cleaner desktop shell shown in the approved reference: remove the duplicate feather mark from the custom title bar and align the `Coffee Note` wordmark's left edge with the Home row icon in the navigation rail.

## Design

- `AppTitlebar` renders only the `Coffee Note` wordmark inside `.titlebar-brand`; history controls and menus keep their existing behavior and order.
- The title bar uses a 23px leading inset, matching the navigation rail's 14px outer padding plus the Home button's 9px inner padding. With the image removed, the wordmark begins on the same horizontal grid as the Home icon.
- The navigation rail and chat empty-state branding are unchanged. The chat empty state continues to render its larger logo.
- Add a source-level regression test that scopes the no-logo assertion to `.titlebar-brand`, so the product mark is not accidentally removed from other approved locations.

## Acceptance

- The title bar has no `<img>` inside `.titlebar-brand`.
- `Coffee Note` remains visible in the title bar and uses the existing Lora wordmark style.
- Existing navigation, title-bar menu, and chat branding tests/build continue to pass.
