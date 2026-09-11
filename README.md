# skill-sync-cli

[中文使用说明](README.zh-CN.md)

`skill-sync-cli` keeps a portable list of third-party agent skills and restores
them on another machine by invoking the `skills` CLI.

The manifest records the source and skill name. The actual download, parsing,
installation, and per-agent linking remain delegated to `npx skills`.

## Quick Start

Requires Node.js 18.17+, npm, and Git. Once this package is published to npm,
run these commands from any directory. Before the first release, use
[a source checkout or local package](#run-before-the-first-release).

Create your manifest:

```bash
npx @wangkh/skill-sync-cli init
```

This creates:

```text
Windows:   %USERPROFILE%/.config/skill-sync/skills.json
macOS/Linux: ~/.config/skill-sync/skills.json
```

Edit this file to list your skills, then preview the installation commands:

```bash
npx @wangkh/skill-sync-cli plan
```

Sync the skills:

```bash
npx @wangkh/skill-sync-cli sync
```

Validate without downloading:

```bash
npx @wangkh/skill-sync-cli validate
```

Show which file will be used:

```bash
npx @wangkh/skill-sync-cli path
```

`init` preserves an existing manifest. Use `npx @wangkh/skill-sync-cli init --force`
when you intend to replace it with the sample.

To keep the manifest in its own Git repository, use
`npx @wangkh/skill-sync-cli sync --config ./my-skills/skills.json`.
See [the cross-machine workflow](#cross-machine-workflow).

## Configuration

`skill-sync-cli` reads one manifest per invocation. The default location is:

```text
Windows:     %USERPROFILE%/.config/skill-sync/skills.json
macOS/Linux: ~/.config/skill-sync/skills.json
```

On Windows, this normally resolves to
`C:\Users\<user>\.config\skill-sync\skills.json`.

Use `--config <file>` (or `-c <file>`) to select a local JSON file for any command:

```bash
npx @wangkh/skill-sync-cli init --config ./my-skills/skills.json
npx @wangkh/skill-sync-cli validate --config ./my-skills/skills.json
npx @wangkh/skill-sync-cli plan --config ./my-skills/skills.json
npx @wangkh/skill-sync-cli sync --config ./my-skills/skills.json
npx @wangkh/skill-sync-cli path --config ./my-skills/skills.json
```

The option can appear before or after the command; `--config=path` also works.
Relative paths resolve from the working directory, absolute paths work as given,
and a leading `~/` expands to your home directory. Quote paths containing spaces.
`path` prints the selected absolute filename. `init` creates its parent directories
and preserves existing files unless `--force` is supplied.

Pass `--config` each time you want to use that manifest. Omitting it selects the
default user file. An explicit missing or invalid file produces an error when
reading; it never falls back to another manifest. Clone a remote configuration
repository first, then pass the path to its local JSON file.

To bootstrap from a manifest that is already published online, pass its file URL
to `init --from`. Gitee and GitHub `blob` page URLs are converted to raw file
URLs automatically, and the download is validated before anything is written:

```bash
npx @wangkh/skill-sync-cli init --from https://gitee.com/ai_1024/skill-sync/blob/main/skills.json
npx @wangkh/skill-sync-cli init --from https://gitee.com/ai_1024/skill-sync/blob/main/skills.json --config ./my-skills/skills.json
```

Without `--config`, the manifest is written to the default user location;
existing files still require `--force`.

The `npx skills` package itself does not discover these files. This wrapper
reads the selected manifest, then delegates each installation to `npx skills`.

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

Create a dedicated configuration repository and initialize its manifest:

```bash
git init -b main my-skills
npx @wangkh/skill-sync-cli init --config ./my-skills/skills.json
```

Edit `my-skills/skills.json`, then save it in Git:

```bash
git -C my-skills add skills.json
git -C my-skills commit -m "chore: add skill manifest"
```

Push this repository to your Git hosting service. On another machine, install
Node.js, npm, and Git, then clone the configuration repository and use its file
directly. Replace the example URL with your repository:

```bash
git clone https://github.com/YOUR_NAME/my-skills.git my-skills
npx @wangkh/skill-sync-cli plan --config ./my-skills/skills.json
npx @wangkh/skill-sync-cli sync --config ./my-skills/skills.json
```

You can skip the clone and initialize directly from the published file URL with
`npx @wangkh/skill-sync-cli init --from <url>`.

After committing and pushing future manifest edits, update each existing clone:

```bash
git -C my-skills pull --ff-only
npx @wangkh/skill-sync-cli sync --config ./my-skills/skills.json
```

Git transfers the manifest between machines; `sync` installs the skills declared
in the local file. Each machine can clone the repository into a different folder.

The `skills` CLI will also maintain its own local lock files for update
tracking. This tool's manifest is the portable declaration of what should be
installed; it is intentionally separate from those machine-local state files.

Sync reinstalls enabled entries and can overwrite installed skills with the same
name. Removing or disabling an entry does not uninstall it. By default a failure
stops the batch; `npx @wangkh/skill-sync-cli sync --continue-on-error` attempts the remaining
entries and still exits with a failure status. Use `npx @wangkh/skill-sync-cli sync --dry-run` to
preview without installing.

For project-scoped skills, set:

```json
"defaults": {
  "agents": ["opencode"],
  "scope": "project",
  "copy": true
}
```

Project scope uses the command's working directory, independently of the manifest
location. From the target application project, run:

```bash
npx @wangkh/skill-sync-cli sync --config /path/to/my-skills/skills.json
```

## Run Before the First Release

From a source checkout, the following commands work without installing project
dependencies:

```bash
npm run init
npm run plan
npm run sync
```

To select a manifest with an npm script, forward the option after `--`:

```bash
npm run plan -- --config ../my-skills/skills.json
```

`npm run sync` runs in this package's directory. For project scope in another
directory, run `node /absolute/path/to/skill-sync-cli/bin/skill-sync.mjs sync`
from the target project.

To verify the packaged CLI before publishing:

```bash
npm run check
npm run test:package
```

This creates `dist/wangkh-skill-sync-cli-0.1.0.tgz` and `dist/package-check.json`. The
package check runs real npx commands offline, with a temporary home directory
and a fresh npm cache. It verifies initialization, external manifests, previews, and
error handling, then removes the temporary environment. The archive and report
remain in `dist/`.

You can run that archive directly. Replace the path with its absolute location:

```bash
npx --yes --package /absolute/path/wangkh-skill-sync-cli-0.1.0.tgz skill-sync-cli --help
npx --yes --package /absolute/path/wangkh-skill-sync-cli-0.1.0.tgz skill-sync-cli init
npx --yes --package /absolute/path/wangkh-skill-sync-cli-0.1.0.tgz skill-sync-cli plan
```

These manual commands use your normal user configuration directory. To select a
repository manifest, append `--config /path/to/my-skills/skills.json` after the
subcommand.

## Security

A skill is agent instructions, and may include scripts or references that
change how an agent operates. Review third-party skills before adding them to
the manifest. Prefer trusted repositories, HTTPS, and immutable commit refs.

## Development

```bash
npm run check
npm run test:package
```

See [the release notes for maintainers](RELEASING.md) for the planned repository,
package details, and publication procedure. `npm publish` runs both checks through
`prepublishOnly`.
