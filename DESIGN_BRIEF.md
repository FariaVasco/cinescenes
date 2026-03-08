# Cinescenes — Design Brief

> Paste this into any AI design session (Figma, v0, etc.) to establish full context.

---

## 1. What Is Cinescenes?

Cinescenes is a **party card game about movies**. Players watch a mystery trailer — no title, no year shown — and must place the movie in its correct chronological position on their personal timeline. The player who builds the longest accurate timeline wins.

It exists in two forms:
- **Physical edition**: beautifully printed cards with a QR code on the back. Scan the code → watch the trailer on your phone.
- **Digital edition**: fully app-based, up to 8 players on the same Wi-Fi.

The core tension of the game: *you know you've seen this film... but was it 1987 or 1994?* That gap between recognition and precision is where the game lives.

---

## 2. Emotional Experience — What Players Should Feel

| Moment | Feeling |
|--------|---------|
| Opening the app | Anticipation. Like settling into a dark cinema seat. |
| The trailer starts | Suspense. Focus. The screen becomes everything. |
| "I know it!" | Rush of recognition. Adrenaline. |
| Placing the card | Strategic tension. Second-guessing. |
| The challenge window | Social electricity. Reading the room. |
| The card flips | Revelation. Drama. The audience leans in. |
| Correct placement | Triumph. Prestige. |
| Wrong placement | Theatrical groan. Laughter. |
| Winning | The credits roll on your victory. |

---

## 3. Brand Identity

### The Concept in One Sentence
> *Cinescenes is a love letter to cinema, disguised as a party game.*

### Personality
- **Cinematic** — serious about film, not about itself
- **Prestigious** — the feel of a film festival, not a quiz app
- **Tactile** — digital UI that feels like handling real cards
- **Social** — built for a room full of people, not a solo player

### Visual References
- The Criterion Collection (editorial, typographic restraint)
- BAFTA / Academy Awards ceremony (gold, dark, formal but exciting)
- Film noir (deep shadow, high contrast, dramatic light)
- A vintage movie palace at night (velvet darkness, gold ornament)

### What It Is NOT
- Bright, casual, cartoonish
- Generic mobile game UI
- Neon/cyberpunk
- Playful rounded bubbly shapes

---

## 4. Design Pillars

### 1. DARK AS THE CINEMA
The primary background (`#100a20`) is the darkness of a cinema before the film starts — deep purple-navy, almost black. Nothing competes with the screen. All content is lit by it.

### 2. GOLD IS EARNED
Gold (`#f5c518`) is used exclusively for things that matter: the brand, primary actions, the active player indicator, earned rewards. It is never decorative. It signals importance and prestige — the colour of trophies, of IMDb stars, of house lights.

### 3. CARDS ARE REAL OBJECTS
The movie cards are the soul of the game. They should feel like premium playing cards — weighted, physical. Dark backgrounds, large typography, precise proportions. When a card flips, it should feel like a revelation.

### 4. MOTION IS NARRATIVE
Every animation tells a small story. The wheel spin is a drawing of fate. The card flip is the moment of truth. The confetti is an audience reaction. Animations are never decorative — they are beats in the game's drama.

---

## 5. Color System

```
── Backgrounds ──────────────────────────────────────
bg           #100a20    Primary screen / cinema darkness
surface      #1e1630    Cards, panels, inputs — surfaces that catch light
surfaceHigh  #2a1f4a    Modals, elevated panels — spotlight effect

── Brand ────────────────────────────────────────────
gold         #f5c518    Primary accent — prestige, action, reward
goldFaint    rgba(245,197,24, 0.12)   Subtle gold wash (active states, glows)
goldGlow     rgba(245,197,24, 0.25)   Gold halos on buttons and rings

── Semantic ─────────────────────────────────────────
danger       #e63946    Challenge, errors, destructive actions

── Text ─────────────────────────────────────────────
textPrimary  #ffffff    Headlines, primary content
textSub      #a0a0b0    Secondary / supporting text
textMuted    #66667a    Captions, disabled, hints
textOnGold   #0a0a0a    Text rendered on gold backgrounds

── Borders ──────────────────────────────────────────
border       rgba(255,255,255, 0.10)   Standard hairline dividers
borderSubtle rgba(255,255,255, 0.06)   Barely-there separators
```

