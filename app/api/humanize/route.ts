import { humanizeChunk } from "@/lib/humanize/pipeline";
import type { PipelineEvent } from "@/lib/humanize/types";
import { cloudGenerate } from "@/lib/llm/cloud";
import { classifyError } from "@/lib/llm/errors";
import { humanizeSchema } from "@/lib/server/schemas";
import { jsonResponse, NO_STORE, readJsonBody, resolveKey } from "@/lib/server/security";

const CLOUD_CONCURRENCY = 2;

/** Rewrites one chunk and streams progress as newline-delimited JSON. Stores and logs nothing. */
export async function POST(request: Request): Promise<Response> {
  const read = await readJsonBody(request);
  if (!read.ok) return read.response;
  const parsed = humanizeSchema.safeParse(read.body);
  if (!parsed.success) return jsonResponse({ code: "bad-request", message: "Invalid request." }, 400);
  const { chunk, provider, ...options } = parsed.data;

  const apiKey = resolveKey(request, provider.id);
  if (!apiKey) return jsonResponse({ code: "auth", message: "Add an API key in Settings." }, 401);

  const generate = cloudGenerate(provider.id, provider.model, apiKey);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: PipelineEvent | { type: "error"; code: string; message: string }) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The client went away; the abort signal stops the work.
        }
      };
      try {
        await humanizeChunk(
          generate,
          chunk,
          { ...options, engine: "prompt", concurrency: CLOUD_CONCURRENCY },
          send,
          request.signal,
        );
      } catch (error) {
        const { code, message } = classifyError(error);
        send({ type: "error", code, message });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a disconnect.
        }
      }
    },
  });

  return new Response(stream, {
    headers: { ...NO_STORE, "content-type": "application/x-ndjson; charset=utf-8" },
  });
}
