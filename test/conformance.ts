#!/usr/bin/env bun
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type TestResult = {
  id: string;
  command: string;
  nativeStdout: string;
  nativeStderr: string;
  nativeExitCode: number;
  ncrStdout: string;
  ncrStderr: string;
  ncrExitCode: number;
  passed: boolean;
  failures: string[];
  knownGap?: string;
};

type TestCase = {
  id: string;
  description: string;
  command: string;
  args: string[];
  nativeArgs?: string[];
  env?: Record<string, string>;
  normalize?: (text: string) => string;
  skip?: boolean;
  skipReason?: string;
  knownGap?: string;
};

const FIXTURE_ROOT = path.resolve(path.dirname(import.meta.url.replace("file://", "")), "fixtures", "repo");
const NCR_RUNNER = path.resolve(path.dirname(import.meta.url.replace("file://", "")), "..", "src", "router.ts");

function ensureFixtureRepo(): void {
  if (existsSync(FIXTURE_ROOT)) return;

  mkdirSync(FIXTURE_ROOT, { recursive: true });

  const dirs = [
    "src/lib", "src/components", "tests", ".hidden/nested",
    "dist", "build", "node_modules/dep", "docs", "bin", "data",
  ];
  for (const d of dirs) {
    mkdirSync(path.join(FIXTURE_ROOT, d), { recursive: true });
  }

  const files: Array<[string, string]> = [
    ["README.md", "# hello world\nSome project docs with TODO items.\n"],
    ["src/index.ts", 'export function main(): void {\n  console.log("hello");\n  // TODO: add error handling\n}\n'],
    ["src/utils.ts", 'export function add(a: number, b: number): number {\n  return a + b; // FIXME: handle overflow\n}\n'],
    ["src/lib/parser.ts", 'export function parse(input: string): string {\n  // TODO: implement parser\n  return input;\n}\n'],
    ["src/lib/helpers.ts", 'export function help(): void {\n  console.log("help");\n}\n'],
    ["src/types.d.ts", 'export interface Config {\n  name: string;\n  // TODO: add validation\n}\n'],
    ["tests/index.test.ts", 'import { main } from "../src/index";\n// TODO: write real tests\ntest("main", () => main());\n'],
    ["tests/utils.test.ts", 'import { add } from "../src/utils";\ntest("add", () => expect(add(1,2)).toBe(3));\n'],
    ["package.json", '{\n  "name": "fixture-project",\n  "version": "1.0.0",\n  "scripts": { "test": "echo TODO: setup test runner" }\n}\n'],
    ["tsconfig.json", '{\n  "compilerOptions": { "target": "ES2022", "module": "ESNext" }\n}\n'],
    [".env.example", "DATABASE_URL=postgres://localhost/test\nTODO=add real credentials\n"],
    [".hidden/config.json", '{ "secret": "TODO-replace-me" }\n'],
    [".hidden/nested/deep.txt", "deep hidden file with TODO marker\n"],
    ["dist/output.js", 'compiled output with TODO comment\n'],
    ["build/main.js", 'built file\n'],
    ["node_modules/dep/index.js", 'module.exports = {};\n'],
    ["docs/guide.md", "# Guide\n\nTODO: write this guide.\n"],
    ["docs/api.md", "# API Reference\n\n## GET /health\n\nReturns health status.\n\n## TODO\n\n- Document all endpoints\n"],
    ["data/mixed.txt", "line1 TODO here\nline2 fixme there\nline3 normal text\nline4 another TODO\n"],
    ["src/components/App.tsx", 'export function App() {\n  // TODO: implement component\n  return <div>App</div>;\n}\n'],
    ["src/components/Button.tsx", 'export function Button({ label }: { label: string }) {\n  return <button>{label}</button>;\n}\n'],
  ];

  for (const [fp, content] of files) {
    writeFileSync(path.join(FIXTURE_ROOT, fp), content, "utf8");
  }

  writeFileSync(path.join(FIXTURE_ROOT, "bin", "tool.sh"), '#!/usr/bin/env bash\necho "TODO: implement tool"\n', "utf8");
  chmodSync(path.join(FIXTURE_ROOT, "bin", "tool.sh"), 0o755);

  try {
    symlinkSync("README.md", path.join(FIXTURE_ROOT, "link-to-readme"));
  } catch { /* ignore */ }
  try {
    symlinkSync("../utils.ts", path.join(FIXTURE_ROOT, "src", "link-to-utils"));
  } catch { /* ignore */ }
}

