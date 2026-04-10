#!/usr/bin/env bun
import { spawn } from "node:child_process";

const argv = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1] ?? "";
  if (key?.startsWith("--")) argv.set(key, value);
}

const BIN = argv.get("--bin") ?? "fff-mcp";
const BASE_PATH = argv.get("--path") ?? process.cwd();
const TOOL = argv.get("--tool") ?? "find_files";
const QUERY = argv.get("--query") ?? "server";
const ITERS = Number(argv.get("--iters") ?? "10");
const MAX_RESULTS = Number(argv.get("--max-results") ?? "20");
const MODE = argv.get("--mode") ?? "warm"; // warm | cold
const NO_WARMUP = (argv.get("--no-warmup") ?? "1") === "1";
const TIMEOUT_MS = Number(argv.get("--timeout-ms") ?? "15000");
const SCAN_WAIT_MS = Number(argv.get("--scan-wait-ms") ?? "120000");

class McpClient {
  private proc;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private buffer = "";

  constructor(bin: string, basePath: string, noWarmup: boolean) {
    const args: string[] = [];
    if (noWarmup) args.push("--no-warmup");
    args.push(basePath);

    this.proc = spawn(bin, args, {
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
    if (!this.proc.killed) this.proc.kill("SIGTERM");
  }
}

function summary(samples: number[]): { min: number; median: number; mean: number; max: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return {
    min: sorted[0] ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    mean,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilIndexed(cli: McpClient): Promise<number> {
  const start = Date.now();
  while (Date.now() - start < SCAN_WAIT_MS) {
    const probe = await cli.callTool("find_files", { query: "AGENTS", maxResults: 1 });
    const text = probe?.content?.[0]?.text ?? "";
    if (!text.includes("(0 indexed)")) return Date.now() - start;
    await sleep(80);
  }
  throw new Error(`scan timeout after ${SCAN_WAIT_MS}ms`);
}

async function runWarm(): Promise<void> {
  const cli = new McpClient(BIN, BASE_PATH, NO_WARMUP);
  try {
    const tInit = process.hrtime.bigint();
    await cli.init();
    const initMs = Number(process.hrtime.bigint() - tInit) / 1e6;
    const scanWaitMs = await waitUntilIndexed(cli);

    const samples: number[] = [];
    for (let i = 0; i < ITERS; i++) {
      const t0 = process.hrtime.bigint();
      await cli.callTool(TOOL, { query: QUERY, maxResults: MAX_RESULTS });
      samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }

    const s = summary(samples);
    console.log(`mode=warm`);
    console.log(`tool=${TOOL}`);
    console.log(`query=${QUERY}`);
    console.log(`iters=${ITERS}`);
    console.log(`init_ms=${initMs.toFixed(3)}`);
    console.log(`scan_wait_ms=${scanWaitMs}`);
    console.log(`min_ms=${s.min.toFixed(3)}`);
    console.log(`median_ms=${s.median.toFixed(3)}`);
    console.log(`mean_ms=${s.mean.toFixed(3)}`);
    console.log(`max_ms=${s.max.toFixed(3)}`);
  } finally {
    cli.close();
  }
}

async function runCold(): Promise<void> {
  const samples: number[] = [];
  for (let i = 0; i < ITERS; i++) {
    const t0 = process.hrtime.bigint();
    const cli = new McpClient(BIN, BASE_PATH, NO_WARMUP);
    try {
      await cli.init();
      await waitUntilIndexed(cli);
      await cli.callTool(TOOL, { query: QUERY, maxResults: MAX_RESULTS });
    } finally {
      cli.close();
    }
    samples.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const s = summary(samples);
  console.log(`mode=cold`);
  console.log(`tool=${TOOL}`);
  console.log(`query=${QUERY}`);
  console.log(`iters=${ITERS}`);
  console.log(`min_ms=${s.min.toFixed(3)}`);
  console.log(`median_ms=${s.median.toFixed(3)}`);
  console.log(`mean_ms=${s.mean.toFixed(3)}`);
  console.log(`max_ms=${s.max.toFixed(3)}`);
}

if (MODE === "cold") {
  await runCold();
} else {
  await runWarm();
}
