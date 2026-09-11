import { access, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import {
  readManifest,
  normalizeManifest,
  DEFAULT_SKILLS_CLI,
} from "./manifest.mjs"
import {
  commandFor,
  displayCommand,
  runCommand,
  statusCode,
} from "./runner.mjs"
import { downloadManifest } from "./remote.mjs"

const SAMPLE_MANIFEST = {
  version: 1,
  cli: {
    package: "skills",
    version: DEFAULT_SKILLS_CLI,
  },
  defaults: {
    agents: ["opencode"],
    scope: "global",
    copy: true,
  },
  skills: [
    {
      name: "find-skills",
      source: "vercel-labs/skills",
      description: "查找和安装更多 Skills",
    },
  ],
}

function enabledSkills(manifest) {
  return manifest.skills.filter((skill) => skill.enabled)
}

export async function validateCommand(manifestFilename) {
  const { path: filename, manifest } = await readManifest(manifestFilename)
  const enabled = enabledSkills(manifest)
  for (const skill of enabled) commandFor(skill, manifest.cli)
  console.log(`Valid manifest: ${filename}`)
  console.log(`Declared skills: ${manifest.skills.length}`)
  console.log(`Enabled skills: ${enabled.length}`)
  return 0
}

export async function planCommand(manifestFilename) {
  const { path: filename, manifest } = await readManifest(manifestFilename)
  const skills = enabledSkills(manifest)

  console.log(`Manifest: ${filename}`)
  if (skills.length === 0) {
    console.log("No enabled skills.")
    return 0
  }

  for (const skill of skills) {
    if (skill.description) console.log(`# ${skill.name}: ${skill.description}`)
    console.log(displayCommand(commandFor(skill, manifest.cli)))
  }
  return 0
}

export async function syncCommand(manifestFilename, options = {}) {
  const { path: filename, manifest } = await readManifest(manifestFilename)
  const skills = enabledSkills(manifest)
  const execute = options.run ?? runCommand

  // Resolve the full plan before installing so invalid refs cannot cause a
  // partially applied manifest.
  const commands = skills.map((skill) => ({ skill, command: commandFor(skill, manifest.cli) }))

  if (skills.length === 0) {
    console.log("No enabled skills.")
    return 0
  }

  console.log(`Syncing ${skills.length} skill${skills.length === 1 ? "" : "s"} from ${filename}`)
  let failures = 0

  for (const { skill, command } of commands) {
    console.log(`\n[${skill.name}] ${skill.source}${skill.ref ? ` @ ${skill.ref}` : ""}`)
    if (skill.description) console.log(skill.description)

    if (options.dryRun) {
      console.log(displayCommand(command))
      continue
    }

    const result = execute(command, { cwd: options.cwd })
    const code = statusCode(result)
    if (code !== 0) {
      failures += 1
      if (result.error) console.error(result.error.message)
      if (result.signal) console.error(`[${skill.name}] terminated by ${result.signal}`)
      console.error(`[${skill.name}] failed with exit code ${code}`)
      if (result.signal || !options.continueOnError) break
    }
  }

  if (failures > 0) {
    console.error(`Sync failed for ${failures} skill${failures === 1 ? "" : "s"}.`)
    return 1
  }

  if (!options.dryRun) console.log("\nSync complete.")
  return 0
}

export async function initCommand(manifestFilename, { force = false, from, fetchImpl } = {}) {
  const filename = path.resolve(manifestFilename)
  if (!force) {
    try {
      await access(filename)
      throw new Error(`Manifest already exists: ${filename} (use --force to replace it)`)
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
  }

  let text = `${JSON.stringify(SAMPLE_MANIFEST, null, 2)}\n`
  let source
  if (from !== undefined) {
    const downloaded = await downloadManifest(from, { fetchImpl })
    source = downloaded.url
    try {
      normalizeManifest(JSON.parse(downloaded.text))
    } catch (error) {
      throw new Error(`Remote manifest at ${source} is invalid: ${error.message}`)
    }
    text = downloaded.text.endsWith("\n") ? downloaded.text : `${downloaded.text}\n`
  }

  await mkdir(path.dirname(filename), { recursive: true })
  await writeFile(filename, text, {
    encoding: "utf8",
    flag: force ? "w" : "wx",
  })
  console.log(source ? `Created ${filename} from ${source}` : `Created ${filename}`)
  return 0
}

export function sampleManifest() {
  return normalizeManifest(SAMPLE_MANIFEST)
}