---

## 6. Typography Hierarchy

All type uses the system font (SF Pro on iOS, Roboto on Android). No custom typeface — the system font at heavy weights with controlled letter-spacing achieves the premium feel.

| Style Name | Size | Weight | Letter Spacing | Case | Color | Usage |
|------------|------|--------|----------------|------|-------|-------|
| `hero` | 40 | 900 | — | — | textPrimary | Screen centrepiece numbers (year on card) |
| `display` | 28 | 900 | 0.3 | — | textPrimary | Major screen titles |
| `title` | 22 | 900 | 0.3 | — | textPrimary | Section headers |
| `subtitle` | 18 | 700 | 0.3 | — | textPrimary | Sub-headers |
| `body` | 16 | 500 | — | — | textSub | Body copy |
| `label` | 14 | 600 | 0.3 | — | textPrimary | Button labels, form labels |
| `overline` | 11 | 700 | 2.0–2.5 | UPPERCASE | gold | Section labels, category tags |
| `caption` | 12 | 500 | 0.3 | — | textMuted | Metadata, hints, timestamps |
| `micro` | 9 | 700 | 1.5 | UPPERCASE | textMuted | Watermarks on cards |
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
xs = 4    Tight internal spacing (icon ↔ label)
sm = 8    Default internal gap
md = 16   Standard section gap
lg = 24   Large section separation
xl = 32   Screen-level padding
```

---

## 9. Icon System

### Philosophy
Every icon in Cinescenes should feel like it belongs in a film credit sequence or a cinema programme. No generic mobile UI icons. No emoji. The vocabulary comes from cinema itself.

### Style Specification
- **Type**: Stroke / outline icons (not filled)
- **Stroke weight**: 1.5px at 24dp canvas
- **Corners**: Rounded cap + rounded join (line-cap: round, line-join: round)
- **Size grid**: 16dp (inline), 20dp (UI standard), 24dp (prominent), 32dp (illustrated), 96dp (rules screen hero)
- **Color default**: `textSub` (#a0a0b0) — icons are supporting, not competing
- **Color active / brand**: `gold` (#f5c518)
- **Color destructive**: `danger` (#e63946)

### Cinema Icon Vocabulary (preferred motifs)

These motifs should be used before reaching for generic equivalents:

| Concept | Cinema Motif | Generic Fallback |
|---------|-------------|-----------------|
| The game / draw | Clapperboard | Playing card |
| A movie / film | Film reel | Film strip |
| Watching | Projector beam | Eye |
| Time / year | Film strip with tick marks | Calendar |
| Recognition | Spotlight circle | Lightbulb |
| Victory | Director's chair | Trophy |
| Challenge | Film reel torn in two | Exclamation |
| Elimination / wrong | Film canister with X | Trash |
| Coin / currency | Round token with star | Generic coin |
| Voice input | Directional boom mic | Microphone |
| Report | Flag planted in film strip | Flag |
| Cast to TV | Projector throwing beam | Cast icon |
| Timeline | Horizontal film strip | Timeline bar |
| Next / advance | Clapperboard clap arrow | Chevron right |

---

## 10. Full Icon Inventory

Every emoji or icon currently used in the app, with its replacement:

### UI Icons (functional — must be crisp at 20dp)

| ID | Current | Replacement | Context |
|----|---------|-------------|---------|
| `ic_coin` | 🪙 | Round token icon — circle with a star or "C" cutout, gold | ScoreBar player chips, rules screen, voice reward hint |
| `ic_mic` | 🎤 | Directional boom mic (cinema style, not karaoke mic) | Voice input button — active state |
| `ic_mic_off` | — | Same mic with diagonal slash | Voice button — idle/disabled |
| `ic_flag` | ⚑ | Flag on a stick — thin stroke | Report trailer button |
| `ic_timeline` | Three lines + connectors | Horizontal film strip with 3 frames | ScoreBar "view timeline" button |
| `ic_back` | ← (text) | Thin chevron left | All back navigation |
| `ic_close` | ✕ (text) | Thin X | Modal dismiss |
| `ic_confirm` | ✓ (text) | Thin checkmark | Timeline slot confirm button |
| `ic_replay` | ↺ (text) | Circular arrow (clockwise) | Replay trailer button |
| `ic_cast` | MaterialCommunityIcons "cast" | Projector throwing beam right | Cast/TV mode button |
| `ic_chevron_right` | → (text) | Thin chevron right | Navigation CTAs |

### Result / State Icons (illustrated — 24–32dp, gold or semantic color)

| ID | Current | Replacement | Context |
|----|---------|-------------|---------|
| `ic_result_correct` | 🎉 | Star burst or clapperboard with checkmark | Active player placed correctly |
| `ic_result_challenge` | 🎯 | Spotlight circle hitting a target | Challenger placed correctly |
| `ic_result_trash` | 🗑️ | Film canister with X mark | Nobody got it right |
| `ic_trophy` | 🏆 | Director's chair or award silhouette | Win screen, race to win |

### Rules Screen Illustrations (hero size — 80–96dp, outline style, gold)

| ID | Current | Replacement | Step |
|----|---------|-------------|------|
| `ill_draw` | 🎬 | Clapperboard (full, detailed) | Draw a Card |
| `ill_watch` | 👀 | Film projector with beam | Watch the Clip |
| `ill_know_it` | ⚡ | Clapperboard mid-clap (action) | Know It? Say It |
| `ill_coin` | 🪙 | Coin / token (large, detailed) | Earn Coins |
| `ill_starting` | 🎴 | Single card with film strip corner | Starting Card |
| `ill_place` | 📅 | Horizontal film strip (timeline) | Place It Right |
| `ill_challenge` | ⚔️ | Two film reels facing each other | Challenge! |
| `ill_reveal` | 🃏 | Card mid-flip (half back, half front) | The Reveal |
| `ill_keep` | 🎯 | Checkmark inside a film reel | Keep or Lose |
| `ill_win` | 🏆 | Director's chair with spotlight | Race to Win |

### Decorative / Background Elements (replace emoji scatter on landing screen)

| ID | Current | Replacement |
|----|---------|-------------|
| `deco_clapperboard` | 🎬 | Clapperboard silhouette, 8–12% opacity |
| `deco_film_reel` | 🍿 | Film reel circle silhouette |
| `deco_star` | ⭐🌟 | Five-point cinema star (Hollywood Walk of Fame style) |
| `deco_masks` | 🎭 | Director's chair silhouette |
| `deco_projector` | 🎥 | Vintage projector silhouette |
| `deco_strip` | — | Short film strip segment (3 frames) |

These should be **custom SVG silhouettes**, placed and rotated as the current emoji are, rendered at `rgba(255,255,255, 0.07–0.10)`.

---

## 11. Movie Card Design

The cards are the centrepiece of the game. Both faces must feel like premium playing cards from a collector's edition.

### CardBack (face-down)
- Background: `#0d0820` (darker than bg for depth)
- Outer frame: gold `rgba(245,197,24, 0.50)` border, inset ~9% of card width, proportional radius
- Inner hairline frame: gold `rgba(245,197,24, 0.22)`, inset 4px further
- Centre emblem: `✦ CINE — SCENES ✦` in stacked arrangement, gold at 88% opacity, weight 800
- The emblem is purely typographic — no logo mark on the card back (the logo lives on the landing screen)
- `outlined` variant adds a dashed gold border (used in timeline gap placeholder)

