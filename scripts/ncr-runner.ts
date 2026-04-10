#!/usr/bin/env node
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { BIN_STATE_DIR } from "./lib/paths";

type RouteDecision = {
  backend: "native" | "smart-find" | "fff";
  reason: string;
  command: string;
  args: string[];
};

const RAW_FIND = "/usr/bin/find";
const RAW_GREP = "/usr/bin/grep";
const HELPER = path.join(BIN_STATE_DIR, "grep-fff-helper.mjs");

function isDebugEnabled(): boolean {
  return process.env.NCR_DEBUG === "1" || process.env.CMD_BRIDGE_DEBUG === "1";
}

function debug(line: string): void {
  if (isDebugEnabled()) {
    process.stderr.write(`[ncr] ${line}\n`);
  }
}

function hasCustomRawFlag(args: string[]): { raw: boolean; filtered: string[] } {
  const filtered: string[] = [];
  let raw = false;
  for (const arg of args) {
    if (arg === "--raw") {
      raw = true;
      continue;
    }
    filtered.push(arg);
  }
  return { raw, filtered };
}

async function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn("/bin/zsh", ["-lc", `command -v ${cmd} >/dev/null 2>&1`], {
      stdio: "ignore",
    });
    p.on("exit", (code) => resolve(code === 0));
    p.on("error", () => resolve(false));
  });
}

async function pathIsDir(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

function containsRegexMeta(pattern: string): boolean {
  return /[\[\](){*+?|^$\\}]/.test(pattern);
}

function parseCombinedShortFlags(arg: string): string[] | null {
  if (!arg.startsWith("-") || arg.startsWith("--") || arg.length < 3) return null;
  return arg.slice(1).split("").map((c) => `-${c}`);
}

async function routeFind(origArgs: string[]): Promise<RouteDecision> {
  const { raw, filtered } = hasCustomRawFlag(origArgs);
  if (process.env.SMART_FIND === "0" || raw) {
    return { backend: "native", reason: "explicit bypass", command: RAW_FIND, args: filtered };
  }

  if (await commandExists("smart-find")) {
    return { backend: "smart-find", reason: "smart-find available", command: "smart-find", args: origArgs };
  }

  return { backend: "native", reason: "smart-find not installed", command: RAW_FIND, args: origArgs };
}

async function routeGrep(origArgs: string[]): Promise<RouteDecision> {
  const { raw, filtered } = hasCustomRawFlag(origArgs);
  if (process.env.SMART_GREP === "0" || raw) {
    return { backend: "native", reason: "explicit bypass", command: RAW_GREP, args: filtered };
  }

  const fffEnabled = process.env.NCR_ENABLE_FFF_GREP === "1" || process.env.CMD_BRIDGE_ENABLE_FFF_GREP === "1";
  if (!fffEnabled) {
    return {
      backend: "native",
      reason: "fff grep disabled by default (set NCR_ENABLE_FFF_GREP=1)",
      command: RAW_GREP,
      args: origArgs,
    };
  }

  if (!(await commandExists("fff-mcp"))) {
    return { backend: "native", reason: "fff-mcp not available", command: RAW_GREP, args: origArgs };
  }

  let args = [...origArgs];
  let recursive = false;
  let lineNumber = false;
  let fixedStrings = false;
  let ignoreCase = false;

  const parsedArgs: string[] = [];
  for (const a of args) {
    const expanded = parseCombinedShortFlags(a);
    if (expanded) parsedArgs.push(...expanded);
    else parsedArgs.push(a);
  }
  args = parsedArgs;

  while (args.length > 0) {
    const arg = args[0]!;
    if (arg === "--") {
      args.shift();
      break;
    }
    if (!arg.startsWith("-")) break;

    switch (arg) {
      case "-R":
      case "-r":
      case "--recursive":
        recursive = true;
        args.shift();
        break;
      case "-n":
      case "--line-number":
        lineNumber = true;
        args.shift();
        break;
      case "-F":
      case "--fixed-strings":
        fixedStrings = true;
        args.shift();
        break;
      case "-i":
      case "--ignore-case":
        ignoreCase = true;
        args.shift();
        break;
      default:
        return { backend: "native", reason: `unsupported flag ${arg}`, command: RAW_GREP, args: origArgs };
    }
  }

  if (!recursive) {
    return { backend: "native", reason: "non-recursive grep", command: RAW_GREP, args: origArgs };
  }

  if (ignoreCase) {
    return { backend: "native", reason: "ignore-case fallback", command: RAW_GREP, args: origArgs };
  }

  if (args.length < 1) {
    return { backend: "native", reason: "missing pattern", command: RAW_GREP, args: origArgs };
  }

  const pattern = args.shift()!;

  let searchPath = ".";
  if (args.length > 1) {
    return { backend: "native", reason: "multiple paths unsupported", command: RAW_GREP, args: origArgs };
  }
  if (args.length === 1) {
    searchPath = args[0]!;
  }

  if (!(await pathIsDir(searchPath))) {
    return { backend: "native", reason: "path must be directory", command: RAW_GREP, args: origArgs };
  }

  if (!fixedStrings && containsRegexMeta(pattern)) {
    return { backend: "native", reason: "regex/meta pattern fallback", command: RAW_GREP, args: origArgs };
  }

  return {
    backend: "fff",
    reason: "recursive literal grep routed to fff",
    command: "node",
    args: [HELPER, "--path", searchPath, "--query", pattern, "--line-number", lineNumber ? "1" : "0"],
  };
}

async function runProcess(command: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", () => resolve(2));
    child.on("exit", (code, signal) => {
      if (signal) {
        resolve(128);
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function execDecision(d: RouteDecision, origArgs: string[]): Promise<number> {
  debug(`backend=${d.backend} reason=${d.reason}`);
  const code = await runProcess(d.command, d.args);
  if (code !== 2) return code;

  if (d.command === RAW_GREP || d.command === RAW_FIND) return code;

  if (d.backend === "smart-find") {
    debug("fallback=native-find reason=smart-find execution failed");
    return runProcess(RAW_FIND, origArgs);
  }

  debug("fallback=native-grep reason=non-native route execution failed");
  return runProcess(RAW_GREP, origArgs);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  if (!command) {
    process.stderr.write("ncr-runner: missing command (expected find|grep)\n");
    process.exit(2);
  }

  if (command === "find") {
    const d = await routeFind(args);
    const code = await execDecision(d, args);
    process.exit(code);
  }

  if (command === "grep") {
    const d = await routeGrep(args);
    const code = await execDecision(d, args);
    process.exit(code);
  }

  process.stderr.write(`ncr-runner: unsupported command ${command}\n`);
  process.exit(2);
}

await main();
