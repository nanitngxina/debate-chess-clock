# 账号系统说明（AUTH_SETUP.md）

本文档说明账号系统的接口、数据表、安全设计，以及**怎么在买到域名后切换成真发信**。

---

## 1. 接口一览

所有接口都是 JSON，路径前缀 `/api/auth`。

| 方法 | 路径 | 需要登录 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | 否 | 注册：`email` + `password` + `displayName`，成功后直接返回会话 |
| POST | `/api/auth/login` | 否 | 登录：`email` + `password` |
| POST | `/api/auth/logout` | 是 | 登出，**服务端真正吊销该 token** |
| GET | `/api/auth/me` | 是 | 读取当前账号 |
| PATCH | `/api/auth/profile` | 是 | 改出场名称 / 头像 |
| POST | `/api/auth/avatar` | 是 | 上传头像图片（multipart，字段名 `file`），返回短 URL |
| POST | `/api/auth/password` | 是 | 改密码：`currentPassword` + `newPassword`，会踢掉其他设备 |
| POST | `/api/auth/email/verify` | 是 | 提交邮箱验证码：`code` |
| POST | `/api/auth/email/resend` | 是 | 重发邮箱验证码 |
| POST | `/api/auth/password/forgot` | 否 | 申请重置：`email`，**永远返回同样的提示**（防邮箱枚举） |
| POST | `/api/auth/password/reset` | 否 | 提交重置：`email` + `code` + `newPassword`，会踢掉所有会话 |
| GET | `/api/avatars/<accountId>/<file>` | 否 | 读取头像图片（公开，图片存在 R2） |
| GET | `/api/dev/outbox` | 否 | **仅本地开发**，读最近 20 封系统发出的邮件 |

登录态通过请求头传递：

```
Authorization: Bearer <token>
```

> ⚠️ 旧的 `/api/accounts/register|me` 已经被上面这套取代。本地 KV 里如果还残留
> `account:` 前缀的旧测试数据，可以直接忽略（那只是旧版本的游客档案）。

### 头像怎么存的

图片**本体存在 R2**，账号记录里只留一个几十字符的短地址，形如
`/api/avatars/acct-xxxx/mucjrhq9-ku52xg.png`。

流程是：

1. 前端把用户选的图片裁成 256×256 JPEG
2. `POST /api/auth/avatar` 上传 → 服务端**按文件头（magic bytes）**校验真实格式，
   只接受 JPEG / PNG / WebP / GIF，单张上限 1MB → 存进 R2 → 返回短 URL
3. 用户点「保存档案」时，这个 URL 才随 `PATCH /api/auth/profile` 写进账号
4. 换头像或清空头像时，服务端会顺手把 R2 里的旧对象删掉

这样有两个好处：账号记录里不再有几千字符的内联图片；图片走独立的
`/api/avatars/...` 地址，带 `immutable` 长缓存，浏览器只下载一次。

> 说明：这一段之前是坏的。旧实现把头像一个 data URL 存进账号，而服务端有个
> 5000 字符的截断上限 —— 但一张 256×256 的 JPEG 转成 data URL 通常就有 7000+
> 字符，于是存进去的字符串被从中间切断，头像显示成坏图。现在图片进了 R2，这个问题
> 从根上没有了。

---

## 2. 数据表（D1）

建表脚本在 `migrations/0001_accounts.sql`。

| 表 | 作用 |
| --- | --- |
| `accounts` | 账号：邮箱（唯一索引）、显示名、头像、PBKDF2 密码派生值 + salt + 迭代次数、邮箱是否验证 |
| `sessions` | 会话：**只存 token 的 SHA-256**、过期时间、是否已吊销 |
| `auth_codes` | 一次性验证码：邮箱验证 / 重置密码共用，含过期时间与错误次数 |
| `rate_limits` | 固定窗口限流计数 |
| `email_outbox` | 发信记录（含开发模式下"发"出去的邮件原文） |

本地应用迁移：

```bash
npx wrangler d1 migrations apply DB --local
```

线上应用迁移（部署前）：

```bash
npx wrangler d1 migrations apply DB --remote
```

---

## 3. 安全设计要点

- **密码**：PBKDF2-SHA256，每用户独立 16 字节随机 salt，只存派生值，永不存明文。
- **会话**：不用自签名 JWT，而是「32 字节随机 token + D1 里存 SHA-256」。因此
  可以真正吊销 —— 登出、改密码、重置密码都能立刻让旧 token 失效。
