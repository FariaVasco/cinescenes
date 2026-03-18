# Cinescenes — Design Brief
> Complete handoff document for the Figma redesign. Covers brand, design system, all screens, all components, and redesign direction.

---

## 1. What Is Cinescenes?

Cinescenes is a **party card game about movies**. Players watch a mystery trailer — no title, no year shown — and must place the movie in its correct chronological position on their personal timeline. The player who builds the longest accurate timeline wins.

Two editions:
- **Physical**: printed cards with a QR code on the back → scan → watch trailer on phone
- **Digital**: fully app-based, up to 8 players on the same Wi-Fi

The core tension: *you know you've seen this film… but was it 1987 or 1994?*

---

## 2. Emotional Experience

| Moment | Feeling |
|--------|---------|
| Opening the app | Anticipation — settling into a dark cinema seat |
| The trailer starts | Suspense. The screen becomes everything |
| "I know it!" | Rush of recognition. Adrenaline |
| Placing the card | Strategic tension. Second-guessing |
| The challenge window | Social electricity. Reading the room |
| The card flips | Revelation. The audience leans in |
| Correct placement | Triumph. Prestige |
| Wrong placement | Theatrical groan. Laughter |
| Winning | The credits roll on your victory |

---

## 3. Brand Identity

### One sentence
> *Cinescenes is a love letter to cinema, disguised as a party game.*

### Personality
- **Cinematic** — serious about film, not about itself
- **Prestigious** — the feel of a film festival, not a quiz app
- **Tactile** — digital UI that feels like handling real cards
- **Social** — built for a room full of people

### Visual references
- The Criterion Collection — editorial, typographic restraint
- BAFTA / Academy Awards — gold, dark, formal but exciting
- Film noir — deep shadow, high contrast, dramatic light
- A vintage movie palace at night — velvet darkness, gold ornament

### What it is NOT
- Bright, casual, cartoonish
- Generic mobile game UI
- Neon / cyberpunk
- Playful rounded bubbly shapes

---

## 4. Design Pillars

### 1. DARK AS THE CINEMA
The primary background (`#100a20`) is the darkness of a cinema before the film starts — deep purple-navy, almost black. All content is lit by the screen.

### 2. GOLD IS EARNED
Gold (`#f5c518`) is used exclusively for things that matter: the brand, primary actions, earned rewards, the active player. Never decorative. The colour of trophies, IMDb stars, house lights.

### 3. CARDS ARE REAL OBJECTS
The movie cards are the soul of the game. They should feel like premium playing cards — weighted, physical. Dark backgrounds, large typography, precise proportions.

### 4. MOTION IS NARRATIVE
Every animation tells a small story. The wheel spin is a drawing of fate. The card flip is the moment of truth. Animations are never decorative — they are beats in the game's drama.

---

## 5. Color System

```
── Backgrounds ──────────────────────────────────────────────────────
bg           #100a20    Primary screen — cinema darkness
surface      #1e1630    Cards, panels, inputs, chips
surfaceHigh  #2a1f4a    Modals, elevated panels, bottom sheets

── Brand ────────────────────────────────────────────────────────────
gold         #f5c518    Primary accent — prestige, action, reward
goldFaint    rgba(245,197,24, 0.12)   Subtle gold wash (active states)
goldGlow     rgba(245,197,24, 0.25)   Gold halos on buttons and rings

── Semantic ─────────────────────────────────────────────────────────
danger       #e63946    Challenge, errors, destructive actions

── Text ─────────────────────────────────────────────────────────────
textPrimary  #ffffff    Headlines, primary content
textSub      #a0a0b0    Secondary / supporting text
textMuted    #66667a    Hints, captions, disabled
textOnGold   #0a0a0a    Text rendered on gold backgrounds

── Borders ──────────────────────────────────────────────────────────
border       rgba(255,255,255, 0.10)   Standard hairline dividers
borderSubtle rgba(255,255,255, 0.06)   Barely-there separators

── Status Badges ────────────────────────────────────────────────────
free         rgba(34,197,94, 0.15)    bg  /  #4ade80  text
premium      goldFaint               bg  /  gold     text + border
comingSoon   rgba(255,255,255,0.06)   bg  /  textMuted text
```

### Decade Card Colors
Cards have unique backgrounds by decade — dark cinematic hues that evoke each era:

| Decade | Hex | Era |
|--------|-----|-----|
| 1920s | `#3D2B1F` | Warm sepia — silent era |
| 1930s | `#1B3252` | Deep navy — noir / art deco |
| 1940s | `#4A1522` | Dark burgundy — wartime |
| 1950s | `#0C5E3E` | Deep teal — Technicolor |
| 1960s | `#7A1E00` | Vermillion — New Wave |
| 1970s | `#7A3C00` | Burnt sienna — New Hollywood |
| 1980s | `#380066` | Deep violet — neon / blockbuster |
| 1990s | `#003E5C` | Ocean blue — indie / Sundance |
| 2000s | `#1B3D1B` | Forest green — CGI / digital |
| 2010s | `#1B1B3D` | Midnight indigo — streaming |
| 2020s | `#2D0A3D` | Deep plum — modern |

Colors are linearly interpolated between adjacent decades for each individual year.

---

## 6. Typography

System font (SF Pro on iOS, Roboto on Android). No custom typeface — heavy weights + controlled letter-spacing achieve the premium feel.

| Style | Size | Weight | Letter Spacing | Case | Default Color | Usage |
|-------|------|--------|----------------|------|---------------|-------|
| `hero` | 40 | 900 | — | — | textPrimary | Year on CardFront |
| `display` | 28 | 900 | 0.3 | — | textPrimary | Major screen titles, paywall headline |
| `title` | 22 | 900 | 0.3 | — | textPrimary | Section headers |
| `subtitle` | 18 | 700 | 0.3 | — | textPrimary | Sub-headers |
| `body` | 16 | 500 | — | — | textSub | Body copy |
| `label` | 14 | 600 | 0.3 | — | textPrimary | Button labels, form labels |
| `overline` | 11 | 700 | 2.0 | UPPERCASE | gold | Section labels, screen category tags |
| `caption` | 12 | 500 | 0.3 | — | textMuted | Metadata, hints, timestamps |
| `micro` | 9 | 700 | 1.5 | UPPERCASE | textMuted | Watermarks, badge labels |
| `wordmark` | varies | 900 | 6 | UPPERCASE | gold | CINESCENES logotype only |

---

## 7. Border Radius Scale

```
xs   = 6    Badges, small tags
sm   = 10   Small interactive elements, icon buttons
md   = 12   Inputs, minor cards
btn  = 16   Primary action buttons
card = 20   Cards, panels, bottom sheets, modals
full = 999  Circles, pills
```

---

## 8. Spacing Scale

```
xs =  4    Tight internal spacing (icon ↔ label)
sm =  8    Default internal gap
md = 16    Standard section gap
lg = 24    Large section separation
xl = 32    Screen-level horizontal padding
```

---

## 9. Icon System

