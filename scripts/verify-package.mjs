import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const projectRoot = fileURLToPath(new URL("../", import.meta.url))
const outputDirectory = path.join(projectRoot, "dist")
const reportPath = path.join(outputDirectory, "package-check.json")
const metadata = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"))
const npmCli = process.env.npm_execpath
const npxCli = npmCli && path.join(path.dirname(npmCli), "npx-cli.js")
assert.ok(npmCli && npxCli && existsSync(npxCli), "Run this check with npm run test:package")

function invoke(cli, args, { cwd = projectRoot, env = process.env, status = 0 } = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env,
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  })
  if (result.error) throw result.error
  assert.equal(result.status, status, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`)
  return result.stdout.trim()
}

const checks = []
async function check(name, action) {
  await action()
  checks.push(name)
  console.log(`[ok] ${name}`)
}

await mkdir(outputDirectory, { recursive: true })
await rm(reportPath, { force: true })
// A publish dry run still needs a real archive for this installation check.
const [packed] = JSON.parse(invoke(npmCli, ["pack", "--dry-run=false", "--json", "--pack-destination", outputDirectory]))
const archive = path.join(outputDirectory, packed.filename)
// A file URL makes npx infer the package's bin. A bare Windows archive path
// can instead be treated as a command to open through a file association.
const archiveSpec = pathToFileURL(archive).href

await check("archive includes the CLI, runtime modules, schema, examples, and documentation", () => {
  assert.equal(packed.name, metadata.name)
  assert.equal(packed.version, metadata.version)
  const files = new Set(packed.files.map((file) => file.path))
  for (const filename of [
    "bin/skill-sync.mjs", "src/config.mjs", "src/commands.mjs", "src/manifest.mjs", "src/runner.mjs",
    "package.json", "schemas/skills-sync.schema.json", "skills.json.example",
    "README.md", "README.zh-CN.md", "RELEASING.md", "LICENSE",
  ]) {
    assert.ok(files.has(filename), `Missing packaged file: ${filename}`)
  }
  assert.ok([...files].every((filename) =>
    /^(?:bin\/|src\/|schemas\/|package\.json$|skills\.json\.example$|README(?:\.zh-CN)?\.md$|RELEASING\.md$|LICENSE$)/.test(filename),
  ), "Unexpected file in release archive")
})

// Spaces in the path also exercise npx's handling of Windows user directories.
const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), "skill sync package-"))
try {
  const sandboxHome = path.join(sandboxRoot, "user")
  const sandboxProject = path.join(sandboxRoot, "project")
  const sandboxTemp = path.join(sandboxRoot, "tmp")
  const sandboxCache = path.join(sandboxRoot, "npm-cache")
  const configFilename = path.join(sandboxHome, ".config", "skill-sync", "skills.json")
  const userNpmrc = path.join(sandboxRoot, "user.npmrc")
  const globalNpmrc = path.join(sandboxRoot, "global.npmrc")
  await Promise.all([
    sandboxHome, sandboxProject, sandboxTemp, sandboxCache,
    path.join(sandboxHome, "AppData", "Roaming"), path.join(sandboxHome, "AppData", "Local"),
  ].map((directory) => mkdir(directory, { recursive: true })))
  await Promise.all([
    writeFile(userNpmrc, ""),
    writeFile(globalNpmrc, ""),
    writeFile(path.join(sandboxProject, "skills.json"), "This project file must not be loaded."),
  ])

  const sandboxEnv = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith("npm_config_"))),
    HOME: sandboxHome,
    USERPROFILE: sandboxHome,
    APPDATA: path.join(sandboxHome, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(sandboxHome, "AppData", "Local"),
    TEMP: sandboxTemp,
    TMP: sandboxTemp,
    TMPDIR: sandboxTemp,
    npm_config_cache: sandboxCache,
    npm_config_userconfig: userNpmrc,
    npm_config_globalconfig: globalNpmrc,
    npm_config_registry: "https://registry.npmjs.org/",
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    DO_NOT_TRACK: "1",
  }
  const run = (args, status = 0) => invoke(npxCli, ["--offline", "--yes", archiveSpec, ...args], {
    cwd: sandboxProject, env: sandboxEnv, status,
  })

  await check("npx infers the package executable and displays help", () => {
    const output = run(["--help"])
    assert.ok(output.startsWith(`${metadata.name} `))
    assert.ok(output.includes(`npx ${metadata.name} <command>`))
    assert.doesNotMatch(output, /^\s*skill-sync(?:\s|:)/m)
  })
  await check("CLI version matches package.json", () => {
    assert.equal(run(["--version"]), metadata.version)
  })
  await check("configuration resolves inside the temporary user directory", () => {
    assert.equal(run(["path"]), configFilename)
    assert.ok(!existsSync(configFilename))
    run(["validate"], 1)
  })
  await check("init creates a usable manifest in a fresh environment", async () => {
    assert.match(run(["init"]), /Created /)
    const manifest = JSON.parse(await readFile(configFilename, "utf8"))
    assert.equal(manifest.version, 1)
    assert.equal(manifest.skills[0].name, "find-skills")
  })
  await check("repeated init preserves an existing manifest", async () => {
    const before = await readFile(configFilename, "utf8")
    run(["init"], 1)
    assert.equal(await readFile(configFilename, "utf8"), before)
  })
  await check("validate loads the user manifest from an unrelated working directory", () => {
    assert.match(run(["validate"]), /Valid manifest:/)
  })
  await check("plan reflects edits, descriptions, target agents, and disabled entries", async () => {
    const manifest = JSON.parse(await readFile(configFilename, "utf8"))
    manifest.defaults.agents = ["opencode", "codex"]
    manifest.skills[0].description = "Package preview check"
    manifest.skills.push({ name: "disabled-example", source: "owner/repo", enabled: false })
    await writeFile(configFilename, JSON.stringify(manifest))
    const output = run(["plan"])
    assert.match(output, /Package preview check/)
    assert.match(output, /--agent opencode --agent codex/)
    assert.match(output, /--skill find-skills/)
    assert.doesNotMatch(output, /disabled-example/)
  })
  await check("sync --dry-run previews enabled skills offline", () => {
    const output = run(["sync", "--dry-run"])
    assert.match(output, /Syncing 1 skill /)
    assert.match(output, /--skill find-skills/)
    assert.doesNotMatch(output, /disabled-example/)
  })
  await check("invalid manifest versions return an error", async () => {
    await writeFile(configFilename, JSON.stringify({ version: 999, skills: [] }))
    run(["validate"], 1)
  })
  await check("init --force restores the sample when explicitly requested", async () => {
    run(["init", "--force"])
    assert.equal(JSON.parse(await readFile(configFilename, "utf8")).version, 1)
  })
  await check("sync succeeds without installing when all entries are disabled", async () => {
    const manifest = JSON.parse(await readFile(configFilename, "utf8"))
    for (const skill of manifest.skills) skill.enabled = false
    await writeFile(configFilename, JSON.stringify(manifest))
    assert.match(run(["sync"]), /No enabled skills/)
    assert.ok(!existsSync(path.join(sandboxHome, ".agents")))
    assert.ok(!existsSync(path.join(sandboxHome, ".config", "opencode", "skills")))
  })

  const repositoryManifest = path.join(sandboxRoot, "config repo", "skills.json")
  const relativeManifest = path.relative(sandboxProject, repositoryManifest)
  const originalUserConfig = await readFile(configFilename, "utf8")
  await check("init --config creates a repository manifest without changing user configuration", async () => {
    run(["init", "--config", relativeManifest])
    assert.equal(JSON.parse(await readFile(repositoryManifest, "utf8")).version, 1)
    assert.equal(await readFile(configFilename, "utf8"), originalUserConfig)
  })
  await check("external config options work before and after subcommands", () => {
    assert.equal(run(["--config", repositoryManifest, "path"]), repositoryManifest)
    assert.equal(run(["path", "-c", relativeManifest]), repositoryManifest)
    assert.match(run([`--config=${relativeManifest}`, "validate"]), /Valid manifest:/)
  })
  await check("plan and dry-run read the repository manifest independently of the user file", async () => {
    const manifest = JSON.parse(await readFile(repositoryManifest, "utf8"))
    manifest.defaults.scope = "project"
    manifest.skills[0].description = "Repository configuration check"
    await writeFile(repositoryManifest, JSON.stringify(manifest))
    assert.match(run(["plan", "--config", relativeManifest]), /Repository configuration check/)
    const output = run(["sync", "--dry-run", "--config", relativeManifest])
    assert.match(output, /--skill find-skills/)
    assert.doesNotMatch(output, /--global\b/)
    assert.equal(await readFile(configFilename, "utf8"), originalUserConfig)
  })
  await check("an explicit missing manifest produces a failure", () => {
    run(["validate", "--config", path.join(sandboxRoot, "missing.json")], 1)
    run(["init", "--config"], 1)
  })
  await check("the installed skill-sync-cli executable works through explicit package selection", () => {
    assert.equal(invoke(npxCli, ["--offline", "--yes", "--package", archive, "skill-sync-cli", "--version"], {
      cwd: sandboxProject, env: sandboxEnv,
    }), metadata.version)
  })
} finally {
  await rm(sandboxRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}

await writeFile(reportPath, `${JSON.stringify({
  name: packed.name,
  version: packed.version,
  archive: packed.filename,
  size: packed.size,
  shasum: packed.shasum,
  integrity: packed.integrity,
  files: packed.files.map((file) => file.path),
  checkedAt: new Date().toISOString(),
  platform: process.platform,
  node: process.version,
  checks,
}, null, 2)}\n`)
console.log(`\nPassed ${checks.length} package checks.\nArchive: ${archive}\nReport: ${reportPath}`)
