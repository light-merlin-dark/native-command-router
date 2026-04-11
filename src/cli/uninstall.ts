import { copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { BACKUP_DIR, BIN_STATE_DIR, LEGACY_STATE_DIR, LOCAL_BIN_DIR } from "../core/paths";
import { fileExists, readTextOrEmpty, removeIfExists } from "../core/fs-utils";

async function uninstallWrapper(command: "find" | "grep"): Promise<string> {
  const target = path.join(LOCAL_BIN_DIR, command);
  const backup = path.join(BACKUP_DIR, `${command}.backup`);

  const exists = await fileExists(target);
  if (exists) {
    const current = await readTextOrEmpty(target);
    const managed = current.includes(`ncr-managed: ${command}`) || current.includes(`cmd-bridge-managed: ${command}`);
    if (!managed) {
      return `${command}: skipped (not managed by ncr)`;
    }
    await rm(target, { force: true });
  }

  if (await fileExists(backup)) {
    await copyFile(backup, target);
    await rm(backup, { force: true });
    return `${command}: restored backup -> ${target}`;
  }

  return `${command}: removed wrapper`;
}

async function main(): Promise<void> {
  const results: string[] = [];
  results.push(await uninstallWrapper("find"));
  results.push(await uninstallWrapper("grep"));
  await removeIfExists(path.join(BIN_STATE_DIR, "ncr-runner.mjs"));
  await removeIfExists(path.join(BIN_STATE_DIR, "grep-fff-helper.mjs"));
  await removeIfExists(path.join(BIN_STATE_DIR, "fff-find-helper.mjs"));
  await removeIfExists(path.join(LEGACY_STATE_DIR, "bin", "cmd-bridge-runner.mjs"));
  await removeIfExists(path.join(LEGACY_STATE_DIR, "bin", "grep-fff-helper.mjs"));
  await removeIfExists(path.join(LEGACY_STATE_DIR, "bin", "fff-find-helper.mjs"));

  console.log("ncr uninstall complete");
  for (const line of results) {
    console.log(`- ${line}`);
  }
}

await main();
