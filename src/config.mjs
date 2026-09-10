import os from "node:os"
import path from "node:path"

export const USER_CONFIG_RELATIVE_PATH = [".config", "skill-sync", "skills.json"]

export function configPath(home = os.homedir()) {
  return path.join(home, ...USER_CONFIG_RELATIVE_PATH)
}