### CardFront (face-up)
- Background: one of 12 dark cinema hues (deterministic from movie ID hash)
  ```
  #6d3014  #4c1247  #0d3b6e  #1a4731  #5c1a1a
  #2d1854  #4a3000  #1a3d2b  #3d1a00  #0a3d62  #2c1654  #1a2e1a
  ```
- Layout top→bottom: director (italic, small) · year (huge, bold — the hero) · title (italic, medium)
- All text white; year at full opacity, director at 75%, title at 90%
- Radial glow overlay: `radial-gradient(ellipse, rgba(255,255,255,0.12) 0%, transparent 68%)`
- Corner icons: 4 small film-strip or aperture icons in the corners (like physical card design)
  - Size: ~7.5% of card width
  - Color: `rgba(255,255,255, 0.15)`
  - Currently missing from the React Native CardFront — should be added

### Card Proportions
- Physical cards: 63mm × 63mm square
- App cards: 80dp wide × 100dp tall (4:5 ratio, portrait) for timeline
- Intro wheel cards: same 72dp × 100dp

---

## 12. Screen Inventory

| Screen | Route | Orientation | Purpose |
|--------|-------|-------------|---------|
| Landing | `/` | Portrait | Entry. Logo + "Let's Play" + "Rules" |
| Play | `/play` | Portrait | Mode choice: physical deck vs. digital |
| Rules | `/rules` | Portrait | 10-slide swipeable tutorial |
| Local Lobby | `/local-lobby` | Portrait | Create/join room; host starts game |
| Scanner | `/scanner` | Landscape | Camera QR scan for physical cards |
| Trailer | `/trailer` | Landscape | Physical card mode: watch trailer |
| Game | `/game` | Landscape (+ Portrait for guess) | Full game loop |

