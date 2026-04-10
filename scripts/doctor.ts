#!/usr/bin/env bun
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { BIN_STATE_DIR, LEGACY_STATE_DIR, LOCAL_BIN_DIR } from "./lib/paths";
import { fileExists, readTextOrEmpty } from "./lib/fs-utils";
import { PLUGINS, resolveProfile, isPluginEnabled } from "./lib/plugins";

const execFileAsync = promisify(execFile);

const VERBOSE = process.argv.includes("--verbose") || process.argv.includes("-v");

async function which(cmd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("/bin/zsh", ["-lc", `which ${cmd}`]);
    return stdout.trim();
  } catch {
    return "(not found)";
  }
}

async function managedStatus(command: "find" | "grep"): Promise<string> {
  const p = path.join(LOCAL_BIN_DIR, command);
  if (!(await fileExists(p))) return `${command}: missing`;
  const content = await readTextOrEmpty(p);
  const managed = content.includes(`ncr-managed: ${command}`) || content.includes(`cmd-bridge-managed: ${command}`);
  return managed
    ? `${command}: managed`
    : `${command}: present (not managed)`;
}

async function main(): Promise<void> {
  const profile = resolveProfile();

  const findPath = await which("find");
  const grepPath = await which("grep");
  const fffPath = await which("fff-mcp");
  const smartFindPath = await which("smart-find");
  const grepHelper = path.join(BIN_STATE_DIR, "grep-fff-helper.mjs");
  const findHelper = path.join(BIN_STATE_DIR, "fff-find-helper.mjs");
  const runner = path.join(BIN_STATE_DIR, "ncr-runner.mjs");
  const legacyRunner = path.join(LEGACY_STATE_DIR, "bin", "cmd-bridge-runner.mjs");

  console.log("ncr doctor");
  console.log(`- profile: ${profile}`);
  console.log(`- which find: ${findPath}`);
  console.log(`- which grep: ${grepPath}`);
  console.log(`- which fff-mcp: ${fffPath}`);
  console.log(`- which smart-find: ${smartFindPath}`);
  console.log(`- runner: ${runner} (${(await fileExists(runner)) ? "present" : "missing"})`);
  if (VERBOSE) {
    console.log(`- legacy runner: ${legacyRunner} (${(await fileExists(legacyRunner)) ? "present" : "missing"})`);
    console.log(`- grep helper: ${grepHelper} (${(await fileExists(grepHelper)) ? "present" : "missing"})`);
    console.log(`- find helper: ${findHelper} (${(await fileExists(findHelper)) ? "present" : "missing"})`);
  }
  console.log(`- ${await managedStatus("find")}`);
  console.log(`- ${await managedStatus("grep")}`);

  if (VERBOSE) {
    console.log("");
    console.log("plugins:");
    for (const p of PLUGINS) {
      const enabled = isPluginEnabled(p, profile);
      const icon = enabled ? "+" : "-";
      console.log(`  [${icon}] ${p.id} (capability=${p.capability}, profiles=${p.profiles.join(",")})`);
    }

    console.log("");
    console.log("routing:");
    console.log(`  find -> ${profile === "fast" && smartFindPath !== "(not found)" ? "smart-find (fast profile)" : "native"}`);
    console.log(`  grep -> ${profile === "fast" && fffPath !== "(not found)" ? "fff (fast profile, safe subset)" : "native"}`);

    console.log("");
    console.log("trace mode:");
    console.log(`  NCR_TRACE=1  ${process.env.NCR_TRACE === "1" ? "active" : "inactive"}`);
    console.log(`  NCR_DEBUG=1  ${process.env.NCR_DEBUG === "1" ? "active" : "inactive"}`);
  }
}

await main();
