/**
 * Optional second opinions from commercial detectors, using the user's own key. Their results are
 * shown next to Longhand's score and never blended into it.
 */
export type ExternalResult = {
  detector: "sapling" | "pangram" | "gptzero";
  /** Probability or share of AI, from 0 to 1. */
  score: number;
  label: string;
};

type FetchLike = typeof fetch;

const httpError = (status: number) => Object.assign(new Error(`Detector returned ${status}`), { statusCode: status });

export async function detectSapling(text: string, apiKey: string, signal?: AbortSignal, f: FetchLike = fetch): Promise<ExternalResult> {
  const res = await f("https://api.sapling.ai/api/v1/aidetect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: apiKey, text }),
    signal,
  });
  if (!res.ok) throw httpError(res.status);
  const body = (await res.json()) as { score: number; verdict?: string };
  return { detector: "sapling", score: body.score, label: body.verdict ?? "" };
}

const PANGRAM_BASE = "https://text.external-api.pangram.com/task";
const PANGRAM_POLLS = 30;

export async function detectPangram(
  text: string,
  apiKey: string,
  signal?: AbortSignal,
  f: FetchLike = fetch,
  waitMs = 1000,
): Promise<ExternalResult> {
  const headers = { "content-type": "application/json", "x-api-key": apiKey };
  const created = await f(PANGRAM_BASE, {
    method: "POST",
    headers,
    body: JSON.stringify({ text, public_dashboard_link: false }),
    signal,
  });
  if (!created.ok) throw httpError(created.status);
  const { task_id: taskId } = (await created.json()) as { task_id: string };
  for (let poll = 0; poll < PANGRAM_POLLS; poll++) {
    const res = await f(`${PANGRAM_BASE}/${encodeURIComponent(taskId)}`, { headers, signal });
    if (!res.ok) throw httpError(res.status);
    const body = (await res.json()) as { stage: string; fraction_ai?: number; prediction_short?: string };
    if (body.stage === "STAGE_SUCCESS") {
      return { detector: "pangram", score: body.fraction_ai ?? 0, label: body.prediction_short ?? "" };
    }
    if (body.stage === "STAGE_FAILED") throw httpError(502);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw httpError(504);
}

/**
 * GPTZero's docs could not be read during research (they render client-side), so this follows
 * third-party descriptions of the API and has not been run against the real service.
 */
export async function detectGptZero(text: string, apiKey: string, signal?: AbortSignal, f: FetchLike = fetch): Promise<ExternalResult> {
  const res = await f("https://api.gptzero.me/v2/predict/text", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ document: text }),
    signal,
  });
  if (!res.ok) throw httpError(res.status);
  const body = (await res.json()) as {
    documents?: { completely_generated_prob?: number; predicted_class?: string }[];
  };
  const document = body.documents?.[0];
  if (typeof document?.completely_generated_prob !== "number") throw httpError(502);
  return { detector: "gptzero", score: document.completely_generated_prob, label: document.predicted_class ?? "" };
}

export const EXTERNAL_DETECTOR_LABELS: Record<ExternalResult["detector"], string> = {
  sapling: "Sapling",
  pangram: "Pangram",
  gptzero: "GPTZero",
};
