import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { $ } from "bun";
import { BACKUP_DIR, BIN_STATE_DIR, LOCAL_BIN_DIR, PATH_LINE, SHELL_FILES } from "./lib/paths";
import { copyIfMissing, ensureDir, fileExists, readTextOrEmpty, writeExecutable } from "./lib/fs-utils";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function ensurePathPrepend(shellFile: string): Promise<string> {
  const exists = await fileExists(shellFile);
  if (!exists) return `${shellFile}: skipped (missing)`;

  const content = await readTextOrEmpty(shellFile);
  const lines = content.split("\n");
  const filtered = lines.filter((line) => !/^export PATH=.*\.local\/bin/.test(line));
  filtered.push(PATH_LINE);
  await writeFile(shellFile, `${filtered.join("\n").replace(/\n+$/, "")}\n`, "utf8");
  return `${shellFile}: updated`;
}

async function installWrapper(command: "find" | "grep", templatePath: string): Promise<string> {
  const target = path.join(LOCAL_BIN_DIR, command);
  const backup = path.join(BACKUP_DIR, `${command}.backup`);

  if (await fileExists(target)) {
    const current = await readTextOrEmpty(target);
    const managed = current.includes(`ncr-managed: ${command}`) || current.includes(`cmd-bridge-managed: ${command}`);
    if (!managed) {
      await copyIfMissing(target, backup);
    }
  }

  const template = await readTextOrEmpty(templatePath);
  await writeExecutable(target, template);
  return `${command}: installed -> ${target}`;
}

async function buildGrepHelper(): Promise<string> {
  const helperSrc = path.join(ROOT, "scripts", "grep-fff-helper.ts");
  const helperOut = path.join(BIN_STATE_DIR, "grep-fff-helper.mjs");
  await ensureDir(BIN_STATE_DIR);

  await $`bun build ${helperSrc} --target node --format esm --outfile ${helperOut}`.quiet();
  await $`chmod +x ${helperOut}`.quiet();

  return `grep helper: built -> ${helperOut}`;
}

async function buildFindHelper(): Promise<string> {
  const helperSrc = path.join(ROOT, "scripts", "fff-find-helper.ts");
  const helperOut = path.join(BIN_STATE_DIR, "fff-find-helper.mjs");
  await ensureDir(BIN_STATE_DIR);

  await $`bun build ${helperSrc} --target node --format esm --outfile ${helperOut}`.quiet();
  await $`chmod +x ${helperOut}`.quiet();

  return `find helper: built -> ${helperOut}`;
}

async function buildRunner(): Promise<string> {
  const runnerSrc = path.join(ROOT, "scripts", "ncr-runner.ts");
  const runnerOut = path.join(BIN_STATE_DIR, "ncr-runner.mjs");
  await ensureDir(BIN_STATE_DIR);

  await $`bun build ${runnerSrc} --target node --format esm --outfile ${runnerOut}`.quiet();
  await $`chmod +x ${runnerOut}`.quiet();

  return `router runner: built -> ${runnerOut}`;
}

async function main(): Promise<void> {
  await ensureDir(LOCAL_BIN_DIR);
  await ensureDir(BACKUP_DIR);
  await ensureDir(BIN_STATE_DIR);

  const results: string[] = [];
  results.push(await buildRunner());
  results.push(await buildGrepHelper());
  results.push(await buildFindHelper());
  results.push(await installWrapper("find", path.join(ROOT, "templates", "find-wrapper.sh")));
  results.push(await installWrapper("grep", path.join(ROOT, "templates", "grep-wrapper.sh")));

  for (const file of SHELL_FILES) {
    results.push(await ensurePathPrepend(file));
  }

  console.log("ncr install complete");
  for (const line of results) {
    console.log(`- ${line}`);
  }
  console.log("- verify: which find && which grep");
}

await main();
