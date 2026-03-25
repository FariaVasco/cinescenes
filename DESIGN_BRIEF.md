# Cinescenes — Product Brief
> Complete description of the app, the game, every screen, every state, and every interaction. Written for a designer approaching the product for the first time with full creative freedom.

---

## 1. What Is Cinescenes?

Cinescenes is a **party game about movies** for 2–8 players. Players watch a mystery movie trailer — with the title and year hidden — and must place the film in its correct chronological position on their personal timeline. The first player to collect 10 cards wins.

The game exists in two editions:

- **Physical edition**: A boxed card game. Each physical card has a QR code on the back. Players scan the code with their phone to watch the trailer. The game is played around a shared phone or TV.
- **Digital edition**: Fully app-based. Up to 8 players connect on the same Wi-Fi network. Each player uses their own phone. No physical cards required.

Both editions use the same app. The physical and digital flows diverge early and rejoin at the game screen.

The core tension of the game: *you recognise the film... but was it 1987 or 1994?*

---

## 2. The Emotional Arc

The game is designed around a sequence of distinct emotional beats. Understanding these moments is essential to understanding why the UI is structured the way it is.

| Moment | What's happening | How the player feels |
|--------|-----------------|---------------------|
| Opening the app | The session is about to begin | Anticipation — settling into a cinema seat before the film |
| The trailer starts | A mystery clip plays with no title | Suspense. Total focus on the screen |
| Recognition | A detail clicks — you know this film | Rush of adrenaline. The urge to shout it out |
| "I know it!" | The player commits | Confidence or bluff — others are watching |
| Placing the card | Choosing a slot in the timeline | Strategic tension — second-guessing yourself |
| The challenge window | Other players decide whether to bet against you | Social electricity. Reading the room. Who's confident? Who's nervous? |
| Picking a challenge position | A challenger picks their own slot on your timeline | High stakes — committing real coins |
| The card flips | The year is revealed | The whole room leans in. Revelation. |
| Correct placement | You nailed it | Triumph. Vindication |
| Wrong placement | You got it wrong | Theatrical groan, laughter, the card flies away |
| Challenger wins | Someone else was right | Begrudging respect — and they take your card |
| Reaching 10 cards | Victory | The credits roll on your win |

---

## 3. Brand Identity

### One sentence
> *Cinescenes is a love letter to cinema, disguised as a party game.*

### Personality
- **Cinematic** — serious about film, not about itself. This is a game for people who care about movies.
- **Prestigious** — the feel of a film festival, not a casual quiz app.
- **Tactile** — even on a phone, the experience should feel like handling real cards.
- **Social** — designed for a room full of people. The UI serves the group, not just the individual player.

---

## 4. Complete Game Rules

### Setup
- 2–8 players connect to the same game session
- Each player receives **1 starting card** before the first turn begins. The starting card is dealt face-up (year, title, and director visible) so every player begins with exactly one anchor point in their timeline
- Each player starts with **5 coins**

### The timeline
Each player maintains their own personal timeline — a horizontal row of movie cards arranged in chronological order from left to right (oldest on the left, newest on the right). Cards are placed with gaps between them. The timeline grows as players collect more cards.

### Turn structure
Turns cycle through all players in order. On each turn, one player is the **active player** and all others are **observers**.

**Step 1 — Watch the trailer**
The active player watches a mystery movie trailer. No title, no year, no director is displayed anywhere during playback. The trailer plays from a "safe window" — a portion of the clip that has been pre-screened to avoid any text overlays, title cards, or obvious spoilers.

**Step 2 — "I know it!"**
When the active player recognises the film (or wants to make a guess), they tap "I know it!" to stop the trailer and proceed. In public games, this button only becomes available after watching a minimum portion of the safe window. In private games, it is immediately available.

**Step 3 — Submit a guess**
The active player enters the movie title and director name. Voice input is available — the player can speak the title instead of typing.

**Step 4 — Place the card**
The active player's timeline is shown with interactive gap slots between each existing card. The player selects a gap — indicating which year they think the film belongs in relation to their existing cards — and confirms the placement. A face-down card (back side visible) appears in the chosen gap to mark the pick.

