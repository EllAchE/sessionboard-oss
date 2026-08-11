# Handoff: land the Cicero design system

Self-contained brief for the session that ports the design system into the repo. You do not need
to know anything about conference software, Sessionboard, or the competition — everything required
is on this page.

The design system was authored separately and is the **source of truth**. Your job is
transcription and porting, not design. Where this document gives a literal value, it is literal.

## What you are building

```
app/tokens.css              every token below, verbatim
app/fonts.ts                next/font/local declarations for the three families
components/ui/<Name>/       21 components, each with index.tsx + <Name>.module.css
components/ui/index.ts      barrel export
app/(dev)/kitchen-sink/     one page rendering every component in every state, both themes
```

No product features. No routes beyond the kitchen sink. No database, no auth, no API.

## Constraints

- **No Tailwind, no shadcn, no Radix, no CSS-in-JS.** Plain CSS Modules reading `var(--…)`.
  Introducing a framework means fighting a system that already has opinions about all of it.
- Components are styled **only** through tokens. A raw hex or a magic pixel value in a
  `.module.css` is a bug — if you need a value that has no token, say so rather than inventing one.
- React 19, TypeScript, Next.js 15 App Router. Client components only where interaction demands it
  (`Dialog`, `Toast`, `Tooltip`, `Tabs`, `CommandMenu`, `Switch`, `DataTable` selection).
- Every component forwards `className` and merges it last, so callers can extend without `!important`.

---

## 1. Tokens — transcribe verbatim into `app/tokens.css`

### Color

```css
:root {
  /* ---- Travertine: warm stone neutrals. The whole product sits on these. ---- */
  --stone-0: #FFFFFF;  --stone-25: #FCFBF8;  --stone-50: #F8F6F1;
  --stone-100: #F1EEE6; --stone-200: #E4DFD3; --stone-300: #D2CABA;
  --stone-400: #B0A794; --stone-500: #8A8170; --stone-600: #6A6255;
  --stone-700: #4D473E; --stone-800: #33302A; --stone-900: #211F1B;
  --stone-950: #141311;

  /* ---- Vermilion: cinnabar red used on Roman wall painting. The one loud color. ---- */
  --vermilion-50: #FDF4F1;  --vermilion-100: #F9E2DA; --vermilion-200: #F0BEAE;
  --vermilion-300: #E2937B; --vermilion-400: #D06A4B; --vermilion-500: #B7391F;
  --vermilion-600: #9C2E17; --vermilion-700: #7C2412; --vermilion-800: #591A0D;
  --vermilion-900: #3A1109;

  /* ---- Support hues. Semantic only; never decorative. ---- */
  --lapis-100: #DCE5F2; --lapis-300: #90A8CE; --lapis-500: #2C4A7C; --lapis-700: #1C3054;
  --verdigris-100: #D9EAE3; --verdigris-300: #86BAAA; --verdigris-500: #2F7361; --verdigris-700: #1D4C3F;
  --ochre-100: #F6E9CC; --ochre-300: #DCBB6C; --ochre-500: #A8781C; --ochre-700: #6F4E0F;

  --surface-page: var(--stone-50);     --surface-card: var(--stone-0);
  --surface-sunken: var(--stone-100);  --surface-raised: var(--stone-0);
  --surface-inverse: var(--stone-900); --surface-hover: var(--stone-100);
  --surface-active: var(--stone-200);  --surface-selected: var(--vermilion-50);
  --surface-overlay: rgba(33, 31, 27, 0.45);

  --text-strong: var(--stone-900); --text-body: var(--stone-800);
  --text-muted: var(--stone-600);  --text-faint: var(--stone-500);
  --text-inverse: var(--stone-50); --text-accent: var(--vermilion-600);
  --text-link: var(--lapis-500);   --text-on-accent: #FFFFFF;

  --border-hairline: var(--stone-200); --border-default: var(--stone-300);
  --border-strong: var(--stone-400);   --border-accent: var(--vermilion-500);
  --border-focus: var(--vermilion-500);

  --status-info-fg: var(--lapis-500);        --status-info-bg: var(--lapis-100);
  --status-success-fg: var(--verdigris-500); --status-success-bg: var(--verdigris-100);
  --status-warning-fg: var(--ochre-700);     --status-warning-bg: var(--ochre-100);
  --status-danger-fg: var(--vermilion-600);  --status-danger-bg: var(--vermilion-50);

  --accent: var(--vermilion-500); --accent-hover: var(--vermilion-600);
  --accent-press: var(--vermilion-700); --accent-subtle: var(--vermilion-50);
  color-scheme: light;
}

[data-theme="dark"] {
  --surface-page: #17150F; --surface-card: #201D17; --surface-sunken: #131109;
  --surface-raised: #2A261E; --surface-inverse: var(--stone-50);
  --surface-hover: #2A261E; --surface-active: #353026; --surface-selected: #3A2018;
  --surface-overlay: rgba(10, 9, 7, 0.6);
  --text-strong: #F6F3EC; --text-body: #E2DCD0; --text-muted: #A79E8C; --text-faint: #7E7666;
  --text-inverse: var(--stone-900); --text-accent: var(--vermilion-300);
  --text-link: var(--lapis-300); --text-on-accent: #FFFFFF;
  --border-hairline: #322D24; --border-default: #423C31; --border-strong: #57503F;
  --border-accent: var(--vermilion-400); --border-focus: var(--vermilion-300);
  --status-info-fg: var(--lapis-300); --status-info-bg: #1B2436;
  --status-success-fg: var(--verdigris-300); --status-success-bg: #162C26;
  --status-warning-fg: var(--ochre-300); --status-warning-bg: #2E2411;
  --status-danger-fg: var(--vermilion-300); --status-danger-bg: #33150D;
  --accent: var(--vermilion-400); --accent-hover: var(--vermilion-300);
  --accent-press: var(--vermilion-500); --accent-subtle: #2E1710;
  color-scheme: dark;
}
```

