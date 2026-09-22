# 八角笼 · DEBATE ARENA

在线辩论赛实时计时平台。把线下辩论赛使用的棋钟搬到网页上：主持人、正方、反方、观众
通过不同权限的链接进入同一个房间，所有设备实时看到完全一致的比赛时间、回合和状态。

## 已经跑通的东西

**在线房间**

- 主持人控制台登录后创建房间
- 每个房间自动生成四类链接（主持人 / 正方 / 反方 / 观众）
- 同一房间内所有端实时同步（SSE + HTTP 指令）
- 辩手只能结束自己一方的当前回合，只能在自己计时时开麦
- 主持人拥有完整控制权
- 房间内语音通话（WebRTC，信令复用房间通道）
- 观众弹幕；观众可申请上麦，由主持人批准

**账号系统**（可选，见 [AUTH_SETUP.md](./AUTH_SETUP.md)）

- 注册（邮箱 + 密码 + 出场名称）、登录、登出
- 邮箱验证码验证
- 修改密码（自动登出其他设备）
- 忘记密码 → 邮箱验证码 → 重置
- 出场档案（名字 + 头像）跟着账号走，换设备也在
- 头像图片上传后存进 R2，账号里只留短 URL
- 接口限流，防注册刷号
- 发信通道可插拔：没配域名时走开发模式，配了自动切真发信

## 角色权限

| 角色 | 能做什么 |
| --- | --- |
| 主持人 | 全部房间控制权：开始/暂停、切换发言方、结束回合、重置、加减时间、改辩题与规则、审批上麦 |
| 正方 / 反方 | 观看、弹幕、语音；只能结束自己一方的回合；只有自己计时时能开麦 |
| 观众 | 观看、弹幕、观众语音频道；可申请加入公共频道 |

## 当前架构

- 前端：React + TypeScript + Vite
- 在线状态层：Cloudflare Worker
- 房间实时状态：Cloudflare Durable Object
- 房间目录：Cloudflare KV
- **账号数据：Cloudflare D1**（账号 / 会话 / 验证码 / 限流 / 发信记录）
- **头像图片：Cloudflare R2**（账号里只存短 URL，不存 data URL）
- 实时同步方式：SSE（Server-Sent Events）+ HTTP 指令写入

账号数据放在 D1 而不是 KV，是因为注册系统需要唯一索引（邮箱唯一）、事务和可吊销的会话记录 —— KV 是最终一致的，做不到这些。

## 界面设计

整站使用一套自建设计系统，定位是**赛事转播控制台**而不是常规后台。核心约定：

- **时间是第一视觉焦点**：计时数字是页面上最大的元素
- **正方蓝 `#3B82F6` / 反方红 `#F04444`**，当前计时方用顶部色线 + 底色光晕表达
- 深色三层表面（`#0A0A0B` / `#111214` / `#18191C`），层级靠**细边框和留白**，不靠阴影和圆角
- 少卡片、多分割线；动效只用于状态变化（数字、进度条、呼吸光、LIVE 闪烁）

样式分层见 `src/styles/`（顺序在 `src/main.tsx` 里统一定义）：

```text
tokens.css      设计变量（颜色 / 字号 / 间距 / 圆角 / 动效）
base.css        重置、排版、布局 helper
components.css  通用原语（按钮 / 面板 / 标签 / 表单 / 抽屉 / 弹层）
shell.css       顶部导航、页脚、登录闸门
timer.css       棋钟视觉语言（首页与房间页共用）
editorial.css   编辑型页面（使用指南 / 关于）
account.css     登录注册、邮箱提示条、账号设置
landing.css     首页
console.css     开房台
room.css        房间页（控制台 / 辩手 / 观众）
```

字体不依赖任何 CDN（面向中国大陆访问）：按本地已装字体依次回退，
计时数字优先 JetBrains Mono 一类等宽字体，并强制 `tabular-nums`。

## 项目结构

