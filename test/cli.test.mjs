import test from "node:test"
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { createServer } from "node:http"
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
  const env = {
    ...process.env,
    HOME: userHome,
    USERPROFILE: userHome,
    npm_config_cache: path.join(root, "npm-cache"),
    npm_config_offline: "true",
  }

  const assertStatus = (args, code, status, stdout, stderr) =>
    assert.equal(code, status, `${args.join(" ")}\n${stdout}\n${stderr}`)

  const run = (args, status = 0) => {
    const result = spawnSync(process.execPath, [cli, ...args], {
      cwd: project,
      env,
      encoding: "utf8",
      timeout: 10000,
      windowsHide: true,
    })
    if (result.error) throw result.error
    assertStatus(args, result.status, status, result.stdout, result.stderr)
    return result
  }

  const runAsync = (args, status = 0) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: project,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })
    let stdout = ""
    let stderr = ""
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Timeout: ${args.join(" ")}`))
    }, 10000)
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      try {
        assertStatus(args, code, status, stdout, stderr)
        resolve({ stdout, stderr })
      } catch (error) {
        reject(error)
      }
    })
  })

  return { root, userHome, project, defaultFile, run, runAsync }
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

test("CLI validates the retry count and batches same-source entries in previews", async (t) => {
  const { project, run } = await fixture(t)
  assert.match(run(["sync", "--retries", "x", "--dry-run"], 1).stderr, /--retries requires a non-negative integer/)
  assert.match(run(["sync", "--retries=", "--dry-run"], 1).stderr, /--retries requires a non-negative integer/)
  assert.match(run(["sync", "--retries", "-1", "--dry-run"], 1).stderr, /--retries requires a non-negative integer/)
  assert.match(run(["sync", "--retries", "1", "--retries", "2", "--dry-run"], 1).stderr, /only once/)

  const filename = path.join(project, "batched.json")
  await writeFile(filename, JSON.stringify({
    version: 1,
    skills: [
      { name: "one", source: "owner/repo" },
      { name: "two", source: "owner/repo" },
    ],
  }))
  const output = run(["sync", "--config", filename, "--dry-run"]).stdout
  assert.match(output, /--skill one two/)
  assert.equal(output.match(/--skill/g).length, 1)
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

async function serveManifest(t, body, { status = 200 } = {}) {
  const server = createServer((request, response) => {
    response.writeHead(status, { "content-type": "application/json; charset=utf-8" })
    response.end(body)
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  t.after(() => server.close())
  return `http://127.0.0.1:${server.address().port}/skills.json`
}

test("CLI initializes a manifest from a remote URL", async (t) => {
  const { project, defaultFile, runAsync } = await fixture(t)
  const remote = JSON.stringify({
    version: 1,
    defaults: { agents: ["opencode"], scope: "project", copy: true },
    skills: [{ name: "remote-skill", source: "owner/repo" }],
  })
  const url = await serveManifest(t, remote)
  const filename = path.join(project, "from-remote.json")

  const { stdout } = await runAsync(["init", "--from", url, "--config", filename])
  assert.match(stdout, /Created /)
  assert.match(stdout, /from http:\/\/127\.0\.0\.1:/)
  assert.equal(await readFile(filename, "utf8"), `${remote}\n`)
  assert.match((await runAsync(["plan", "--config", filename])).stdout, /--skill remote-skill/)
  assert.equal(await readFile(defaultFile, "utf8"), "Keep the default user file unchanged.")

  await assert.rejects(runAsync(["init", "--from", url, "--config", filename]), /already exists/)
  assert.equal(await readFile(filename, "utf8"), `${remote}\n`)
})

test("CLI init --from rejects invalid downloads and misuse", async (t) => {
  const { project, run, runAsync } = await fixture(t)
  const target = path.join(project, "remote-invalid.json")

  const invalidUrl = await serveManifest(t, "{\"version\": 2}")
  await assert.rejects(runAsync(["init", "--from", invalidUrl, "--config", target]), /invalid/)
  assert.ok(!existsSync(target))

  const missingUrl = await serveManifest(t, "not found", { status: 404 })
  await assert.rejects(runAsync(["init", "--from", missingUrl, "--config", target]), /HTTP 404/)
  assert.ok(!existsSync(target))

  assert.match(run(["init", "--from"], 1).stderr, /--from requires a URL/)
  assert.match(run(["plan", "--from", "https://example.com/skills.json"], 1).stderr, /only supported by init/)
  assert.match(run([
    "init", "--from", "ftp://example.com/skills.json", "--config", path.join(project, "scheme.json"),
  ], 1).stderr, /http\(s\) URL/)
})
