import test from "node:test"
import assert from "node:assert/strict"
import { normalizeManifest, sourceWithRef } from "../src/manifest.mjs"
import { commandFor } from "../src/runner.mjs"

test("normalizes defaults and skill declarations", () => {
  const manifest = normalizeManifest({
    version: 1,
    skills: [
      {
        name: "matplotlib",
        source: "k-dense-ai/scientific-agent-skills",
        description: "绘制和导出科研图表",
      },
    ],
  })

  assert.equal(manifest.cli.package, "skills")
  assert.equal(manifest.cli.version, "1.5.22")
  assert.deepEqual(manifest.skills[0].agents, ["opencode"])
  assert.equal(manifest.skills[0].scope, "global")
  assert.equal(manifest.skills[0].copy, true)
  assert.equal(manifest.skills[0].description, "绘制和导出科研图表")
})

test("rejects local sources for a portable manifest", () => {
  assert.throws(
    () => normalizeManifest({
      version: 1,
      skills: [{ name: "local", source: "./local-skill" }],
    }),
    /local path/,
  )
})

test("rejects duplicate declarations", () => {
  assert.throws(
    () => normalizeManifest({
      version: 1,
      skills: [
        { name: "review", source: "owner/repo" },
        { name: "review", source: "owner/repo" },
      ],
    }),
    /duplicate skill declaration/,
  )
})

test("encodes a ref in the source fragment", () => {
  assert.equal(
    sourceWithRef("owner/repo", "feature/one"),
    "owner/repo#feature%2Fone",
  )
})

test("builds a platform-independent skills command", () => {
  const command = commandFor(
    {
      name: "matplotlib",
      source: "owner/repo",
      ref: "main",
      agents: ["opencode", "codex"],
      scope: "global",
      copy: true,
    },
    { package: "skills", version: "1.5.22" },
  )

  assert.deepEqual(command.args, [
    "--yes",
    "skills@1.5.22",
    "add",
    "owner/repo#main",
    "--agent",
    "opencode",
    "--agent",
    "codex",
    "--skill",
    "matplotlib",
    "--global",
    "--copy",
    "--yes",
  ])
})
