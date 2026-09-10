#!/usr/bin/env node

import { createRequire } from "node:module"
import {
  initCommand,
  planCommand,
  syncCommand,
  validateCommand,
} from "../src/commands.mjs"
import { configPath } from "../src/config.mjs"

const { name: COMMAND_NAME, version: VERSION } = createRequire(import.meta.url)("../package.json")
function help() {
  console.log(`${COMMAND_NAME} ${VERSION}

Sync skills declared in a JSON manifest by delegating downloads to npx skills.

Usage:
  npx ${COMMAND_NAME} <command> [options]
  ${COMMAND_NAME} sync [options]
  ${COMMAND_NAME} plan
  ${COMMAND_NAME} validate
  ${COMMAND_NAME} path
  ${COMMAND_NAME} init [--force]

Options:
  --dry-run               Print commands without downloading anything
  --continue-on-error     Continue after a skill installation fails
  --force                 Replace the user config with init
  -h, --help              Show this help
  -v, --version           Show the version

Examples:
  npx ${COMMAND_NAME} init
  npx ${COMMAND_NAME} path
  npx ${COMMAND_NAME} plan
  npx ${COMMAND_NAME} sync
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
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`)
    } else {
      options.positional.push(arg)
    }
  }

  return options
}

async function main() {
  const argv = process.argv.slice(2)
  const command = argv[0] ?? "help"

  if (command === "--help" || command === "-h") {
    help()
    return 0
  }
  if (command === "--version" || command === "-v") {
    console.log(VERSION)
    return 0
  }

  const options = parseArgs(argv.slice(1))

  if (options.help || command === "help") {
    help()
    return 0
  }
  if (options.version) {
    console.log(VERSION)
    return 0
  }

  if (options.positional.length > 0) {
    throw new Error(`Unexpected argument: ${options.positional[0]}`)
  }

  const filename = configPath()
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
