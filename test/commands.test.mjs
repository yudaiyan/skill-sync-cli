import test from "node:test"
import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { initCommand, syncCommand } from "../src/commands.mjs"
import { normalizeManifest } from "../src/manifest.mjs"
import { stateKey } from "../src/state.mjs"

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
  const errors = []
  t.mock.method(console, "log", () => {})
  t.mock.method(console, "error", (...args) => { errors.push(args.join(" ")) })
  await writeFile(filename, JSON.stringify({ version: 1, skills }))
  return { root, filename, errors }
}

function skillArgs(command) {
  const names = []
  const start = command.args.indexOf("--skill")
  for (let index = start + 1; index < command.args.length && !command.args[index].startsWith("-"); index += 1) {
    names.push(command.args[index])
  }
  return names
}

const offlineProbe = () => ({ status: "unknown" })

const batch = [
  { name: "first", source: "owner/repo" },
  { name: "disabled", source: "owner/repo", enabled: false },
  { name: "last", source: "owner/repo" },
]

const separate = [
  { name: "first", source: "owner/one" },
  { name: "last", source: "owner/two" },
]

test("sync batches entries sharing command flags and forwards a project directory", async (t) => {
  const { root, filename } = await manifestFixture(t, batch)
  const project = path.join(root, "application")
  await mkdir(project)
  const calls = []
  const code = await syncCommand(filename, {
    cwd: project,
    probe: offlineProbe,
    run(command, options) {
      calls.push(command)
      assert.equal(options.cwd, project)
      return { status: 0 }
    },
  })
  assert.equal(code, 0)
  assert.equal(calls.length, 1)
  assert.deepEqual(skillArgs(calls[0]), ["first", "last"])
})

test("sync installs entries separately when command flags differ", async (t) => {
  const { filename } = await manifestFixture(t, [
    { name: "one", source: "owner/repo" },
    { name: "two", source: "owner/repo", agents: ["codex"] },
    { name: "three", source: "other/repo" },
  ])
  const calls = []
  const code = await syncCommand(filename, {
    retries: 0,
    probe: offlineProbe,
    run(command) {
      calls.push(skillArgs(command))
      return { status: 0 }
    },
  })
  assert.equal(code, 0)
  assert.deepEqual(calls, [["one"], ["two"], ["three"]])
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
    const { filename } = await manifestFixture(t, separate)
    let calls = 0
    const code = await syncCommand(filename, {
      continueOnError,
      retries: 0,
      probe: offlineProbe,
      run() {
        calls += 1
        return { status: calls === 1 ? 7 : 0 }
      },
    })
    assert.equal(code, 1)
    assert.equal(calls, continueOnError ? 2 : 1)
  })
}

test("sync falls back to individual installs when a batch fails", async (t) => {
  const { filename, errors } = await manifestFixture(t, [
    { name: "good", source: "owner/repo" },
    { name: "bad", source: "owner/repo" },
  ])
  const calls = []
  const code = await syncCommand(filename, {
    retries: 0,
    probe: offlineProbe,
    run(command) {
      const names = skillArgs(command)
      calls.push(names)
      if (names.length > 1) return { status: 3 }
      return { status: names[0] === "bad" ? 9 : 0 }
    },
  })
  assert.equal(code, 1)
  assert.deepEqual(calls, [["good", "bad"], ["good"], ["bad"]])
  assert.ok(errors.some((line) => line.includes("batch install failed")))
  assert.ok(errors.some((line) => line.includes("[bad] failed with exit code 9")))
})

test("sync retries a failed install before giving up", async (t) => {
  const { filename } = await manifestFixture(t, [{ name: "flaky", source: "owner/repo" }])
  let calls = 0
  const code = await syncCommand(filename, {
    retries: 2,
    retryDelayMs: 0,
    probe: offlineProbe,
    run() {
      calls += 1
      return { status: calls < 3 ? 1 : 0 }
    },
  })
  assert.equal(code, 0)
  assert.equal(calls, 3)
})

