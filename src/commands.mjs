import { access, mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import {
  readManifest,
  normalizeManifest,
  DEFAULT_SKILLS_CLI,
} from "./manifest.mjs"
import {
  commandFor,
  commandForGroup,
  displayCommand,
  groupSkills,
  runCommand,
  statusCode,
} from "./runner.mjs"
import { gitUrlForSource, isCommitSha, probeRevision } from "./revision.mjs"
import {
  allInstalled,
  readState,
  setStateEntry,
  stateEntry,
  stateKey,
  statePath,
  writeState,
} from "./state.mjs"
import { downloadManifest } from "./remote.mjs"

export const DEFAULT_RETRIES = 2
const DEFAULT_RETRY_DELAY_MS = 2000

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

function sourceLabel(group) {
  const { source, ref } = group[0]
  return `${source}${ref ? ` @ ${ref}` : ""}`
}

function groupLabel(group) {
  if (group.length === 1) return `[${group[0].name}] ${sourceLabel(group)}`
  return `[${sourceLabel(group)}] ${group.length} skills: ${group.map((skill) => skill.name).join(", ")}`
}

function printDescriptions(group) {
  for (const skill of group) {
    if (!skill.description) continue
    console.log(group.length === 1 ? skill.description : `# ${skill.name}: ${skill.description}`)
  }
}

function reportFailure(label, result) {
  if (result.error) console.error(result.error.message)
  if (result.signal) console.error(`[${label}] terminated by ${result.signal}`)
  console.error(`[${label}] failed with exit code ${statusCode(result)}`)
}

function resolveGroupRevision(skills, probe) {
  const { source, ref } = skills[0]
  if (isCommitSha(ref)) return { status: "known", revision: ref.toLowerCase() }
  const url = gitUrlForSource(source)
  if (!url) return { status: "unknown" }
  return probe(url, ref)
}

async function runWithRetries(execute, command, { cwd, retries, retryDelayMs, label }) {
  for (let attempt = 0; ; attempt += 1) {
    const result = execute(command, { cwd })
    const code = statusCode(result)
    if (code === 0 || result.signal || attempt >= retries) return result

    const delayMs = retryDelayMs * (attempt + 1)
    const delayText = delayMs > 0 ? ` in ${Math.round(delayMs / 1000)}s` : ""
    console.error(`[${label}] attempt ${attempt + 1}/${retries + 1} failed with exit code ${code}; retrying${delayText}`)
    if (delayMs > 0) await sleep(delayMs)
  }
}

export async function planCommand(manifestFilename) {
  const { path: filename, manifest } = await readManifest(manifestFilename)
  const skills = enabledSkills(manifest)

  console.log(`Manifest: ${filename}`)
  if (skills.length === 0) {
    console.log("No enabled skills.")
    return 0
  }

  for (const group of groupSkills(skills)) {
    for (const skill of group) {
      if (skill.description) console.log(`# ${skill.name}: ${skill.description}`)
    }
    console.log(displayCommand(commandForGroup(group, manifest.cli)))
  }
  return 0
}

export async function syncCommand(manifestFilename, options = {}) {
  const { path: filename, manifest } = await readManifest(manifestFilename)
  const skills = enabledSkills(manifest)
  const execute = options.run ?? runCommand
  const retries = options.retries ?? DEFAULT_RETRIES
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const home = options.home ?? os.homedir()
  const cwd = options.cwd ?? process.cwd()
  const probe = options.probe ?? probeRevision

  if (skills.length === 0) {
    console.log("No enabled skills.")
    return 0
  }

  // Resolve the full plan before installing so invalid refs cannot cause a
  // partially applied manifest.
  const groups = groupSkills(skills).map((group) => ({
    skills: group,
    command: commandForGroup(group, manifest.cli),
  }))

  const stateFilename = options.stateFile ?? statePath(home)
  const state = await readState(stateFilename)

  console.log(`Syncing ${skills.length} skill${skills.length === 1 ? "" : "s"} from ${filename}`)
  let failures = 0
  let skipped = 0
  let stopped = false

  for (const group of groups) {
    if (stopped) break

    console.log(`\n${groupLabel(group.skills)}`)
    if (options.dryRun) {
      printDescriptions(group.skills)
      console.log(displayCommand(group.command))
      continue
    }

    const key = stateKey(group.skills)
    const entry = stateEntry(state, filename, key)
    const installedHere = allInstalled(group.skills, {
      global: group.skills[0].scope === "global",
      cwd,
      home,
    })
    // Only a previous install can be skipped, so check the remote before
    // installing only when there is a record and the files are still present.
    // A first install records the revision afterwards.
    let revision = null

    if (!options.force && entry && installedHere) {
      revision = resolveGroupRevision(group.skills, probe)
      if (revision.status === "known" && entry.revision === revision.revision) {
        console.log(`# unchanged (${revision.revision.slice(0, 7)}); skipping, use --force to reinstall`)
        skipped += 1
        continue
      }
      // The remote cannot be checked right now, but the group was installed
      // before and its files are still present, so keep the current copy.
      if (revision.status === "error") {
        console.error(`[${sourceLabel(group.skills)}] update check failed (${revision.message}); keeping the installed copy`)
        skipped += 1
        continue
      }
    }

    let groupFailed = false

    if (group.skills.length === 1) {
      const skill = group.skills[0]
      printDescriptions(group.skills)
      const result = await runWithRetries(execute, group.command, {
        cwd: options.cwd,
        retries,
        retryDelayMs,
        label: skill.name,
      })
      if (statusCode(result) !== 0) {
        failures += 1
        groupFailed = true
        reportFailure(skill.name, result)
        if (result.signal || !options.continueOnError) stopped = true
      }
    } else {
      // A batched command shares one fetch. Since a failure could come from a
      // single bad name or a transient error, retry each entry individually
      // when the batch does not succeed.
      const batch = execute(group.command, { cwd: options.cwd })
      if (statusCode(batch) !== 0) {
        if (batch.signal) {
          failures += group.skills.length
          groupFailed = true
          reportFailure(sourceLabel(group.skills), batch)
          stopped = true
        } else {
          console.error(`[${sourceLabel(group.skills)}] batch install failed; retrying each skill individually`)
          for (const skill of group.skills) {
            const result = await runWithRetries(execute, commandFor(skill, manifest.cli), {
              cwd: options.cwd,
              retries,
              retryDelayMs,
              label: skill.name,
            })
            if (statusCode(result) !== 0) {
              failures += 1
              groupFailed = true
              reportFailure(skill.name, result)
              if (result.signal || !options.continueOnError) {
                stopped = true
                break
              }
            }
          }
        }
      }
    }

    if (!groupFailed) {
      if (!revision) revision = resolveGroupRevision(group.skills, probe)
      if (revision.status === "known") {
        setStateEntry(state, filename, key, {
          revision: revision.revision,
          skills: group.skills.map((skill) => skill.name),
          installedAt: new Date().toISOString(),
        })
        try {
          await writeState(stateFilename, state)
        } catch (error) {
          console.error(`skill-sync: cannot write state ${stateFilename}: ${error.message}`)
        }
      }
    }
  }

  if (failures > 0) {
    console.error(`Sync failed for ${failures} skill${failures === 1 ? "" : "s"}.`)
    return 1
  }

  if (!options.dryRun) {
    const skippedText = skipped > 0
      ? ` Skipped ${skipped} unchanged group${skipped === 1 ? "" : "s"}.`
      : ""
    console.log(`\nSync complete.${skippedText}`)
  }
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