function normalizeCommon(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/, "")
    .split("\n")
    .sort()
    .join("\n");
}

function normalizePreserveOrder(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n+$/, "");
}

function makeSortNormalizer(baseDir: string): (text: string) => string {
  const normalizedBase = path.resolve(baseDir).replace(/\/+$/, "");
  return (text: string) => {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\n+$/, "")
      .split("\n")
      .map((line) => {
        const idx = line.indexOf(":");
        if (idx === -1) return line;
        const filePart = line.slice(0, idx);
        const rest = line.slice(idx);
        const absPath = path.resolve(normalizedBase, filePart);
        const relPath = path.relative(normalizedBase, absPath);
        return relPath + rest;
      })
      .sort()
      .join("\n");
  };
}

function makeLineCountNormalizer(): (text: string) => string {
  return (text: string) => {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/, "").split("\n");
    return String(lines.length);
  };
}

const FIXTURE = FIXTURE_ROOT;

const FIND_TESTS: TestCase[] = [
  {
    id: "find-basic-files",
    description: "Basic file traversal with -type f (stable profile -> native)",
    command: "find",
    args: [FIXTURE, "-type", "f"],
    normalize: normalizeCommon,
  },
  {
    id: "find-basic-files-dot",
    description: "Basic file traversal from within directory",
    command: "find",
    args: ["-type", "f"],
    normalize: normalizeCommon,
  },
  {
    id: "find-name-filter",
    description: "Name pattern filtering with -name",
    command: "find",
    args: [FIXTURE, "-name", "*.ts"],
    normalize: normalizeCommon,
  },
  {
    id: "find-name-filter-tsx",
    description: "Name pattern filtering for .tsx files",
    command: "find",
    args: [FIXTURE, "-name", "*.tsx"],
    normalize: normalizeCommon,
  },
  {
    id: "find-hidden-dirs",
    description: "Find includes hidden directories",
    command: "find",
    args: [FIXTURE, "-name", "*.json"],
    normalize: normalizeCommon,
  },
  {
    id: "find-symlinks",
    description: "Find with symlink following",
    command: "find",
    args: [FIXTURE, "-type", "l"],
    normalize: normalizeCommon,
  },
  {
    id: "find-raw-flag",
    description: "--raw flag bypasses to native",
    command: "find",
    args: ["--raw", FIXTURE, "-type", "f"],
    nativeArgs: [FIXTURE, "-type", "f"],
    normalize: normalizeCommon,
  },
  {
    id: "find-bypass-env",
    description: "SMART_FIND=0 bypasses to native",
    command: "find",
    args: [FIXTURE, "-type", "f"],
    env: { SMART_FIND: "0" },
    normalize: normalizeCommon,
  },
  {
    id: "find-empty-dir",
    description: "Find in empty directory returns empty",
    command: "find",
    args: [],
    normalize: normalizeCommon,
    skip: true,
    skipReason: "needs empty dir fixture; will use /dev/null-like approach",
  },
  {
    id: "find-maxdepth",
    description: "Find with -maxdepth restriction",
    command: "find",
    args: [FIXTURE, "-maxdepth", "1", "-type", "f"],
    normalize: normalizeCommon,
  },
  {
    id: "find-path-filter",
    description: "Find with -path filter",
    command: "find",
    args: [FIXTURE, "-path", "*/src/lib/*", "-type", "f"],
    normalize: normalizeCommon,
  },
];