### Game Screen Sub-states
The game screen renders different UI based on turn status and player role:

| State | Who sees it | What happens |
|-------|-------------|--------------|
| `drawing` — all players | Full screen: whose turn / player timelines | Active player taps "Let's Guess" |
| `placing` — trailer playing | Active: trailer + report + "I know it!" button | Observers: waiting screen |
| `placing` — guess screen | Active player only (Portrait) | Name/director input + voice option |
| `placing` — timeline | Active: interactive timeline + floating card back | Observers: non-interactive timeline |
| `challenging` | All non-active: 5s countdown ring + challenge button | Active: locked "Reveal" button |
| `revealing` — flip phase | All: timeline with FlippingMovieCard at placed position | 1.2s card flip animation |
| `revealing` — result phase | All: winner's timeline + result strip + next button | Confetti or TrashCard animation |

---

## 13. Key Components

### CinescenesLogo
SVG clapperboard (52×56 viewBox) + "CINESCENES" wordmark.
- Top bar: gold `#f5c518`, black diagonal stripes, hinge pins
- Board body: dark `#0a0a14`, gold border, gold sprocket holes
- Wordmark: weight 900, gold, letterSpacing 6, gold text-shadow glow
- Props: `iconSize` (default 48), `showWordmark` (default true), `layout` (vertical | horizontal)

### Timeline
Horizontal scroll of cards with gap slots between them.
- Existing cards: `CardFront` at 80×100dp
- Gap (interactive): circular `+` button with gold border
- Gap (selected): dashed card-shaped placeholder with checkmark
- Gap (blocked, challenging): `✕` in danger color
- Gap (observer, placed): `CardBack outlined` or `FlippingMovieCard` during reveal
- Gap (spacer): 20dp invisible spacer

### ScoreBar
Fixed bottom bar on all game screens.
- Horizontal scroll of player chips
- Each chip: `{name} · {card count (gold)} · {coin icon}`
- Active player chip: gold border
- Right: film-strip timeline button (opens "My Timeline" bottom sheet)

