import test from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { initCommand, syncCommand } from "../src/commands.mjs"

test("init creates the fixed config file's parent directories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "skill-sync-init-"))
  const filename = path.join(root, ".config", "skill-sync", "skills.json")

  try {
    assert.equal(await initCommand(filename), 0)
    const content = JSON.parse(await readFile(filename, "utf8"))
    assert.equal(content.version, 1)
    assert.equal(content.skills[0].name, "find-skills")
    await assert.rejects(initCommand(filename), /already exists/)
    assert.deepEqual(JSON.parse(await readFile(filename, "utf8")), content)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function manifestFixture(t, skills) {
  const root = await mkdtemp(path.join(os.tmpdir(), "skill-sync-batch-"))
  const filename = path.join(root, "skills.json")
  t.after(() => rm(root, { recursive: true, force: true }))
  t.mock.method(console, "log", () => {})
  t.mock.method(console, "error", () => {})
  await writeFile(filename, JSON.stringify({ version: 1, skills }))
  return { root, filename }
}

const batch = [
  { name: "first", source: "owner/repo" },
  { name: "disabled", source: "owner/repo", enabled: false },
  { name: "last", source: "owner/repo" },
]

test("sync skips disabled entries and forwards a separate project directory", async (t) => {
  const { root, filename } = await manifestFixture(t, batch)
  const project = path.join(root, "application")
  await mkdir(project)
  const installed = []
  const code = await syncCommand(filename, {
    cwd: project,
    run(command, options) {
      installed.push(command.args[command.args.indexOf("--skill") + 1])
      assert.equal(options.cwd, project)
      return { status: 0 }
    },
  })
  assert.equal(code, 0)
  assert.deepEqual(installed, ["first", "last"])
})

test("dry-run never starts an installer", async (t) => {
  const { filename } = await manifestFixture(t, batch)
  assert.equal(await syncCommand(filename, {
    dryRun: true,
    run() { assert.fail("dry-run must not run a command") },
  }), 0)
})

for (const continueOnError of [false, true]) {
  test(`sync reports failure with continueOnError=${continueOnError}`, async (t) => {
    const { filename } = await manifestFixture(t, batch)
    let calls = 0
    const code = await syncCommand(filename, {
      continueOnError,
      run() {
        calls += 1
        return { status: calls === 1 ? 7 : 0 }
      },
    })
    assert.equal(code, 1)
    assert.equal(calls, continueOnError ? 2 : 1)
  })
}

test("sync stops on interruption even with continue-on-error", async (t) => {
  const { filename } = await manifestFixture(t, batch)
  let calls = 0
  assert.equal(await syncCommand(filename, {
    continueOnError: true,
    run() {
      calls += 1
      return { status: null, signal: "SIGINT" }
    },
  }), 1)
  assert.equal(calls, 1)
})

test("sync checks every command before starting any installation", async (t) => {
  const { filename } = await manifestFixture(t, [
    batch[0],
    { name: "invalid", source: "owner/repo#main", ref: "other" },
  ])
  await assert.rejects(syncCommand(filename, {
    run() { assert.fail("invalid plan must not start an installation") },
  }), /already contains a ref/)
})

test("init downloads a remote manifest and validates it before writing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "skill-sync-remote-"))
  const filename = path.join(root, "remote.json")
  const remoteText = JSON.stringify({
    version: 1,
    skills: [{ name: "remote-skill", source: "owner/repo" }],
  })
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => remoteText })

  try {
    assert.equal(
      await initCommand(filename, { from: "https://example.com/skills.json", fetchImpl }),
      0,
    )
    assert.equal(JSON.parse(await readFile(filename, "utf8")).skills[0].name, "remote-skill")
    await assert.rejects(
      initCommand(filename, { from: "https://example.com/skills.json", fetchImpl }),
      /already exists/,
    )

    const invalid = path.join(root, "invalid.json")
    await assert.rejects(initCommand(invalid, {
      from: "https://example.com/bad.json",
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => "{\"version\": 2}" }),
    }), /Remote manifest at .* is invalid/)
    assert.ok(!existsSync(invalid))

    await assert.rejects(initCommand(path.join(root, "missing.json"), {
      from: "https://example.com/missing.json",
      fetchImpl: async () => ({ ok: false, status: 404 }),
    }), /HTTP 404/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
