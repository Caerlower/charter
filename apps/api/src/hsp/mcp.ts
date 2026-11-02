import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "../config.js";

const REQUIRED_TOOLS = [
  "get_chain_config",
  "create_order",
  "get_order",
  "prepare_payment",
  "finalize_payment",
  "estimate_fee",
  "submit_payment",
  "query_payment",
] as const;

export type HspToolName = (typeof REQUIRED_TOOLS)[number];

let clientPromise: Promise<Client> | null = null;

function looksLikeCloudflareBlock(msg: string): boolean {
  return /cloudflare|cf-ray|attention required|sorry, you have been blocked|error code: 1\d{3}/i.test(
    msg,
  );
}

function mcpConnectHint(detail: string): string {
  if (looksLikeCloudflareBlock(detail) || /fetch failed|ECONNRESET|403|1010/i.test(detail)) {
    return (
      `HSP MCP blocked or unreachable (${config.hspMcpUrl}). ` +
      `Confirm IP allowlisting with HSP Ops (egress IP), then restart API. Detail: ${detail}`
    );
  }
  return `HSP MCP connect failed (${config.hspMcpUrl}). Detail: ${detail}`;
}

function parseToolJson(result: {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}): unknown {
  if (result.isError) {
    const msg =
      result.content?.map((c) => c.text).filter(Boolean).join("\n") || "HSP MCP tool error";
    throw new Error(msg);
  }
  if (result.structuredContent !== undefined) return result.structuredContent;
  const text = result.content?.find((c) => c.type === "text" && c.text)?.text;
  if (!text) return result;
  if (looksLikeCloudflareBlock(text) || text.trimStart().startsWith("<!DOCTYPE")) {
    throw new Error(mcpConnectHint(text.slice(0, 280)));
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Drop cached client so the next call reconnects (after allowlist / outage). */
export function resetHspMcpClient() {
  clientPromise = null;
}

export async function getHspMcpClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = new Client({ name: "charter", version: "0.1.0" });
      const transport = new StreamableHTTPClientTransport(new URL(config.hspMcpUrl));
      try {
        await client.connect(transport);
      } catch (err) {
        clientPromise = null;
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(mcpConnectHint(msg));
      }
      return client;
    })();
  }
  return clientPromise;
}

export async function listHspTools(): Promise<string[]> {
  const client = await getHspMcpClient();
  const listed = await client.listTools();
  return listed.tools.map((t) => t.name);
}

export async function assertHspTools(): Promise<string[]> {
  const names = await listHspTools();
  const missing = REQUIRED_TOOLS.filter((t) => !names.includes(t));
  if (missing.length) {
    throw new Error(`HSP MCP missing tools: ${missing.join(", ")}. Available: ${names.join(", ")}`);
  }
  return names;
}

export async function callHspTool<T = unknown>(
  name: HspToolName | string,
  args: Record<string, unknown> = {},
): Promise<T> {
  try {
    const client = await getHspMcpClient();
    const result = await client.callTool({ name, arguments: args });
    return parseToolJson(result as Parameters<typeof parseToolJson>[0]) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      looksLikeCloudflareBlock(msg) ||
      /connect failed|blocked or unreachable|ECONNRESET|fetch failed|Not connected/i.test(msg)
    ) {
      resetHspMcpClient();
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}

export async function probeHspMcp(): Promise<{
  ok: boolean;
  url: string;
  tools?: string[];
  error?: string;
}> {
  try {
    const tools = await assertHspTools();
    return { ok: true, url: config.hspMcpUrl, tools };
  } catch (err) {
    return {
      ok: false,
      url: config.hspMcpUrl,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
