import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { gitUrlForSource, isCommitSha, probeRevision } from "../src/revision.mjs"

const sha = "a".repeat(40)

test("recognizes full commit SHAs", () => {
  assert.equal(isCommitSha(sha), true)
  assert.equal(isCommitSha(sha.toUpperCase()), true)
  assert.equal(isCommitSha("main"), false)
  assert.equal(isCommitSha(undefined), false)
})

test("derives probeable Git URLs from supported sources", () => {
  assert.equal(gitUrlForSource("owner/repo"), "https://github.com/owner/repo.git")
  assert.equal(gitUrlForSource("https://github.com/owner/repo"), "https://github.com/owner/repo.git")
  assert.equal(gitUrlForSource("https://github.com/owner/repo.git"), "https://github.com/owner/repo.git")
  assert.equal(gitUrlForSource("https://github.com/owner/repo/tree/main/skills/one"), "https://github.com/owner/repo.git")
  assert.equal(gitUrlForSource("git@github.com:owner/repo.git"), "git@github.com:owner/repo.git")
  assert.equal(gitUrlForSource("https://example.com/downloads/skill.zip"), null)
  assert.equal(gitUrlForSource("./local-skill"), null)
})

test("probes a real repository through git ls-remote", {
  skip: spawnSync("git", ["--version"], { windowsHide: true }).status !== 0,
}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "skill-sync-revision-"))
  const git = (...args) => spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true })

  try {
    git("init", "-b", "main")
    await writeFile(path.join(root, "SKILL.md"), "test")
    git("add", ".")
    git("-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-m", "init")

    const head = probeRevision(root, undefined)
    assert.equal(head.status, "known")
    assert.match(head.revision, /^[0-9a-f]{40}$/)

    const branch = probeRevision(root, "main")
    assert.deepEqual(branch, head)
    assert.deepEqual(probeRevision(root, "missing-ref"), { status: "unknown" })
    assert.equal(probeRevision(path.join(root, "missing"), "HEAD").status, "error")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
