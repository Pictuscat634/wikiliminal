export const TILE = 32;
export const VIEW_W = 640;
export const VIEW_H = 360;
export const PLAYER_SPEED = 94; // px/s
export const PLAYER_LIGHT_RADIUS = 64; // weak starter light; later driven by equipment
export const LAMP_RADIUS = 110; // fixed ceiling lamps (Lobby and Levels)
export const TERMINAL_GLOW_RADIUS = 60;
export const DEPTH = { lamps: 1000, darkness: 2000, hud: 3000 };

// --- Wikipedia / Level generation (Phase 2) -------------------------------------------
// The spec's own examples are Japanese Wikipedia articles (深海, 図書館, ...); set to
// 'en' (or any Wikipedia language code) to pull from a different edition instead.
export const WIKI_LANG = 'ja';
// Phase 2 has no article-picker UI yet (that's the Phase 5 Level Management Terminal),
// so the Lobby's No-clip point always leads here first.
export const ENTRY_ARTICLE_TITLE = '深海';
// Bumping this changes every generated Level's seed, even for an unchanged article.
export const GENERATOR_VERSION = 1;
// How many link-hops a chain of Levels can extend before it dead-ends. Raising this
// lets exploration follow article links arbitrarily deep; capped low for now so the
// two-Level chain this phase targets is easy to verify.
export const MAX_CHAIN_DEPTH = 1;
