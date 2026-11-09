import { LIMITS } from "@/lib/text/limits";
import { SERVER_KEY_ENV, type CloudProvider } from "@/lib/llm/providers";

export const KEY_HEADER = "x-provider-key";

/** Responses carry user text, so nothing may cache them. */
export const NO_STORE = { "cache-control": "no-store" };

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export const serverKeysAllowed = () => process.env.LONGHAND_ALLOW_SERVER_KEYS === "true";

/** A key from the request wins. Server keys are only read when explicitly enabled. */
export function resolveKey(request: Request, provider: CloudProvider): string | null {
  const fromRequest = request.headers.get(KEY_HEADER)?.trim();
  if (fromRequest) return fromRequest;
  if (!serverKeysAllowed()) return null;
  return process.env[SERVER_KEY_ENV[provider]] ?? null;
}

/** Reads a JSON body with a size limit, without logging it anywhere. */
export async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > LIMITS.maxRequestChars * 4) {
    return { ok: false, response: jsonResponse({ code: "too-large", message: "That request is too large." }, 413) };
  }
  const raw = await request.text();
  if (raw.length > LIMITS.maxRequestChars * 2) {
    return { ok: false, response: jsonResponse({ code: "too-large", message: "That request is too large." }, 413) };
  }
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, response: jsonResponse({ code: "bad-request", message: "Invalid JSON." }, 400) };
  }
}
