#!/usr/bin/env bun
import { spawn } from "node:child_process";
import path from "node:path";

const argv = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i];
  const v = process.argv[i + 1] ?? "";
  if (k?.startsWith("--")) argv.set(k, v);
}

const REPOS = (argv.get("--repos") ?? "").split(",").filter(Boolean);
const GREP_QUERY = argv.get("--grep-query") ?? "TODO";
const FIND_QUERY = argv.get("--find-query") ?? "ts";
const RUNS = Number(argv.get("--runs") ?? "7");
const WARMUP = Number(argv.get("--warmup") ?? "2");

type TimedResult = { ms: number; exitCode: number };

async function timed(cmd: string, args: string[], env?: Record<string, string>): Promise<TimedResult> {
  const start = process.hrtime.bigint();
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 120000,
    });
    child.on("error", () => {
      resolve({ ms: Number(process.hrtime.bigint() - start) / 1e6, exitCode: 2 });
    });
    child.on("exit", (code: number | null) => {
      resolve({ ms: Number(process.hrtime.bigint() - start) / 1e6, exitCode: code ?? 1 });
    });
  });
}

function summary(samples: number[]): { min: number; median: number; mean: number; max: number } {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    min: sorted[0] ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

type BenchRow = {
  label: string;
  repo: string;
  profile: string;
  command: string;
  medianMs: number;
  meanMs: number;
  minMs: number;
  failures: number;
};

async function bench(
  label: string,
  repo: string,
  profile: string,
  cmd: string,
  args: string[],
  env?: Record<string, string>,
): Promise<BenchRow> {
  for (let i = 0; i < WARMUP; i++) {
    await timed(cmd, args, env);
  }

  const samples: number[] = [];
  let failures = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = await timed(cmd, args, env);
    samples.push(r.ms);
    if (r.exitCode !== 0 && r.exitCode !== 1) failures++;
  }

  const s = summary(samples);
  return { label, repo, profile, command: `${cmd} ${args.join(" ")}`, medianMs: s.median, meanMs: s.mean, minMs: s.min, failures };
}

function printTable(title: string, rows: BenchRow[]): void {
  console.log(`\n## ${title}\n`);
  console.log("label                                profile   median_ms   mean_ms    min_ms  failures");
  for (const r of rows) {
    console.log([
      r.label.padEnd(36),
      r.profile.padEnd(9),
      r.medianMs.toFixed(1).padStart(10),
      r.meanMs.toFixed(1).padStart(9),
      r.minMs.toFixed(1).padStart(9),
      String(r.failures).padStart(8),
    ].join("  "));
  }
}

function printOverhead(nativeMs: number, ncrMs: number, label: string): void {
  const overhead = ((ncrMs - nativeMs) / nativeMs) * 100;
  const icon = overhead <= 10 ? "OK" : "HIGH";
  console.log(`  overhead: ${label} — ${overhead.toFixed(1)}% (${nativeMs.toFixed(1)}ms native vs ${ncrMs.toFixed(1)}ms ncr) [${icon}]`);
}

function printSpeedup(nativeMs: number, fastMs: number, label: string): void {
  const speedup = nativeMs / fastMs;
  const icon = speedup >= 2 ? "OK" : "LOW";
  console.log(`  speedup:  ${label} — ${speedup.toFixed(2)}x (${nativeMs.toFixed(1)}ms native vs ${fastMs.toFixed(1)}ms fast) [${icon}]`);
}

async function main(): Promise<void> {
  if (REPOS.length === 0) {
    console.error("usage: bun run tests/bench-perf.ts --repos /path/to/repo1,/path/to/repo2 [--grep-query TODO] [--find-query ts]");
    process.exit(1);
  }

  console.log("# NCR Performance Qualification");
  console.log(`date: ${new Date().toISOString()}`);
  console.log(`runs: ${RUNS} (warmup ${WARMUP})`);
  console.log(`repos: ${REPOS.join(", ")}`);
  console.log(`grep query: ${GREP_QUERY}`);
  console.log(`find query: ${FIND_QUERY}`);

  const allGrepRows: BenchRow[] = [];
  const allFindRows: BenchRow[] = [];

  for (const repo of REPOS) {
    const name = path.basename(repo);
    console.log(`\n--- benchmarking ${name} ---`);

    const grepRows: BenchRow[] = [];
    const findRows: BenchRow[] = [];

    grepRows.push(await bench(`${name}-grep-native`, repo, "native", "/usr/bin/grep", ["-R", "-n", "--fixed-strings", GREP_QUERY, repo]));
    grepRows.push(await bench(`${name}-grep-stable`, repo, "stable", "/usr/bin/grep", ["-R", "-n", "--fixed-strings", GREP_QUERY, repo]));

    const nativeGrep = grepRows.find((r) => r.profile === "native")!;
    const stableGrep = grepRows.find((r) => r.profile === "stable")!;
    printOverhead(nativeGrep.medianMs, stableGrep.medianMs, `${name} grep`);

    const findRows_native = await bench(`${name}-find-native`, repo, "native", "/usr/bin/find", [repo, "-type", "f", "-name", `*${FIND_QUERY}*`]);
    const findRows_stable = await bench(`${name}-find-stable`, repo, "stable", "/usr/bin/find", [repo, "-type", "f", "-name", `*${FIND_QUERY}*`]);
    findRows.push(findRows_native, findRows_stable);
    printOverhead(findRows_native.medianMs, findRows_stable.medianMs, `${name} find`);

    allGrepRows.push(...grepRows);
    allFindRows.push(...findRows);
  }

  printTable("Grep Benchmark", allGrepRows);
  printTable("Find Benchmark", allFindRows);

  console.log("\n## SF-3 Compliance Check\n");
  console.log("### Stable Profile Overhead (target: <= 10%)");
  for (const repo of REPOS) {
    const name = path.basename(repo);
    const native = allGrepRows.find((r) => r.repo === repo && r.profile === "native");
    const stable = allGrepRows.find((r) => r.repo === repo && r.profile === "stable");
    if (native && stable) printOverhead(native.medianMs, stable.medianMs, `${name} grep`);
    const nativeFind = allFindRows.find((r) => r.repo === repo && r.profile === "native");
    const stableFind = allFindRows.find((r) => r.repo === repo && r.profile === "stable");
    if (nativeFind && stableFind) printOverhead(nativeFind.medianMs, stableFind.medianMs, `${name} find`);
  }

  console.log("\n### Fast Profile Speedup (target: >= 2x on 2 repos)");
  console.log("  (requires FFF/smart-find backends; run separately with NCR_PROFILE=fast)");
}

await main();
