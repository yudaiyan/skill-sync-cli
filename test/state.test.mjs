import test from "node:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  allInstalled,
  canonicalSkillPath,
  readState,
  setStateEntry,
  stateEntry,
  stateKey,
  statePath,
  writeState,
} from "../src/state.mjs"

async function tempDir() {
  return mkdtemp(path.join(os.tmpdir(), "skill-sync-state-"))
}

test("resolves the state file next to the default configuration", () => {
  const home = path.join(os.tmpdir(), "skill-sync-home")
  assert.equal(statePath(home), path.join(home, ".config", "skill-sync", "state.json"))
})

test("state keys cover the group flags and skill names", () => {
  const base = [
    { name: "a", source: "owner/repo", ref: "main", agents: ["opencode"], scope: "global", copy: true },
    { name: "b", source: "owner/repo", ref: "main", agents: ["opencode"], scope: "global", copy: true },
  ]
  const key = stateKey(base)
  assert.equal(key, stateKey(base))
  assert.notEqual(key, stateKey([base[0]]))
  assert.notEqual(key, stateKey([{ ...base[0], ref: "dev" }, base[1]]))
  assert.notEqual(key, stateKey([{ ...base[0], scope: "project" }, base[1]]))
})

test("reads an empty state for missing or corrupt files and round trips entries", async () => {
  const root = await tempDir()
  const filename = path.join(root, "nested", "state.json")

  try {
    assert.deepEqual(await readState(filename), { version: 1, manifests: {} })
    await mkdir(path.dirname(filename), { recursive: true })
    await writeFile(filename, "{not json")
    assert.deepEqual(await readState(filename), { version: 1, manifests: {} })
    await writeFile(filename, JSON.stringify({ version: 99, manifests: {} }))
    assert.deepEqual(await readState(filename), { version: 1, manifests: {} })

    const state = await readState(filename)
    assert.equal(stateEntry(state, "manifest.json", "key"), undefined)
    setStateEntry(state, "manifest.json", "key", { revision: "abc" })
    await writeState(filename, state)
    const reloaded = await readState(filename)
    assert.deepEqual(stateEntry(reloaded, "manifest.json", "key"), { revision: "abc" })
    assert.equal(JSON.parse(await readFile(filename, "utf8")).version, 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("checks the canonical installed copy for both scopes", async () => {
  const root = await tempDir()
  const home = path.join(root, "home")
  const cwd = path.join(root, "application")
  const globalSkill = { name: "global-skill" }
  const projectSkill = { name: "project-skill" }

  try {
    await mkdir(canonicalSkillPath("global-skill", { global: true, cwd, home }), { recursive: true })
    await mkdir(canonicalSkillPath("project-skill", { global: false, cwd, home }), { recursive: true })

    assert.equal(allInstalled([globalSkill], { global: true, cwd, home }), true)
    assert.equal(allInstalled([globalSkill], { global: false, cwd, home }), false)
    assert.equal(allInstalled([projectSkill], { global: false, cwd, home }), true)
    assert.equal(allInstalled([projectSkill], { global: true, cwd, home }), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
