import { CLOUD_PROVIDERS, SERVER_KEY_ENV } from "@/lib/llm/providers";
import { jsonResponse, serverKeysAllowed } from "@/lib/server/security";

/**
 * Tells the client which providers work without a key. Never returns the keys themselves.
 * Reading the request keeps this route dynamic, so it reflects the deployment's environment
 * rather than whatever was set at build time.
 */
export async function GET(request: Request): Promise<Response> {
  void request.headers.get("accept");
  const allowed = serverKeysAllowed();
  return jsonResponse({
    serverKeys: Object.fromEntries(
      CLOUD_PROVIDERS.map((provider) => [provider, allowed && Boolean(process.env[SERVER_KEY_ENV[provider]])]),
    ),
  });
}
