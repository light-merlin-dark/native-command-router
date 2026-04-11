#!/usr/bin/env bun
import { PLUGINS, resolveProfile, isPluginEnabled } from "../core/plugins";

type Action = "list" | "status" | "enable" | "disable";

function usage(): void {
  console.log(`ncr plugins — manage optimization plugins

Usage:
  ncr plugins list      List all registered plugins and their status
  ncr plugins status    Show detailed plugin status and routing
  ncr plugins enable ID Enable a specific plugin for this session tip
  ncr plugins disable ID Disable a specific plugin for this session tip

Environment:
  NCR_PROFILE=stable|fast   Set routing profile (default: stable)
  NCR_ENABLE_SMART_FIND=1   Enable smart-find plugin
  NCR_ENABLE_FFF_GREP=1     Enable FFF grep plugin
  NCR_DEBUG=1               Show debug output`);
}

function cmdList(): void {
  const profile = resolveProfile();
  console.log(`profile: ${profile}\n`);
  console.log("ID            CAPABILITY       ENABLED  PROFILES     DESCRIPTION");
  for (const p of PLUGINS) {
    const enabled = isPluginEnabled(p, profile);
    const line = [
      p.id.padEnd(13),
      p.capability.padEnd(16),
      (enabled ? "yes" : "no").padEnd(8),
      p.profiles.join(",").padEnd(12),
      p.description,
    ].join(" ");
    console.log(line);
  }
}

function cmdStatus(): void {
  const profile = resolveProfile();
  console.log(`profile: ${profile}`);
  console.log("");

  for (const p of PLUGINS) {
    const enabled = isPluginEnabled(p, profile);
    console.log(`[${p.id}]`);
    console.log(`  name:        ${p.name}`);
    console.log(`  description: ${p.description}`);
    console.log(`  capability:  ${p.capability}`);
    console.log(`  command:     ${p.command}`);
    console.log(`  backend:     ${p.backend}`);
    console.log(`  profiles:    ${p.profiles.join(", ")}`);
    console.log(`  enabled:     ${enabled}`);
    if (p.envEnable) console.log(`  env enable:  ${p.envEnable}=1`);
    if (p.envDisable) console.log(`  env disable: ${p.envDisable}=0`);
    console.log("");
  }
}

function cmdEnable(id: string): void {
  const plugin = PLUGINS.find((p) => p.id === id);
  if (!plugin) {
    console.error(`unknown plugin: ${id}`);
    console.error(`available: ${PLUGINS.map((p) => p.id).join(", ")}`);
    process.exit(1);
  }
  if (!plugin.envEnable) {
    console.error(`plugin ${id} has no enable env var`);
    process.exit(1);
  }
  console.log(`To enable ${plugin.name}, run:`);
  console.log(`  export ${plugin.envEnable}=1`);
  console.log(`  or: NCR_PROFILE=fast`);
}

function cmdDisable(id: string): void {
  const plugin = PLUGINS.find((p) => p.id === id);
  if (!plugin) {
    console.error(`unknown plugin: ${id}`);
    console.error(`available: ${PLUGINS.map((p) => p.id).join(", ")}`);
    process.exit(1);
  }
  if (!plugin.envDisable) {
    console.error(`plugin ${id} has no disable env var`);
    process.exit(1);
  }
  console.log(`To disable ${plugin.name}, run:`);
  console.log(`  export ${plugin.envDisable}=0`);
}

const action = process.argv[2] as Action | undefined;
const target = process.argv[3];

switch (action) {
  case "list":
    cmdList();
    break;
  case "status":
    cmdStatus();
    break;
  case "enable":
    if (!target) {
      console.error("usage: ncr plugins enable <plugin-id>");
      process.exit(1);
    }
    cmdEnable(target);
    break;
  case "disable":
    if (!target) {
      console.error("usage: ncr plugins disable <plugin-id>");
      process.exit(1);
    }
    cmdDisable(target);
    break;
  default:
    usage();
    break;
}
