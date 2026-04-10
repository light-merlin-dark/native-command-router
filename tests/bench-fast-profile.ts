#!/usr/bin/env bun
import { spawn } from "node:child_process";

const argv = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i];
  const v = process.argv[i + 1] ?? "";
  if (k?.startsWith("--")) argv.set(k, v);
}

const REPO = argv.get("--repo") ?? "";
const QUERY = argv.get("--query") ?? "TODO";
const RUNS = Number(argv.get("--runs") ?? "5");
const WARMUP = Number(argv.get("--warmup") ?? "1");

if (!REPO) {
  console.error("usage: bun run tests/bench-fast-profile.ts --repo /path --query TODO");
  process.exit(1);
}

function run(cmd: string, args: string[], env?: Record<string, string>): Promise<number> {
  const start = process.hrtime.bigint();
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "ignore", "ignore"],
    });
    child.on("error", () => resolve(Number(process.hrtime.bigint() - start) / 1e6));
    child.on("exit", () => resolve(Number(process.hrtime.bigint() - start) / 1e6));
  });
}

function summary(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    min: sorted[0] ?? 0,
    median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
  };
}

async function bench(label: string, cmd: string, args: string[], env?: Record<string, string>) {
  for (let i = 0; i < WARMUP; i++) await run(cmd, args, env);
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    samples.push(await run(cmd, args, env));
  }
  const s = summary(samples);
  return { label, median: s.median, mean: s.mean, min: s.min };
}

async function main() {
  console.log(`# Fast Profile Benchmark`);
  console.log(`repo: ${REPO}`);
  console.log(`query: ${QUERY}`);
  console.log(`runs: ${RUNS} (warmup ${WARMUP})\n`);

  const nativeResult = await bench("native-grep", "/usr/bin/grep", ["-R", "-n", "--fixed-strings", QUERY, REPO]);
  const stableResult = await bench("stable-ncr", "grep", ["-R", "-n", "--fixed-strings", QUERY, REPO]);
  const fastResult = await bench("fast-ncr", "grep", ["-R", "-n", "--fixed-strings", QUERY, REPO], { NCR_PROFILE: "fast" });

  console.log("label            median_ms   mean_ms    min_ms");
  for (const r of [nativeResult, stableResult, fastResult]) {
    console.log([
      r.label.padEnd(16),
      r.median.toFixed(1).padStart(10),
      r.mean.toFixed(1).padStart(9),
      r.min.toFixed(1).padStart(9),
    ].join("  "));
  }

  const speedup = nativeResult.median / fastResult.median;
  const overhead = ((stableResult.median - nativeResult.median) / nativeResult.median) * 100;

  console.log(`\nstable overhead: ${overhead.toFixed(1)}%`);
  console.log(`fast speedup:    ${speedup.toFixed(2)}x vs native`);

  if (overhead <= 10) console.log("stable overhead: PASS (<= 10%)");
  else console.log(`stable overhead: FAIL (> 10%)`);

  if (speedup >= 2) console.log("fast speedup:    PASS (>= 2x)");
  else console.log(`fast speedup:    FAIL (< 2x, note: FFF includes startup/indexing overhead per cold invocation)`);
}

await main();
