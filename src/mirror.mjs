export const GITHUB_BASE = "https://github.com/"

export function normalizeMirror(mirror) {
  if (mirror === undefined || mirror === null || mirror === "") return undefined
  if (typeof mirror !== "string") throw new Error("GitHub mirror must be a URL")

  let url
  try {
    url = new URL(mirror.trim())
  } catch {
    throw new Error(`Invalid GitHub mirror URL: ${mirror}`)
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`GitHub mirror must be an http(s) URL: ${mirror}`)
  }
  url.hash = ""
  url.search = ""
  const href = url.toString()
  return href.endsWith("/") ? href : `${href}/`
}

// Git rewrites https://github.com/... to <mirror>https://github.com/... through
// the GIT_CONFIG_* environment variables, so the rewrite applies to every git
// process this tool starts without touching the user's global configuration.
export function mirrorGitEnv(mirror, baseEnv = process.env) {
  const normalized = normalizeMirror(mirror)
  if (!normalized) return undefined

  const env = { ...baseEnv }
  const parsed = Number.parseInt(env.GIT_CONFIG_COUNT ?? "0", 10)
  const start = Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
  env.GIT_CONFIG_COUNT = String(start + 1)
  env[`GIT_CONFIG_KEY_${start}`] = `url.${normalized}${GITHUB_BASE}.insteadOf`
  env[`GIT_CONFIG_VALUE_${start}`] = GITHUB_BASE
  return env
}
