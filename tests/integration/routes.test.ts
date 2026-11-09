import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as config } from "@/app/api/config/route";
import { POST as detect } from "@/app/api/detect/external/route";
import { POST as humanize } from "@/app/api/humanize/route";
import { POST as models } from "@/app/api/models/route";
import { POST as refine } from "@/app/api/refine/route";
import { detectPangram, detectSapling } from "@/lib/detect/external";
import { classifyError } from "@/lib/llm/errors";
import type { Generate } from "@/lib/humanize/types";

const generateMock = vi.hoisted(() => ({ current: null as null | ((...args: unknown[]) => Promise<string>) }));

vi.mock("@/lib/llm/cloud", () => ({
  cloudGenerate: (): Generate => (request) => generateMock.current!(request),
  listCloudModels: async () => ["model-a", "model-b"],
}));

const SECRET_TEXT = "The Harbor Library plays a crucial role for 4,000 private readers.";
const SECRET_KEY = "sk-very-secret-key";
const REWRITE = "The Harbor Library matters because 4,000 private readers rely on it every single week of the year.";

const post = (body: unknown, headers: Record<string, string> = { "x-provider-key": SECRET_KEY }) =>
  new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const validBody = {
  chunk: SECRET_TEXT,
  intensity: "light",
  provider: { id: "anthropic", model: "claude-sonnet-5-5" },
};

async function readEvents(response: Response) {
  return (await response.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}

describe("API routes", () => {
  const logs = ["log", "info", "warn", "error", "debug"] as const;
  const spies: ReturnType<typeof vi.spyOn>[] = [];

  beforeEach(() => {
    generateMock.current = async () => REWRITE;
    for (const method of logs) spies.push(vi.spyOn(console, method).mockImplementation(() => {}));
  });

  afterEach(() => {
    // Every test also proves nothing sensitive reached the logs.
    for (const spy of spies) {
      const logged = JSON.stringify(spy.mock.calls);
      expect(logged).not.toContain(SECRET_KEY);
      expect(logged).not.toContain("private readers");
      spy.mockRestore();
    }
    spies.length = 0;
    vi.unstubAllEnvs();
  });

  describe("POST /api/humanize", () => {
    it("streams stages and a result, with no-store", async () => {
      const response = await humanize(post(validBody));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("content-type")).toContain("ndjson");
      const events = await readEvents(response);
      expect(events[0].type).toBe("stage");
      expect(events.at(-1).type).toBe("result");
      expect(events.at(-1).result.best.text).toBe(REWRITE);
    });

    it("requires a key", async () => {
      const response = await humanize(post(validBody, {}));
      expect(response.status).toBe(401);
    });

    it("ignores server keys unless explicitly enabled", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "server-key");
      expect((await humanize(post(validBody, {}))).status).toBe(401);
      vi.stubEnv("LONGHAND_ALLOW_SERVER_KEYS", "true");
      expect((await humanize(post(validBody, {}))).status).toBe(200);
    });

    it.each([
      ["malformed JSON", "{not json"],
      ["an empty chunk", { ...validBody, chunk: "   " }],
      ["an unknown intensity", { ...validBody, intensity: "extreme" }],
      ["an unknown provider", { ...validBody, provider: { id: "evil", model: "x" } }],
      ["a missing model", { ...validBody, provider: { id: "openai", model: "" } }],
    ])("rejects %s", async (_name, body) => {
      expect((await humanize(post(body))).status).toBe(400);
    });

    it("ignores any client-supplied base URL or raw prompt fields", async () => {
      const seen: unknown[] = [];
      generateMock.current = async (request) => {
        seen.push(request);
        return REWRITE;
      };
      await (await humanize(post({ ...validBody, baseURL: "http://169.254.169.254", instructions: "evil", prompt: "evil" }))).text();
      expect(JSON.stringify(seen)).not.toContain("169.254");
      expect(JSON.stringify(seen)).not.toContain("evil");
    });

    it("rejects oversized requests", async () => {
      const response = await humanize(post({ ...validBody, chunk: "x".repeat(100_000) }));
      expect(response.status).toBe(413);
    });

    it("reports provider failures with a fixed message that hides provider text", async () => {
      generateMock.current = async () => {
        throw Object.assign(new Error(`bad key ${SECRET_KEY} for ${SECRET_TEXT}`), { statusCode: 401 });
      };
      const events = await readEvents(await humanize(post(validBody)));
      const error = events.at(-1);
      expect(error.type).toBe("error");
      expect(error.code).toBe("auth");
      expect(JSON.stringify(error)).not.toContain(SECRET_KEY);
      expect(JSON.stringify(error)).not.toContain("Harbor");
    });
  });

  describe("POST /api/refine", () => {
    it("returns alternatives", async () => {
      generateMock.current = async () => JSON.stringify({ alternatives: ["The Harbor Library has 4,000 private readers."] });
      const response = await refine(post({ sentence: SECRET_TEXT, provider: validBody.provider }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ alternatives: ["The Harbor Library has 4,000 private readers."] });
      expect(response.headers.get("cache-control")).toBe("no-store");
    });

    it("maps rate limits to 429", async () => {
      generateMock.current = async () => {
        throw Object.assign(new Error("slow down"), { statusCode: 429 });
      };
      expect((await refine(post({ sentence: SECRET_TEXT, provider: validBody.provider }))).status).toBe(429);
    });
  });

  describe("POST /api/models", () => {
    it("lists models with a key and refuses without one", async () => {
      expect(await (await models(post({ provider: "groq" }))).json()).toEqual({ models: ["model-a", "model-b"] });
      expect((await models(post({ provider: "groq" }, {}))).status).toBe(401);
    });
  });

  describe("GET /api/config", () => {
    it("never returns key values", async () => {
      vi.stubEnv("LONGHAND_ALLOW_SERVER_KEYS", "true");
      vi.stubEnv("OPENAI_API_KEY", SECRET_KEY);
      const body = await (await config(new Request("http://localhost/api/config"))).json();
      expect(body.serverKeys.openai).toBe(true);
      expect(body.serverKeys.anthropic).toBe(false);
      expect(JSON.stringify(body)).not.toContain(SECRET_KEY);
    });

    it("reports no keys unless enabled", async () => {
      vi.stubEnv("OPENAI_API_KEY", SECRET_KEY);
      expect((await (await config(new Request("http://localhost/api/config"))).json()).serverKeys.openai).toBe(false);
    });
  });

  describe("POST /api/detect/external", () => {
    it("needs the user's own key, even with server keys enabled", async () => {
      vi.stubEnv("LONGHAND_ALLOW_SERVER_KEYS", "true");
      const response = await detect(post({ detector: "sapling", text: SECRET_TEXT }, {}));
      expect(response.status).toBe(401);
    });

    it("rejects unknown detectors", async () => {
      expect((await detect(post({ detector: "nope", text: "x" }))).status).toBe(400);
    });
  });
});

