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

配置文件固定在用户目录中：

- Windows：`%USERPROFILE%\.config\skill-sync\skills.json`
- macOS / Linux：`~/.config/skill-sync/skills.json`

创建后，编辑这个文件填写自己常用的 Skills。`init` 默认保留已有文件；如果确实要用示例覆盖当前清单，可以运行 `npx skill-sync-cli init --force`。

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

使用 `scope: "project"` 时，在目标项目目录运行 `npx skill-sync-cli sync`，Skills 就会安装到该项目下。

## 在新电脑上使用

1. 安装 Node.js、npm 和 Git。
2. 把保存的 `skills.json` 放到该电脑的 `~/.config/skill-sync/skills.json`。
3. 运行 `npx skill-sync-cli plan` 查看清单，再运行 `npx skill-sync-cli sync` 安装。

清单是这个脚本定义的格式；脚本读取后逐项调用官方 `skills` CLI。上游的 `.skill-lock.json` 继续由官方 CLI 维护。

## 发布前使用

获取项目源码后，可以在源码目录直接运行，无需安装项目依赖：

```bash
npm run init
npm run plan
npm run sync
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

命令会生成 `dist/skill-sync-cli-0.1.0.tgz` 和验证报告 `dist/package-check.json`。安装包验证通过真实 npx 命令离线执行，使用临时用户目录和全新的 npm 缓存，检查初始化、配置、预览和错误处理。验证结束后清理临时环境，保留安装包及报告。

也可以直接用 npx 运行安装包。请把路径替换为安装包的实际绝对路径：

```powershell
npx --yes --package "C:\path\to\skill-sync-cli-0.1.0.tgz" skill-sync-cli --help
npx --yes --package "C:\path\to\skill-sync-cli-0.1.0.tgz" skill-sync-cli init
npx --yes --package "C:\path\to\skill-sync-cli-0.1.0.tgz" skill-sync-cli plan
```

这些手动命令使用正常的用户配置目录。

维护者发布流程见 [RELEASING.md](RELEASING.md)。从源码运行 `npm publish` 时，会自动执行单元测试和安装包验证。

参考：[skills 官方文档](https://github.com/vercel-labs/skills)、[示例清单](skills.json.example)、[JSON Schema](schemas/skills-sync.schema.json)。
