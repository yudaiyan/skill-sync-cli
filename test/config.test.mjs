import test from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { configPath, USER_CONFIG_RELATIVE_PATH } from "../src/config.mjs"

test("uses the fixed user config path", () => {
  const home = path.join(os.tmpdir(), "skill-sync-config-home")
  assert.equal(
    configPath(home),
    path.join(home, ...USER_CONFIG_RELATIVE_PATH),
  )
})

test("uses the current user's home directory by default", () => {
  assert.equal(configPath(), path.join(os.homedir(), ...USER_CONFIG_RELATIVE_PATH))
})
