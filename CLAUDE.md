# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

OpenCode Go 用量查看工具 — 本地 CLI / Web 看板，监控多个 opencode Go 套餐的三档用量（5h滚动/$12、每周/$30、每月/$60）。通过带 auth cookie 请求 go 页 HTML、正则提取 SSR 注入的用量数据实现。

## 运行环境

- **推荐 Bun ≥ 1.0**（直跑 TS 免编译），Node.js ≥ 18 备选
- 依赖仅 `yaml`（配置解析）和 `puppeteer-core`（一键登录，驱动系统 Chrome/Edge）

## 常用命令

```bash
bun install                                           # 安装依赖

# 命令行模式
bun run src/index.ts                                  # 读取 accounts.yaml，输出彩色表格
bun run src/index.ts --json                           # 输出 JSON
bun run src/index.ts --config /path/to/accounts.yaml  # 指定配置文件

# Web 看板模式
bun run src/index.ts --serve 8765                     # 启动看板 http://localhost:8765

# 验证脚本（手动运行，非自动化测试）
bun run tests/verify-parser.ts                        # 用 fixtures 里的 HTML 验证解析逻辑
bun run tests/verify-login.ts                         # 手动验证 puppeteer 登录流程
```

## 核心架构

**数据流**: `accounts.yaml` → `config.ts`(加载校验) → `reporter.ts`(批量拉取, 并发4) → `fetcher.ts`(带cookie请求HTML) + `parser.ts`(正则提取三档用量) → CLI(`render.ts` ANSI表格) 或 Web(`server.ts` 内嵌前端)

**关键设计决策**:
- 没有公开用量 API，所有数据从 `https://opencode.ai/workspace/{id}/go` 的 HTML `<script>` 中提取。SolidStart SSR 把用量以 `rollingUsage:$R[N]={status:"ok",resetInSec:...,usagePercent:...}` 形式注入
- `fetcher.ts` 用 `redirect: 'manual'` 检测 302 跳 `/auth/` → 判断 cookie 失效
- `parser.ts` 的 `extractTierByKey` 用 `$R[N]={` 前缀定位避免与 billing 段的 `monthlyUsage:null` 混淆，手工平衡花括号解析
- `login.ts` 每次「+ 添加账号」建新临时 Chrome profile→用完即删，避免前次登录态自动复用导致总登成同一个账号。登录完通过 CDP `Network.getAllCookies` 拿 HttpOnly auth cookie
- `config.ts` 的 `addAccount`/`removeAccount`/`renameAccount` 直接写回 yaml 文件（记住 `lastFile` 路径）
- `server.ts` 用 `loginBusy` 锁防并发登录；前端每 60 秒自动拉取

## 文件职责速查

| 文件 | 职责 |
|---|---|
| `src/index.ts` | CLI 入口，参数解析（--config, --json, --serve） |
| `src/types.ts` | Account, UsageTier, UsageReport, Config 类型 + LIMITS 常量 |
| `src/config.ts` | YAML 配置读写、账号增删改、校验 |
| `src/fetcher.ts` | fetch HTML，识别 auth 失效/网络错误 |
| `src/parser.ts` | 正则提取 rolling/weekly/monthly usage + email + workspace 列表 |
| `src/reporter.ts` | fetchReport 单账号、fetchAllReports 并发限流 |
| `src/format.ts` | 倒计时、金额格式化 |
| `src/render.ts` | ANSI 彩色表格 + 进度条（手写，零依赖） |
| `src/server.ts` | HTTP 服务 + 内嵌 SPA 前端（含 API 路由） |
| `src/login.ts` | puppeteer-core 驱动系统 Chrome 完成登录抓 cookie |

## 注意事项

- `accounts.yaml` 含敏感 auth cookie，已在 `.gitignore`，**绝不提交**
- TypeScript 配置 `noEmit: true`，全靠 Bun 直接执行 `.ts` 文件
- `import` 路径必须带 `.js` 扩展名（`'./types.js'`），因为 Bun 按 ESM 解析
- 项目没有自动化测试框架，`tests/` 下是手动验证脚本，用 `bun run` 直接跑
- `tests/fixtures/go-sample.html` 是线上真实页面保存的样本，修改解析逻辑前用它验证不会破坏现有功能
- 三档上限 $12/$30/$60 是官方固定值，定义在 `types.ts` 的 `LIMITS` 常量中
