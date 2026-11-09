import { detectGptZero, detectPangram, detectSapling } from "@/lib/detect/external";
import { classifyError } from "@/lib/llm/errors";
import { externalDetectSchema } from "@/lib/server/schemas";
import { jsonResponse, KEY_HEADER, readJsonBody } from "@/lib/server/security";

/** A stateless relay for detectors that do not allow browser requests. Needs the user's own key. */
export async function POST(request: Request): Promise<Response> {
  const read = await readJsonBody(request);
  if (!read.ok) return read.response;
  const parsed = externalDetectSchema.safeParse(read.body);
  if (!parsed.success) return jsonResponse({ code: "bad-request", message: "Invalid request." }, 400);

  const apiKey = request.headers.get(KEY_HEADER)?.trim();
  if (!apiKey) return jsonResponse({ code: "auth", message: "Add this detector's API key in Settings." }, 401);

  const { detector, text } = parsed.data;
  const run = { sapling: detectSapling, pangram: detectPangram, gptzero: detectGptZero }[detector];
  try {
    return jsonResponse(await run(text, apiKey, request.signal));
  } catch (error) {
    const { code, message } = classifyError(error);
    return jsonResponse({ code, message }, code === "auth" ? 401 : code === "rate-limit" ? 429 : 502);
  }
}
