/**
 * Anything that can answer "is this pixel position solid?". Satisfied by both the
 * hand-authored Lobby's TileGrid and the infinite, chunk-generated Level grid, so
 * Player collision and the lighting raycaster work with either.
 */
export interface SolidGrid {
  isSolidPx(x: number, y: number): boolean;
}