- **恒定时间比较**：密码派生值和验证码哈希都用恒定时间比较，避免时序侧信道。
- **防邮箱枚举**：登录失败和不存在的邮箱返回**完全相同**的 `401 邮箱或密码错误`；
  找回密码对不存在的邮箱也返回同样的成功提示。而且账号不存在时也会做一次等价开销的
  PBKDF2 派生，避免用响应时间判断邮箱是否注册过。
- **限流**：注册按来源 IP、登录按 IP+邮箱、找回按 IP 和按邮箱、重发验证码按账号。
- **验证码**：6 位数字、15 分钟有效、一次性使用、错 5 次即作废。
- **错误信息**：线上不把内部异常信息返回给客户端（只有本地开了开发收件箱才暴露）。

### 已知取舍

- **PBKDF2 迭代次数 vs Cloudflare CPU 限制**：默认 `PASSWORD_ITERATIONS=100000`。
  Cloudflare **免费版** Worker 每请求 CPU 时间上限约 10ms，PBKDF2 迭代太高会报
  `1102` 错误。本地开发不受影响。线上如果遇到，把该变量调小，或升级到 Workers Paid
  （$5/月，CPU 上限 30s）。
- **限流的来源 IP**：优先读 `CF-Connecting-IP`（Cloudflare 会强制注入，无法伪造），
  本地开发时回退到 `X-Forwarded-For`。如果你的部署前面还有别的反向代理，
  要注意这个回退值理论上可被伪造。
- **上传了头像但没点保存**：图片已经进了 R2，但账号没引用它，会留下一个孤儿对象。
  上传接口按账号限流（每小时 20 次），所以最多也就这么多。

---

## 4. 现在没有域名，怎么用？

发信通道做成了**可插拔**的。一个发信服务都没配时，系统自动进入**开发模式**：

- 验证码会打印在 `wrangler dev` 的窗口里
- 同时写进 `email_outbox` 表
- 前端会自动把验证码显示在界面上（注册后和找回密码时都能看到）
- 也可以用 `GET /api/dev/outbox` 读

所以**不需要域名、不需要花钱，本地就能把注册 → 邮箱验证 → 找回密码整条链路跑通**。

前提是 `.dev.vars` 里有这一行：

```
ENABLE_DEV_OUTBOX=true
```

> ⚠️ **线上部署前务必删掉这一行**。留着等于把验证码公开在接口上。

---

## 5. 将来怎么切换成真发信

发信这一步**需要你自己的域名**（要配 SPF / DKIM），因为 Resend、Brevo 这类服务
必须验证发信域名之后才能给任意收件人投递。域名费用大概是：
`.top` / `.xyz` 首年十几到几十元，`.com` 约 70–90 元/年。

以 **Resend** 为例（免费额度约 3000 封/月、100 封/天）：

1. **买域名**，比如 `bajiaolong.com`。
2. **在 Resend 注册**，添加这个域名，按它给的提示去域名商那边加 DNS 记录
   （一般是 SPF 和 DKIM 两条 TXT，有时带一条 MX），等验证通过。
3. **创建 API Key**，形如 `re_xxxxxxxx`。
4. **填环境变量**：
   - 本地：编辑 `.dev.vars`，加上
     ```
     EMAIL_PROVIDER=resend
     EMAIL_FROM=八角笼辩论棋钟 <no-reply@bajiaolong.com>
     RESEND_API_KEY=re_xxxxxxxx
     ```
   - 线上：`npx wrangler secret put RESEND_API_KEY`，
     并在 `wrangler.toml` 的 `[vars]` 里补 `EMAIL_PROVIDER` 和 `EMAIL_FROM`。
5. **重启 Worker**。从此自动走真实发信，**代码一行都不用改**。
6. 最后把 `ENABLE_DEV_OUTBOX` 去掉。

用 **Brevo** 也一样，只是把变量换成 `EMAIL_PROVIDER=brevo` + `BREVO_API_KEY=...`。

---

## 6. 部署前检查清单

- [ ] `npx wrangler d1 create debate-cage-clock-accounts` 并把真实 `database_id` 填进 `wrangler.toml`
- [ ] `npx wrangler d1 migrations apply DB --remote` 建表
- [ ] `npx wrangler secret put ADMIN_SESSION_SECRET`（换成足够长的随机串）
- [ ] `npx wrangler secret put HOST_ADMIN_PASSWORD`（**和本地 `.dev.vars` 用同一个值**，否则会出现"本地能登、线上登不上"）
- [ ] 配好发信服务并 `wrangler secret put RESEND_API_KEY`
- [ ] **确认 `ENABLE_DEV_OUTBOX` 没有带到线上**
- [ ] 用 `scripts/smoke-test-auth.ps1` 的思路在线上手动验证一遍注册/找回
