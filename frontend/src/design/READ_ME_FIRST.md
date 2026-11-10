# frontend/src/design: read me first

## Purpose

The look and the shared building blocks. Every colour, space, font size,
radius, shadow, layer and duration is a token in `tokens.css`; components use
the tokens, never raw values. Details and the contrast table:
`docs/design-system.md`.

## Key files

| File | Job |
|---|---|
| `tokens.css` | The only place with design values (light and dark) |
| `base.css` | Page defaults: fonts, the focus ring, reduced motion |
| `components.css` | Styles of the shared components and the skip link |
| `components/Button.tsx` | Variants and `busy`: a busy button is `aria-disabled` and ignores clicks, but keeps keyboard focus |
| `components/Dialog.tsx` | Modal: focus moves in, Tab stays inside, Escape closes, focus goes back |
| `components/Toast.tsx` | Short messages in one `aria-live` region (`useToast().show(...)`) |
| `components/Field.tsx`, `Select.tsx`, `Checkbox.tsx` | Labelled inputs with hint and error text linked by `aria-describedby` |
| `components/States.tsx`, `Badge.tsx`, `Stepper.tsx`, `Legend.tsx`, `PageShell.tsx` | Loading, empty and error states; badges; step indicator; map legend; page frame |

## Data flow

```
tokens.css (variables) -> components.css -> components/*.tsx -> pages
scripts/contrast.mjs reads tokens.css and checks every text and colour pair (WCAG)
```

## Three likely walkthrough questions

**Why tokens instead of colours in each file?**
One change in `tokens.css` changes the whole app, dark mode is a second set of
the same names, and `npm run contrast` can check every pair automatically.

**Why does a busy button not use the `disabled` attribute?**
Browsers move focus away from a disabled button to the page body. A keyboard
user inside a dialog would then fall out of it. `aria-disabled` tells screen
readers the button is unavailable and the click handler ignores presses.

**How does the dialog keep keyboard focus inside?**
It listens for keys on the whole document while open. On Tab it recomputes
the focusable controls and wraps around; if focus fell outside the panel it
pulls it back in; Escape always closes.
