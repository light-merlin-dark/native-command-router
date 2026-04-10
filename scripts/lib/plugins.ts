export type PluginCapability = "drop_in_safe" | "ranked_preview";

export type PluginDef = {
  id: string;
  name: string;
  description: string;
  capability: PluginCapability;
  command: string;
  backend: string;
  envEnable?: string;
  envDisable?: string;
  profiles: Array<"stable" | "fast">;
};

export const PLUGINS: PluginDef[] = [
  {
    id: "smart-find",
    name: "smart-find",
    description: "Optimized find with noise-dir filtering (node_modules, .git, dist, build)",
    capability: "ranked_preview",
    command: "find",
    backend: "smart-find",
    envEnable: "NCR_ENABLE_SMART_FIND",
    envDisable: "SMART_FIND",
    profiles: ["fast"],
  },
  {
    id: "fff-grep",
    name: "fff grep",
    description: "FFF-based grep for recursive literal search",
    capability: "ranked_preview",
    command: "grep",
    backend: "fff",
    envEnable: "NCR_ENABLE_FFF_GREP",
    envDisable: "SMART_GREP",
    profiles: ["fast"],
  },
];

export type ProfileName = "stable" | "fast";

export function resolveProfile(): ProfileName {
  const env = process.env.NCR_PROFILE ?? process.env.CMD_BRIDGE_PROFILE ?? "";
  if (env === "fast") return "fast";
  return "stable";
}

export function isPluginEnabled(plugin: PluginDef, profile: ProfileName): boolean {
  if (plugin.envDisable && process.env[plugin.envDisable] === "0") return false;
  if (plugin.envEnable && process.env[plugin.envEnable] === "1") return true;
  return plugin.profiles.includes(profile);
}

export function getPluginForRoute(command: string, backend: string): PluginDef | undefined {
  return PLUGINS.find((p) => p.command === command && p.backend === backend);
}
