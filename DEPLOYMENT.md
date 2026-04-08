# 部署说明

## 1. 准备 Cloudflare 资源

需要准备：

- 1 个 Worker 项目
- 1 个 Durable Object 绑定
- 1 个 KV Namespace
- 1 个可绑定到 Worker 的域名

`wrangler.toml` 里已经预留了：

- `ROOMS`：Durable Object
- `ROOM_DIRECTORY`：KV
- `ASSETS`：前端静态资源绑定

你需要把 `wrangler.toml` 里的以下占位符换成真实值：

- `YOUR_KV_NAMESPACE_ID`
- `YOUR_KV_PREVIEW_NAMESPACE_ID`

## 2. 安装依赖

```bash
npm install
```

## 3. 构建前端

```bash
npm run build
```

## 4. 配置 Worker Secrets

```bash
wrangler secret put HOST_ADMIN_PASSWORD
wrangler secret put ADMIN_SESSION_SECRET
```

建议：

- `HOST_ADMIN_PASSWORD` 用于主持人后台登录
- `ADMIN_SESSION_SECRET` 用于签发后台会话令牌，务必使用高强度随机字符串

## 5. 部署

```bash
npx wrangler deploy
```

## 6. 首次上线后检查

至少验证下面这些环节：

1. 主持人后台能正常登录
2. 能成功创建房间
3. 房间能生成四类链接
4. 观众进入后能看到同步计时状态
5. 正反方链接只能结束自己一方当前回合
6. 主持人操作能实时同步到其他设备
7. 弹幕能实时同步
8. 手机端布局正常

## 7. 推荐上线流程

建议先走一个 staging 域名或子域名：

- `debate-clock-staging.xxx.com`
- `debate-clock.xxx.com`

先让八角笼群内测试员压一轮，再切正式域名。

## 8. 生产建议

- 给主持人后台密码做专人保管
- 每场比赛创建新房间，不复用旧房间链接
- 赛后如需归档，可在后续版本加入房间关闭/回放功能
- 后续如果要扩成正式账号系统，再考虑接入 Cloudflare Access、OAuth 或独立鉴权服务