### Style spec
- **Type**: Stroke / outline icons (not filled)
- **Stroke weight**: 1.5px at 24dp canvas
- **Corners**: Rounded cap + rounded join
- **Size grid**: 16dp (inline), 20dp (UI standard), 24dp (prominent), 32dp (illustrated), 96dp (rules hero)
- **Color default**: `textSub` (#a0a0b0)
- **Color active / brand**: `gold` (#f5c518)
- **Color destructive**: `danger` (#e63946)

### Cinema vocabulary (preferred before generic equivalents)

| Concept | Cinema Motif |
|---------|-------------|
| The game / draw | Clapperboard |
| A movie | Film reel |
| Watching | Projector beam |
| Time / year | Film strip with tick marks |
| Recognition | Spotlight circle |
| Victory | Director's chair |
| Challenge | Film reel torn in two |
| Wrong / elimination | Film canister with X |
| Coin / currency | Round token with star |
| Voice input | Directional boom mic |
| Report | Flag planted in film strip |
| Cast to TV | Projector throwing beam |
| Timeline | Horizontal film strip |
| Next / advance | Clapperboard clap arrow |

### Full icon inventory

**UI Icons (functional — must be crisp at 20dp)**

| ID | Current (code) | Replacement | Context |
|----|---------------|-------------|---------|
| `ic_coin` | 🪙 emoji | Round token with star or "C" cutout, gold | ScoreBar, rules screen |
| `ic_mic` | 🎤 emoji | Directional boom mic, cinema style | Voice button — active |
| `ic_mic_off` | — | Same mic with diagonal slash | Voice button — idle |
| `ic_flag` | ⚑ text | Flag on a stick, thin stroke | Report trailer |
| `ic_timeline` | nested views | Horizontal film strip, 3 frames | ScoreBar view-timeline |
| `ic_back` | ← text | Thin chevron left | All back navigation |
| `ic_close` | ✕ text | Thin X | Modal dismiss |
| `ic_confirm` | ✓ text | Thin checkmark | Timeline slot confirm |
| `ic_replay` | ↺ text | Circular arrow (clockwise) | Replay trailer |
| `ic_cast` | MaterialCommunityIcons | Projector throwing beam right | Cast / TV mode |
| `ic_chevron_right` | → text | Thin chevron right | Navigation CTAs |

**Result / State Icons (illustrated — 24–32dp)**

| ID | Current | Replacement | Context |
|----|---------|-------------|---------|
| `ic_result_correct` | 🎉 | Star burst or clapperboard with checkmark | Active player placed correctly |
| `ic_result_challenge` | 🎯 | Spotlight hitting a target | Challenger placed correctly |
| `ic_result_trash` | 🗑️ | Film canister with X | Nobody got it right |
| `ic_trophy` | 🏆 | Director's chair or award silhouette | Win screen |

**Rules Screen Illustrations (hero — 80–96dp, outline, gold)**

| ID | Step |
|----|------|
| `ill_draw` | Draw a Card — clapperboard |
| `ill_watch` | Watch the Clip — projector with beam |
| `ill_know_it` | Know It? Say It — clapperboard mid-clap |
| `ill_coin` | Earn Coins — coin / token |
| `ill_starting` | Starting Card — single card with film strip corner |
| `ill_place` | Place It Right — horizontal film strip (timeline) |
| `ill_challenge` | Challenge! — two film reels facing each other |
| `ill_reveal` | The Reveal — card mid-flip |
| `ill_keep` | Keep or Lose — checkmark inside film reel |
| `ill_win` | Race to Win — director's chair with spotlight |

**Decorative Background Elements (all screens)**

Custom SVG silhouettes placed absolutely, rotated randomly, at 5–8% opacity, `pointerEvents="none"`:
- `deco_clapperboard` — clapperboard silhouette
- `deco_film_reel` — film reel circle
- `deco_star` — five-point cinema star
- `deco_projector` — vintage projector silhouette
- `deco_strip` — short film strip segment (3 frames)

---

## 10. Components

### CinemaButton
The universal button. 3 variants × 3 sizes. Spring-scale press animation (0.97 scale).

| Variant | Background | Text color | Border |
|---------|-----------|------------|--------|
| `primary` | gold #f5c518 | textOnGold #0a0a0a | none |
| `ghost` | transparent | textPrimary white | border rgba white 0.10 |
| `danger` | danger #e63946 | white | none |

| Size | Padding H×V | Font size |
|------|------------|-----------|
| `sm` | 16 × 8 | base 14 |
| `md` | 24 × 12 | base 14 |
| `lg` | 32 × 16 | base 14 |

Disabled state: opacity 0.4.

---

### CardBack
The face-down card. Used everywhere a movie is hidden.
- Background: `#0d0820` (darker than bg — depth)
- Outer gold frame: `rgba(245,197,24,0.50)`, inset ~9% of card width
- Inner hairline frame: `rgba(245,197,24,0.22)`, inset 4px further
- Centre emblem: `✦ CINE — SCENES ✦` stacked, gold at 88% opacity, weight 800, purely typographic
- `outlined` variant: dashed gold border (used as timeline gap placeholder)

### CardFront
The revealed card. The moment of truth.
- Background: decade-interpolated color (see section 5)
- Layout: director (italic, small, 75% opacity) → year (huge hero, full opacity) → title (italic, 90% opacity)
- Radial glow overlay: `rgba(255,255,255,0.07)`
- Card proportions: 80dp × 100dp (timeline), 72dp × 100dp (intro wheel), 52dp × 70dp (drawing phase mini)

### FlippingMovieCard
Animated card flip. CardBack → CardFront with 3D rotateY.
- Phase 1: back rotates 0→90° (hides back)
- Phase 2: front rotates -90→0° (reveals front)
- Duration: 600ms linear, useNativeDriver

---

### Timeline
Horizontal scrollable row of cards with gap slots.

| Gap type | Visual |
|----------|--------|
| Spacer (non-interactive) | 20dp invisible |
| Open gap (interactive) | 32dp × 100dp · circular + button, gold border |
| Selected gap | 80dp × 100dp dashed card outline, checkmark inside |
| Blocked gap (challenging) | 28dp × 100dp · ✕ in danger color |
| My placed pick (pre-reveal) | `CardBack outlined` with "your pick" overline label |
| Observer placed pick | `CardBack outlined` with player name overline label |
| Reveal — flip | `FlippingMovieCard` with autoFlip |
| Reveal — challenger insert | Spring scale-in animation from 0→1 |
| Reveal — trash | Card flies up-right (700ms) → slot collapses (600ms) |
| Challenger coin | 36dp circle, gold border, player initials |

---

### ScoreBar
Fixed bottom bar on all game screens.
- Background: surfaceHigh `#2a1f4a`, top hairline border
- Horizontal scroll of player chips
- Each chip: `{name} · {card count} · {coin count}`, gold text for counts
- Active player chip: gold border
- Right side: timeline button (film strip icon)

---

### ChallengeTimer
SVG animated countdown ring.
- Duration: 5 seconds
- Ring color progression: `#e63946` (red) → `#f5a623` (amber) → `#555` (grey)
- Stroke: 5px, round cap, starts at top (rotated -90°)
- Background ring: `#2a2a3a`
- Challenge / Pass buttons rendered inside the ring area

---

### CinescenesLogo
SVG clapperboard + CINESCENES wordmark.
- Top bar: gold `#f5c518`, black diagonal stripes, hinge pins
- Board body: dark `#0a0a14`, gold border, gold sprocket holes
- Wordmark: weight 900, gold, letterSpacing 6, gold text-shadow glow
- Props: `iconSize` (default 48), `showWordmark` (default true), `layout` (vertical | horizontal)

---

### PaywallSheet
Bottom sheet modal for RevenueCat subscription.
- Overlay: `rgba(0,0,0,0.75)`
- Sheet: surfaceHigh `#2a1f4a`, card radius 20, top handle bar
- 3 plan options (monthly / annual / lifetime): radio button + label + price + optional badge
- Selected plan: gold border + goldFaint background + filled gold radio dot
- CTA: primary CinemaButton "GET PREMIUM" (full width, lg)
- Footer: "Restore purchases" · "Not now" (caption links)
- Decorative: 2 SVG icons top-corners at 6% opacity

---

## 11. Screen Inventory

| Screen | Route | Orientation | Purpose |
|--------|-------|-------------|---------|
| Landing | `/` | Portrait | Entry: logo + "Let's Play" + "How to Play" |
| Play | `/play` | Portrait | Mode: physical deck vs. digital |
| Mode Select | `/mode-select` | Portrait | Standard (free) vs Collections (premium) |
| Sign In | `/sign-in` | Portrait | Apple (iOS) / Google (Android) auth |
| Rules | `/rules` | Portrait | 10-slide swipeable tutorial |
| Local Lobby | `/local-lobby` | Portrait | Create / join room; host starts game |
| Scanner | `/scanner` | Landscape | Camera QR scan for physical cards |
| Trailer | `/trailer` | Landscape | Physical card mode: watch trailer |
| Game | `/game` | Landscape | Full game loop (multiple sub-states) |

---

## 12. Game Screen Sub-states

The game screen renders different UI based on `turn.status` and the player's role.

### Drawing phase
After a turn ends, before the next trailer starts.

| Viewer | Layout |
|--------|--------|
| Active player | Overline "Your turn" · Active player's own timeline · "Let's Guess" primary button |
| Observer | Overline "{name}'s timeline" · Active player's timeline (main) · "Waiting for {name}…" label · Own mini-timeline at bottom (52×70dp cards, horizontal scroll) |

ScoreBar pinned to bottom on all states.

### Placing — trailer
| Viewer | Layout |
|--------|--------|
| Active player | Full-screen trailer · "I know it!" floating button · Report button |
| Observer | Waiting state — blurred/dark background |

### Placing — guess
Active player only (portrait orientation). Text inputs for movie title + director name. Voice input button (boom mic icon). Submit → timeline.

### Placing — timeline
| Viewer | Layout |
|--------|--------|
| Active player | Interactive timeline · floating CardBack (pre-placement) · gap selection + confirm |
| Observer | Non-interactive timeline · active player's placed CardBack visible |

### Challenging
10-second window for non-active players. Sequential two-phase flow:

**Phase 1 — Decision** (for each observer):
- Not decided: ChallengeTimer ring (5s) + [Challenge] button + [Pass] button
- Challenged: "You challenged! Waiting for others…"
- Passed: "You passed"
- Active player: "Waiting for everyone…"

**Phase 2 — Sequential picking** (after all decided, at least one challenged):
- Active player: "Challengers are picking…" · challenger coins accumulating on timeline
- Waiting for another: "Waiting for {name}…"
- My turn to pick: Interactive timeline · blocked gaps marked ✕ · [↩ Withdraw] if not first challenger
- Already picked: "Coin placed. Waiting for others…"
- Withdrew: "You withdrew."

### Revealing — flip phase
All players see the timeline with `FlippingMovieCard` at the placed position. Card autoFlips after 300ms.

### Revealing — result phase
Result strip appears with:
- Winner name + result icon
- "Card moves to {name}'s timeline" (if challenger won)
- "{name} also had it right" (if coin refunded)
- Bonus coin indicator (active player)
- [Next →] button

Result types:
- `correct` — active player placed correctly · star burst icon
- `challenge` — challenger placed correctly · spotlight icon
- `trash` — nobody correct · film canister icon

---

## 13. Animation Language

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Card flip (reveal) | 600ms | Linear (two-phase) | `status → revealing` |
| Card flip (intro wheel) | 600ms | inOut(cubic) | Wheel stopped |
| Intro wheel spin | 5500ms | inOut(cubic) | "Let's spin!" tap |
| Highlight card glide | 700ms | out(cubic) | Wheel stopped |
| Highlight card scale | 700ms | out(back 1.1) | With glide |
| Challenger card insert | Spring (damping 14, stiffness 180) | — | Sequential phase |
| Trash card fly-off | 700ms (300ms delay) | in(cubic) | Result = trash |
| Slot collapse | 600ms | inOut(quad) | After trash fly-off |
| Confetti burst (28 particles) | 850–1300ms staggered | out(cubic) | Correct placement |
| ChallengeTimer ring | 5000ms | Linear | `status = challenging` |
| Button press | Spring scale 0.97 | — | All CinemaButtons |
| Screen transition | Fade | — | Expo Router |

---

## 14. Redesign Vision — What "Bold" Means

The current design is correct in direction but conservative in execution. The redesign should push harder on the cinematic premise while keeping all the dark/gold foundations.

### Key opportunities

**1. Typography needs more contrast**
The current UI uses similar weights/sizes throughout. A bold redesign would use much larger type — hero-level sizes on secondary screens, not just on cards. Think magazine editorial: one massive number or word that commands the screen, everything else secondary.

**2. Cards should feel dimensional**
CardFront currently uses flat color. Introduce subtle gradient overlays, a film grain texture at 4–6% opacity, and stronger inner-shadow at the bottom edge. The card should feel like it has weight and depth.

**3. The timeline needs a visual identity**
Currently functional but plain. Consider a film-strip aesthetic — sprocket holes at top and bottom edges, or a subtle horizontal track behind the cards. The timeline is the game — it deserves a stronger visual language.

**4. Screens need a focal point**
Landing screen is good. Game screen is crowded. Each screen should have one unmissable focal element (the year on the card, the challenge timer ring, the wheel). Everything else recedes.

**5. Gold usage can be bolder**
Currently gold appears as small accents. In a bold redesign, the primary action moment (the reveal, the result) should feel like a spotlight — a full gold flash, a gold glow emanating from the correct card, the screen briefly lighting up gold on a win.

**6. The challenge moment is the emotional peak**
The challenge window (5-second timer, Challenge vs. Pass) is the highest-stakes moment. It needs to feel urgent and cinematic — the timer ring could be larger, the background could pulse slightly, the social tension should be physically felt through the UI.

### Things NOT to change
- The dark purple-navy background
- Gold as the primary accent — not blue, not white
- Card proportions and the flip animation
- The overall vocabulary (cards, timeline, coins)

---

## 15. Figma Setup

### Variables to create
Import `figma-tokens.json` (included in repo root) using the **Tokens Studio for Figma** plugin.

### Manual color styles
`bg / surface / surfaceHigh / gold / goldFaint / goldGlow / danger / textPrimary / textSub / textMuted / textOnGold / border / borderSubtle`

### Text styles
`hero / display / title / subtitle / body / label / overline / caption / micro / wordmark`

### Suggested component frames (in order)
1. Color palette — all swatches + decade card colors
2. Typography specimen — all 10 styles on dark bg
3. Icon set — all icons at 24dp on surface bg, grouped by type
4. Buttons — all variants × sizes × states
5. Cards — CardBack + CardFront (all decade variants) + FlippingMovieCard states
6. Timeline — 6 states documented
7. ChallengeTimer — 0%, 50%, 100% states
8. ScoreBar
9. PaywallSheet — all plan states
10. All screens (Landing → Play → Mode Select → Sign In → Rules → Lobby → Game all sub-states)

### Icon file
Dedicated component file, all icons at 24dp on surface bg. Groups: UI / Results / Rules illustrations / Decorative. Export as SVG for implementation in `react-native-svg`.
