/**
 * INI file parser for ~/.databrickscfg.
 *
 * Uses only node:fs and node:os — no third-party INI parsing library.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ConfigProfile {
  [key: string]: string | undefined;
}

const DEFAULT_CONFIG_PATH = join(homedir(), ".databrickscfg");

/**
 * Parse a Databricks config file (INI format) into a map of profile name → key/value pairs.
 */
export function parseConfigFile(
  filePath: string = DEFAULT_CONFIG_PATH,
): Map<string, ConfigProfile> {
  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return new Map();
  }

  const profiles = new Map<string, ConfigProfile>();
  let currentSection: string | null = null;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    // Skip empty lines and comments
    if (line === "" || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }

    // Section header: [PROFILE_NAME]
    const sectionMatch = line.match(/^\[(.+)]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].trim();
      if (!profiles.has(currentSection)) {
        profiles.set(currentSection, {});
      }
      continue;
    }

    // Key = value pair
    if (currentSection !== null) {
      const eqIndex = line.indexOf("=");
      if (eqIndex > 0) {
        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        profiles.get(currentSection)![key] = value;
      }
    }
  }

  return profiles;
}

/**
 * Get a specific profile from the Databricks config file.
 * Defaults to the "DEFAULT" profile.
 */
export function getProfile(
  profileName: string = "DEFAULT",
  filePath: string = DEFAULT_CONFIG_PATH,
): ConfigProfile | null {
  const profiles = parseConfigFile(filePath);
  return profiles.get(profileName) ?? null;
}
