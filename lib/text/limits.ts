export const LIMITS = {
  scanWords: 20_000,
  rewriteWords: 5_000,
  rewriteMinWords: 20,
  refineWords: 120,
  chunkWords: 450,
  /** Rough cap on a single request, enforced by the routes. */
  maxRequestChars: 40_000,
} as const;
