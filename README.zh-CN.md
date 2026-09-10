# skill-sync-cli

用一份 JSON 清单记录常用开源 Skills 的名称、来源和用途，通过一个命令批量调用 `npx skills add` 安装。适合把个人清单保存在 dotfiles 仓库中，在新电脑上恢复环境。

## 开始使用

需要 Node.js 18.17+、npm 和 Git。首次运行时，npx 会获取本工具；执行安装时，再获取清单指定版本的 `skills` CLI。

发布到 npm 后，可以在任意目录运行以下命令。首个版本发布前，使用下文的[源码或本地安装包](#发布前使用)。

```bash
# 新环境：创建初始清单；如果已有清单，跳过这一步
npx skill-sync-cli init

# 查看配置文件的位置
npx skill-sync-cli path

# 编辑清单后检查格式并预览安装命令
npx skill-sync-cli validate
npx skill-sync-cli plan

# 批量安装已启用的 Skills
npx skill-sync-cli sync
```

默认配置文件位于用户目录中：

- Windows：`%USERPROFILE%\.config\skill-sync\skills.json`
- macOS / Linux：`~/.config/skill-sync/skills.json`

创建后，编辑这个文件填写自己常用的 Skills。`init` 默认保留已有文件；如果确实要用示例覆盖当前清单，可以运行 `npx skill-sync-cli init --force`。

## 指定配置文件

所有命令都支持 `--config <文件路径>`，可以直接使用独立 Git 仓库里的清单：

```bash
npx skill-sync-cli init --config ./my-skills/skills.json
npx skill-sync-cli validate --config ./my-skills/skills.json
npx skill-sync-cli plan --config ./my-skills/skills.json
npx skill-sync-cli sync --config ./my-skills/skills.json
npx skill-sync-cli path --config ./my-skills/skills.json
```

也支持 `-c <文件路径>` 和 `--config=文件路径`，参数可以放在子命令前或后。相对路径以运行命令的目录为基准，支持绝对路径和 `~/`；包含空格的路径需要加引号。

`path` 显示本次选中的绝对路径。`init` 会创建所需的父目录，已有文件需要显式加 `--force` 才能覆盖。读取时，如果指定文件不存在或内容无效，命令会报错。

每次使用仓库清单时都传入 `--config`；省略时使用默认用户配置。远程配置仓库先用 Git 克隆到本机，再把本地 JSON 文件路径交给这个参数。

## 清单格式

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
      "description": "查找和安装更多 Skills"
    },
    {
      "name": "agent-browser",
      "source": "vercel-labs/agent-browser",
      "description": "浏览器自动化",
      "enabled": false
    }
  ]
}
```

每个 Skill 的 `name`、`source` 必填，其他字段可选：

| 字段 | 含义 |
| --- | --- |
| `name` | 上游 Skill 的准确名称，传给 `--skill` |
| `source` | GitHub 的 `owner/repo`、远程 Git URL、Skill URL 或下载地址 |
| `description` | 自己记录的用途说明，预览时显示 |
| `enabled` | 是否安装，默认 `true`；设为 `false` 可暂时停用 |
| `ref` | Git 仓库的分支、标签或 commit SHA，省略则使用上游默认版本 |
| `agents` | 安装到哪些工具，如 `["opencode", "codex", "claude-code"]` |
| `scope` | `global` 安装到用户目录，`project` 安装到运行命令的工作目录 |
| `copy` | `true` 复制文件，`false` 使用上游 CLI 的符号链接方式 |

`agents`、`scope`、`copy` 优先使用条目自己的值，其次使用 `defaults`，未配置时分别为 `["opencode"]`、`"global"`、`true`。

同一仓库的多个 Skills 分别写成多个条目。查找准确名称可以运行：

```bash
npx --yes skills@1.5.22 add vercel-labs/agent-browser --list
```

`ref` 用于 Git 来源，会编码成 `source#ref`。对于已经包含分支的 `/tree/...` URL 或直接下载地址，在 `source` 中指定版本即可。固定 CLI 版本只固定安装工具；要固定某个 Skill 的内容，需要为 Git 来源指定 commit SHA。

## 安装行为

