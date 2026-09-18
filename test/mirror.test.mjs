import test from "node:test"
import assert from "node:assert/strict"
import { mirrorGitEnv, normalizeMirror } from "../src/mirror.mjs"

test("normalizes mirror URLs", () => {
  assert.equal(normalizeMirror("https://gh-proxy.com"), "https://gh-proxy.com/")
  assert.equal(normalizeMirror(" https://gh-proxy.com/gh/ "), "https://gh-proxy.com/gh/")
  assert.equal(normalizeMirror(undefined), undefined)
  assert.equal(normalizeMirror(""), undefined)
  assert.throws(() => normalizeMirror("not a url"), /Invalid GitHub mirror URL/)
  assert.throws(() => normalizeMirror("ftp://example.com"), /http\(s\) URL/)
})

test("builds git insteadOf environment variables without losing existing entries", () => {
  const env = mirrorGitEnv("https://gh-proxy.com", {
    PATH: "x",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "keep",
    GIT_CONFIG_VALUE_0: "value",
  })
  assert.equal(env.GIT_CONFIG_COUNT, "2")
  assert.equal(env.GIT_CONFIG_KEY_0, "keep")
  assert.equal(env.GIT_CONFIG_KEY_1, "url.https://gh-proxy.com/https://github.com/.insteadOf")
  assert.equal(env.GIT_CONFIG_VALUE_1, "https://github.com/")
  assert.equal(env.PATH, "x")
  assert.equal(mirrorGitEnv(undefined), undefined)
})