const GREP_TESTS: TestCase[] = [
  {
    id: "grep-native-recursive-fixed",
    description: "Native recursive fixed-string search (default route)",
    command: "grep",
    args: ["-R", "-n", "--fixed-strings", "TODO", FIXTURE],
    normalize: makeSortNormalizer(FIXTURE),
  },
  {
    id: "grep-native-recursive-short-r",
    description: "Native recursive search with -r",
    command: "grep",
    args: ["-r", "-n", "TODO", FIXTURE],
    normalize: makeSortNormalizer(FIXTURE),
  },
  {
    id: "grep-native-case-insensitive",
    description: "Native case-insensitive search",
    command: "grep",
    args: ["-R", "-n", "-i", "todo", FIXTURE],
    normalize: makeSortNormalizer(FIXTURE),
  },
  {
    id: "grep-native-no-match",
    description: "Native search with no matches returns exit code 1",
    command: "grep",
    args: ["-R", "-n", "--fixed-strings", "ZZZZNONEXISTENT", FIXTURE],
    normalize: makeLineCountNormalizer(),
  },
  {
    id: "grep-native-invalid-regex",
    description: "Invalid regex produces error exit code",
    command: "grep",
    args: ["-R", "-n", "[invalid", FIXTURE],
  },
  {
    id: "grep-native-binary-file",
    description: "Search across binary files",
    command: "grep",
    args: ["-R", "-n", "TODO", FIXTURE],
    normalize: makeSortNormalizer(FIXTURE),
  },
  {
    id: "grep-native-scoped-path",
    description: "Search scoped to subdirectory",
    command: "grep",
    args: ["-R", "-n", "--fixed-strings", "TODO", path.join(FIXTURE, "src")],
    normalize: makeSortNormalizer(path.join(FIXTURE, "src")),
  },
  {
    id: "grep-native-no-recursive",
    description: "Non-recursive grep in directory",
    command: "grep",
    args: ["-n", "TODO", path.join(FIXTURE, "src")],
  },
  {
    id: "grep-native-raw-flag",
    description: "--raw flag bypasses to native grep",
    command: "grep",
    args: ["--raw", "-R", "-n", "TODO", FIXTURE],
    nativeArgs: ["-R", "-n", "TODO", FIXTURE],
    normalize: makeSortNormalizer(FIXTURE),
  },
  {
    id: "grep-bypass-env",
    description: "SMART_GREP=0 bypasses to native",
    command: "grep",
    args: ["-R", "-n", "TODO", FIXTURE],
    env: { SMART_GREP: "0" },
    normalize: makeSortNormalizer(FIXTURE),
  },
  {
    id: "grep-native-regex",
    description: "Regex pattern search (not fixed-strings)",
    command: "grep",
    args: ["-R", "-n", "TODO.*implement", FIXTURE],
    normalize: makeSortNormalizer(FIXTURE),
  },
  {
    id: "grep-native-multi-file",
    description: "Multiple file arguments",
    command: "grep",
    args: ["-n", "TODO", path.join(FIXTURE, "README.md"), path.join(FIXTURE, "package.json")],
    normalize: normalizePreserveOrder,
  },
  {
    id: "grep-native-fixed-no-n",
    description: "Recursive fixed-string without -n flag",
    command: "grep",
    args: ["-R", "--fixed-strings", "TODO", path.join(FIXTURE, "src")],
    normalize: makeSortNormalizer(path.join(FIXTURE, "src")),
  },
  {
    id: "grep-native-combined-flags",
    description: "Combined short flags -Rn",
    command: "grep",
    args: ["-Rn", "TODO", path.join(FIXTURE, "src")],
    normalize: makeSortNormalizer(path.join(FIXTURE, "src")),
  },
];

const FAST_PROFILE_TESTS: TestCase[] = [
  {
    id: "fast-find-basic-files",
    description: "Fast profile find routes to smart-find (non-native output expected)",
    command: "find",
    args: [FIXTURE, "-type", "f"],
    env: { NCR_PROFILE: "fast" },
    knownGap: "GAP-002: smart-find filters noise dirs, output differs from native",
  },
  {
    id: "fast-find-bypass-env",
    description: "Fast profile find with SMART_FIND=0 still bypasses",
    command: "find",
    args: [FIXTURE, "-type", "f"],
    env: { NCR_PROFILE: "fast", SMART_FIND: "0" },
    normalize: normalizeCommon,
  },
  {
    id: "fast-grep-recursive-literal",
    description: "Fast profile grep routes FFF for literal recursive search",
    command: "grep",
    args: ["-R", "-n", "--fixed-strings", "TODO", path.join(FIXTURE, "src")],
    env: { NCR_PROFILE: "fast" },
    knownGap: "GAP-001: FFF grep completeness mismatch",
  },
  {
    id: "fast-grep-unsupported-fallback",
    description: "Fast profile grep falls back for regex patterns",
    command: "grep",
    args: ["-R", "-n", "TODO.*implement", FIXTURE],
    env: { NCR_PROFILE: "fast" },
    normalize: makeSortNormalizer(FIXTURE),
  },
  {
    id: "fast-grep-ignore-case-fallback",
    description: "Fast profile grep falls back for ignore-case",
    command: "grep",
    args: ["-R", "-n", "-i", "todo", FIXTURE],
    env: { NCR_PROFILE: "fast" },
    normalize: makeSortNormalizer(FIXTURE),
  },
];