**Step 5 — Challenge window**
Immediately after placement, a 5-second countdown begins for all observers. Each observer independently decides:
- **Challenge** (costs 1 coin): The observer believes the active player placed the card in the wrong position
- **Pass**: The observer does not challenge

Observers cannot challenge if they have 0 coins. The active player waits.

**Step 6 — Sequential picking (if at least one observer challenged)**
Challengers take turns picking their own alternative position on the active player's timeline. This happens one challenger at a time, in the order they joined the game:
- The active player's chosen gap is **blocked** — no one can pick that position
- Each gap can only be picked by one challenger — once claimed, it's blocked for subsequent challengers
- Each challenger's coin visually lands on their chosen gap
- A challenger (except the very first) may **withdraw** before picking — their coin is returned and they forfeit the challenge
- The active player watches as challengers claim positions on their timeline

If nobody challenged, the game skips directly to the reveal.

**Step 7 — The reveal**
The face-down card in the timeline flips to reveal the movie: year, title, and director name are now visible. Every player sees this simultaneously.

**Step 8 — Result**
The correct year is now known. One of three outcomes:

1. **Active player correct** — The active player's chosen position was right (the card belongs between those two years). The card stays in the active player's timeline permanently. If any challenger also happened to pick a correct alternative position, the active player earns 1 bonus coin as a reward for being right while challenged.

