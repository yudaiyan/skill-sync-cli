import os from "node:os"
import path from "node:path"

export const USER_CONFIG_RELATIVE_PATH = [".config", "skill-sync", "skills.json"]

export function configPath(home = os.homedir()) {
  return path.join(home, ...USER_CONFIG_RELATIVE_PATH)
}

export function resolveConfigPath(filename, { cwd = process.cwd(), userHome = os.homedir() } = {}) {
  if (filename === undefined) return configPath(userHome)
  if (typeof filename !== "string" || filename.trim() === "") {
    throw new Error("--config requires a file path")
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(filename) || filename.startsWith("git@")) {
    throw new Error("--config expects a local file path. Clone the configuration repository first.")
  }
  if (filename === "~") return userHome
  if (/^~[\\/]/.test(filename)) return path.resolve(userHome, filename.slice(2))
  return path.resolve(cwd, filename)
}
