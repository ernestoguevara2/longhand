import { listCloudModels } from "@/lib/llm/cloud";
import { classifyError } from "@/lib/llm/errors";
import { modelsSchema } from "@/lib/server/schemas";
import { jsonResponse, readJsonBody, resolveKey } from "@/lib/server/security";

export async function POST(request: Request): Promise<Response> {
  const read = await readJsonBody(request);
  if (!read.ok) return read.response;
  const parsed = modelsSchema.safeParse(read.body);
  if (!parsed.success) return jsonResponse({ code: "bad-request", message: "Invalid request." }, 400);

  const apiKey = resolveKey(request, parsed.data.provider);
  if (!apiKey) return jsonResponse({ code: "auth", message: "Add an API key in Settings." }, 401);

  try {
    return jsonResponse({ models: await listCloudModels(parsed.data.provider, apiKey, request.signal) });
  } catch (error) {
    const { code, message } = classifyError(error);
    return jsonResponse({ code, message }, code === "auth" ? 401 : 502);
  }
}
