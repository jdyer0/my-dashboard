# Phase 0 — scaffold, design system, shell

Paste the block below into Claude Code, in an empty directory, with `CLAUDE.md` already at
the repo root.

---

Read `CLAUDE.md` first, in full. It's the spec for this project and it overrides your
defaults. Then build Phase 0 only.

Phase 0 is the foundation and nothing else. There are no features in this phase. When you
finish, I should be able to install the app to my iPhone home screen, sign in, see a
four-tab shell with empty states, and watch the boot sequence run. No gym, no nutrition, no
finance, no goals.

## Build

**Project setup**

- Vite + React 18 + TypeScript, strict mode
- Tailwind, with every token from `CLAUDE.md` §4 defined in `tailwind.config.js` — the
  colour scale, the type scale, the `ease-instrument` cubic-bezier, the `0.5px` border
  width. I want to write `border-line` and `ease-instrument`, never arbitrary values.
- `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`, self-hosted, subset to latin
- ESLint + Prettier, no arguing with them later
- `.env.example` listing every var with a comment on each. Only `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` are client-side. Nothing else gets a `VITE_` prefix, ever.

**Supabase**

- Local project via the Supabase CLI, `supabase/migrations/0001_init.sql`
- Auth: email magic link, single user. No signup screen — I'll create my user in the
  dashboard. The sign-in screen is one email field and one button.
- Migration creates a `profiles` table (`user_id`, `display_name`, `sex`, `birth_date`,
  `height_cm`, `timezone` default `'Europe/London'`) with RLS on. Later phases need
  `sex` and `birth_date` for RNI targets and `height_cm` for BMI — put them in now so I
  can fill them once.
- An auth-gate: unauthenticated users see the sign-in screen, authenticated users see the
  shell. No flash of the wrong one on load — hold on a neutral splash until the session
  resolves.

**PWA**

- `vite-plugin-pwa`, manifest with `display: standalone`, `theme_color: #0B0F10`,
  `background_color: #0B0F10`, portrait orientation
- Generate the icon set. Include an iOS 180px apple-touch-icon and a maskable icon.
- Offline shell only — cache the app shell, do not attempt to cache data. Supabase is the
  source of truth and there's no offline write story in this app.
- Respect the iOS safe-area insets (`env(safe-area-inset-*)`) — the tab bar must sit above
  the home indicator, not under it.

**Shell**

- Bottom tab bar, four tabs: Overview, Gym, Food, Money. Icons plus labels. 44px targets.
  Tabs for unbuilt modules render a proper empty state, not a 404 and not "coming soon".
- React Router. Route change is a 200ms crossfade.
- An Overview screen laid out as the real dashboard will be: a header with the date and a
  sync indicator, a three-tile metric row, and two card slots below. Wire it to placeholder
  values for now — the point of this phase is that the layout and the motion are correct
  before any real data exists.

**The motion primitives** — this is the actual deliverable of Phase 0. Build these as
reusable pieces the later phases just consume:

- `<BootSequence>` — a context provider that orchestrates the mount cascade. Children
  register themselves and receive a delay index. Runs once per mount, guarded by a ref.
  Must not re-run on state change or tab switch.
- `<CountUp value={} />` — counts from 0 to value over 600ms on boot, tweens over 300ms on
  subsequent changes, renders the final value immediately under reduced motion. Mono,
  `tabular-nums`. Handles decimals and a `format` prop for currency/units.
- `<Sparkline points={} />` — inline SVG, draws via `stroke-dashoffset` over 700ms. 1.5px
  stroke, no fill, dot on the final point only.
- `<Bar value={} max={} />` — `scaleX` from `transform-origin: left`, 500ms.
- `<SyncDot state="synced|syncing|stale|error" />` — the 2s opacity pulse. The only
  perpetual animation in the app.

Every one of them honours `prefers-reduced-motion: reduce`. Write a single
`usePrefersReducedMotion` hook and use it in all of them — don't scatter media queries.

## Constraints

- Do not deploy. Do not run any Netlify command. I'll deploy manually.
- Do not install a component library, a charting library, or a state manager.
- Do not create tables, routes, or files for Phase 1–4 modules.
- Do not write tests this phase.
- No secrets in client code. Anything `VITE_*` is public.

## When you're done

Run `npm run dev`, confirm it builds clean with no TypeScript errors and no console
warnings, then tell me:

1. What to put in `.env`
2. The exact Supabase CLI commands to run the migration
3. How to create my user
4. How to install to my iPhone home screen and verify standalone mode

Then stop. Don't start Phase 1.

Ask me now if anything in `CLAUDE.md` is ambiguous or if you'd push back on any of it —
before you write code, not after.
