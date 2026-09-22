# 部署说明

## 1. 准备 Cloudflare 资源

需要准备：

- 1 个 Worker 项目
- 1 个 Durable Object 绑定
- 2 个 KV / D1 存储（房间用 KV，账号用 D1）
- 1 个可绑定到 Worker 的域名

`wrangler.toml` 里已经预留了：

- `ROOMS`：Durable Object（房间实时状态）
- `ROOM_DIRECTORY`：KV（房间目录）
- `DB`：D1（账号、会话、验证码、限流、发信记录）
- `ASSETS`：前端静态资源绑定

### 1.1 创建 KV

```bash
npx wrangler kv namespace create ROOM_DIRECTORY
```

把输出里的 id 填进 `wrangler.toml` 的 `[[kv_namespaces]]`。

### 1.2 创建 D1（账号数据库）

```bash
npx wrangler d1 create debate-cage-clock-accounts
```

把输出里的 `database_id` 填进 `wrangler.toml` 的 `[[d1_databases]]`，
替换掉现在的占位值 `local-dev-placeholder`。

### 1.3 创建 R2（头像图片）

```bash
npx wrangler r2 bucket create debate-cage-clock-avatars
```

`wrangler.toml` 里的 `[[r2_buckets]]` 已经写好，bucket 名字对得上就行，不需要填 id。
头像图片只存在这里，账号里只保留一个短 URL。

> R2 有免费额度（约 10GB 存储、出网不收费），头像这种小图基本用不到付费。

## 2. 安装依赖

```bash
npm install
```

## 3. 建表（账号数据库）

```bash
npx wrangler d1 migrations apply DB --remote
```

## 4. 构建前端

```bash
npm run build
```

## 5. 配置 Worker Secrets

```bash
wrangler secret put HOST_ADMIN_PASSWORD
wrangler secret put ADMIN_SESSION_SECRET
```

建议：

- `HOST_ADMIN_PASSWORD` 用于主持人后台登录
- `ADMIN_SESSION_SECRET` 用于签发后台会话令牌，**务必使用足够长的高强度随机串**

### 5.1 配置邮件发信（账号系统需要）

注册验证和找回密码都要发邮件。**这一步需要一个属于你的域名**（要在域名商那边配置
SPF / DKIM），因为发信服务必须验证发信域名之后才能给任意收件人投递。

以 Resend 为例：

```bash
wrangler secret put RESEND_API_KEY
```

并在 `wrangler.toml` 里加入非敏感变量：

```toml
[vars]
EMAIL_PROVIDER = "resend"
EMAIL_FROM = "八角笼辩论棋钟 <no-reply@你的域名>"
```

用 Brevo 的话换成 `EMAIL_PROVIDER = "brevo"` + `BREVO_API_KEY`。

详见 [AUTH_SETUP.md](./AUTH_SETUP.md)。

> ⚠️ **千万不要把 `ENABLE_DEV_OUTBOX` 带到线上**。那个开关会让
> `/api/dev/outbox` 公开返回验证码原文，只适合本地开发。

## 6. 部署

```bash
npx wrangler deploy
```

## 7. 首次上线后检查

**房间相关**

1. 主持人后台能正常登录
2. 能成功创建房间
3. 房间能生成四类链接
4. 观众进入后能看到同步计时状态
5. 正反方链接只能结束自己一方当前回合
6. 主持人操作能实时同步到其他设备
7. 弹幕能实时同步
8. 语音通话能接通
9. 手机端布局正常

**账号相关**

10. 能注册（收到验证邮件）
11. 能完成邮箱验证
12. 退出后能用邮箱密码重新登录
13. 改密码后，其他设备上的登录被登出
14. 找回密码能收到重置验证码并成功重置
15. 能上传头像，且 `accounts` 表里 `avatar_url` 是一个 `/api/avatars/...` 短地址，
    **不是** `data:` 开头的长字符串
16. 确认访问 `/api/dev/outbox` 返回 **404**（说明开发开关没有带到线上）

本地可以用 `scripts/smoke-test-auth.ps1` 先把这套流程跑一遍。

## 8. 推荐上线流程

建议先走一个 staging 域名或子域名：

- `debate-clock-staging.xxx.com`
- `debate-clock.xxx.com`

先让八角笼群内测试员压一轮，再切正式域名。

注意：**本地 D1 和线上 D1 是两套数据**，互不相通。本地注册的账号线上看不到，
这是正常的。

## 9. 生产建议

- 给主持人后台密码做专人保管
- 每场比赛创建新房间，不复用旧房间链接
- 赛后如需归档，可在后续版本加入房间关闭/回放功能
- 账号密码哈希强度受 Cloudflare 免费版 CPU 限制影响，见 AUTH_SETUP.md 的「已知取舍」
- 头像图片存在 R2，账号里只有 URL；换头像时旧对象会自动删除
