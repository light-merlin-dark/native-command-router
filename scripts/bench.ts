#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { HOME } from "./lib/paths";

type BenchResult = {
  name: string;
  runs: number;
  warmup: number;
  minMs: number;
  medianMs: number;
  meanMs: number;
  maxMs: number;
  failures: number;
  command: string;
};

const argv = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i];
  const v = process.argv[i + 1] ?? "";
  if (k?.startsWith("--")) argv.set(k, v);
}

const TARGET_PATH = path.resolve(argv.get("--path") ?? process.cwd());
const GREP_QUERY = argv.get("--grep-query") ?? "TODO";
const FILE_QUERY = argv.get("--file-query") ?? "ts";
const RUNS = Number(argv.get("--runs") ?? "7");
const WARMUP = Number(argv.get("--warmup") ?? "2");

function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function runShell(cmd: string): Promise<number> {
  const start = process.hrtime.bigint();
  return new Promise((resolve) => {
    const p = spawn("/bin/zsh", ["-lc", cmd], {
      stdio: ["ignore", "ignore", "ignore"],
      env: process.env,
    });

    p.on("error", () => resolve(Number(process.hrtime.bigint() - start) / 1e6));
    p.on("exit", () => resolve(Number(process.hrtime.bigint() - start) / 1e6));
  });
}

function runShellWithCode(cmd: string): Promise<{ ms: number; code: number }> {
  const start = process.hrtime.bigint();
  return new Promise((resolve) => {
    const p = spawn("/bin/zsh", ["-lc", cmd], {
      stdio: ["ignore", "ignore", "ignore"],
      env: process.env,
    });

    p.on("error", () => resolve({ ms: Number(process.hrtime.bigint() - start) / 1e6, code: 2 }));
    p.on("exit", (code) => resolve({ ms: Number(process.hrtime.bigint() - start) / 1e6, code: code ?? 1 }));
  });
}

