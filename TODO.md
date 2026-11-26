# WIKILIMINAL — status

## Phase 1: written, NOT yet run or type-checked
- [x] Phaser 3 + TS + Vite scaffold
- [x] Tile-based oblique top-down Lobby, procedural placeholder pixel art
- [x] Player (protective suit), 4-direction movement, grid collision with wall sliding
- [x] Wall-occluded visibility (ray polygons), weak player light, flickering fluorescent lamps
- [x] localStorage persistence wrapper (`systems/storage.ts`), player position autosaves + resumes on reload
- [ ] First run: `npm install && npm run typecheck && npm run dev`, then tune light radii/falloff/flicker

## Phase 2: written, NOT yet run or type-checked
- [x] Wikipedia client (`net/wikipedia.ts`): REST summary + action API links/categories, both
      CORS-enabled via `origin=*`, cached through `systems/storage.ts`, with an offline fallback
      dataset so the game still works with no network. **Unverified against the live API** —
      this sandbox has no network access, so it has only been reviewed, not run, against real
      Wikipedia. Watch the browser console on first run for CORS or response-shape errors.
- [x] Deterministic seeded Level generator (`world/levelgen.ts`): seeded random-walk corridor
      carve, back/forward No-clip spots, 1-3 "echo" signs drawn from the article's own title/
      category/extract, a coarse keyword→palette pick (aqua/industrial/default)
- [x] `ExploreScene`: generic scene for any Wikipedia-based Level, reused for every hop in a chain
- [x] Lobby → one fixed entry article (深海) → its first link (海洋学) → back, back — a real
      two-Level connected chain per the Phase 2 goal, plus a back-to-Lobby No-clip
- [x] Chain depth capped at 1 hop (`MAX_CHAIN_DEPTH`) so the Phase 2 goal is easy to verify;
      the mechanism itself already supports deeper chains if the cap is raised later

## Known limitations / next
- Visibility is ray-marched (200 rays, 2px step); very thin corner gaps can leak a pixel.
- Darkness texture is world-sized; make it view-sized before large Levels.
- No "explored area" memory yet (darkness fully re-hides left areas).
- Terminal ("NEW EXPLORER REGISTERED", locker) is placed but not interactive.
- Lobby side rooms are empty shells; facilities arrive in Phase 5.
- No article-picker UI yet — the entry article is a fixed constant (`ENTRY_ARTICLE_TITLE`).
  Discovery methods B (random passages) and part of A (player-chosen article) are deferred.
- Level layout is a single carved corridor, not rooms — fine for proving the chain works,
  worth revisiting for variety once Phase 2 is confirmed working in a real browser.
- Sign text is a flat always-same reveal at proximity; true "readable only under light"
  (SAN, equipment-driven radius) comes with Phase 3.
- Not started: SAN, artifacts, CCTV, sharing.
- Persistence is localStorage only, per-browser, per-device. Artifacts, inventory and SAN
  (Phases 3-4) should save through the same `systems/storage.ts` wrapper. A real backend/database
  (the spec's shared Levels, Phase 7) will need a server component beyond what Pages alone provides —
  Cloudflare D1 or KV via a Pages Function would be the natural next step when that's built.
