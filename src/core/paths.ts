import { homedir } from "node:os";
import path from "node:path";

export const HOME = homedir();
export const LOCAL_BIN_DIR = process.env.NCR_BIN_DIR ?? process.env.CMD_BRIDGE_BIN_DIR ?? path.join(HOME, ".local", "bin");
export const STATE_DIR =
  process.env.NCR_STATE_DIR ?? process.env.CMD_BRIDGE_STATE_DIR ?? path.join(HOME, ".local", "share", "ncr");
export const LEGACY_STATE_DIR = path.join(HOME, ".local", "share", "cmd-bridge");
export const BIN_STATE_DIR = path.join(STATE_DIR, "bin");
export const BACKUP_DIR = path.join(STATE_DIR, "backup");

export const SHELL_FILES = [
  path.join(HOME, ".zshrc"),
  path.join(HOME, ".zprofile"),
  path.join(HOME, ".bashrc"),
  path.join(HOME, ".profile"),
] as const;

export const PATH_LINE = 'export PATH="$HOME/.local/bin:$PATH"';