**Dark mode is `[data-theme="dark"]` on the root element.** Not a `prefers-color-scheme` media
query, not a `.dark` class. Only the semantic layer flips; the raw Travertine, Vermilion, Lapis,
Verdigris and Ochre scales are shared between themes and are never redeclared.

Lapis, Verdigris and Ochre exist to carry status meaning. Never reach for them as decoration.

### Typography

```css
--font-display: "Spectral", "Iowan Old Style", Georgia, serif;
--font-ui: "Archivo", -apple-system, "Segoe UI", sans-serif;
--font-mono: "IBM Plex Mono", ui-monospace, "SF Mono", monospace;

--text-2xs:11px; --text-xs:12px; --text-sm:13px; --text-md:14px; --text-lg:16px;
--text-xl:19px; --text-2xl:24px; --text-3xl:31px; --text-4xl:40px; --text-5xl:54px; --text-6xl:72px;

--leading-tight:1.12; --leading-snug:1.28; --leading-normal:1.5; --leading-loose:1.65;
--weight-regular:400; --weight-medium:500; --weight-semibold:600; --weight-bold:700;

--tracking-inscribed:0.18em; --tracking-eyebrow:0.1em; --tracking-tight:-0.015em;
--tracking-tighter:-0.025em; --tracking-normal:0;

--type-display: var(--weight-regular) var(--text-5xl)/var(--leading-tight) var(--font-display);
--type-title:   var(--weight-regular) var(--text-3xl)/var(--leading-tight) var(--font-display);
--type-heading: var(--weight-semibold) var(--text-lg)/var(--leading-snug) var(--font-ui);
--type-body:    var(--weight-regular) var(--text-md)/var(--leading-normal) var(--font-ui);
--type-prose:   var(--weight-regular) var(--text-lg)/var(--leading-loose) var(--font-display);
--type-label:   var(--weight-medium) var(--text-xs)/1.2 var(--font-ui);
--type-mono:    var(--weight-regular) var(--text-sm)/1.4 var(--font-mono);
```

The composite `--type-*` tokens are CSS `font` shorthand. Use `font: var(--type-body)` rather than
setting family/size/weight/leading separately.

Serif (Spectral) is for display, titles and long-form prose. Sans (Archivo) is the working UI face
and carries everything dense. Mono is for identifiers, refs like `SESS-4`, and code.

### Geometry

```css
/* 4px base with a 2px micro step — dense tables need the half. */
--space-0:0px; --space-05:2px; --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
--space-5:20px; --space-6:24px; --space-8:32px; --space-10:40px; --space-12:48px;
--space-16:64px; --space-20:80px; --space-24:96px; --space-32:128px;

/* Radii stay small. Stone is cut, not moulded. */
--radius-xs:2px; --radius-sm:3px; --radius-md:5px; --radius-lg:8px; --radius-xl:12px; --radius-full:999px;
--border-width:1px; --border-width-thick:2px;

--control-xs:22px; --control-sm:28px; --control-md:32px; --control-lg:40px;
--row-height:36px; --sidebar-width:232px; --topbar-height:48px;
--content-max:1200px; --prose-max:68ch;
```

### Elevation

