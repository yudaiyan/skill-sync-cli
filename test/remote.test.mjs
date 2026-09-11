import test from "node:test"
import assert from "node:assert/strict"
import { normalizeManifestUrl, downloadManifest } from "../src/remote.mjs"

test("converts Gitee blob pages to raw file URLs", () => {
  assert.equal(
    normalizeManifestUrl("https://gitee.com/ai_1024/skill-sync/blob/main/skills.json"),
    "https://gitee.com/ai_1024/skill-sync/raw/main/skills.json",
  )
})

test("converts GitHub blob pages to raw file URLs", () => {
  assert.equal(
    normalizeManifestUrl("https://github.com/owner/repo/blob/main/skills.json"),
    "https://raw.githubusercontent.com/owner/repo/main/skills.json",
  )
})

test("keeps raw and unrelated URLs unchanged", () => {
  for (const url of [
    "https://gitee.com/ai_1024/skill-sync/raw/main/skills.json",
    "https://raw.githubusercontent.com/owner/repo/main/skills.json",
    "https://example.com/skills.json",
  ]) {
    assert.equal(normalizeManifestUrl(url), url)
  }
})

test("rejects non-http sources", async () => {
  for (const source of ["./skills.json", "file:///tmp/skills.json", "git@gitee.com:ai_1024/skill-sync.git"]) {
    await assert.rejects(downloadManifest(source), /http\(s\) URL/)
  }
})

test("reports download failures and size limits", async () => {
  await assert.rejects(
    downloadManifest("https://example.com/missing.json", {
      fetchImpl: async () => ({ ok: false, status: 404 }),
    }),
    /HTTP 404/,
  )
  await assert.rejects(
    downloadManifest("https://example.com/big.json", {
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => "x".repeat(1024 * 1024 + 1) }),
    }),
    /too large/,
  )
  await assert.rejects(
    downloadManifest("https://example.com/skills.json", {
      fetchImpl: async () => { throw new Error("boom") },
    }),
    /Cannot download manifest from .*: boom/,
  )
})
