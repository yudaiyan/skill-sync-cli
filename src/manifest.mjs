import { readFile } from "node:fs/promises"
import path from "node:path"

export const MANIFEST_VERSION = 1
export const DEFAULT_SKILLS_CLI = "1.5.22"
export const DEFAULT_AGENTS = ["opencode"]
export const DEFAULT_SCOPE = "global"
export const DEFAULT_COPY = true

function fail(message) {
  throw new Error(`Invalid skills manifest: ${message}`)
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function assertString(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    fail(`${label} must be a non-empty string`)
  }
  return value.trim()
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    fail(`${label} must be a non-empty array of strings`)
  }

  const result = value.map((item, index) =>
    assertString(item, `${label}[${index}]`),
  )

  if (new Set(result).size !== result.length) {
    fail(`${label} must not contain duplicate values`)
  }

  return result
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") fail(`${label} must be a boolean`)
  return value
}

function isLocalSource(source) {
  return (
    source === "." ||
    source === ".." ||
    source.startsWith("./") ||
    source.startsWith("../") ||
    source.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/.test(source)
  )
}

function validateSource(source, label) {
  if (isLocalSource(source)) {
    fail(`${label} is a local path; use a remote Git, URL, or archive source`)
  }

  if (/\r|\n|\0/.test(source)) {
    fail(`${label} contains a control character`)
  }

  return source
}

function validateRef(ref, label) {
  if (/[\r\n\0#]/.test(ref)) {
    fail(`${label} contains an invalid character`)
  }
  return ref
}

function normalizeDefaults(rawDefaults) {
  if (rawDefaults === undefined) return {
    agents: [...DEFAULT_AGENTS],
    scope: DEFAULT_SCOPE,
    copy: DEFAULT_COPY,
  }

  if (!isPlainObject(rawDefaults)) fail("defaults must be an object")

  const agents = rawDefaults.agents === undefined
    ? [...DEFAULT_AGENTS]
    : assertStringArray(rawDefaults.agents, "defaults.agents")
  const scope = rawDefaults.scope === undefined
    ? DEFAULT_SCOPE
    : assertString(rawDefaults.scope, "defaults.scope")
  const copy = rawDefaults.copy === undefined
    ? DEFAULT_COPY
    : assertBoolean(rawDefaults.copy, "defaults.copy")

  if (scope !== "global" && scope !== "project") {
    fail('defaults.scope must be "global" or "project"')
  }

  return { agents, scope, copy }
}

function normalizeCli(rawCli) {
  if (rawCli === undefined) {
    return { package: "skills", version: DEFAULT_SKILLS_CLI }
  }

  if (!isPlainObject(rawCli)) fail("cli must be an object")

  const packageName = rawCli.package === undefined
    ? "skills"
    : assertString(rawCli.package, "cli.package")
  const version = rawCli.version === undefined
    ? DEFAULT_SKILLS_CLI
    : assertString(rawCli.version, "cli.version")

  if (/\s|[;&|<>`$]/.test(packageName)) {
    fail("cli.package contains shell-like characters")
  }

  if (/\s|[;&|<>`$]/.test(version)) {
    fail("cli.version contains shell-like characters")
  }

  return { package: packageName, version }
}

function normalizeSkill(rawSkill, index, defaults) {
  if (!isPlainObject(rawSkill)) fail(`skills[${index}] must be an object`)

  const name = assertString(rawSkill.name, `skills[${index}].name`)
  const source = validateSource(
    assertString(rawSkill.source, `skills[${index}].source`),
    `skills[${index}].source`,
  )
  const ref = rawSkill.ref === undefined
    ? undefined
    : validateRef(assertString(rawSkill.ref, `skills[${index}].ref`), `skills[${index}].ref`)
  const description = rawSkill.description === undefined
    ? undefined
    : assertString(rawSkill.description, `skills[${index}].description`)
  const enabled = rawSkill.enabled === undefined
    ? true
    : assertBoolean(rawSkill.enabled, `skills[${index}].enabled`)
  const agents = rawSkill.agents === undefined
    ? [...defaults.agents]
    : assertStringArray(rawSkill.agents, `skills[${index}].agents`)
  const scope = rawSkill.scope === undefined
    ? defaults.scope
    : assertString(rawSkill.scope, `skills[${index}].scope`)
  const copy = rawSkill.copy === undefined
    ? defaults.copy
    : assertBoolean(rawSkill.copy, `skills[${index}].copy`)

  if (scope !== "global" && scope !== "project") {
    fail(`skills[${index}].scope must be "global" or "project"`)
  }

  const unknownKeys = Object.keys(rawSkill).filter((key) =>
    !["name", "source", "description", "ref", "enabled", "agents", "scope", "copy"].includes(key),
  )
  if (unknownKeys.length > 0) {
    fail(`skills[${index}] contains unknown field(s): ${unknownKeys.join(", ")}`)
  }

  return { name, source, description, ref, enabled, agents, scope, copy }
}

export function normalizeManifest(raw) {
  if (!isPlainObject(raw)) fail("root value must be an object")

  if (raw.version !== MANIFEST_VERSION) {
    fail(`version must be ${MANIFEST_VERSION}`)
  }

  if (!Array.isArray(raw.skills) || raw.skills.length === 0) {
    fail("skills must be a non-empty array")
  }

  const defaults = normalizeDefaults(raw.defaults)
  const cli = normalizeCli(raw.cli)
  const skills = raw.skills.map((skill, index) =>
    normalizeSkill(skill, index, defaults),
  )

  const identities = new Set()
  for (const skill of skills) {
    const identity = JSON.stringify([
      skill.source,
      skill.ref ?? null,
      skill.name,
      skill.scope,
      skill.agents,
    ])
    if (identities.has(identity)) {
      fail(`duplicate skill declaration: ${skill.name} from ${skill.source}`)
    }
    identities.add(identity)
  }

  return { version: MANIFEST_VERSION, cli, defaults, skills }
}

export async function readManifest(filename) {
  const absolutePath = path.resolve(filename)
  let text
  try {
    text = await readFile(absolutePath, "utf8")
  } catch (error) {
    throw new Error(`Cannot read manifest ${absolutePath}: ${error.message}`)
  }

  let raw
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new Error(`Cannot parse manifest ${absolutePath}: ${error.message}`)
  }

  return { path: absolutePath, manifest: normalizeManifest(raw) }
}

export function sourceWithRef(source, ref) {
  if (!ref) return source
  if (source.includes("#")) {
    throw new Error(`Source already contains a ref fragment; remove ref or use one source ref: ${source}`)
  }
  return `${source}#${encodeURIComponent(ref)}`
}
