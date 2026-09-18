import { spawnSync } from "node:child_process"

const COMMIT_SHA = /^[0-9a-f]{40}$/i
const SHORTHAND = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/
const KNOWN_GIT_HOSTS = /(^|\.)(github\.com|gitlab\.com|bitbucket\.org|gitee\.com)$/i

export function isCommitSha(ref) {
  return typeof ref === "string" && COMMIT_SHA.test(ref)
}

// Returns a URL git ls-remote can probe, or null when the source is not a
// plain Git repository (direct downloads, archives, unknown hosts).
export function gitUrlForSource(source) {
  if (SHORTHAND.test(source) && !source.split("/").some((part) => part.startsWith("."))) {
    return `https://github.com/${source}.git`
  }
  if (/^git@[^:]+:.+/.test(source)) return source

  let url
  try {
    url = new URL(source)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (!url.pathname.endsWith(".git") && !KNOWN_GIT_HOSTS.test(url.hostname)) return null

  const tree = url.pathname.indexOf("/tree/")
  if (tree !== -1) url.pathname = url.pathname.slice(0, tree)
  if (!url.pathname.endsWith(".git")) url.pathname += ".git"
  url.search = ""
  url.hash = ""
  return url.toString()
}

export function probeRevision(url, ref, { timeoutMs = 10000 } = {}) {
  const result = spawnSync("git", ["ls-remote", url, ref ?? "HEAD"], {
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  })

  if (result.error) return { status: "error", message: result.error.message }
  if (result.status !== 0) {
    const message = (result.stderr || "").trim() || `git ls-remote exited with code ${result.status}`
    return { status: "error", message }
  }

  const line = (result.stdout || "").split(/\r?\n/).find((entry) => entry.trim() !== "")
  if (!line) return { status: "unknown" }
  const revision = line.trim().split(/\s+/)[0]
  if (!COMMIT_SHA.test(revision)) return { status: "unknown" }
  return { status: "known", revision: revision.toLowerCase() }
}
