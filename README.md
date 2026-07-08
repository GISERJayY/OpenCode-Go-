# OpenCode Go 用量查看工具

一个本地命令行 / Web 看板工具，查看多个 opencode Go 套餐的实时用量。

## 它能做什么

- 一次性拉取多个 opencode 账号的 Go 套餐用量（5 小时滚动档 / 每周 / 每月）
- 命令行彩色表格输出，含进度条、金额换算、重置倒计时
- 或启动本地 Web 看板，浏览器打开自动每 60 秒刷新
- 用量超 80% 变黄、超 95% 变红提醒

三档固定上限（官方文档确认，工具按百分比换算金额）：

| 档 | 上限 |
|---|---|
| 5 小时滚动 | $12 |
| 每周 | $30 |
| 每月 | $60 |

---

## 环境要求

- [Node.js](https://nodejs.org) ≥ 18（本机已装 24，含内置 `fetch`）
- 或 [Bun](https://bun.sh) ≥ 1.0（本机已装 1.3.14，直跑 TS 免编译，推荐）

---

## 安装

在项目目录下：

```bash
bun install
```

依赖两个：`yaml`（解析配置）、`puppeteer-core`（驱动系统 Chrome 完成一键登录添加账号）。puppeteer-core 不下载自带 Chromium，直接用你系统已装的 Chrome / Edge。

---

## 添加账号

有两种方式，**推荐方式一**（一键登录，免手动导 cookie）。

### 方式一：看板里一键登录添加（推荐）

启动看板后（见下文「Web 看板用法」），页面上有 **「+ 添加账号」** 按钮：

1. 点击该按钮 → 工具会拉起一个**独立 Chrome 窗口**（一次性临时 profile，与你日常浏览器完全隔离，用完即删）；
2. 在弹出的窗口里点「Continue with GitHub」或「Continue with Google」完成登录（含 OAuth 授权 / 可能的 2FA，全部走你熟悉的第三方登录）；
3. 登录成功跳转到 workspace 页后，工具会**自动抓取 auth cookie 和 workspaceId**、关闭浏览器，并把该账号追加写入 `accounts.yaml`；
4. 紧接着弹框让你**给新账号起个名字**（默认用邮箱前缀），确认后看板刷新，新账号以你起的名字出现在列表里。

> 为什么用临时 profile 而不是持久保留登录态？因为 opencode 账号身份由 GitHub/Google 决定。如果保留上一次的登录态，下次点「+ 添加账号」会被自动复用成**上一个账号的身份**，导致永远只能添加成同一个账号。每次用干净 profile，才能登录任意的 GitHub/Google 身份、添加对应的 opencode 账号。代价是每次添加新账号都要在那个弹窗里重新登录 GitHub/Google——这是添加"不同身份账号"绕不开的成本。

> 注意：opencode 仅支持 GitHub / Google 第三方登录，没有「邮箱密码」这一说，所以工具无法凭账密自动登录。它做的是「帮你打开浏览器完成登录 → 自动抓 cookie 落盘」，把人工步骤减到最少。

添加后想给账号改个更好认的名字，点账号卡片上的 **「改名」** 按钮，输入新名确认即可（会写回 `accounts.yaml`）。想删账号，点卡片上的 **「删除」** 按钮，会同步从 `accounts.yaml` 移除。

> 中途反悔：登录过程中若你手动关掉那个弹出的浏览器窗口，看板会很快提示「添加失败: 用户取消了登录（浏览器被关闭）」，并能立即重新点「+ 添加账号」重试，不会卡住。

### 方式二：手动导 cookie（备选）

不方便用看板登录、或想批量填，可直接编辑 `accounts.yaml`：

#### 1. 复制配置模板

```bash
cp accounts.example.yaml accounts.yaml
```

`accounts.yaml` 已在 `.gitignore` 中，不会被提交，可放心放真实 cookie。

#### 2. 导出每个账号的 auth cookie

每个 opencode 账号都要各导一次（认证按账号）：

1. 浏览器登录 https://opencode.ai 该账号；
2. 进入用量页 `https://opencode.ai/workspace/<你的workspaceId>/go`；
3. 按 `F12` → 切到 **Application / 应用程序** 标签 → 左侧 **Cookies** → 选 `https://opencode.ai`；
4. 找到名为 **`auth`** 的那一行，复制 **Value** 列的值（一长串 `Fe26.2**...`，注意是 HttpOnly，JS 读不到但 DevTools 能看到）；
5. 从浏览器地址栏复制 `wrk_xxx`，这就是 `workspaceId`。

#### 3. 填写 accounts.yaml

```yaml
accounts:
  # 账号 1
  - name: 主号
    cookie: "Fe26.2**xxx...粘贴 auth cookie 的 Value"
    workspaceId: wrk_01AAAAAAAAAAAAAAAAAAA

  # 账号 2
  - name: 备号1
    cookie: "Fe26.2**yyy...另一个账号的 auth cookie"
    workspaceId: wrk_01BBBBBBBBBBBBBBBBBBB

  # 账号 3 —— 想加多少加多少
  - name: 团队共享
    cookie: "Fe26.2**zzz..."
    workspaceId: wrk_01CCCCCCCCCCCCCCCCCCC

# 可选：进度条阈值（百分比），不写用默认值
warn: 80   # 超过变黄
alert: 95  # 超过变红
```

**字段说明**：

| 字段 | 必填 | 说明 |
|---|---|---|
| `name` | 是 | 展示名，随意起，用于区分账号 |
| `cookie` | 是 | `auth` cookie 的 Value，**不要带 `auth=` 前缀** |
| `workspaceId` | 是 | `wrk_` 开头，从浏览器地址栏复制 |
| `warn` / `alert` | 否 | 整体配置项，进度条阈值百分比 |

---

## 命令行用法

```bash
# 默认读 ./accounts.yaml，输出彩色表格
bun run src/index.ts

# 指定配置文件
bun run src/index.ts --config /path/to/my-accounts.yaml

# 输出 JSON（便于脚本处理）
bun run src/index.ts --json

# 查看帮助
bun run src/index.ts --help
```

输出示例（单账号）：

```
账号  | 邮箱              | workspace    | 5h档（$12）              | 每周档（$30）              | 每月档（$60）
主号  | user@example... | wrk_01E...   | ░░░░░░░░░░░░░░░░ 0%    | ░░░░░░░░░░░░░░░░ 0%     | █░░░░░░░░░░░░░░░ 3%
      |                  |             | $0.00/$12 reset 5h 0m  | $0.00/$30 reset 5d 13h | $1.80/$60 reset 25d 16h
      |                  |             | status=ok              | status=ok              | status=ok
```

多账号时表格多行，每账号一行。

---

## Web 看板用法（推荐）

### 启动看板

```bash
# 在本机 8765 端口启动看板
bun run src/index.ts --serve 8765
```

启动后会输出：

```
OpenCode Go 用量看板已启动: http://localhost:8765/
按 Ctrl+C 停止
```

### 访问

浏览器打开 **http://localhost:8765/** 即可：

- 每个账号一张卡片，含 5h / 每周 / 每月 三档用量
- 进度条按 `warn` / `alert` 阈值变色
- 显示 `$已用/$上限`、`重置于 Xd Yh`、`status`
- 每 **60 秒** 自动刷新
- 右上角「刷新」按钮可立即拉取
- 右上角 **「+ 添加账号」** 按钮：一键登录添加账号，登录成功后会立即问你要叫什么名字（详见上节「方式一」）
- 每张卡片右上 **「改名」** 按钮：给已有账号起更好认的名字
- 每张卡片右上 **「删除」** 按钮：移除该账号并从 `accounts.yaml` 删除

### 后台常驻（关闭终端不退出）

#### Windows（PowerShell）

```powershell
# 后台启动，日志写到 usage-server.log
Start-Process -WindowStyle Hidden -FilePath bun `
  -ArgumentList "run","src\index.ts","--serve","8765" `
  -RedirectStandardOutput usage-server.log `
  -RedirectStandardError usage-server.err.log
```

查看进程 / 停止：

```powershell
# 找到监听 8765 的进程
Get-NetTCPConnection -LocalPort 8765 | Select OwningProcess
Stop-Process -Id <上面那个 PID>
```

或用任务管理器找 `bun.exe` 结束。

#### Linux / macOS

```bash
# nohup 后台 + 日志
nohup bun run src/index.ts --serve 8765 > usage-server.log 2>&1 &

# 查看进程
ps aux | grep "index.ts --serve"

# 停止
kill <PID>
```

更稳妥可用 [pm2](https://pm2.keymetrics.io/)：

```bash
pm2 start "bun run src/index.ts --serve 8765" --name opencodego-usage
pm2 logs opencodego-usage
pm2 stop opencodego-usage
pm2 delete opencodego-usage
```

---

## 工作原理

opencode 未公开用量查询 API，但访问 `https://opencode.ai/workspace/{workspaceId}/go` 这个 **HTML 页面**（带登录态 `auth` cookie），用量数据会由 SolidStart SSR 注入到 HTML 中一段 `<script>` 内，形如：

```js
{ rollingUsage: { status:"ok", resetInSec:18000,   usagePercent:0 },   // 5h 滚动
  weeklyUsage:  { status:"ok", resetInSec:481434,  usagePercent:0 },   // 每周
  monthlyUsage: { status:"ok", resetInSec:2218515, usagePercent:3 } }  // 每月
```

工具带 cookie 请求该 HTML，用正则提取这三档 `status / resetInSec / usagePercent`，按已知固定上限换算金额，渲染成表格或卡片。**单次请求即拿到该账号全部用量**，不存在高频轮询，对服务器友好。

---

## 排错

| 现象 | 原因 / 处理 |
|---|---|
| 看板该账号行显示"cookie 失效，请重新登录导出" | auth cookie 过期或填错。点「+ 添加账号」重新登录添加，或手动重新导出 auth cookie 填入配置 |
| 显示 "页面未含用量数据" | 该 workspaceId 不属于此账号 / cookie 无权访问，核对 workspaceId |
| 显示 "网络错误" | DNS / 代理 / 连接问题，检查本机网络 |
| 端口 8765 被占用 | 换个端口，如 `--serve 9000` |
| 点「+ 添加账号」后报"启动浏览器失败" / "未找到 Chrome" | 系统需安装 Chrome 或 Edge；或 puppeteer-core 与 Chrome 版本差异太大，升级 `puppeteer-core` |
| 登录浏览器一直不关、提示"登录超时" | 3 分钟内未完成登录跳转（超时已自动从原 5 分钟缩到 3 分钟）。请重新点按钮，确保在弹出窗口里走完 GitHub/Google 登录并最终跳到 `opencode.ai/workspace/wrk_...` |
| 弹出登录窗口后手动关掉，看板说"添加失败: 用户取消了登录" | 这是正常的取消路径。看板会立即释放锁，可重新点「+ 添加账号」重试 |
| 添加第二个账号时，系统自动登成第一个账号的身份 | 旧版本行为；当前版本每次用全新临时 profile，已修复。若仍发生，升级代码后重试 |
| 配置加载报错 | accounts.yaml 格式错误，检查缩进与字段是否齐全 |

---

## 安全提醒

- `accounts.yaml` 含敏感 `auth` cookie（HttpOnly、有效期约 1 年）。该文件已在 `.gitignore`，**不要提交到代码仓库、不要发到公开群**。
- 若怀疑泄露：在 opencode.ai 重新登录会让旧 cookie 失效；重新导出新 cookie 替换配置即可。
- 工具不会打印 cookie 原文，日志里也不含凭据。

---

## 目录结构

```
opencodego/
├─ package.json              # 依赖与脚本
├─ tsconfig.json             # TS 配置
├─ .gitignore                # 忽略 accounts.yaml、node_modules
├─ accounts.example.yaml     # 配置模板
├─ accounts.yaml             # 你的真实配置（不入库）
├─ README.md                 # 本文档
└─ src/
   ├─ index.ts               # CLI 入口（--json / --serve）
   ├─ config.ts              # 读 accounts.yaml 并校验
   ├─ fetcher.ts             # 带 cookie 请求 go 页 HTML
   ├─ parser.ts              # 从 HTML 提取三档用量
   ├─ reporter.ts            # 批量拉取（CLI 与 Web 看板共用）
   ├─ format.ts              # 倒计时 / 金额格式化
   ├─ render.ts              # 命令行彩色表格
   ├─ server.ts              # Web 看板 HTTP 服务 + 内嵌前端
   ├─ login.ts               # 一键登录添加账号（puppeteer-core 驱动系统 Chrome）
   └─ types.ts               # 类型定义
```

---

## 常见问题

**Q: 能不能不导 cookie，直接用 API key？**
不能。opencode 公开了模型列表/补全接口（用 API key），但没有用量查询端点。用量只能在 Web 控制台看，工具复刻的是这条路径，需要登录态 cookie。

**Q: cookie 多久过期？**
实测 `Set-Cookie` 显示有效期约 1 年。过期后重新登录导出即可。

**Q: 看板刷新频率会不会被风控？**
默认 60 秒一次，单次 HTML 请求即拿全部三档数据，无轮询多端点，对服务器很轻。如需更保守可改 `server.ts` 里的 `setInterval(refresh, 60000)`。

**Q: 多账号会一起拉取吗？**
会，默认并发 4，互不影响。某账号失败不影响其他账号展示。

**Q: 一台机器能看另一个地区账号吗？**
能，工具只看 cookie + workspaceId，与浏览器在哪无关。

**Q: 「+ 添加账号」弹出的浏览器，登录信息存哪了？**
**不保留**。每次「+ 添加账号」都会在系统临时目录（如 Windows 下的 `%TEMP%\opencodego-login-XXXX`）建一个全新的独立 profile，登录结束后立刻删除。整个过程与你日常浏览器完全隔离，**不会传染身份、不会留下任何登录态**。这是为了避免被上一次登录的 GitHub/Google 身份"自动复用"，导致添加新账号时永远登成第一个账号。

**Q: 既然用临时 profile，那不是每次都要重新登录？会不会很烦？**
会。这是当前实打实的代价——添加"另一个 GitHub/Google 身份对应的 opencode 账号"绕不开这一步。如果你日常只用一个身份，登录一次就够用；多身份切换时（需要它处理不同账号）每次都得重新走一次 GitHub/Google 登录（含可能的 2FA）。如果以后能找到更优雅的多账户隔离方式（例如指定多个 profile 目录并在浏览器里让你选）会再加。

**Q: 工具会自动登录我账号吗？会偷偷拿别东西吗？**
工具只在你点「+ 添加账号」时主动打开浏览器让你人工登录，登录完成后**只读取** `auth` cookie 和当前页面 URL 里的 workspaceId 与邮箱显示，**不读取其它 cookie、不记录密码、不写浏览器历史**。日志不含任何凭据。临时 profile 用完即删，不留痕。