### ChallengeTimer
SVG animated countdown ring.
- Duration: 5 seconds
- Ring colour: red `#e63946` → amber `#f5a623` → grey `#555` (at 0%, 60%, 100% elapsed)
- Stroke: 5px, round cap, starts at top (rotated -90°)
- Background ring: `#2a2a3a`
- Children (the challenge button) rendered inside the ring

### CastModal
Landscape-optimised modal for Cast/TV setup.
- Backdrop: `rgba(0,0,0,0.72)`
- Sheet: `surface` bg, `card` radius, max-width 560dp
- Explains screen-mirroring setup

---

## 14. Animation Language

All animations serve narrative purpose. Timings reference:

| Animation | Duration | Easing | Trigger |
|-----------|----------|--------|---------|
| Card flip (timeline reveal) | 600ms | Linear (two-phase: 0→90° back, -90→0° front) | `status → revealing` |
| Card flip (intro wheel) | 600ms | inOut(cubic) | After wheel stops |
| Intro wheel spin | 5500ms | inOut(cubic) | "Let's spin!" tap |
| Highlight card glide to centre | 700ms | out(cubic) | After wheel stops |
| Highlight card scale up | 700ms | out(back 1.1) | With glide |
| Card placement fly | 380ms | — | Confirm placement |
| Confetti burst (28 particles) | 850–1300ms staggered | out(cubic) | Correct placement |
| Trash card fly-off | 700ms (300ms delay) | in(cubic) | Nobody correct |
| Screen transition | Fade | — | All nav via Expo Router |

---

## 15. Emotion-to-Design Mapping

| Moment | Design Response |
|--------|----------------|
| Dark background | Creates cinema atmosphere — the world falls away |
| Gold accents | Signals reward, prestige, what matters most |
| Large year number on CardFront | The moment of truth — nothing else matters |
| Slow card flip animation | Builds anticipation — the audience holds its breath |
| Challenge timer red ring | Danger, urgency, social pressure |
| Confetti burst | Pure joy — the audience erupts |
| Trash card flying off-screen | Comic deflation — theatrical groaning |
| "Let's spin!" wheel | Fate, randomness, ceremony |

---

## 16. What Makes Cinescenes Feel Premium

1. **No emojis in the final product** — every icon is bespoke cinema vocabulary
2. **Cards feel physical** — weight, texture implied by gradients and borders
3. **Gold is never misused** — only on things that are earned or matter
4. **Typography does the heavy lifting** — no decorative fonts, but weight and spacing create sophistication
5. **Darkness is intentional** — the bg is not "dark mode", it is a *cinema*
6. **Motion is slow and deliberate** — no snappy transitions; every animation breathes

---

## 17. Figma Setup Recommendations

### Colour Styles
Create these as named colour styles:
`bg / surface / surfaceHigh / gold / goldFaint / goldGlow / danger / textPrimary / textSub / textMuted / textOnGold / border / borderSubtle`

### Text Styles
Create these as named text styles:
`hero / display / title / subtitle / body / label / overline / caption / micro / wordmark`

### Component Frames (suggested order)
1. Colour palette overview
2. Typography specimen
3. Icon set (all icons at 24dp, shown on dark bg)
4. CardBack + CardFront (all 12 colour variants)
5. FlippingMovieCard (back + front states)
6. Buttons (primary / ghost / gold-outline / disabled)
7. Input fields (idle / focused / error)
8. ChallengeTimer ring (0%, 50%, 100% states)
9. ScoreBar
10. Timeline (empty / with cards / interactive / observer)
11. All screens (Landing → Play → Rules → Lobby → Game states)

### Icon File
Create a dedicated icon component file:
- All icons at 24dp on a `surface` (#1e1630) frame
- Organised in groups: UI / Results / Rules illustrations / Decorative
- Export as SVG for implementation in `react-native-svg`