2. **Challenger correct** — The active player placed incorrectly, but a challenger picked a correct alternative position. The card is moved to that challenger's timeline. The challenger's coin is returned (no net coin loss). If multiple challengers all picked correct positions, the one whose position was most accurate wins (the gap whose neighbouring years are closest to the film's actual year). If the active player's original position was also technically correct, their coin is refunded but the card still moves to the winning challenger's timeline.

3. **Trash** — Neither the active player nor any challenger placed the card correctly. The card is discarded — it belongs to no one. All challenger coins are lost. The card flies off-screen with an animation.

**Step 9 — Next turn**
Play passes to the next player. The game continues until someone reaches 10 cards.

### Winning
The first player to have 10 cards in their timeline wins the game immediately.

### Coins in detail
Coins are the betting currency of the challenge system:
- Starting amount: 5 coins per player
- **Spend**: 1 coin to challenge on any turn
- **Earn**: 1 bonus coin if you placed correctly and at least one challenger also placed correctly (vindication bonus)
- **Refund**: Coin returned if you withdraw from a challenge (before picking a position) or if the active player placed correctly and you challenged — you lose your coin
- **Win a challenge**: Coin refunded (no net loss) + you receive the card

---

## 5. App Navigation Structure

The app has two separate entry paths (physical vs. digital) that converge at the game screen.

```
Landing
 ├── How to Play (Rules)
 └── Let's Play
      ├── Use Your Deck (physical cards)
      │    └── Scanner → Trailer (standalone)
      └── Go Digital
           ├── Mode Select
           │    ├── Standard (free)
           │    ├── Insane Mode (premium — requires sign-in)
           │    ├── Collections (coming soon)
           │    └── Movie Trivia (coming soon)
           ├── Sign In (if not authenticated, for premium modes)
           └── Local Lobby
                ├── Create game → wait for players → start
                ├── Join game (enter room code) → wait for host
                └── Browse open games → join a public game
                     └── Game Screen (all turns)
                          └── Win Screen
```

---

## 6. Screen-by-Screen Description

### Screen 1 — Landing
**Orientation**: Portrait
**Purpose**: Entry point. First impression of the brand.

**What's on screen:**
- The Cinescenes logo: a clapperboard icon with the wordmark "CINESCENES" beneath it. This is the brand mark.
- A primary call-to-action button: "Let's Play"
- A secondary link: "How to Play"

**Interactions:**
- Tapping "Let's Play" navigates to the Play screen
- Tapping "How to Play" navigates to the Rules screen

---

### Screen 2 — Play (Mode Entry)
**Orientation**: Portrait
**Purpose**: Choose between physical card deck or fully digital play.

**What's on screen:**
- Two large mode options:
  1. **"Use Your Deck"** — for players who own the physical card game. Leads to the camera scanner. Subtitle explains this is for scanning QR codes on physical cards.
  2. **"Go Digital"** — for fully app-based play. Leads to the mode selection screen. Subtitle explains up to 8 players on the same Wi-Fi.

**Interactions:**
- Tapping either option navigates to the corresponding flow

---

### Screen 3 — Rules
**Orientation**: Portrait
**Purpose**: Teach the game to new players. 10 illustrated slides, swipeable.

**Slides (in order):**
1. **Draw a Card** — A card is drawn from the deck each turn. The movie on it is a mystery.
2. **Watch the Clip** — The trailer plays with no title or year shown. Pay attention.
3. **Know It? Say It!** — When you recognise the film, tap "I know it!" and enter the title and director.
4. **Earn Coins** — You start with 5 coins. Use them to challenge other players. Guard them carefully.
5. **Starting Card** — Before the first turn, each player receives one starting card face-up. This is your anchor — the film's year is shown so you know exactly where it sits on your timeline.
6. **Place It Right** — After guessing, place the card in your timeline in the correct chronological position.
7. **Challenge!** — Observers can spend a coin to challenge your placement. If they think you placed it wrong, they pick where they think it belongs.
8. **The Reveal** — The card flips over. The year is shown. Everyone sees if the placement was correct.
9. **Keep or Lose** — Correct placement: you keep the card. Wrong placement but a challenger was right: the challenger takes it. Nobody right: card is trashed.
10. **Race to Win** — First player to collect 10 cards wins.

**Interactions:**
- Swipe left/right between slides
- Progress indicator shows current slide
- Navigation arrows or swipe to advance

---

### Screen 4 — Mode Select
**Orientation**: Portrait
**Purpose**: Choose which game mode to play.

**What's on screen:**
Four mode cards:

1. **Standard** (FREE)
   - Subtitle: 500+ curated movies · Trailer plays on every player's phone
   - Free tier — available to all users

2. **Insane Mode** (PREMIUM — labelled with a star badge)
   - Subtitle: Every movie ever made · Trailer only on host's phone
   - Premium tier — requires subscription
   - Because Insane Mode draws from TMDb's full catalogue of 100,000+ films, trailers only play on the host's device (others would see a waiting screen)

3. **Collections** (COMING SOON — disabled)
   - Subtitle: Christmas · Horror · The 2010s…
   - Themed packs of movies (not yet available)

4. **Movie Trivia** (COMING SOON — disabled)
   - Subtitle: Guess movies from trivia clues
   - Different game mechanic — clues instead of trailers (not yet available)

**Interactions:**
- Tapping Standard → navigates to Local Lobby
- Tapping Insane Mode → triggers sign-in if not authenticated; if authenticated and has premium → navigates to Local Lobby; if no premium → presents paywall
- Coming Soon modes are non-interactive
- A "Restore purchases" or authentication flow may appear if needed

**Paywall (bottom sheet overlay — appears when tapping a premium mode without subscription):**
The paywall presents three subscription options:
- Monthly plan (auto-renewing)
- Annual plan (auto-renewing, typically discounted)
- Lifetime (one-time purchase)

Each option shows the plan name, price, and billing period. Selecting a plan highlights it. A prominent "Get Premium" call-to-action confirms the purchase. Below: "Restore purchases" for existing subscribers, and a dismiss option.

---

### Screen 5 — Sign In
**Orientation**: Portrait
**Purpose**: Authenticate the user to enable premium features.

**What's on screen:**
- Brief explanation of why sign-in is required (to associate purchases with an account)
- Platform-appropriate sign-in button:
  - iOS: "Sign in with Apple"
  - Android: "Sign in with Google"

**Interactions:**
- Tapping the sign-in button triggers native platform authentication
- On success, the user is returned to the premium feature they were trying to access
- A back/dismiss option is available

---

### Screen 6 — Local Lobby
**Orientation**: Portrait
**Purpose**: Create or join a game session before play begins.

The lobby has two sub-flows: **creating** a game and **joining** one.

#### Creating a game

**What's on screen:**
- Display name input — the player's name as it appears to others
- Game visibility toggle:
  - **Private (invite only)**: only players with the room code can join
  - **Public**: the game appears in the public lobby browser for anyone to find and join
- The room code — a short alphanumeric code that joiners enter to find this session
- A list of connected players (including the host)
  - Each player shown by display name
  - The host is marked with a badge
- "Start Game" button (host only; enabled only when 2+ players are connected)

**Interactions:**
- Entering a name + setting visibility → creates the session
- Sharing the room code lets other players join
- As players join, they appear in the list in real time (polled every 2 seconds)
- Only the host can start the game
- The host can cancel and return to mode select

#### Joining a game

**What's on screen:**
- Display name input
- Room code input — enter the code shared by the host
- "Join" button
- "Browse open games" link (navigates to lobby browser for public games)

After joining:
- The player sees the same waiting room: list of all connected players, "Waiting for host to start…"
- The start button is not visible (host only)

---

### Screen 7 — Lobby Browser
**Orientation**: Portrait
**Purpose**: Discover and join public games without a room code.

**What's on screen:**
- A list of currently open public games
- Each entry shows: host's display name, number of players currently in the lobby
- Auto-refreshes every 5 seconds
- Empty state if no public games are open

**Interactions:**
- Tapping a game entry joins it directly (navigates to lobby in joined state)
- Back button to return to lobby

---

### Screen 8 — Scanner (Physical Mode Only)
**Orientation**: Landscape
**Purpose**: Scan the QR code on the back of a physical movie card.

**What's on screen:**
- Live camera viewfinder, full-screen
- A scanning reticle or framing guide
- Brief instruction label ("Scan the QR code on your card")

**Interactions:**
- Camera continuously scans for a QR code
- On successful scan, the app decodes the movie UUID and navigates to the Trailer screen for that specific film
- No manual entry fallback

---

### Screen 9 — Trailer (Physical Mode Only)
**Orientation**: Landscape
**Purpose**: Watch the trailer for the physically scanned card.

**What's on screen:**
- The movie trailer plays, full-screen
- No movie title or year is displayed
- A cast/TV mode button: opens instructions for screen mirroring (AirPlay on iOS, Cast on Android) so the trailer can be shown on a TV instead of a phone screen
- Playback controls may be available

This screen stands alone — there is no multiplayer coordination here. Players huddle around the phone or a cast TV and use the physical cards to manage their own timelines.

---

### Screen 10 — Game Screen
**Orientation**: Landscape (locked)
**Purpose**: The main game loop. All turn phases happen here.

This is the most complex screen in the app. Its content changes dramatically based on the current turn phase and the player's role (active player or observer).

A persistent **Score Bar** is pinned to the bottom of the screen at all times during the game. It shows:
- All players in a horizontally scrollable row
- Each player: their display name, how many cards they have, how many coins they have
- The active player's chip is visually distinguished
- A button to view any player's full timeline

---

## 7. Game Screen — All Sub-states in Detail

### Sub-state A — Starting Card Intro (game start only)

This state plays exactly once, at the very beginning of the game, before the first turn.

**What happens:**
Each player needs to receive their starting card. A **spinning wheel** presents all the starting cards face-down. The player taps "Let's Spin!" and the wheel spins, landing on one card. That card flips over to reveal the starting movie (year, title, and director all visible). This becomes the first card in the player's timeline.

**What's on screen:**
- An animated spinning wheel showing multiple face-down cards arranged in a fan or carousel
- "Let's Spin!" button
- After spinning: the selected card glides to a prominent position and flips face-up
- The revealed starting card shows: director name, year (large and prominent), movie title
- Confirmation to accept the starting card and continue

**Why it matters:**
The starting card is the player's single reference point. It establishes one known year in their timeline. All future placements are made relative to existing cards, so the starting card is the foundation of the whole strategy.

---

### Sub-state B — Drawing Phase

This is the "between turns" state. A turn has just ended (or the game just started) and the next trailer hasn't played yet.

**Active player sees:**
- A label indicating it's their turn
- Their own timeline (all the cards they've collected so far)
- A primary action button: "Let's Guess"
- Score bar at bottom

**Observers see:**
- A label showing whose turn it is: "[Name]'s timeline"
- The active player's full timeline (read-only)
- A "Waiting for [name]…" message
- Their own timeline displayed in a compact collapsible bar at the bottom of the screen, above the score bar:
  - **Collapsed state**: A compact fan of small cards showing only year numbers. A tap anywhere on the bar expands it.
  - **Expanded state**: Full-size cards in a horizontal scroll, showing director, year, and title. A "collapse" button is visible to close it back down.

**Interactions:**
- Active player taps "Let's Guess" → advances to trailer phase
- Observers can expand/collapse their own timeline bar
- Observers can tap the timeline button in the score bar to view any player's full timeline

---

### Sub-state C — Placing: Trailer Phase

The active player is watching the mystery trailer.

**Active player sees:**
- Full-screen movie trailer (no title, no year shown anywhere)
- A floating "I know it! →" button, initially disabled (in public games) then enabled after watching enough of the safe window. In private games, it's immediately enabled.
- A small "report" button to flag the trailer if it's broken, age-restricted, or shows the title

**Observers see:**
- A waiting screen — the trailer is not playing on their device (in private/invite-only games)
- In public games: the trailer plays on all devices simultaneously, the "I know it!" button is absent for observers (they cannot advance the turn)

**What observers see during waiting (private games):**
- A message: "[Name] is watching the trailer…"
- No video, no audio
- They are simply waiting

**Interactions:**
- Active player taps "I know it! →" → advances to Guess phase
- Active player taps Report → submits a flag and the turn may be skipped or retried

---

### Sub-state D — Placing: Guess Phase

The active player submits their guess for the movie.

**What's on screen:**
- A text field for the movie title
- A text field for the director's name
- A voice input button — tapping it activates speech recognition. The player speaks the title and it is transcribed into the title field
- A "Submit" or confirm button

**Context:**
The player may already be confident or may be bluffing. Both fields are required before submission can proceed.

**After submission:**
Navigates to the Timeline Placement phase.

---

### Sub-state E — Placing: Timeline Phase

The active player selects where in their timeline the mystery card belongs.

**What the active player sees:**
- Their full timeline displayed as a horizontal scroll
- Between every pair of adjacent cards (and at each end), there is an interactive **gap slot** — a visual indicator that can be tapped to select that position
- When a gap is tapped, it becomes "selected" — it expands and shows a face-down card outline in that position, indicating "I want to place the card here"
- A confirm/checkmark button appears when a gap is selected
- The card to be placed is face-down (its contents are hidden until the reveal)

**Gap slot states:**
- **Default / available**: A small interactive affordance between cards, inviting a tap
- **Selected**: Expanded to card size, showing a face-down card outline with a visual indicator that this is the player's pick. A "confirm" checkmark is available.

**What observers see:**
- The active player's timeline with the face-down card already in its chosen gap (after the active player confirms)
- The gap is marked with a label like "your pick" (to the active player) or "[name]'s pick" (to observers)
- Non-interactive — observers cannot move the card

**Interactions:**
- Active player taps a gap → selects it
- Active player taps confirm → locks the placement and advances to the challenge window

---

### Sub-state F — Challenging Phase

After the active player confirms placement, the challenge window opens.

#### Phase 1 — Decision (all observers simultaneously)

**What each observer sees:**
- The active player's timeline with the face-down card in its chosen position
- A prominent countdown timer — 5 seconds, visually counting down (ring animation, progress bar, or other mechanism)
- Two buttons: **"Challenge"** and **"Pass"**
- Their current coin count is visible — they need at least 1 coin to challenge

**After deciding:**
- Observer who challenged: sees "You challenged! Waiting for others…"
- Observer who passed: sees "You passed. Waiting for others…"
- Observer with 0 coins: cannot challenge (button disabled or hidden)

**What the active player sees:**
- "Waiting for everyone…"
- The timeline with their chosen placement visible

**When the decision phase ends:**
- The 5 seconds expire OR all observers have decided — whichever comes first
- If nobody challenged: skip directly to the Reveal phase
- If at least one challenged: proceed to Phase 2

#### Phase 2 — Sequential Picking (challengers pick positions one by one)

Challengers are resolved in the order they joined the game.

**What each player sees depends on their status:**

**Active player:**
- "Challengers are picking…"
- Their timeline with the chosen placement visible
- As each challenger picks, their coin visually lands on the chosen gap
- The active player cannot interact

**Observer — waiting for their turn:**
- "[Name] is picking their position…"
- The timeline visible (read-only)
- Can see previously placed challenger coins

**Observer — it's their turn to pick:**
- The timeline is interactive
- The active player's chosen gap is **blocked** — visually marked with an X or similar — it cannot be picked
- Gaps already claimed by earlier challengers are also blocked
- Available gaps can be tapped
- If this observer is not the first challenger, a "Withdraw" button is available — tapping it cancels their challenge and refunds their coin (they then see "You withdrew")
- After picking: their coin appears in the chosen gap, status becomes "Coin placed. Waiting for others…"

**Observer — already picked:**
- "Coin placed. Waiting for others…"
- Can see the timeline with all coins placed so far

**Observer — withdrew:**
- "You withdrew."
- No further interaction

---

### Sub-state G — Revealing: Flip Phase

All players see the same screen simultaneously.

**What's on screen:**
- The active player's timeline
- The mystery card is in its placed position, still face-down
- After a brief moment, the card **flips over** — a 3D rotation animation reveals the front face
- The front face shows: director name (small), year (very large and prominent), movie title (large)

This is the most dramatic moment of each turn. All players see the year revealed at the same time.

---

### Sub-state H — Revealing: Result Phase

After the flip, the outcome is determined and announced.

**What's on screen:**
- The timeline with the now face-up card visible
- A result strip or overlay announcing the outcome:

**Outcome 1 — Active player correct:**
- Announcement: "[Name] got it right!"
- If any challenger also placed correctly: "[Name] earns a bonus coin" (the active player placed correctly while being challenged)
- The card remains in the active player's timeline
- For the active player: a confetti animation if they placed correctly

**Outcome 2 — Challenger wins:**
- Announcement: "[Name] was right! Card goes to [challenger's name]'s timeline"
- The card visually moves from the active player's timeline to the challenger's
- If multiple challengers were correct, the most accurate one (closest surrounding years) wins; others are announced as refunded
- If the active player was also correct by a different measure, this is noted (e.g., "[Name] also had it right — coin refunded")
- The winning challenger's coin is shown being returned

**Outcome 3 — Trash:**
- Announcement: "Nobody got it right"
- The card flies off-screen in an animation — it rises and spins out of the frame
- The slot collapses, closing the gap in the timeline
- All challenger coins are lost

**Common to all outcomes:**
- A "Next →" button to proceed to the next turn (visible to all players, but only the active player — or any player once all have acknowledged — can advance, depending on implementation)
- The score bar updates to reflect any new card counts and coin changes

---

### Sub-state I — Win Screen

Triggered when a player reaches 10 cards.

**What's on screen:**
- The winner's name, prominently displayed
- A trophy or victory graphic
- Options to: play again (return to lobby) or go home (return to landing)

---

## 8. The Movie Cards

Cards are the central object of the game. There are two faces:

**Face down (CardBack):**
The back of every card looks the same — a uniform design that reveals nothing about the movie. This is the mystery state. Used:
- During the intro wheel (before spinning)
- As the placeholder in the timeline during placement and the challenge window
- As observers' "your pick" indicator
- Everywhere the movie identity is hidden

**Face up (CardFront):**
Revealed only at the moment of the flip. Shows:
- Director name (supporting, contextual)
- Release year (dominant — the most important piece of information)
- Movie title (prominent)
- Each card has a visual identity based on its decade — the era of the film influences the card's appearance

**The flip animation:**
A 3D card-flip animation transitions from the back face to the front face. This is the moment of truth — designed to be dramatic and impossible to miss.

---

## 9. Game Modes in Detail

### Standard Mode (free)
- Pool of 500+ curated movies, each with a pre-screened safe trailer window
- Trailer plays on every player's phone simultaneously
- Available to all users without a subscription

### Insane Mode (premium)
- Draws from TMDb's full catalogue — every movie ever catalogued (100,000+)
- Random movie selected each turn from the full database
- Trailer plays only on the host's device (the player who created the game)
- Other players see a waiting screen while the trailer plays
- This is because: the movie pool is so vast that many films have no pre-screened safe window; the trailer must be reviewed live before play, so it makes more sense for one device to display it (typically cast to a TV for the group)
- Premium subscription required

### Collections (coming soon)
- Themed packs: Christmas movies, horror, a specific decade, director retrospectives, etc.
- Premium

### Movie Trivia (coming soon)
- Instead of trailers, players receive text-based clues (genre, award nominations, cast members) and must guess the movie from the clues
- Different skill set — no need to recognise a trailer

---

## 10. Public vs. Private Games

Every game session has a visibility setting chosen by the host when creating the game:

**Private (invite only):**
- Game does not appear in the lobby browser
- Only players with the room code can join
- Trailer plays only on the active player's device (others see a waiting screen for who is watching)
- The typical mode for a group of friends playing together in the same room — the trailer is cast to a shared TV or viewed on one phone

**Public:**
- Game appears in the public lobby browser — anyone can find and join
- Trailer plays on every player's device simultaneously
- Designed for remote play, or for players who want to open their session to strangers

---

## 11. Supporting Systems

### Voice Input
During the Guess phase, the active player can use voice input instead of typing:
- A microphone button activates speech recognition
- The player speaks the movie title
- The spoken words are transcribed into the title input field
- Useful in a noisy party environment or when hands are otherwise occupied

### Reporting a Trailer
During the Trailer phase, a small report button is available. Tapping it flags the current trailer as problematic (broken link, age-restricted, shows title text, or otherwise unusable). The report is submitted silently; the movie is marked in the database for review and will not be dealt again.

### Casting to TV
Available in the physical card Trailer screen (and potentially in game):
- A cast button opens a modal explaining how to mirror the phone screen to a TV
- iOS: AirPlay to Apple TV or AirPlay-compatible TV
- Android: Google Cast / Chromecast
- This allows the group to watch the trailer on a shared screen rather than crowding around a phone

### The Collapsible Timeline Bar (observers during drawing phase)
Observers have their own growing timeline but during the drawing phase they are viewing the active player's timeline. Their own timeline is accessible via a compact bar at the bottom of the screen:
- In collapsed state: a narrow bar showing small year-number-only cards arranged in a fan, indicating how many cards the observer has and their rough chronological spread
- Tapping the bar expands it into a full horizontal scroll of complete cards (director, year, title all visible)
- A collapse button returns it to the compact state
- This allows observers to reference their own timeline without losing sight of the active player's

---

## 12. Complete Screen & State Inventory

| Screen / State | Who sees it | When |
|----------------|-------------|------|
| Landing | Everyone | App open |
| Rules | Everyone | Tapping "How to Play" |
| Play (mode entry) | Everyone | Tapping "Let's Play" |
| Mode Select | Everyone entering digital play | After "Go Digital" |
| Sign In | Unauthenticated users | Attempting premium mode |
| Paywall | Authenticated non-premium users | Attempting premium mode |
| Local Lobby — creating | Game creator | After choosing a mode |
| Local Lobby — waiting | All players after joining | Before host starts |
| Lobby Browser | Anyone | "Browse open games" link |
| Scanner | Physical deck players | "Use Your Deck" |
| Trailer (standalone) | Physical deck players | After scanning a card |
| Game — Starting Card Intro | All players | Game start, one-time |
| Game — Drawing Phase (active) | Active player | Between turns |
| Game — Drawing Phase (observer) | All observers | Between turns |
| Game — Trailer Phase (active) | Active player | After "Let's Guess" |
| Game — Trailer Phase (observer, private) | All observers in private games | During trailer playback |
| Game — Trailer Phase (observer, public) | All observers in public games | Trailer plays on all devices |
| Game — Guess Phase | Active player only | After "I know it!" |
| Game — Timeline Placement (active) | Active player | After submitting guess |
| Game — Timeline Placement (observer) | All observers | After active player places |
| Game — Challenge: Decision (observer) | All observers | 5s window after placement |
| Game — Challenge: Decision (active) | Active player | Same 5s window |
| Game — Challenge: Picking (my turn) | Each challenger in sequence | Sequential picking phase |
| Game — Challenge: Picking (waiting) | Non-current challengers + active player | Between each pick |
| Game — Reveal: Flip Phase | All players | After all picks confirmed |
| Game — Reveal: Result Phase | All players | After card flip |
| Win Screen | All players | When someone reaches 10 cards |