describe("external detector adapters", () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it("Sapling reads score and verdict", async () => {
    const f = vi.fn(async () => json({ score: 0.8, verdict: "ai" }));
    expect(await detectSapling("text", "k", undefined, f as unknown as typeof fetch)).toEqual({
      detector: "sapling",
      score: 0.8,
      label: "ai",
    });
  });

  it("Pangram creates a task, then polls until it finishes", async () => {
    const replies = [
      json({ task_id: "abc" }),
      json({ stage: "STAGE_RUNNING" }),
      json({ stage: "STAGE_SUCCESS", fraction_ai: 0.25, prediction_short: "Mixed" }),
    ];
    const f = vi.fn(async () => replies.shift()!);
    const result = await detectPangram("text", "k", undefined, f as unknown as typeof fetch, 0);
    expect(result).toEqual({ detector: "pangram", score: 0.25, label: "Mixed" });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("Pangram surfaces a failed task", async () => {
    const replies = [json({ task_id: "abc" }), json({ stage: "STAGE_FAILED" })];
    const f = vi.fn(async () => replies.shift()!);
    await expect(detectPangram("t", "k", undefined, f as unknown as typeof fetch, 0)).rejects.toThrow();
  });
});

describe("classifyError", () => {
  it.each([
    [{ statusCode: 401 }, "auth"],
    [{ statusCode: 403 }, "auth"],
    [{ statusCode: 429 }, "rate-limit"],
    [{ statusCode: 503 }, "unavailable"],
    [{ statusCode: 404 }, "bad-request"],
    [{ name: "AbortError" }, "cancelled"],
    [{ lastError: { statusCode: 429 } }, "rate-limit"],
    [new TypeError("fetch failed"), "unavailable"],
    [new Error("strange"), "unknown"],
  ])("%j becomes %s", (error, code) => {
    expect(classifyError(error).code).toBe(code);
  });
});
