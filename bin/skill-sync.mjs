#!/usr/bin/env node

import { createRequire } from "node:module"
import {
  initCommand,
  planCommand,
  syncCommand,
  validateCommand,
} from "../src/commands.mjs"
import { resolveConfigPath } from "../src/config.mjs"

const { name: COMMAND_NAME, version: VERSION } = createRequire(import.meta.url)("../package.json")
function help() {
  console.log(`${COMMAND_NAME} ${VERSION}

Sync skills declared in a JSON manifest by delegating downloads to npx skills.

Usage:
  npx ${COMMAND_NAME} <command> [options]
  ${COMMAND_NAME} sync [options]
  ${COMMAND_NAME} plan [options]
  ${COMMAND_NAME} validate [options]
  ${COMMAND_NAME} path [options]
  ${COMMAND_NAME} init [options]

Options:
  -c, --config <file>      Use this JSON manifest (relative or absolute path)
  --dry-run               Print commands without downloading anything
  --continue-on-error     Continue after a skill installation fails
  --force                 Replace the selected manifest with init
  -h, --help              Show this help
  -v, --version           Show the version

Examples:
  npx ${COMMAND_NAME} init
  npx ${COMMAND_NAME} path
  npx ${COMMAND_NAME} plan
  npx ${COMMAND_NAME} sync
  npx ${COMMAND_NAME} init --config ./my-skills/skills.json
  npx ${COMMAND_NAME} sync --config ./my-skills/skills.json

Without --config, use ~/.config/skill-sync/skills.json.
Relative config paths and project installations use the current working directory.
`)
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    continueOnError: false,
    force: false,
    positional: [],
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "-h" || arg === "--help") {
      options.help = true
    } else if (arg === "-v" || arg === "--version") {
      options.version = true
    } else if (arg === "--dry-run") {
      options.dryRun = true
    } else if (arg === "--continue-on-error") {
      options.continueOnError = true
    } else if (arg === "--force") {
      options.force = true
    } else if (arg === "--config" || arg === "-c" || arg.startsWith("--config=")) {
      if (options.configFile !== undefined) {
        throw new Error("Specify --config only once")
      }
      const inline = arg.startsWith("--config=")
      const value = inline ? arg.slice("--config=".length) : argv[++index]
      if (value === undefined || value.trim() === "" || (!inline && value.startsWith("-"))) {
        throw new Error("--config requires a file path")
      }
      options.configFile = value
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`)
    } else {
      options.positional.push(arg)
    }
  }

  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const command = options.positional[0] ?? "help"

  if (options.help) {
    help()
    return 0
  }
  if (options.version) {
    console.log(VERSION)
    return 0
  }

  if (command === "help") {
    help()
    return 0
  }
  if (options.positional.length > 1) {
    throw new Error(`Unexpected argument: ${options.positional[1]}`)
  }

  const filename = resolveConfigPath(options.configFile)
  if (command === "init") {
    return initCommand(filename, options)
  }

  if (command === "path") {
    console.log(filename)
    return 0
  }
  if (command === "validate") return validateCommand(filename)
  if (command === "plan") return planCommand(filename)
  if (command === "sync") {
    return syncCommand(filename, options)
  }

  throw new Error(`Unknown command: ${command}`)
}

try {
  const code = await main()
  process.exitCode = code
} catch (error) {
  console.error(`${COMMAND_NAME}: ${error.message}`)
  process.exitCode = 1
}