async function commandExists(cmd: string): Promise<boolean> {
  const r = await runShellWithCode(`command -v ${cmd} >/dev/null 2>&1`);
  return r.code === 0;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function summary(samples: number[]): { min: number; median: number; mean: number; max: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((acc, n) => acc + n, 0) / sorted.length;
  return {
    min: sorted[0] ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    mean,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

async function bench(name: string, cmd: string): Promise<BenchResult> {
  for (let i = 0; i < WARMUP; i++) {
    await runShell(cmd);
  }

  const samples: number[] = [];
  let failures = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = await runShellWithCode(cmd);
    samples.push(r.ms);
    if (r.code !== 0) failures += 1;
  }

  const s = summary(samples);
  return {
    name,
    runs: RUNS,
    warmup: WARMUP,
    minMs: s.min,
    medianMs: s.median,
    meanMs: s.mean,
    maxMs: s.max,
    failures,
    command: cmd,
  };
}

function printTable(title: string, rows: BenchResult[]): void {
  console.log(`\n${title}`);
  console.log("name                             median_ms  mean_ms   min_ms    max_ms    failures");
  for (const row of rows) {
    const line = [
      row.name.padEnd(32),
      row.medianMs.toFixed(3).padStart(9),
      row.meanMs.toFixed(3).padStart(8),
      row.minMs.toFixed(3).padStart(9),
      row.maxMs.toFixed(3).padStart(9),
      String(row.failures).padStart(9),
    ].join("  ");
    console.log(line);
  }
}

async function main(): Promise<void> {
  const legacyHelperDir = path.join(HOME, ".local", "share", "cmd-bridge", "bin");
  const ncrHelperDir = path.join(HOME, ".local", "share", "ncr", "bin");
  const grepHelper = (await pathExists(path.join(ncrHelperDir, "grep-fff-helper.mjs")))
    ? path.join(ncrHelperDir, "grep-fff-helper.mjs")
    : path.join(legacyHelperDir, "grep-fff-helper.mjs");
  const findHelper = (await pathExists(path.join(ncrHelperDir, "fff-find-helper.mjs")))
    ? path.join(ncrHelperDir, "fff-find-helper.mjs")
    : path.join(legacyHelperDir, "fff-find-helper.mjs");

  const hasRg = await commandExists("rg");
  const hasFd = await commandExists("fd");
  const hasFff = await commandExists("fff-mcp");
  const hasGrepHelper = await pathExists(grepHelper);
  const hasFindHelper = await pathExists(findHelper);

  const grepCmds: Array<{ name: string; cmd: string; enabled: boolean }> = [
    {
      name: "native-grep",
      cmd: `/usr/bin/grep -R -n --fixed-strings ${q(GREP_QUERY)} ${q(TARGET_PATH)} >/dev/null`,
      enabled: true,
    },
    {
      name: "rg-fixed",
      cmd: `rg --line-number --fixed-strings ${q(GREP_QUERY)} ${q(TARGET_PATH)} >/dev/null`,
      enabled: hasRg,
    },
    {
      name: "bridge-grep",
      cmd: `NCR_ENABLE_FFF_GREP=1 grep -R -n --fixed-strings ${q(GREP_QUERY)} ${q(TARGET_PATH)} >/dev/null`,
      enabled: true,
    },
    {
      name: "fff-direct-grep-helper",
      cmd: `node ${q(grepHelper)} --path ${q(TARGET_PATH)} --query ${q(GREP_QUERY)} --line-number 1 >/dev/null`,
      enabled: hasFff && hasGrepHelper,
    },
  ];

  const fileCmds: Array<{ name: string; cmd: string; enabled: boolean }> = [
    {
      name: "native-find+grep",
      cmd: `/usr/bin/find ${q(TARGET_PATH)} -type f | /usr/bin/grep -i ${q(FILE_QUERY)} >/dev/null`,
      enabled: true,
    },
    {
      name: "rg-files+grep",
      cmd: `rg --files ${q(TARGET_PATH)} | /usr/bin/grep -i ${q(FILE_QUERY)} >/dev/null`,
      enabled: hasRg,
    },
    {
      name: "fd-query",
      cmd: `fd -i ${q(FILE_QUERY)} ${q(TARGET_PATH)} >/dev/null`,
      enabled: hasFd,
    },
    {
      name: "bridge-find+grep",
      cmd: `find ${q(TARGET_PATH)} -type f | /usr/bin/grep -i ${q(FILE_QUERY)} >/dev/null`,
      enabled: true,
    },
    {
      name: "fff-direct-find-helper",
      cmd: `node ${q(findHelper)} --path ${q(TARGET_PATH)} --query ${q(FILE_QUERY)} --max-results 200 >/dev/null`,
      enabled: hasFff && hasFindHelper,
    },
  ];

  console.log("ncr benchmark");
  console.log(`- path: ${TARGET_PATH}`);
  console.log(`- grep query: ${GREP_QUERY}`);
  console.log(`- file query: ${FILE_QUERY}`);
  console.log(`- runs: ${RUNS} (warmup ${WARMUP})`);
  console.log(`- rg available: ${hasRg}`);
  console.log(`- fd available: ${hasFd}`);
  console.log(`- fff-mcp available: ${hasFff}`);

  const grepRows: BenchResult[] = [];
  for (const c of grepCmds) {
    if (!c.enabled) continue;
    grepRows.push(await bench(c.name, c.cmd));
  }

  const fileRows: BenchResult[] = [];
  for (const c of fileCmds) {
    if (!c.enabled) continue;
    fileRows.push(await bench(c.name, c.cmd));
  }

  printTable("Grep Benchmark", grepRows);
  printTable("File Search Benchmark", fileRows);

  console.log("\nnotes");
  console.log("- bridge-grep routes to FFF only for the supported recursive literal subset.");
  console.log("- direct FFF helper timings include MCP process startup and indexing wait each run.");
  console.log("- for hot-path FFF timings, use a persistent daemon session benchmark.");
}

await main();
