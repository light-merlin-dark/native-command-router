#!/usr/bin/env node
import { spawn } from "node:child_process";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1] ?? "";
  if (key?.startsWith("--")) args.set(key, value);
}

const BASE_PATH = args.get("--path") ?? process.cwd();
const QUERY = args.get("--query") ?? "";
const MAX_RESULTS = Number(args.get("--max-results") ?? "200");
const TIMEOUT_MS = Number(args.get("--timeout-ms") ?? "20000");
const SCAN_WAIT_MS = Number(args.get("--scan-wait-ms") ?? "120000");
const FFF_BIN = args.get("--bin") ?? process.env.FFF_MCP_BIN ?? "fff-mcp";

if (!QUERY) {
  console.error("fff-find-helper: missing --query");
  process.exit(2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class McpClient {
  private proc;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private buffer = "";

  constructor(bin: string, basePath: string) {
    this.proc = spawn(bin, ["--no-warmup", basePath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    this.proc.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
    this.proc.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`mcp exited code=${code} signal=${signal}`));
      }
      this.pending.clear();
    });
  }

  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");

    while (true) {
      const idx = this.buffer.indexOf("\n");
      if (idx === -1) return;

      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;

      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }

      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
    }
  }

  request(method: string, params: Record<string, unknown>): Promise<any> {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }, TIMEOUT_MS);

      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  async init(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "ncr", version: "0.1.0" },
    });
    this.notify("notifications/initialized", {});
    await this.request("tools/list", {});
  }

  async callTool(name: string, toolArgs: Record<string, unknown>): Promise<any> {
    return this.request("tools/call", { name, arguments: toolArgs });
  }

  close(): void {
    this.proc.kill("SIGTERM");
  }
}

function normalizeFileLine(line: string): string {
  return line
    .replace(/\s+-\s+(hot|warm|frequent)(?:\s+git:[a-z_,]+)?$/, "")
    .replace(/\s+git:[a-z_,]+$/, "")
    .trim();
}

function parseFileMatches(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "").trim();
    if (!line) continue;
    if (line === "0 matches.") continue;
    if (/^\d+\/\d+ matches shown$/.test(line)) continue;
    if (line.startsWith("→ Read ")) continue;
    if (line.startsWith("! ")) continue;
    if (line.startsWith("cursor: ")) continue;
    out.push(normalizeFileLine(line));
  }
  return out;
}

async function waitUntilIndexed(cli: McpClient): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < SCAN_WAIT_MS) {
    const probe = await cli.callTool("find_files", { query: "AGENTS", maxResults: 1 });
    const text = probe?.content?.[0]?.text ?? "";
    if (!text.includes("(0 indexed)")) return;
    await sleep(80);
  }
  throw new Error(`scan timeout after ${SCAN_WAIT_MS}ms`);
}

async function main(): Promise<void> {
  const cli = new McpClient(FFF_BIN, BASE_PATH);
  try {
    await cli.init();
    await waitUntilIndexed(cli);
    const res = await cli.callTool("find_files", { query: QUERY, maxResults: MAX_RESULTS });
    const text = res?.content?.[0]?.text ?? "";
    const lines = parseFileMatches(text);
    for (const line of lines) {
      process.stdout.write(`${line}\n`);
    }
    process.exit(lines.length > 0 ? 0 : 1);
  } catch (err) {
    console.error(`fff-find-helper: ${(err as Error).message}`);
    process.exit(2);
  } finally {
    cli.close();
  }
}

await main();
