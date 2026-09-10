# skill-sync-cli

[中文使用说明](README.zh-CN.md)

`skill-sync-cli` keeps a portable list of third-party agent skills and restores
them on another machine by invoking the `skills` CLI.

The manifest records the source and skill name. The actual download, parsing,
installation, and per-agent linking remain delegated to `npx skills`.

## Quick Start

Requires Node.js 18.17+, npm, and Git. From this checkout, create the user-level
manifest (no project dependency installation is needed):

```bash
npm run init
```

This creates:

```text
Windows:   %USERPROFILE%/.config/skill-sync/skills.json
macOS/Linux: ~/.config/skill-sync/skills.json
```

Preview the commands:

```bash
npm run plan
```

Sync the skills:

```bash
npm run sync
```

Validate without downloading:

```bash
npm run validate
```

Show which file will be used:

```bash
npm run path
```

The package can also be run from a checked-out clone:

```bash
node ./bin/skill-sync.mjs sync
```

## Configuration

`skill-sync-cli` reads exactly one manifest. The location is fixed for the
current user:

```text
Windows:     %USERPROFILE%/.config/skill-sync/skills.json
macOS/Linux: ~/.config/skill-sync/skills.json
```

On Windows, this normally resolves to
`C:\Users\<user>\.config\skill-sync\skills.json`. The command never reads a
project manifest or an environment-variable override.

Commands:

```bash
npm run init
npm run sync
npm run plan
npm run validate
npm run path
```

The `npx skills` package itself does not discover these files. This wrapper
reads the fixed user manifest, then delegates each installation to `npx skills`.

## Manifest

```json
{
  "version": 1,
  "cli": {
    "package": "skills",
    "version": "1.5.22"
  },
  "defaults": {
    "agents": ["opencode"],
    "scope": "global",
    "copy": true
  },
  "skills": [
    {
      "name": "find-skills",
      "source": "vercel-labs/skills",
      "description": "Discover and install more skills"
    },
    {
      "name": "agent-browser",
      "source": "vercel-labs/agent-browser",
      "description": "Browser automation",
      "ref": "main",
      "agents": ["opencode", "codex"],
      "scope": "global"
    }
  ]
}
```

Supported source strings are the same ones accepted by `skills add`, such as
GitHub shorthand, GitHub/GitLab URLs, Git URLs, direct skill URLs, and archives.
Local filesystem paths are rejected because they are not portable between
machines.

`ref` is optional. For reproducible installations, use a tag or commit SHA
instead of a moving branch such as `main`.

## Fields

### `cli`

Controls which `skills` package is executed. Pinning the version makes setup
behavior repeatable:

```json
"cli": { "package": "skills", "version": "1.5.22" }
```

Use `"latest"` when you explicitly want the newest CLI.

### `defaults`

Defaults apply to every skill unless overridden on the skill entry:

- `agents`: target agent names, default `opencode`
- `scope`: `global` or `project`, default `global`
- `copy`: use copies instead of symlinks, default `true`

Copy mode is the safer default on Windows because it does not require
Developer Mode or symlink privileges. Set `copy` to `false` when you want the
canonical-copy-plus-symlink layout provided by `skills`.

### `skills`

Each entry requires:

- `name`: the skill name passed to `skills add --skill`
- `source`: the remote source passed to `skills add`

Optional fields are `description`, `ref`, `enabled`, `agents`, `scope`, and `copy`.

`description` records why you use a skill and appears in the installation plan.

Disabled entries remain in the manifest but are skipped by `sync`.

## Cross-Machine Workflow

Keep the contents of `~/.config/skill-sync/skills.json` in a private dotfiles
repository or a private setup repository. On each machine, restore that file
to the same path and run:

```bash
npm run sync
```

The `skills` CLI will also maintain its own local lock files for update
tracking. This tool's manifest is the portable declaration of what should be
installed; it is intentionally separate from those machine-local state files.

Sync reinstalls enabled entries and can overwrite installed skills with the same
name. Removing or disabling an entry does not uninstall it. By default a failure
stops the batch; `npm run sync -- --continue-on-error` attempts the remaining
entries and still exits with a failure status. Use `npm run sync -- --dry-run` to
preview without installing.

For project-scoped skills, set:

```json
"defaults": {
  "agents": ["opencode"],
  "scope": "project",
  "copy": true
}
```

Project scope uses the command's working directory. `npm run sync` runs in this
package's directory; to install into another project, run
`node /absolute/path/to/skill-sync-cli/bin/skill-sync.mjs sync` from that project.

## Security

A skill is agent instructions, and may include scripts or references that
change how an agent operates. Review third-party skills before adding them to
the manifest. Prefer trusted repositories, HTTPS, and immutable commit refs.

## Development

```bash
npm test
npm run check
```
