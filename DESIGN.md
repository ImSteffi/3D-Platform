# Design

The visual contract for the platform. Product facts live in `PRODUCT.md`. The reference render is `.impeccable/mocks/space-light.html` (open it; match its finish).

## The idea

**Your place is the page.** The customer's own space fills the screen and the interface is light frosted glass floating on it. It is a calm, contained, premium service — never a generic dashboard.

## Three surface modes

| Mode | Where | Ground | Surfaces |
|---|---|---|---|
| **Place** | Customer screens: Home, Spaces, Space page, Learn, Login | The space's own image (latest capture photo, or the tour preview once delivered), cover-fit. With no image: the ambient ground (`--ground`) | Frosted glass panels |
| **Desk** | Operator screens: Queue, request (plan editor, photo review), Customers, projects, uploads | Ambient ground only, no photo | One large frosted window; **opaque** wells for plans and photos being judged |
| **Lens** | Capture camera, 3D viewer, shared tour page | The live camera / the tour itself, full-bleed | Solid dark bars and chips. No frosted panels over a viewfinder |

Never put frosted glass over a photo the operator is judging, a plan being edited, or a live viewfinder.

## Tokens (CSS custom properties in `shared/styles/tokens.css`)

- Ink: `--ink #17191b`, `--ink-2` 66% ink, `--ink-3` 46% ink. On dark (Lens): `--on-dark #f6f5f2`, `--on-dark-2` 70%.
- Glass: `--glass rgba(255,255,255,.68)` content panels; `--glass-chrome rgba(255,255,255,.56)` pills and bars; `--well rgba(255,255,255,.5)`; `--solid #fbfaf7` opaque wells; edge `--edge rgba(255,255,255,.78)`; hairline `--hair rgba(23,25,27,.09)`. Blur `34px saturate(170%)`.
- Ground: `--ground` a soft warm-neutral field (`#d9d3c8` → `#c9c2b6`), used when no place image exists.
- Lens: `--lens #141516`, `--lens-bar rgba(20,21,22,.86)`.
- **Amber `--amber #f2a31b`** means "your move / next": the next point, the customer's-turn tag, count badges. `--amber-soft` 18%, `--amber-ink #7a4a00` for text on soft amber.
- **Red `--red #d9423a`** means retake / error only. **Green `--green #23855a`** means done / approved only.
- Primary action is **ink**, not amber: black pill button, white text. One primary per view.
- Radii: panel 28, card 20, control 14, pill = half height. Shadow: `0 24px 48px -24px rgba(40,30,15,.38), 0 2px 6px rgba(40,30,15,.06)` plus a 1px white inset top edge.
- Spacing scale: 4 8 12 16 20 24 32 48. Panel padding 24–28. Outer margin 20.
- Motion: `--ease cubic-bezier(.22,1,.36,1)`; 180ms for hover/press, 360ms for panels. Respect `prefers-reduced-motion`.

## Type

- **Geist** (variable) for everything; **Geist Mono** only for numbers that are counted or measured: point numbers, `9 / 20`, sizes, distances, dates in tables. Self-hosted through `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`.
- Scale: 12 / 13 / 14 (body) / 15 / 17 / 20 / 26 / 34, plus one hero numeral per screen at most (96–136px, Geist Mono 400, tracking -0.06em).
- Headings weight 500, tracking -0.02em. Body 14–15px, line-height 1.45, measure ≤ 70ch. Sentence case everywhere. No uppercase tracked labels, no eyebrow/kicker lines above headings.

## Shell

- **Sidebar** (232px glass panel, labelled icon + word): customer → Home, Spaces, Learn, then "Your spaces" shortcuts; operator → Queue (amber badge = requests waiting on the operator), Customers. Account block at the bottom with Sign out.
- Under 900px the sidebar becomes a bottom bar with the same labelled items (thumb reach); content panels stack full-width with 12px margins.
- Lens mode hides the shell completely: one close button, one path.
- Page header: title (26–34px) + one line of context; on Place mode over a photo the title is white with a soft shadow.

## Components (shared/ui)

`Panel` (glass | solid | well), `Button` (primary ink / secondary / quiet / danger; sizes md 44px, lg 50px), `Icon` (1.6px stroke, one set), `Field` (label above, hint/error below), `Segmented`, `Steps`, `StatusPill`, `WhoseMove`, `Ticks`, `EmptyState`, `ConfirmDialog`, `Toast/inline error`.

- **WhoseMove**: `Your move` (amber dot, soft amber) or `With the team` (ink-3 dot, neutral). Appears on every Space card, the Space header, and every Queue row (mirrored: the operator's move is amber there).
- **Steps** (a Space's journey): Floor plan → Photos → Team builds → Your tour → Share. Done = green check, current = ink pill, later = ink-3. Team-owned steps say so.
- **Ticks**: one thin tick per photo; ink = taken, amber = next, red = retake, faint = to do. Always paired with a Geist Mono count (`9 / 20`).
- **StatusPill**: neutral by default; colour only for retake (red), done (green), your move (amber).
- Plans are drawn flat and top-down wherever they are tapped, placed or aimed. A tilted plan (`rotateX(46deg) rotateZ(-28deg)`) is allowed only as a non-interactive desktop overview.
- Points on plans: ink disc + white mono number = taken; amber room/disc = next; hollow = to do; red ring = retake.

## Copy

- Plain words, second person, sentence case. Buttons name the action ("Open camera", "Send photos to the team", "Deliver tour").
- Vocabulary: **Space**, **Tour**, **Capture**, **point**, **retake**, **the team**. Never "scan", "project", "tour request", "generate" in customer-facing text.
- Always say whose move it is and what happens next. The team builds tours by hand in a few days: never promise instant, automatic or AI results, and never show times or metrics the data does not have.
- Errors say what went wrong and what to do.

## Do not

Gradient text; neon glows; emoji or unicode glyphs as icons; stat cards, sparklines, deltas or charts without real data; nested cards; a coloured left border on cards; modals for things that fit on the page; an assistant/chat page; uppercase micro-labels.

## Routes

| Path | Screen | Who |
|---|---|---|
| `/login` | Sign in | public |
| `/view/:token` | Shared tour (Lens) | public |
| `/home` | Home: next move / waiting / tour ready | customer (operator is sent to `/review`) |
| `/spaces` | All spaces | customer |
| `/spaces/new` | Start a space | customer |
| `/spaces/:spaceId/:tab?` | Space page; tab = `plan` `photos` `tour` `share` | customer |
| `/learn` | How to take good photos | customer |
| `/projects/:projectId` | Tours delivered outside a capture | customer |
| `/review`, `/review/:tourId` | Queue and one request | operator |
| `/organizations`, `/organizations/:id`, `/organizations/:o/projects/:p` | Customers | operator |

Legacy redirects: `/dashboard`→`/home`, `/projects`→`/spaces`, `/generate`→`/spaces`, `/generate/tour`→`/spaces/new`, `/generate/tour/:id`→`/spaces/:id`, `/tour-requests`→`/review`, `/tour-requests/:id`→`/review/:id`.
