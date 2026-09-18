import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { commandForGroup, groupSkills, runCommand, statusCode } from "../src/runner.mjs"

const skill = (name, overrides = {}) => ({
  name,
  source: "owner/repo",
  ref: "main",
  agents: ["opencode"],
  scope: "global",
  copy: true,
  ...overrides,
})

test("groups skills that share source, ref, agents, scope, and copy", () => {
  const groups = groupSkills([
    skill("a"),
    skill("b"),
    skill("c", { agents: ["codex"] }),
    skill("d", { ref: "dev" }),
    skill("e", { source: "owner/other" }),
    skill("f", { scope: "project" }),
    skill("g", { copy: false }),
  ])
  assert.deepEqual(
    groups.map((group) => group.map((entry) => entry.name)),
    [["a", "b"], ["c"], ["d"], ["e"], ["f"], ["g"]],
  )
})

test("builds one command with multiple skill names", () => {
  const command = commandForGroup([skill("a"), skill("b")], { package: "skills", version: "1.5.22" })
  assert.deepEqual(command.args, [
    "--yes",
    "skills@1.5.22",
    "add",
    "owner/repo#main",
    "--agent",
    "opencode",
    "--skill",
    "a",
    "b",
    "--global",
    "--copy",
    "--yes",
  ])
})

test("starts the installed npx without a shell or network access", () => {
  const result = runCommand({
    executable: process.platform === "win32" ? "npx.cmd" : "npx",
    args: ["--version"],
  }, { timeout: 10000 })
  assert.equal(statusCode(result), 0, result.error?.message)
})

test("reports a command startup failure", () => {
  const result = runCommand({ executable: "skill-sync-nonexistent-executable", args: [] })
  assert.equal(statusCode(result), 1)
  assert.equal(result.error?.code, "ENOENT")
})

test("Windows passes spaces and shell characters literally to npx", {
  skip: process.platform !== "win32",
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "skill sync npx-"))
  try {
    await writeFile(path.join(root, "npx-cli.js"), [
      "const actual = JSON.stringify(process.argv.slice(2))",
      "if (actual !== process.env.SKILL_SYNC_TEST_ARGS) process.exitCode = 1",
    ].join("\n"))
    const args = [
      "add", "https://example.com/download?a=1&b=2", "--skill",
      "skill with spaces", "literal%PATH%", "$(literal)", "a\"b", "x^y", "a|b",
    ]
    const result = runCommand({ executable: "npx.cmd", args }, {
      env: {
        ...process.env,
        npm_execpath: path.join(root, "npm-cli.js"),
        SKILL_SYNC_TEST_ARGS: JSON.stringify(args),
      },
      timeout: 10000,
    })
    assert.equal(statusCode(result), 0, result.error?.message)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