```text
.
├─ src/
│  ├─ styles/              # Design System（见上）
│  ├─ shared/              # 前后端共享的类型与计时引擎
│  ├─ ui/                  # 可复用组件（TimerLab / AppHeader / 面板等）
│  ├─ hooks/               # 实时同步、语音、账号、计时 Hook
│  ├─ pages/               # 使用指南、关于
│  ├─ lib/                 # API 客户端、路由、格式化
│  ├─ App.tsx              # 路由与外壳
│  ├─ MarketingPage.tsx    # 首页
│  ├─ DashboardPage.tsx    # 开房台（建房 / 链接 / 房间列表）
│  └─ RoomPage.tsx         # 房间页（控制台 / 辩手 / 观众三种形态）
├─ migrations/
│  └─ 0001_accounts.sql    # 账号数据库建表脚本
├─ scripts/
│  ├─ smoke-test-auth.ps1  # 账号接口端到端冒烟测试
│  └─ render-check.tsx     # 无浏览器静态渲染检查
├─ worker-index.ts         # Worker 入口（路由 + 账号接口）
├─ worker-auth.ts          # 密码哈希 / 会话 / 验证码 / 限流
├─ worker-avatars.ts       # 头像图片存取（R2，含文件头校验）
├─ worker-email.ts         # 发信抽象（Resend / Brevo / 开发模式）
├─ worker-room-object.ts   # Durable Object 房间逻辑
├─ cloudflare.d.ts         # 本地 Worker 类型声明（含 D1 / R2 类型）
├─ wrangler.toml           # Cloudflare 部署配置
├─ AUTH_SETUP.md           # 账号系统与发信配置说明
├─ DEPLOYMENT.md           # 部署说明
└─ LICENSE
```

## 本地开发

最省事的方式：直接双击 **`启动.bat`**（或 `start.bat`）。它会自动

1. 检查 Node.js / npm
2. 首次运行时安装依赖
3. 没有 `.dev.vars` 就从 `.dev.vars.example` 复制一份
4. **应用本地 D1 数据库迁移**（建账号相关的表）
5. 起 Worker API（`http://127.0.0.1:8787`）
6. 起前端（`http://localhost:5173`）

手动方式：

```bash
npm install
npx wrangler d1 migrations apply DB --local   # 必须先建表，否则注册会报错
npm run dev:worker                            # 终端 1：Worker API
npm run dev                                   # 终端 2：前端
```

### 检查

```bash
npm run check         # 前端 + Worker 两套 tsconfig
npm run check:render  # 无浏览器静态渲染检查（能抓到渲染期抛异常）
npm run check:all     # 上面两个一起跑
```

`check:render` 用 `react-dom/server` 把首页、指南、关于、导航、登录面板、
账号面板、棋钟、弹幕、语音、房间页的无效链接分支各渲染一遍并断言关键标记。
它不需要浏览器，适合在改 UI 后快速确认"没有把界面改崩"。

### 账号接口冒烟测试

Worker 跑起来之后，在 PowerShell 里执行：

```powershell
powershell -File scripts/smoke-test-auth.ps1
```

它会完整走一遍：注册 → 邮箱验证 → 登录 → 改资料 → 改密码（并确认旧会话被踢）→
找回密码 → 重置密码 → 登出（并确认 token 真的失效）→ 头像上传/取回/清理 →
各种非法输入校验。全部通过会打印 `PASS n / FAIL 0`。

> 注意：这个脚本必须保留 UTF-8 BOM，且注释只用 ASCII。
> Windows PowerShell 5.1 会把无 BOM 文件按 ANSI 读取，中文注释的字节错位会"吃掉"
> 下一行的换行符，把下一条语句静默变成注释内容 —— 脚本里已经加了 BOM 缺失告警。

## 环境变量

见 [AUTH_SETUP.md](./AUTH_SETUP.md)，最小集合是：

| 变量 | 说明 |
| --- | --- |
| `HOST_ADMIN_PASSWORD` | 主持人控制台口令 |
| `ADMIN_SESSION_SECRET` | 后台会话签名密钥，请用足够长的随机串 |
| `ENABLE_DEV_OUTBOX` | 仅本地开发设为 `true`，可用 `/api/dev/outbox` 读验证码。**线上必须留空** |
| `EMAIL_PROVIDER` / `EMAIL_FROM` / `RESEND_API_KEY` | 真发信时才需要，见 AUTH_SETUP.md |
| `PASSWORD_ITERATIONS` | PBKDF2 迭代次数，默认 100000 |

本地开发参考 `.dev.vars.example`；`.dev.vars` 已被 `.gitignore` 忽略，不会提交。

## License

MIT
