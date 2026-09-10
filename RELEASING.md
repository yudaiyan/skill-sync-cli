# 发布 0.1.0

## 发布信息

| 项目 | 值 |
| --- | --- |
| npm 包名 | `@wangkh/skill-sync-cli` |
| 版本 | `0.1.0` |
| 命令入口 | `npx @wangkh/skill-sync-cli`；安装后的可执行命令为 `skill-sync-cli` |
| 计划 GitHub 仓库 | `https://github.com/yudaiyan/skill-sync-cli` |
| 默认上游 CLI | `skills@1.5.22` |
| 默认配置位置 | `~/.config/skill-sync/skills.json` |
| 仓库清单 | `--config /path/to/my-skills/skills.json`，也支持 `-c` |

2026-09-10 首次发布时，npm 公共注册表拒绝了非作用域包名 `skill-sync-cli`，理由是它与已存在的 `skillsync-cli` 过于相似，并建议改用 `@wangkh/skill-sync-cli`；当前包名已采用该建议，发布需要 npm 账号的 2FA。GitHub CLI 登录账号为 `yudaiyan`，仓库地址按 `https://github.com/yudaiyan/skill-sync-cli` 准备。

## 生成并验证安装包

在项目源码目录运行：

```bash
npm run check
npm run test:package
```

`test:package` 会实际执行 `npm pack`，随后用独立的用户目录和 npm 缓存离线运行安装包。输出：

- `dist/wangkh-skill-sync-cli-0.1.0.tgz`：可分发的 npm 安装包。
- `dist/package-check.json`：包摘要、文件清单、执行环境和通过的检查。

`dist/` 已加入 Git 忽略规则。修改代码或文档后，需要重新生成安装包，使报告对应最终内容。

## 正式发布流程

完成发布准备提交后，创建计划仓库并推送 `main`。例如，选择公开仓库时：

```bash
gh repo create yudaiyan/skill-sync-cli --public --source . --remote origin --push
```

确认 npm 登录身份，然后从项目源码目录发布：

```bash
npm whoami --registry=https://registry.npmjs.org/
npm publish
```

`npm publish` 会执行 `prepublishOnly`，重新运行单元测试和安装包验证。npm 认证、双重验证及包名权限由 npm 处理。`publishConfig` 指向公共 npm 注册表。

发布成功后，从其他目录检查 npm 上的版本和用户入口：

```bash
npm view @wangkh/skill-sync-cli version
npx --yes @wangkh/skill-sync-cli@0.1.0 --version
npx --yes @wangkh/skill-sync-cli@0.1.0 --help
```

## 后续版本

更新 `package.json` 的版本，CLI 的 `--version` 会读取同一版本号。同步修改文档中的安装包文件名，运行上述检查，再提交和发布。
