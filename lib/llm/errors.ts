export type ErrorCode = "auth" | "rate-limit" | "unavailable" | "bad-request" | "cancelled" | "unknown";

export type ProviderError = { code: ErrorCode; message: string };

const MESSAGES: Record<ErrorCode, string> = {
  auth: "The provider rejected the API key. Check it in Settings.",
  "rate-limit": "The provider is rate limiting requests. Wait a moment and retry.",
  unavailable: "The model service is unavailable right now. Retry in a moment.",
  "bad-request": "The provider rejected the request. Check the model name in Settings.",
  cancelled: "Cancelled.",
  unknown: "Something went wrong while talking to the model.",
};

function statusOf(error: unknown): number | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const record = current as { statusCode?: unknown; cause?: unknown; lastError?: unknown };
    if (typeof record.statusCode === "number") return record.statusCode;
    current = record.lastError ?? record.cause;
  }
  return undefined;
}

/**
 * Maps any failure to a fixed message. Provider error text is deliberately not passed on, because
 * it can echo keys or the user's text.
 */
export function classifyError(error: unknown): ProviderError {
  const name = (error as { name?: string } | null)?.name ?? "";
  if (name === "AbortError" || name === "TimeoutError") return { code: "cancelled", message: MESSAGES.cancelled };
  const status = statusOf(error);
  let code: ErrorCode = "unknown";
  if (status === 401 || status === 403) code = "auth";
  else if (status === 429) code = "rate-limit";
  else if (status && status >= 500) code = "unavailable";
  else if (status && status >= 400) code = "bad-request";
  else if (error instanceof TypeError || /fetch failed|ECONNREFUSED|ENOTFOUND/i.test(String(error))) code = "unavailable";
  return { code, message: MESSAGES[code] };
}
