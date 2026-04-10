import { chmod, copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function readTextOrEmpty(p: string): Promise<string> {
  try {
    return await readFile(p, "utf8");
  } catch {
    return "";
  }
}

export async function writeExecutable(p: string, content: string): Promise<void> {
  await writeFile(p, content, "utf8");
  await chmod(p, 0o755);
}

export async function copyIfMissing(src: string, dst: string): Promise<boolean> {
  if (await fileExists(dst)) return false;
  await copyFile(src, dst);
  return true;
}

export async function removeIfExists(p: string): Promise<boolean> {
  if (!(await fileExists(p))) return false;
  await rm(p, { force: true });
  return true;
}
