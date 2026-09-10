import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { sourceWithRef } from "./manifest.mjs"

function npxExecutable() {
  return process.platform === "win32" ? "npx.cmd" : "npx"
}

function packageSpec(cli) {
  if (!cli.version || cli.version === "latest") return cli.package
  if (cli.package.startsWith("@")) {
    const slash = cli.package.indexOf("/")
    const at = cli.package.indexOf("@", slash)
    if (at !== -1) return cli.package
  }
  if (cli.package.includes("@")) return cli.package
  return `${cli.package}@${cli.version}`
}

export function commandFor(skill, cli) {
  const args = ["--yes", packageSpec(cli), "add", sourceWithRef(skill.source, skill.ref)]

  for (const agent of skill.agents) {
    args.push("--agent", agent)
  }

  args.push("--skill", skill.name)

  if (skill.scope === "global") args.push("--global")
  if (skill.copy) args.push("--copy")
  args.push("--yes")

  return { executable: npxExecutable(), args }
}

function quoteForDisplay(value) {
  if (/^[a-zA-Z0-9_./:@%+=,-]+$/.test(value)) return value
  return process.platform === "win32"
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", "'\\''")}'`
}

export function displayCommand(command) {
  return [command.executable, ...command.args].map(quoteForDisplay).join(" ")
}

function windowsNpxCli(env) {
  const searchPath = Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1] ?? ""
  const candidates = [
    env.npm_execpath && path.join(path.dirname(env.npm_execpath), "npx-cli.js"),
    ...searchPath.split(path.delimiter).filter(Boolean).map((directory) =>
      path.join(directory.replace(/^"|"$/g, ""), "node_modules", "npm", "bin", "npx-cli.js"),
    ),
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"),
  ]
  const filename = candidates.find((candidate) => candidate && existsSync(candidate))
  if (!filename) {
    throw new Error("Cannot find npm's npx-cli.js. Install Node.js with npm, then run npm run sync.")
  }
  return filename
}

export function runCommand(command, { cwd, env = process.env, timeout } = {}) {
  try {
    // Windows cannot spawn .cmd files directly. Run npx's JS entry point so
    // manifest values stay literal arguments and never pass through a shell.
    const useNode = process.platform === "win32" && command.executable === "npx.cmd"
    return spawnSync(useNode ? process.execPath : command.executable,
      useNode ? [windowsNpxCli(env), ...command.args] : command.args, {
        cwd,
        env,
        timeout,
        stdio: "inherit",
        windowsHide: true,
      })
  } catch (error) {
    return { status: null, error }
  }
}

export function statusCode(result) {
  if (typeof result.status === "number") return result.status
  if (result.error) return 1
  return 1
}
