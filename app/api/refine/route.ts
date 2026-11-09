import { refineSentence } from "@/lib/humanize/refine";
import { cloudGenerate } from "@/lib/llm/cloud";
import { classifyError } from "@/lib/llm/errors";
import { refineSchema } from "@/lib/server/schemas";
import { jsonResponse, readJsonBody, resolveKey } from "@/lib/server/security";

export async function POST(request: Request): Promise<Response> {
  const read = await readJsonBody(request);
  if (!read.ok) return read.response;
  const parsed = refineSchema.safeParse(read.body);
  if (!parsed.success) return jsonResponse({ code: "bad-request", message: "Invalid request." }, 400);
  const { provider, ...input } = parsed.data;

  const apiKey = resolveKey(request, provider.id);
  if (!apiKey) return jsonResponse({ code: "auth", message: "Add an API key in Settings." }, 401);

  try {
    const generate = cloudGenerate(provider.id, provider.model, apiKey);
    const alternatives = await refineSentence(generate, input, request.signal);
    return jsonResponse({ alternatives });
  } catch (error) {
    const { code, message } = classifyError(error);
    return jsonResponse({ code, message }, code === "auth" ? 401 : code === "rate-limit" ? 429 : 502);
  }
}
