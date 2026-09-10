import test from "node:test"
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const cli = fileURLToPath(new URL("../bin/skill-sync.mjs", import.meta.url))

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "skill-sync-config-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const userHome = path.join(root, "user")
  const project = path.join(root, "application")
  const defaultFile = path.join(userHome, ".config", "skill-sync", "skills.json")
  await Promise.all([
    mkdir(project),
    mkdir(path.dirname(defaultFile), { recursive: true }),
  ])
  await writeFile(defaultFile, "Keep the default user file unchanged.")
  const run = (args, status = 0) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: project,
      env: {
        ...process.env,
        HOME: userHome,
        USERPROFILE: userHome,
        npm_config_cache: path.join(root, "npm-cache"),
        npm_config_offline: "true",
      },
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    })
    if (result.error) throw result.error
    assert.equal(result.status, status, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`)
    return result
  }
  return { root, userHome, project, defaultFile, run }
}

test("CLI initializes and reads an external repository manifest from another project", async (t) => {
  const { root, project, defaultFile, run } = await fixture(t)
  const defaultBefore = await readFile(defaultFile, "utf8")
  const filename = path.join(root, "config repo", "nested", "skills.json")
  const relative = path.relative(project, filename)
  run(["--config", relative, "init"])
  const manifest = JSON.parse(await readFile(filename, "utf8"))
  manifest.defaults.scope = "project"
  manifest.skills[0].name = "repository-only-skill"
  await writeFile(filename, JSON.stringify(manifest))

  for (const args of [
    ["path", "--config", filename],
    [`--config=${relative}`, "path"],
    ["path", "-c", relative],
  ]) {
    assert.equal(run(args).stdout.trim(), filename)
  }
  assert.match(run(["validate", "--config", relative]).stdout, /Valid manifest:/)
  assert.match(run(["-c", relative, "plan"]).stdout, /--skill repository-only-skill/)
  const preview = run(["sync", "--config", relative, "--dry-run"]).stdout
  assert.match(preview, /--skill repository-only-skill/)
  assert.doesNotMatch(preview, /--global\b/)
  assert.equal(run(["path"]).stdout.trim(), defaultFile)
  assert.equal(await readFile(defaultFile, "utf8"), defaultBefore)
})

test("CLI protects an existing selected file and expands a quoted home path", async (t) => {
  const { userHome, defaultFile, run } = await fixture(t)
  const defaultBefore = await readFile(defaultFile, "utf8")
  const selected = "~/dotfiles/skills.json"
  const filename = path.join(userHome, "dotfiles", "skills.json")
  run(["init", "--config", selected])
  await writeFile(filename, "Keep this selected file until --force is used.")
  run(["init", "--config", selected], 1)
  assert.equal(await readFile(filename, "utf8"), "Keep this selected file until --force is used.")
  run(["init", "--force", "--config", selected])
  assert.equal(JSON.parse(await readFile(filename, "utf8")).skills[0].name, "find-skills")
  assert.equal(run(["path", "--config", selected]).stdout.trim(), filename)
  assert.equal(await readFile(defaultFile, "utf8"), defaultBefore)
})

test("CLI reports explicit missing, invalid, and remote configurations without falling back", async (t) => {
  const { project, defaultFile, run } = await fixture(t)
  await writeFile(defaultFile, JSON.stringify({
    version: 1,
    skills: [{ name: "default", source: "owner/repo", enabled: false }],
  }))
  run(["validate"])
  const missing = path.join(project, "missing.json")
  for (const args of [["validate"], ["plan"], ["sync", "--dry-run"]]) {
    assert.ok(run([...args, "--config", missing], 1).stderr.includes(missing))
  }
  await writeFile(missing, "{")
  assert.match(run(["validate", "--config", missing], 1).stderr, /Cannot parse manifest/)
  assert.match(run(["path", "--config", "https://github.com/owner/configs"], 1).stderr, /local file path/)
})

test("CLI rejects missing values and conflicting config options before writing files", async (t) => {
  const { project, defaultFile, run } = await fixture(t)
  const defaultBefore = await readFile(defaultFile, "utf8")
  for (const args of [
    ["init", "--config"],
    ["init", "-c"],
    ["init", "--config="],
    ["init", "--config", " "],
    ["init", "--config", "--force"],
  ]) {
    assert.match(run(args, 1).stderr, /--config requires a file path/)
  }
  assert.match(run(["init", "-c", "first.json", "--config=second.json"], 1).stderr, /only once/)
  assert.ok(!existsSync(path.join(project, "first.json")))
  assert.ok(!existsSync(path.join(project, "second.json")))
  assert.equal(await readFile(defaultFile, "utf8"), defaultBefore)
})