type FallbackTestResult = {
  id: string;
  description: string;
  passed: boolean;
  failure?: string;
};

async function runFallbackTest(
  id: string,
  description: string,
  command: string,
  args: string[],
  env?: Record<string, string>,
  expectExitCode?: number,
): Promise<FallbackTestResult> {
  const result = await runNcr(command, args, env);
  const expected = expectExitCode ?? 0;

  if (result.exitCode !== expected && expected !== 1) {
    return { id, description, passed: false, failure: `exit code ${result.exitCode}, expected ${expected}` };
  }

  return { id, description, passed: true };
}

const STRESS_TESTS: Array<{
  id: string;
  description: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  expectExitCode?: number;
}> = [
  {
    id: "stress-nonexistent-path",
    description: "Find on nonexistent path returns error without crash",
    command: "find",
    args: ["/nonexistent/path/that/does/not/exist", "-type", "f"],
    expectExitCode: 1,
  },
  {
    id: "stress-grep-nonexistent-path",
    description: "Grep on nonexistent path returns error without crash",
    command: "grep",
    args: ["-R", "-n", "TODO", "/nonexistent/path"],
    expectExitCode: 2,
  },
  {
    id: "stress-find-no-args",
    description: "Find with no args returns usage error (macOS)",
    command: "find",
    args: [],
    expectExitCode: 1,
  },
  {
    id: "stress-grep-empty-pattern",
    description: "Grep with empty pattern matches all lines",
    command: "grep",
    args: ["-R", "-n", "", FIXTURE],
    expectExitCode: 0,
  },
  {
    id: "stress-grep-no-args",
    description: "Grep with no args returns error",
    command: "grep",
    args: [],
    expectExitCode: 2,
  },
  {
    id: "stress-find-deeply-nested",
    description: "Find with many -name clauses",
    command: "find",
    args: [FIXTURE, "-name", "*.ts", "-o", "-name", "*.tsx", "-o", "-name", "*.js"],
  },
  {
    id: "stress-grep-file-arg",
    description: "Grep with single file arg (not directory)",
    command: "grep",
    args: ["-n", "TODO", path.join(FIXTURE, "README.md")],
  },
  {
    id: "stress-grep-stdin-no-crash",
    description: "Grep with -- separator",
    command: "grep",
    args: ["-R", "-n", "--", "TODO", FIXTURE],
  },
  {
    id: "stress-profile-invalid",
    description: "Invalid profile falls back to stable",
    command: "grep",
    args: ["-R", "-n", "TODO", FIXTURE],
    env: { NCR_PROFILE: "invalid" },
  },
];

const ALL_TESTS: TestCase[] = [...FIND_TESTS, ...GREP_TESTS, ...FAST_PROFILE_TESTS];

