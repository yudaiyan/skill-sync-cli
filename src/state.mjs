import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export const STATE_VERSION = 1
export const STATE_FILENAME = "state.json"

export function statePath(home = os.homedir()) {
  return path.join(home, ".config", "skill-sync", STATE_FILENAME)
}

// The key covers everything that changes the installed result except the
// remote revision, so a new skill name or flag in the same group forces a
// fresh install.
export function stateKey(skills) {
  const { source, ref, agents, scope, copy } = skills[0]
  return JSON.stringify([
    source,
    ref ?? null,
    agents,
    scope,
    copy,
    skills.map((skill) => skill.name),
  ])
}

export async function readState(filename) {
  try {
    const parsed = JSON.parse(await readFile(filename, "utf8"))
    if (parsed?.version === STATE_VERSION && parsed.manifests && typeof parsed.manifests === "object") {
      return parsed
    }
  } catch {
    // A missing or unreadable state file only disables skipping.
  }
  return { version: STATE_VERSION, manifests: {} }
}

export async function writeState(filename, state) {
  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

export function stateEntry(state, manifestFilename, key) {
  return state.manifests[manifestFilename]?.[key]
}

export function setStateEntry(state, manifestFilename, key, entry) {
  if (!state.manifests[manifestFilename]) state.manifests[manifestFilename] = {}
  state.manifests[manifestFilename][key] = entry
}

// skills installs a canonical copy under .agents/skills for both global and
// project scope, independently of the target agents and copy/symlink mode.
export function canonicalSkillPath(name, { global: isGlobal, cwd, home }) {
  const base = isGlobal ? home : cwd
  return path.join(base, ".agents", "skills", name)
}

export function allInstalled(skills, options) {
  return skills.every((skill) => existsSync(canonicalSkillPath(skill.name, options)))
}