上面的第一个条目会生成：

```bash
npx --yes skills@1.5.22 add vercel-labs/skills --agent opencode --skill find-skills --global --copy --yes
```

两个 `--yes` 分别用于 npx 下载安装工具和 Skills 安装确认。`sync` 会按清单顺序安装；再次运行会重新安装或更新这些条目，可能覆盖目标位置同名 Skill 的内容。从清单移除或禁用一个条目后，已经安装的内容仍会保留。

只预览，或者在单个 Skill 失败后继续处理其他条目：

```bash
npx skill-sync-cli sync --dry-run
npx skill-sync-cli sync --continue-on-error
```

默认遇到安装失败就停止并返回非零退出码。使用 `--continue-on-error` 后会继续执行，其间发生失败仍返回非零退出码。

使用 `scope: "project"` 时，安装目标是运行命令的目录，与清单所在目录相互独立。在目标应用项目目录运行：

```bash
npx skill-sync-cli sync --config /path/to/my-skills/skills.json
```

## 用独立 Git 仓库跨机器同步

先创建一个保存配置的仓库，并生成清单：

```bash
git init -b main my-skills
npx skill-sync-cli init --config ./my-skills/skills.json
```

编辑 `my-skills/skills.json` 后提交：

```bash
git -C my-skills add skills.json
git -C my-skills commit -m "chore: add skill manifest"
```

把这个仓库推送到自己的 Git 托管平台。其他电脑安装 Node.js、npm 和 Git 后，克隆配置仓库并直接使用其中的清单。请替换下面的示例地址：

```bash
git clone https://github.com/YOUR_NAME/my-skills.git my-skills
npx skill-sync-cli plan --config ./my-skills/skills.json
npx skill-sync-cli sync --config ./my-skills/skills.json
```

以后修改清单并提交、推送后，在已经克隆仓库的电脑上执行：

```bash
git -C my-skills pull --ff-only
npx skill-sync-cli sync --config ./my-skills/skills.json
```

Git 负责在机器之间传递清单，`sync` 根据本地清单安装 Skills。每台电脑可以把配置仓库放在不同目录，通过 `--config` 指向对应文件。

清单是这个脚本定义的格式；脚本读取后逐项调用官方 `skills` CLI。上游的 `.skill-lock.json` 继续由官方 CLI 维护。

## 发布前使用

获取项目源码后，可以在源码目录直接运行，无需安装项目依赖：

```bash
npm run init
npm run plan
npm run sync
```

通过 npm 脚本指定配置时，把参数放在 `--` 后面：

```bash
npm run plan -- --config ../my-skills/skills.json
```

`npm run sync` 的工作目录是本项目目录。如果清单采用项目安装范围，需要在目标项目目录运行脚本的绝对路径：

```powershell
node "C:\path\to\skill-sync-cli\bin\skill-sync.mjs" sync
```

生成并验证可分发的安装包：

```bash
npm run check
npm run test:package
```

命令会生成 `dist/skill-sync-cli-0.1.0.tgz` 和验证报告 `dist/package-check.json`。安装包验证通过真实 npx 命令离线执行，使用临时用户目录和全新的 npm 缓存，检查初始化、外部清单、预览和错误处理。验证结束后清理临时环境，保留安装包及报告。

也可以直接用 npx 运行安装包。请把路径替换为安装包的实际绝对路径：

```powershell
npx --yes --package "C:\path\to\skill-sync-cli-0.1.0.tgz" skill-sync-cli --help
npx --yes --package "C:\path\to\skill-sync-cli-0.1.0.tgz" skill-sync-cli init
npx --yes --package "C:\path\to\skill-sync-cli-0.1.0.tgz" skill-sync-cli plan
```

这些手动命令默认使用正常的用户配置目录。使用仓库清单时，在子命令后加上 `--config "C:\path\to\my-skills\skills.json"`。

维护者发布流程见 [RELEASING.md](RELEASING.md)。从源码运行 `npm publish` 时，会自动执行单元测试和安装包验证。

参考：[skills 官方文档](https://github.com/vercel-labs/skills)、[示例清单](skills.json.example)、[JSON Schema](schemas/skills-sync.schema.json)。
