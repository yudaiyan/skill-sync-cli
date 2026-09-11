const MAX_MANIFEST_BYTES = 1024 * 1024

export function normalizeManifestUrl(input) {
  let parsed
  try {
    parsed = new URL(input)
  } catch {
    return input
  }

  if (parsed.hostname === "gitee.com") {
    const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/)
    if (match) return `${parsed.origin}/${match[1]}/${match[2]}/raw/${match[3]}`
  }

  if (parsed.hostname === "github.com") {
    const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/)
    if (match) return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}`
  }

  return input
}

export async function downloadManifest(url, { fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    throw new Error("--from requires an http(s) URL")
  }

  const normalized = normalizeManifestUrl(url)
  let response
  try {
    response = await fetchImpl(normalized, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "skill-sync-cli" },
    })
  } catch (error) {
    throw new Error(`Cannot download manifest from ${normalized}: ${error.message}`)
  }

  if (!response.ok) {
    throw new Error(`Cannot download manifest from ${normalized}: HTTP ${response.status}`)
  }

  const text = await response.text()
  if (Buffer.byteLength(text, "utf8") > MAX_MANIFEST_BYTES) {
    throw new Error(`Remote manifest is too large (limit ${MAX_MANIFEST_BYTES} bytes): ${normalized}`)
  }

  return { url: normalized, text: text.replace(/^\uFEFF/, "") }
}
