import calibration from "./data/calibration.json";
import type { Band, StyleFeatures } from "./types";

export type LinearModel = {
  intercept: number;
  weights: Record<string, number>;
  mean: Record<string, number>;
  std: Record<string, number>;
  thresholds: { likelyAi: number; likelyHuman: number };
};

const clampProbability = (p: number) => Math.min(1 - 1e-6, Math.max(1e-6, p));

export const logit = (p: number) => {
  const q = clampProbability(p);
  return Math.log(q / (1 - q));
};

export const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export function applyModel(model: LinearModel, values: Record<string, number>): number {
  let sum = model.intercept;
  for (const [name, weight] of Object.entries(model.weights)) {
    const std = model.std[name] || 1;
    sum += (weight * ((values[name] ?? 0) - (model.mean[name] ?? 0))) / std;
  }
  return sigmoid(sum);
}

const deepModel = calibration.deep as LinearModel;
const quickModel = calibration.quick as LinearModel;

/** Classifier scores for the windows are averaged in logit space, so one window cannot dominate. */
export function pooledClassifierScore(scores: number[]): number {
  if (scores.length === 0) return 0;
  return sigmoid(scores.reduce((sum, s) => sum + logit(s), 0) / scores.length);
}

export function fuseDeep(classifierScore: number, features: StyleFeatures): number {
  return applyModel(deepModel, { ...features, classifierLogit: logit(classifierScore) });
}

export function fuseQuick(features: StyleFeatures): number {
  return applyModel(quickModel, features);
}

export function bandFor(score: number, mode: "quick" | "deep"): Band {
  const { thresholds } = mode === "deep" ? deepModel : quickModel;
  if (score >= thresholds.likelyAi) return "likely-ai";
  if (score < thresholds.likelyHuman) return "likely-human";
  return "unclear";
}

export const CALIBRATION_VERSION = calibration.version;