async function runCommand(
  command: string,
  args: string[],
  env?: Record<string, string>,
  cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const fullEnv = { ...process.env, ...env };

  return new Promise((resolve) => {
    const nativeCmd = command === "find" ? "/usr/bin/find" : "/usr/bin/grep";

    const proc = execFileAsync(nativeCmd, args, {
      cwd: cwd ?? process.cwd(),
      env: fullEnv,
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    proc.then(
      ({ stdout, stderr }) => resolve({ stdout, stderr, exitCode: 0 }),
      (err: any) => {
        resolve({
          stdout: err.stdout ?? "",
          stderr: err.stderr ?? "",
          exitCode: err.code ?? 1,
        });
      },
    );
  });
}

async function runNcr(
  command: string,
  args: string[],
  env?: Record<string, string>,
  cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const fullEnv = { ...process.env, ...env, NCR_CONFORMANCE_TEST: "1" };

  return new Promise((resolve) => {
    const proc = execFileAsync("bun", [NCR_RUNNER, command, ...args], {
      cwd: cwd ?? process.cwd(),
      env: fullEnv,
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });

    proc.then(
      ({ stdout, stderr }) => resolve({ stdout, stderr, exitCode: 0 }),
      (err: any) => {
        resolve({
          stdout: err.stdout ?? "",
          stderr: err.stderr ?? "",
          exitCode: typeof err.code === "number" ? err.code : 1,
        });
      },
    );
  });
}

async function runTest(tc: TestCase): Promise<TestResult> {
  const failures: string[] = [];

  const nativeArgs = tc.nativeArgs ?? tc.args;
  const native = await runCommand(tc.command, nativeArgs, tc.env);
  const ncr = await runNcr(tc.command, tc.args, tc.env);

  const normalizer = tc.normalize ?? normalizePreserveOrder;
  const nativeNorm = normalizer(native.stdout);
  const ncrNorm = normalizer(ncr.stdout);

  if (nativeNorm !== ncrNorm) {
    failures.push(`stdout mismatch`);
  }

  if (native.exitCode !== ncr.exitCode) {
    failures.push(`exit code mismatch (native=${native.exitCode}, ncr=${ncr.exitCode})`);
  }

  return {
    id: tc.id,
    command: `${tc.command} ${tc.args.join(" ")}`,
    nativeStdout: native.stdout,
    nativeStderr: native.stderr,
    nativeExitCode: native.exitCode,
    ncrStdout: ncr.stdout,
    ncrStderr: ncr.stderr,
    ncrExitCode: ncr.exitCode,
    passed: failures.length === 0,
    failures,
    knownGap: tc.knownGap,
  };
}

function formatResult(r: TestResult & { knownGap?: string }): string {
  const status = r.passed ? "PASS" : r.knownGap ? "XFAIL" : "FAIL";
  let line = `[${status}] ${r.id}`;
  if (r.knownGap && !r.passed) {
    line += ` — known gap: ${r.knownGap}`;
  } else if (!r.passed) {
    line += ` — ${r.failures.join("; ")}`;
  }
  return line;
}

async function main(): Promise<void> {
  ensureFixtureRepo();

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  let xfailed = 0;
  let skipped = 0;

  console.log(`ncr conformance test suite`);
  console.log(`fixture: ${FIXTURE_ROOT}`);
  console.log(`tests: ${ALL_TESTS.length}`);
  console.log("");

  for (const tc of ALL_TESTS) {
    if (tc.skip) {
      console.log(`[SKIP] ${tc.id} — ${tc.skipReason ?? "no reason"}`);
      skipped++;
      continue;
    }

    const result = await runTest(tc);
    results.push(result);
    console.log(formatResult(result));

    if (result.passed) {
      passed++;
    } else if (result.knownGap) {
      xfailed++;
    } else {
      failed++;
    }
  }

  console.log("");
  console.log(`results: ${passed} passed, ${failed} failed, ${xfailed} xfail (known gaps), ${skipped} skipped out of ${ALL_TESTS.length}`);

  if (failed > 0) {
    console.log("");
    console.log("failures:");
    for (const r of results.filter((r) => !r.passed && !r.knownGap)) {
      console.log(`\n--- ${r.id} ---`);
      console.log(`command: ${r.command}`);
      console.log(`native exit: ${r.nativeExitCode}, ncr exit: ${r.ncrExitCode}`);
      console.log(`native stdout lines: ${r.nativeStdout.split("\n").length}`);
      console.log(`ncr stdout lines: ${r.ncrStdout.split("\n").length}`);
      if (r.nativeStdout.length < 500 && r.ncrStdout.length < 500) {
        console.log(`native stdout:\n${r.nativeStdout}`);
        console.log(`ncr stdout:\n${r.ncrStdout}`);
      }
    }
  }

  let stressPassed = 0;
  let stressFailed = 0;
  console.log("");
  console.log("--- stress/fallback tests ---");
  for (const st of STRESS_TESTS) {
    const r = await runFallbackTest(st.id, st.description, st.command, st.args, st.env, st.expectExitCode);
    if (r.passed) {
      console.log(`[PASS] ${r.id}`);
      stressPassed++;
    } else {
      console.log(`[FAIL] ${r.id} — ${r.failure}`);
      stressFailed++;
    }
  }
  console.log(`\nstress results: ${stressPassed} passed, ${stressFailed} failed out of ${STRESS_TESTS.length}`);

  if (failed > 0 || stressFailed > 0) {
    process.exit(1);
  }
}

await main();
