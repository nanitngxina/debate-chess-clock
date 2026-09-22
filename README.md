# 八角笼辩论棋钟 Online

把原先“主持人在本地电脑上运行的单机棋钟”，重构成了一个可部署上线、可多人同步观看和操作的网页应用。

## 已经跑通的东西

**在线房间**

- 主持人后台登录后创建房间
- 每个房间自动生成四类链接（主持人 / 正方 / 反方 / 观众）
- 同一房间内所有端实时同步
- 观众无需登录即可观看并发送弹幕
- 辩手只能结束自己一方的当前回合
- 主持人拥有完整控制权
- 房间内语音通话（WebRTC，信令走房间通道）

**账号系统**（2026 年新增，见 [AUTH_SETUP.md](./AUTH_SETUP.md)）

- 注册（邮箱 + 密码 + 出场名称）
- 登录 / 退出登录
- 邮箱验证码验证
- 修改密码（会自动登出其他设备）
- 忘记密码 → 邮箱验证码 → 重置
- 出场档案（名字 + 头像）跟着账号走，换设备也在
- 头像图片上传后存进 R2，账号里只留短 URL
- 接口限流，防注册刷号
- 发信通道可插拔：没配域名时走开发模式，配了自动切真发信

## 当前架构

- 前端：React + TypeScript + Vite
- 在线状态层：Cloudflare Worker
- 房间实时状态：Cloudflare Durable Object
- 房间目录：Cloudflare KV
- **账号数据：Cloudflare D1**（账号 / 会话 / 验证码 / 限流 / 发信记录）
- **头像图片：Cloudflare R2**（账号里只存短 URL，不存 data URL）
- 实时同步方式：SSE（Server-Sent Events）+ HTTP 指令写入

账号数据放在 D1 而不是 KV，是因为注册系统需要唯一索引（邮箱唯一）、事务和可吊销的会话记录 —— KV 是最终一致的，做不到这些。

## 角色权限

### 观众

- 可进入房间观看
- 可发送弹幕
- 不可控制棋钟

### 辩手

- 拥有观众全部能力
- 只能执行“结束自己这一方当前回合”

### 主持人

- 拥有全部房间控制权
- 可修改辩题、规则说明、双方名称
- 可暂停和继续、切边、结束回合、重置
- 可手动增减时间、调整计时规则

## 项目结构

```text
.
├─ src/                    # React 前端
│  ├─ shared/              # 前后端共享的类型与计时引擎
│  ├─ ui/                  # 可复用界面组件（含 AuthPanel / AccountPanel）
│  ├─ hooks/               # 前端状态与实时同步 Hook（含 useAccountSession）
│  ├─ App.tsx              # 前端入口路由
│  ├─ DashboardPage.tsx    # 主持人后台
│  ├─ MarketingPage.tsx    # 首页
│  └─ RoomPage.tsx         # 房间页
├─ migrations/
│  └─ 0001_accounts.sql    # 账号数据库建表脚本
├─ scripts/
│  └─ smoke-test-auth.ps1  # 账号接口端到端冒烟测试
├─ worker-index.ts         # Cloudflare Worker 入口（路由 + 账号接口）
├─ worker-auth.ts          # 密码哈希 / 会话 / 验证码 / 限流
├─ worker-avatars.ts       # 头像图片存取（R2，含文件头校验）
├─ worker-email.ts         # 发信抽象（Resend / Brevo / 开发模式）
├─ worker-room-object.ts   # Durable Object 房间逻辑
├─ worker-types.ts         # Worker 环境类型
├─ cloudflare.d.ts         # 本地 Worker 类型声明（含 D1 类型）
├─ wrangler.toml           # Cloudflare 部署配置
├─ tsconfig.worker.json    # Worker 类型检查配置
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

### 类型检查

```bash
npm run check    # 前端 + Worker 两套 tsconfig 一起检查
```

### 账号接口冒烟测试

Worker 跑起来之后，在 PowerShell 里执行：

```powershell
powershell -File scripts/smoke-test-auth.ps1
```

它会完整走一遍：注册 → 邮箱验证 → 登录 → 改资料 → 改密码（并确认旧会话被踢）→
找回密码 → 重置密码 → 登出（并确认 token 真的失效）→ 各种非法输入校验。全部通过会打印 `PASS n / FAIL 0`。

## 环境变量

账号系统相关的变量见 [AUTH_SETUP.md](./AUTH_SETUP.md)，最小集合是：

| 变量 | 说明 |
| --- | --- |
| `HOST_ADMIN_PASSWORD` | 主持人后台口令 |
| `ADMIN_SESSION_SECRET` | 后台会话签名密钥，请用足够长的随机串 |
| `ENABLE_DEV_OUTBOX` | 仅本地开发设为 `true`，可用 `/api/dev/outbox` 读验证码。**线上必须留空** |
| `EMAIL_PROVIDER` / `EMAIL_FROM` / `RESEND_API_KEY` | 真发信时才需要，见 AUTH_SETUP.md |
| `PASSWORD_ITERATIONS` | PBKDF2 迭代次数，默认 100000 |

本地开发参考 `.dev.vars.example`；`.dev.vars` 已被 `.gitignore` 忽略，不会提交。

## License

MIT
