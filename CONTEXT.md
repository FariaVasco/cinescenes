# Cinescenes — Project Context (paste this into any new AI session)

## What is Cinescenes?

A Hitster-inspired party game for movies. Players watch a movie trailer (no title shown) and try to place the movie chronologically in their personal timeline. First to 10 cards wins.

## Tech Stack

- React Native + Expo (iOS + Android)
- Expo Router (file-based routing)
- Zustand (global state)
- Supabase (PostgreSQL, polling-based sync — no realtime)
- expo-speech-recognition (voice input)
- react-native-webview + react-native-youtube-iframe (trailer playback)

## Design System

### Colors
```
bg           #100a20   — deep dark purple-navy (main background)
surface      #1e1630   — cards, panels, inputs
surfaceHigh  #2a1f4a   — modals, elevated panels

gold         #f5c518   — primary brand accent (IMDb-inspired)
goldFaint    rgba(245,197,24,0.12)
goldGlow     rgba(245,197,24,0.25)

danger       #e63946

textPrimary  #ffffff
textSub      #a0a0b0
textMuted    #66667a
textOnGold   #0a0a0a

border       rgba(255,255,255,0.10)
borderSubtle rgba(255,255,255,0.06)
```

### Border Radius
```
xs=6  sm=10  md=12  btn=16  card=20  full=999
```

### Font Size
```
micro=9  xs=11  sm=12  base=14  md=16  lg=18  xl=22  2xl=28  hero=40
```

### Spacing
```
xs=4  sm=8  md=16  lg=24  xl=32
```

## Component Inventory

| Component | Description |
|-----------|-------------|
| `CardBack` | Face-down movie card. Dark bg `#100a20`, 4 corner film icons, centered logo. Props: width, height, outlined? |
| `CardFront` | Face-up movie card. Dark colour per movie (12 hues). Layout: director italic 8pt / year 44pt bold / title italic 10pt. Props: movie, width, height |
| `FlippingMovieCard` | 3D flip animation: CardBack → CardFront. autoFlip starts on mount. Props: movie, width, height, autoFlip? |
| `Timeline` | Horizontal scroll of cards + gap slots. Gaps are tappable `+` (interactive), `✕` (blocked), or spacers. |
| `ChallengeTimer` | SVG countdown ring (red→amber→grey). Wraps the Challenge button. |
| `TrailerPlayer` | YouTube iframe. Plays safe_start→safe_end window. |
| `ScoreBar` | Bottom bar showing all players: name / card count (gold) / 🪙coins |

### Card front colour palette (12 dark hues, assigned by hash of movie.id)
```
#6d3014  #4c1247  #0d3b6e  #1a4731  #5c1a1a
#2d1854  #4a3000  #1a3d2b  #3d1a00  #0a3d62  #2c1654  #1a2e1a
```

## UI Pattern Reference

```
Primary button:  gold bg, R.btn radius, textOnGold, weight 900
Ghost button:    1px white/20 border, white/6 bg, textSub
Gold outline:    1.5px gold border, gold/12 bg, gold text
Input field:     white/7 bg, 1px white/15 border, R.md radius
Overline label:  gold, xs, weight 700, letterSpacing 1.5-2.5, uppercase
```

## Game Turn Flow

```
drawing → placing → challenging → revealing → complete
```

- **Drawing**: whose turn it is; active player taps "Let's Guess"
- **Placing**: trailer plays; active player clicks "I know it!" → portrait screen for name guess + voice input → places card in timeline
- **Challenging**: 5s window; other players spend 1 coin to challenge; reveal button unlocks after 5.5s
- **Revealing**: card flips in active player's timeline (1.2s), then shows winner's timeline + result
- **Complete**: `handleNextTurn` advances to next player

## Coin Economy

- Start: 2 coins each
- Earn: correct placement + exact movie title + exact director (all three required)
- Spend: 1 coin to challenge (non-refundable)
- 0 coins → challenge disabled (timer still runs, auto-passes at 5s)

## Screen Orientations

- Portrait: intro / loading / guess input screen
- Landscape: all actual gameplay screens

## Database Schema (simplified)

```sql
movies(id, title, year, director, youtube_id, safe_start, safe_end, poster_url, flagged, active)
games(id, name, mode, multiplayer_type, status, game_code)
players(id, game_id, display_name, coins, timeline int[])
turns(id, game_id, active_player_id, movie_id, placed_interval, status)
challenges(id, turn_id, challenger_id, interval_index, resolved_at)
```

## What's Been Built

- ✅ Full digital local multiplayer game loop
- ✅ Physical card mode (QR scan via app)
- ✅ Custom movie card components (CardBack/CardFront/FlippingMovieCard)
- ✅ Animated spinning wheel intro
- ✅ 5-second challenge timer with SVG countdown ring
- ✅ Coin economy (spend to challenge, earn by naming movie+director)
- ✅ Voice input for movie name guess (device STT + Groq LLaMA interpretation)
- ✅ Card flip reveal animation in timeline
- ✅ Confetti burst (correct) + trash card animation (nobody correct)
- ✅ Report system for bad trailers
- ✅ "My Timeline" modal (bottom sheet with CardFront cards)
- ✅ AI trailer safe-zone scanner (Phase 2 Node.js pipeline)
- ✅ 521 curated movies (active=false, pending Phase 2 scan)

## What's Planned / Parking Lot

- Cast/TV mode (screen mirroring support) — partially built
- Online multiplayer (across devices/locations)
- Bidding mode (variable coin bids instead of fixed 1)
- Physical card scanning
- "Insane mode" (full TMDb database)
