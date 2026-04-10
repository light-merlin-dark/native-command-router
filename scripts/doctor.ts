import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { BIN_STATE_DIR, LEGACY_STATE_DIR, LOCAL_BIN_DIR } from "./lib/paths";
import { fileExists, readTextOrEmpty } from "./lib/fs-utils";

const execFileAsync = promisify(execFile);

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
  const findPath = await which("find");
  const grepPath = await which("grep");
  const fffPath = await which("fff-mcp");
  const grepHelper = path.join(BIN_STATE_DIR, "grep-fff-helper.mjs");
  const findHelper = path.join(BIN_STATE_DIR, "fff-find-helper.mjs");
  const runner = path.join(BIN_STATE_DIR, "ncr-runner.mjs");
  const legacyRunner = path.join(LEGACY_STATE_DIR, "bin", "cmd-bridge-runner.mjs");

  console.log("ncr doctor");
  console.log(`- which find: ${findPath}`);
  console.log(`- which grep: ${grepPath}`);
  console.log(`- which fff-mcp: ${fffPath}`);
  console.log(`- runner: ${runner} (${(await fileExists(runner)) ? "present" : "missing"})`);
  console.log(`- legacy runner: ${legacyRunner} (${(await fileExists(legacyRunner)) ? "present" : "missing"})`);
  console.log(`- grep helper: ${grepHelper} (${(await fileExists(grepHelper)) ? "present" : "missing"})`);
  console.log(`- find helper: ${findHelper} (${(await fileExists(findHelper)) ? "present" : "missing"})`);
  console.log(`- ${await managedStatus("find")}`);
  console.log(`- ${await managedStatus("grep")}`);
}

await main();
