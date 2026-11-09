/** Small weighted logistic regression and the metrics used by calibration and evaluation. */

export type Fit = {
  intercept: number;
  weights: Record<string, number>;
  mean: Record<string, number>;
  std: Record<string, number>;
};

export function fitLogistic(
  rows: Record<string, number>[],
  labels: number[],
  sampleWeights: number[],
  names: readonly string[],
  { l2 = 0.01, iterations = 4000, rate = 0.3 } = {},
): Fit {
  const totalWeight = sampleWeights.reduce((a, b) => a + b, 0);
  const mean: Record<string, number> = {};
  const std: Record<string, number> = {};
  for (const name of names) {
    mean[name] = rows.reduce((s, r, i) => s + sampleWeights[i] * r[name], 0) / totalWeight;
    const variance = rows.reduce((s, r, i) => s + sampleWeights[i] * (r[name] - mean[name]) ** 2, 0) / totalWeight;
    std[name] = Math.sqrt(variance) || 1;
  }
  const x = rows.map((r) => names.map((n) => (r[n] - mean[n]) / std[n]));
  const beta = new Array<number>(names.length).fill(0);
  let intercept = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    let gradIntercept = 0;
    const grad = new Array<number>(names.length).fill(0);
    for (let i = 0; i < x.length; i++) {
      const z = intercept + x[i].reduce((s, v, j) => s + v * beta[j], 0);
      const error = sampleWeights[i] * (1 / (1 + Math.exp(-z)) - labels[i]);
      gradIntercept += error;
      for (let j = 0; j < names.length; j++) grad[j] += error * x[i][j];
    }
    intercept -= (rate * gradIntercept) / totalWeight;
    for (let j = 0; j < names.length; j++) beta[j] -= rate * (grad[j] / totalWeight + l2 * beta[j]);
  }
  return {
    intercept,
    weights: Object.fromEntries(names.map((n, j) => [n, beta[j]])),
    mean,
    std,
  };
}

/** Rank-based, handling ties; O(n log n). */
export function auroc(positive: number[], negative: number[]): number {
  if (!positive.length || !negative.length) return Number.NaN;
  const all = [
    ...positive.map((v) => ({ v, p: 1 })),
    ...negative.map((v) => ({ v, p: 0 })),
  ].sort((a, b) => a.v - b.v);
  let rankSum = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (all[k].p) rankSum += rank;
    i = j + 1;
  }
  return (rankSum - (positive.length * (positive.length + 1)) / 2) / (positive.length * negative.length);
}

/** The value below which `q` of the sorted values fall. */
export function quantile(values: number[], q: number): number {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

export const rateAtOrAbove = (values: number[], threshold: number) =>
  values.length ? values.filter((v) => v >= threshold).length / values.length : Number.NaN;
