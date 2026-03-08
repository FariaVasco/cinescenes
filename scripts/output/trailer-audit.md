# Cinescenes — Trailer Audit  (2026-03-01)

> Read-only audit. No database changes were made.

## Summary

| Category | Count |
|----------|------:|
| ✅ Official / already correct | 12 |
| ⬆️  Unofficial → better trailer found on TMDb | 3 |
| ⚠️  Unofficial, no TMDb alternative | 0 |
| 🚫 Broken / unavailable video | 1 |
| ❌ No trailer stored | 0 |
| 🔎 Not found on TMDb | 0 |
| **TOTAL** | **16** |

---

## ⬆️  Unofficial → Better Trailer Available (3)

These movies have unofficial (fan-upload / aggregator) trailers stored. TMDb has a better official alternative.
Run `node scripts/scan-trailer.js --tmdb-id <ID> --update` to switch and compute safe intervals.

### The Godfather (1972)
*Francis Ford Coppola*

**Current**
- YouTube: https://youtu.be/sY1S34973zA
- Channel: Fan-Made Film Trailers — unofficial
- Safe window: 8s – 57s (already scanned)

**Best TMDb alternative**
- "Original Trailer"  |  1080p  |  official  |  published 2012-03-27
- YouTube: https://youtu.be/8V2k2YQEQJ4
- TMDb ID: 238  →  `node scripts/scan-trailer.js --tmdb-id 238 --update`

<details><summary>All TMDb options</summary>

| # | Name | Quality | Official | Published | YouTube |
|---|------|---------|----------|-----------|---------|
| ★ | Original Trailer | 1080p | ✅ | 2012-03-27 | [link](https://youtu.be/8V2k2YQEQJ4) |
| 2 | 50th Anniversary Trailer | 2160p | ✅ | 2022-01-13 | [link](https://youtu.be/Ew9ngL1GZvs) |

</details>

### Alien (1979)
*Ridley Scott*

**Current**
- YouTube: https://youtu.be/jQ5lPt9edzQ
- Channel: Rotten Tomatoes Trailers — unofficial
- Safe window: 43s – 100s (already scanned)

**Best TMDb alternative**
- "Throwback Trailer"  |  1080p  |  official  |  published 2014-06-20
- YouTube: https://youtu.be/L2VWfWC-wI4
- TMDb ID: 348  →  `node scripts/scan-trailer.js --tmdb-id 348 --update`

<details><summary>All TMDb options</summary>

| # | Name | Quality | Official | Published | YouTube |
|---|------|---------|----------|-----------|---------|
| ★ | Throwback Trailer | 1080p | ✅ | 2014-06-20 | [link](https://youtu.be/L2VWfWC-wI4) |
| 2 | #TBT Trailer | 1080p | ✅ | 2018-04-12 | [link](https://youtu.be/MNZPs5AKibU) |
| 3 | Modern Trailer | 1080p | ✅ | 2020-10-16 | [link](https://youtu.be/sVwH0hIvV5k) |
| 4 | 2024 Modern Trailer | 2160p | ❌ | 2023-12-11 | [link](https://youtu.be/bM01Al2SWx4) |

</details>

### The Silence of the Lambs (1991)
*Jonathan Demme*

**Current**
- YouTube: https://youtu.be/RuX2MQeb8UM
- Channel: Mark's Movie Trailers — unofficial
- Safe window: 1s – 45s (already scanned)

**Best TMDb alternative**
- "UK Re-release Trailer"  |  1080p  |  official  |  published 2017-10-25
- YouTube: https://youtu.be/gSQciiKhqXc
- TMDb ID: 274  →  `node scripts/scan-trailer.js --tmdb-id 274 --update`

<details><summary>All TMDb options</summary>

| # | Name | Quality | Official | Published | YouTube |
|---|------|---------|----------|-----------|---------|
| ★ | UK Re-release Trailer | 1080p | ✅ | 2017-10-25 | [link](https://youtu.be/gSQciiKhqXc) |
| 2 | Back in Cinemas Official Trailer | 1080p | ✅ | 2021-10-06 | [link](https://youtu.be/Msigx2eqO6s) |
| 3 | Official Trailer | 1080p | ✅ | 2023-05-08 | [link](https://youtu.be/6iB21hsprAQ) |

</details>

---

## 🚫  Broken / Unavailable Videos (1)

The stored YouTube ID returned an error (deleted, private, or age-restricted). These need a new trailer.

| Title | Year | Director | Stored YouTube ID | TMDb ID | Best TMDb Option |
|-------|------|----------|-------------------|---------|-----------------|
| Pulp Fiction | 1994 | Quentin Tarantino | `dlWokErY4VA` | 680 | [Official Trailer](https://youtu.be/tGpTpVyI_OQ) |

---

## ✅  Official / Already Correct (12)

<details><summary>Expand full list</summary>

| Title | Year | YouTube | Channel | Safe Window |
|-------|------|---------|---------|-------------|
| Star Wars | 1977 | [link](https://youtu.be/vZ734NWnAHA) | (in TMDb official list) | 15s–45s |
| Raiders of the Lost Ark | 1981 | [link](https://youtu.be/0xQSIdSRlAk) | (in TMDb official list) | 34s–70s |
| E.T. the Extra-Terrestrial | 1982 | [link](https://youtu.be/wZNInG8kSiA) | (in TMDb official list) | 34s–93s |
| Back to the Future | 1985 | [link](https://youtu.be/ez6WQ7IX72U) | (in TMDb official list) | 1s–32s |
| Die Hard | 1988 | [link](https://youtu.be/gYWvwkXreaI) | (in TMDb official list) | 20s–67s |
| GoodFellas | 1990 | [link](https://youtu.be/Zll4cjyk6sU) | (in TMDb official list) | 0s–60s |
| Groundhog Day | 1993 | [link](https://youtu.be/86jI-u2zp7s) | Sony Pictures Entertainment | 7s–37s |
| Schindler's List | 1993 | [link](https://youtu.be/mxphAlJID9U) | (in TMDb official list) | 40s–95s |
| The Matrix | 1999 | [link](https://youtu.be/tGgCqGm_6Hs) | Warner Bros. Rewind | 48s–96s |
| Gladiator | 2000 | [link](https://youtu.be/P5ieIbInFpg) | (in TMDb official list) | 1s–45s |
| The Dark Knight | 2008 | [link](https://youtu.be/TQfATDZY5Y4) | (in TMDb official list) | 12s–62s |
| Inception | 2010 | [link](https://youtu.be/Qwe6qXFTdgc) | Warner Bros. Entertainment | 24s–54s |

</details>

---

## Next Steps

### 1. Upgrade unofficial trailers
For each movie in the "Unofficial → Better Available" section, run:
```bash
node scripts/scan-trailer.js --tmdb-id <ID> --update
```
This downloads the trailer, transcribes it with Whisper, runs visual analysis, and writes the safe window to Supabase.

### 2. Fix broken trailers
Use the TMDb IDs listed in the "Broken" section. Same command as above.

### 3. Manually flag no-alternative unofficials
For the "Unofficial — No Alternative" group, either:
- Find a better YouTube URL and run: `node scripts/scan-trailer.js --youtube-id <YT_ID> --movie "Title" --year YYYY --update`
- Or mark those movies as `flagged=true` in Supabase to exclude from the game deck.