# skill-sync-cli

用一份 JSON 清单记录常用开源 Skills 的名称、来源和用途，通过一个命令批量调用 `npx skills add` 安装。适合把个人清单保存在 dotfiles 仓库中，在新电脑上恢复环境。

## 开始使用

需要 Node.js 18.17+、npm 和 Git。脚本使用 Node.js 内置模块，无需先安装项目依赖。首次执行安装时，npx 会下载清单指定版本的 `skills` CLI。

在本项目目录运行：

```bash
# 新环境：创建初始清单；如果已有清单，跳过这一步
npm run init

# 查看配置文件的位置
npm run path

# 编辑清单后检查格式并预览安装命令
npm run validate
npm run plan

# 批量安装已启用的 Skills
npm run sync
```

配置文件固定在用户目录中：

- Windows：`%USERPROFILE%\.config\skill-sync\skills.json`
- macOS / Linux：`~/.config/skill-sync/skills.json`

`init` 默认保留已有文件。如果确实要用示例覆盖当前清单，可以运行 `npm run init -- --force`。

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
npm run sync -- --dry-run
npm run sync -- --continue-on-error
```

默认遇到安装失败就停止并返回非零退出码。使用 `--continue-on-error` 后会继续执行，其间发生失败仍返回非零退出码。

`npm run sync` 的工作目录是本项目目录。如果需要把 `scope: "project"` 的 Skills 安装到另一个项目，请在目标项目目录调用脚本的绝对路径，例如：

```powershell
node "C:\Users\test\skill-sync-cli\bin\skill-sync.mjs" sync
```

## 在新电脑上使用

1. 获取这个项目，安装 Node.js、npm 和 Git。
2. 把保存的 `skills.json` 放到该电脑的 `~/.config/skill-sync/skills.json`。
3. 在项目目录运行 `npm run plan` 查看清单，再运行 `npm run sync` 安装。

清单是这个脚本定义的格式；脚本读取后逐项调用官方 `skills` CLI。上游的 `.skill-lock.json` 继续由官方 CLI 维护。

## 验证

```bash
npm run check
```

测试覆盖清单解析、批量执行行为和 npx 启动，不需要安装真实 Skills。

参考：[skills 官方文档](https://github.com/vercel-labs/skills)、[示例清单](skills.json.example)、[JSON Schema](schemas/skills-sync.schema.json)。