```css
--shadow-xs: 0 1px 0 rgba(33,31,27,0.04);
--shadow-sm: 0 1px 2px rgba(33,31,27,0.06), 0 0 0 1px rgba(33,31,27,0.04);
--shadow-md: 0 2px 6px rgba(33,31,27,0.08), 0 0 0 1px rgba(33,31,27,0.05);
--shadow-lg: 0 8px 24px rgba(33,31,27,0.12), 0 0 0 1px rgba(33,31,27,0.06);
--shadow-overlay: 0 16px 48px rgba(33,31,27,0.2), 0 0 0 1px rgba(33,31,27,0.08);
--shadow-inset: inset 0 1px 2px rgba(33,31,27,0.06);
--ring-focus: 0 0 0 2px var(--surface-card), 0 0 0 4px var(--vermilion-300);
```

Shadows are shallow and warm-tinted. **Hierarchy comes from hairlines first** — reach for
`--border-hairline` before reaching for a shadow. `--shadow-lg` and above are for genuinely
floating surfaces (popovers, command menu), not for cards in a list.

### Motion

```css
/* Fast and unfussy. A power tool should never make you wait for a transition. */
--duration-instant:60ms; --duration-fast:110ms; --duration-normal:180ms; --duration-slow:300ms;
--ease-standard: cubic-bezier(0.2,0,0,1); --ease-out: cubic-bezier(0.16,1,0.3,1);
--ease-in: cubic-bezier(0.5,0,0.9,0.2);
```

Hover and focus transitions use `--duration-fast`. Nothing in a table row or a button should
animate slower than that. Respect `prefers-reduced-motion` by zeroing durations.

---

## 2. Fonts

Three families, 17 static woff2 files total:

| Family | Weights |
|---|---|
| Spectral | 300, 400, 500, 600, 700 + matching italics |
| Archivo | 400, 500, 600, 700 |
| IBM Plex Mono | 400, 500, 600 |

Wire them through `next/font/local` in `app/fonts.ts`, `display: 'swap'`, subset to latin, and set
the CSS variables so `--font-display` / `--font-ui` / `--font-mono` resolve to the local faces with
the stacks above as fallback. Self-hosted only — no runtime request to Google Fonts, and no layout
shift.

The woff2 files come from the design artifact bundle. If they are not in the repo when you start,
say so and stop rather than substituting Google Fonts CDN links.

---

## 3. Components

21 components, one directory each under `components/ui/`.

```
core        Button · IconButton · Kbd · Card · Badge · Tag · Avatar
forms       Input · Textarea · Select · Checkbox · Radio · Switch
navigation  Tabs · SidebarNav · CommandMenu
feedback    Dialog · Toast · Tooltip
data        DataTable · ScoreStars
```

The source artifact styles everything with inline `style={{}}` objects. Your port converts those to
CSS Modules reading the same `var(--…)` tokens — the computed result must be identical, the
mechanism must not be inline styles.

**Two carry the power-user feel and get built properly:**

- **`DataTable`** — row selection (single and multi), a keyboard-driven `activeIndex` with
  up/down/home/end, per-column `render`, fixed column widths, `--row-height: 36px`, hairline row
  separators, sticky header. This is the component the whole admin surface is made of; nearly every
  organizer screen is a dense table. It must feel fast under a keyboard, not just correct.
- **`CommandMenu`** — ⌘K overlay, fuzzy filter, grouped results, arrow navigation, Enter to run,
  Esc to dismiss, focus trap and focus restore.

The other 19 are thin styled elements. Do not over-engineer them.

**Every component:** visible focus ring using `--ring-focus` (never `outline: none` without a
replacement), correct ARIA roles, keyboard operability, and a disabled state that is legible rather
than merely faded.

---

## 4. Acceptance criteria

Done means all of these hold.

1. `app/tokens.css` matches §1 **character for character** on every value. This is checkable —
   diff it.
2. `grep -rE '#[0-9a-fA-F]{3,8}' components/` returns nothing. No hardcoded color outside
   `tokens.css`.
3. No pixel value in any `.module.css` that isn't a token reference, except `0` and `1px` hairlines
   where a border token doesn't apply.
4. The kitchen-sink page renders all 21 components, each in default / hover / focus / disabled /
   error states where applicable, and reads correctly in **both** themes — toggled by setting
   `data-theme` on `<html>`, with no reload.
5. `next build` and `tsc --noEmit` are clean.
6. Every interactive component is reachable and operable by keyboard alone. Tab order is sane;
   `Dialog` and `CommandMenu` trap focus and restore it on close.
7. `prefers-reduced-motion: reduce` zeroes transition durations.

## 5. Where to stop

You own `app/tokens.css`, `app/fonts.ts`, `components/ui/**`, and the kitchen-sink route. Nothing
else. If you find yourself adding a dependency, editing a database schema, or writing a feature
route, you have left your scope — stop and report it instead.

Once merged, `components/ui/` is **frozen**: feature work consumes it read-only, and changes route
back through the owner. That freeze is what lets many agents build features concurrently without
inventing eight different buttons.
