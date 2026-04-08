# 八角笼辩论棋钟 Online

把原先“主持人在本地电脑上运行的单机棋钟”，重构成了一个可部署上线、可多人同步观看和操作的网页应用。

这版的目标不是一步到位做完整用户系统，而是先把真实可用的在线房间模型跑通：

- 主持人后台登录后创建房间
- 每个房间自动生成四类链接
- 主持人链接
- 正方辩手链接
- 反方辩手链接
- 观众链接
- 同一房间内所有端实时同步
- 观众无需登录即可观看并发送弹幕
- 辩手只能结束自己一方的当前回合
- 主持人拥有完整控制权

## 当前架构

- 前端：React + TypeScript + Vite
- 在线状态层：Cloudflare Worker
- 房间实时状态：Cloudflare Durable Object
- 房间目录：Cloudflare KV
- 实时同步方式：SSE（Server-Sent Events）+ HTTP 指令写入

这个组合的好处是第一版实现成本低、部署简单、很适合中国大陆可访问的公共网页应用场景。

## 已实现的能力

- 多房间
- 主持人后台登录与开房
- 房间级四类权限链接
- 主持人完整控制
- 暂停 / 开始 / 切边 / 结束回合 / 重置
- 修改辩题、规则说明、双方名称
- 修改初始时间、总时长、自动加时规则
- 观众弹幕
- 手机端和桌面端响应式界面
- 房间回合历史
- Cloudflare 部署骨架

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
- 可修改辩题
- 可修改规则说明
- 可修改双方名称
- 可暂停和继续
- 可切边
- 可结束回合
- 可重置
- 可手动增减时间
- 可调整计时规则

## 项目结构

```text
.
├─ src/                  # React 前端
│  ├─ shared/            # 前后端共享的类型与计时引擎
│  ├─ ui/                # 可复用界面组件
│  ├─ hooks/             # 前端状态与实时同步 Hook
│  ├─ App.tsx            # 前端入口路由
│  ├─ DashboardPage.tsx  # 主持人后台
│  ├─ MarketingPage.tsx  # 首页
│  └─ RoomPage.tsx       # 房间页
├─ worker-index.ts       # Cloudflare Worker 入口
├─ worker-room-object.ts # Durable Object 房间逻辑
├─ worker-types.ts       # Worker 环境类型
├─ cloudflare.d.ts       # 本地 Worker 类型声明
├─ wrangler.toml         # Cloudflare 部署配置
├─ tsconfig.worker.json  # Worker 类型检查配置
├─ DEPLOYMENT.md         # 部署说明
└─ LICENSE
```

## 本地开发

### 前端

如果本机已安装 Node.js：

```bash
npm install
npm run dev
```

### 类型检查

```bash
npm run check
```

### Cloudflare 部署

```bash
npm run build
npx wrangler deploy
```

更完整的部署步骤见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 环境变量

Worker 需要至少两个敏感配置：

- `HOST_ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

本地开发可参考 `.dev.vars.example`。

## 开源发布建议

这份代码已经整理成可开源仓库的基础形态，但当前工作区还没有真正连到 GitHub 远程仓库。推荐下一步这样做：

1. 在 GitHub 新建仓库
2. 本地执行 `git init`
3. 提交代码并添加远程仓库
4. 在 Cloudflare 中创建 KV、绑定 Durable Object、设置 Worker secrets
5. 首次部署并拉测试员压测

## 已知说明

- 当前我无法在这个工作区里直接帮你创建 GitHub 远程仓库，也无法直接完成 Cloudflare 线上发布，因为这里没有现成的登录凭据和命令环境。
- 我已经把第一版需要的代码、配置文件和部署骨架补齐，后续主要剩“装环境、填 Cloudflare 资源 ID、真正上线验证”。

## License

MIT
