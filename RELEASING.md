# 发布 0.2.0

## 发布信息

| 项目 | 值 |
| --- | --- |
| npm 包名 | `@wangkh/skill-sync-cli` |
| 版本 | `0.2.0` |
| 命令入口 | `npx @wangkh/skill-sync-cli`；安装后的可执行命令为 `skill-sync-cli` |
| 计划 GitHub 仓库 | `https://github.com/yudaiyan/skill-sync-cli` |
| 默认上游 CLI | `skills@1.5.22` |
| 默认配置位置 | `~/.config/skill-sync/skills.json` |
| 仓库清单 | `--config /path/to/my-skills/skills.json`，也支持 `-c` |

0.1.0 已于 2026-09-10 发布到 npm；首次尝试非作用域包名 `skill-sync-cli` 时被拒（与已存在的 `skillsync-cli` 过于相似），随后改用 `@wangkh/skill-sync-cli`。发布需要 npm 账号的 2FA。GitHub 仓库已创建：`https://github.com/yudaiyan/skill-sync-cli`。0.2.0 新增 `init --from <url>`，支持从 Gitee / GitHub 文件链接初始化清单。

## 生成并验证安装包

在项目源码目录运行：

```bash
npm run check
npm run test:package
```

`test:package` 会实际执行 `npm pack`，随后用独立的用户目录和 npm 缓存离线运行安装包。输出：

- `dist/wangkh-skill-sync-cli-0.2.0.tgz`：可分发的 npm 安装包。
- `dist/package-check.json`：包摘要、文件清单、执行环境和通过的检查。

`dist/` 已加入 Git 忽略规则。修改代码或文档后，需要重新生成安装包，使报告对应最终内容。

## 正式发布流程

确认改动已提交并推送 `main`，然后确认 npm 登录身份，从项目源码目录发布：

```bash
git push origin main
npm whoami --registry=https://registry.npmjs.org/
npm publish
```

`npm publish` 会执行 `prepublishOnly`，重新运行单元测试和安装包验证。npm 认证、双重验证及包名权限由 npm 处理。`publishConfig` 指向公共 npm 注册表。

发布成功后，从其他目录检查 npm 上的版本和用户入口：

```bash
npm view @wangkh/skill-sync-cli version
npx --yes @wangkh/skill-sync-cli@0.2.0 --version
npx --yes @wangkh/skill-sync-cli@0.2.0 --help
```

## 后续版本

更新 `package.json` 的版本，CLI 的 `--version` 会读取同一版本号。同步修改文档中的安装包文件名，运行上述检查，再提交和发布。