test("sync stops retrying after the configured attempts", async (t) => {
  const { filename, errors } = await manifestFixture(t, [{ name: "broken", source: "owner/repo" }])
  let calls = 0
  const code = await syncCommand(filename, {
    retries: 1,
    retryDelayMs: 0,
    probe: offlineProbe,
    run() {
      calls += 1
      return { status: 5 }
    },
  })
  assert.equal(code, 1)
  assert.equal(calls, 2)
  assert.ok(errors.some((line) => line.includes("attempt 1/2 failed with exit code 5")))
})

test("sync never retries an interrupted install", async (t) => {
  const { filename } = await manifestFixture(t, [{ name: "interrupted", source: "owner/repo" }])
  let calls = 0
  const code = await syncCommand(filename, {
    retries: 3,
    retryDelayMs: 0,
    probe: offlineProbe,
    run() {
      calls += 1
      return { status: null, signal: "SIGINT" }
    },
  })
  assert.equal(code, 1)
  assert.equal(calls, 1)
})

test("sync stops on interruption even with continue-on-error", async (t) => {
  const { filename } = await manifestFixture(t, batch)
  let calls = 0
  assert.equal(await syncCommand(filename, {
    continueOnError: true,
    probe: offlineProbe,
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

const sha = (char) => char.repeat(40)

async function skipFixture(t, skills, { stateRevision, installed = true } = {}) {
  const { root, filename, errors } = await manifestFixture(t, skills)
  const home = path.join(root, "home")
  const cwd = path.join(root, "application")
  const stateFile = path.join(root, "state.json")
  const normalized = normalizeManifest({ version: 1, skills }).skills
  const key = stateKey(normalized)
  await mkdir(cwd, { recursive: true })
  if (installed) {
    for (const skill of skills) {
      await mkdir(path.join(home, ".agents", "skills", skill.name), { recursive: true })
    }
  }
  if (stateRevision !== undefined) {
    await writeFile(stateFile, JSON.stringify({
      version: 1,
      manifests: {
        [filename]: {
          [key]: {
            revision: stateRevision,
            skills: skills.map((skill) => skill.name),
            installedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      },
    }))
  }
  return { root, filename, errors, home, cwd, stateFile, key }
}

test("sync skips a group whose recorded revision is unchanged", async (t) => {
  const skills = [
    { name: "one", source: "owner/repo" },
    { name: "two", source: "owner/repo" },
  ]
  const { filename, home, cwd, stateFile } = await skipFixture(t, skills, { stateRevision: sha("a") })
  let calls = 0
  const code = await syncCommand(filename, {
    home,
    cwd,
    stateFile,
    probe: () => ({ status: "known", revision: sha("a") }),
    run() {
      calls += 1
      return { status: 0 }
    },
  })
  assert.equal(code, 0)
  assert.equal(calls, 0)
})

test("sync installs and records the revision when the remote moved", async (t) => {
  const skills = [{ name: "one", source: "owner/repo" }]
  const { filename, home, cwd, stateFile, key } = await skipFixture(t, skills, { stateRevision: sha("a") })
  const code = await syncCommand(filename, {
    home,
    cwd,
    stateFile,
    probe: () => ({ status: "known", revision: sha("b") }),
    run() {
      return { status: 0 }
    },
  })
  assert.equal(code, 0)
  const state = JSON.parse(await readFile(stateFile, "utf8"))
  assert.equal(state.manifests[filename][key].revision, sha("b"))
})

test("sync keeps the installed copy when the update check fails", async (t) => {
  const skills = [{ name: "one", source: "owner/repo" }]
  const { filename, home, cwd, stateFile, errors } = await skipFixture(t, skills, { stateRevision: sha("a") })
  let calls = 0
  const code = await syncCommand(filename, {
    home,
    cwd,
    stateFile,
    probe: () => ({ status: "error", message: "timed out" }),
    run() {
      calls += 1
      return { status: 0 }
    },
  })
  assert.equal(code, 0)
  assert.equal(calls, 0)
  assert.ok(errors.some((line) => line.includes("update check failed")))
})

test("sync attempts installation when the check fails without recorded state", async (t) => {
  const skills = [{ name: "one", source: "owner/repo" }]
  const { filename, home, cwd, stateFile } = await skipFixture(t, skills)
  let calls = 0
  const code = await syncCommand(filename, {
    home,
    cwd,
    stateFile,
    probe: () => ({ status: "error", message: "timed out" }),
    run() {
      calls += 1
      return { status: 0 }
    },
  })
  assert.equal(code, 0)
  assert.equal(calls, 1)
})

test("sync records the revision after a first install without checking first", async (t) => {
  const skills = [{ name: "one", source: "owner/repo" }]
  const { filename, home, cwd, stateFile } = await skipFixture(t, skills, { installed: false })
  const events = []
  const code = await syncCommand(filename, {
    home,
    cwd,
    stateFile,
    probe() {
      events.push("probe")
      return { status: "known", revision: sha("d") }
    },
    run() {
      events.push("run")
      return { status: 0 }
    },
  })
  assert.equal(code, 0)
  assert.deepEqual(events, ["run", "probe"])
  const state = JSON.parse(await readFile(stateFile, "utf8"))
  assert.equal(Object.values(state.manifests[filename])[0].revision, sha("d"))
})

test("sync applies the GitHub mirror to installs and update checks", async (t) => {
  const skills = [{ name: "one", source: "owner/repo" }]
  const { filename, home, cwd, stateFile } = await skipFixture(t, skills, { installed: false })
  let runEnv
  let probeEnv
  const code = await syncCommand(filename, {
    githubMirror: "https://gh-proxy.com",
    home,
    cwd,
    stateFile,
    probe(url, ref, options) {
      probeEnv = options?.env
      return { status: "unknown" }
    },
    run(command, options) {
      runEnv = options.env
      return { status: 0 }
    },
  })
  assert.equal(code, 0)
  for (const env of [runEnv, probeEnv]) {
    assert.equal(env.GIT_CONFIG_KEY_0, "url.https://gh-proxy.com/https://github.com/.insteadOf")
    assert.equal(env.GIT_CONFIG_VALUE_0, "https://github.com/")
  }
})

test("sync rejects an invalid GitHub mirror before installing", async (t) => {
  const skills = [{ name: "one", source: "owner/repo" }]
  const { filename, home, cwd, stateFile } = await skipFixture(t, skills)
  await assert.rejects(syncCommand(filename, {
    githubMirror: "ftp://mirror",
    home,
    cwd,
    stateFile,
    run() {
      assert.fail("must not run")
    },
  }), /http\(s\) URL/)
})

test("sync --force reinstalls an unchanged group", async (t) => {
  const skills = [{ name: "one", source: "owner/repo" }]
  const { filename, home, cwd, stateFile } = await skipFixture(t, skills, { stateRevision: sha("a") })
  let calls = 0
  const code = await syncCommand(filename, {
    force: true,
    home,
    cwd,
    stateFile,
    probe: () => ({ status: "known", revision: sha("a") }),
    run() {
      calls += 1
      return { status: 0 }
    },
  })
  assert.equal(code, 0)
  assert.equal(calls, 1)
})

test("sync skips an immutable commit ref without probing", async (t) => {
  const skills = [{ name: "one", source: "owner/repo", ref: sha("c") }]
  const { filename, home, cwd, stateFile } = await skipFixture(t, skills, { stateRevision: sha("c") })
  let calls = 0
  const code = await syncCommand(filename, {
    home,
    cwd,
    stateFile,
    probe() {
      assert.fail("immutable refs must not be probed")
    },
    run() {
      calls += 1
      return { status: 0 }
    },
  })
  assert.equal(code, 0)
  assert.equal(calls, 0)
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
