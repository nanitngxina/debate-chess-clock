# 部署说明

本项目**从未部署过**，下面是从零到上线的完整流程。

---

## 0. 先决条件：Cloudflare 账号

### 需要你做的只有两步

1. **注册 / 登录 Cloudflare**：https://dash.cloudflare.com/sign-up
   只需要邮箱 + 密码 + 邮箱验证。**不需要域名**就能用 Workers。
2. **在本项目目录运行一次登录**：

   ```bash
   npx wrangler login
   ```

   它会在浏览器里打开一个 Cloudflare 授权页，点同意即可。授权信息保存在本机
   （`%APPDATA%\xdg.config\.wrangler\config\default.toml`），
   以后部署不用再登。

> 这两步只能由你完成 —— 需要邮箱验证和浏览器授权，自动化工具做不了。
> 完成后告诉我，剩下的（建资源、填 ID、建表、设密钥、部署）我来做。

### 关于费用

| 资源 | 免费版情况 |
| --- | --- |
| Cloudflare 账号 | 免费 |
| Workers | 免费版每天 10 万次请求。**CPU 时间上限约 10ms/请求**（见下方风险 1） |
| KV | 免费版可用 |
| D1 | 免费版可用（每天 500 万行读 / 10 万行写） |
| Durable Objects | **必须用 SQLite 版才免费**，本项目已改成 `new_sqlite_classes` |
| R2 | 免费额度约 10GB 存储、出网不收费 |

> ⚠️ **R2 有一点我无法替你核实**：开通 R2 时 Cloudflare 有可能要求先绑定支付方式
> （即使不超额不扣费）。如果它要绑卡而你不想绑，**可以不走 R2** ——
> 把 `wrangler.toml` 里的 `[[r2_buckets]]` 整段删掉即可，
> 头像上传会返回 503，房间 / 计时 / 语音 / 弹幕全部不受影响。

---

## 0.1 免费版的两个已知风险

### 风险 1：密码哈希可能超 CPU 限制

密码用 PBKDF2-SHA256，默认 **10 万次迭代**（`PASSWORD_ITERATIONS`）。
但 Workers **免费版每个请求只有约 10ms CPU 时间**，PBKDF2 有可能超限，
表现为注册/登录返回 **1102** 错误。

- 本地开发不受影响（本地没有这个 CPU 限制），所以**没法在本地提前验证**
- 部署后**第一件事就是试注册**。如果报 1102，把 `PASSWORD_ITERATIONS` 调小
  （先试 `25000`），或者升级到 Workers Paid（$5/月，CPU 上限 30 秒）
- 调小迭代次数会降低密码哈希强度，这是"免费版"的代价，需要你来权衡

### 风险 2：`*.workers.dev` 在中国大陆不稳定

首次部署会得到一个 `https://debate-cage-clock.<你的子域>.workers.dev` 地址。
这个域名在中国大陆**经常无法访问或时断时续**。

如果八角笼群里的测试员打不开，就需要**绑定自己的域名**
（在 Cloudflare 买或从别处转入，几十元一年），然后在 Workers 里加自定义域。

---

## 0.2 关于邮件发信

注册、邮箱验证、找回密码都需要发信。而发信服务（Resend / Brevo）**要求先验证一个自己的域名**，
所以现在没有域名的情况下：

- **注册可以用**
- **收不到验证码** → 邮箱会一直显示"未验证"
- **找回密码不可用**

好消息是邮箱验证我当初就做成了**只提醒、不拦截**，所以不影响正常使用。
等有了域名，按 [AUTH_SETUP.md](./AUTH_SETUP.md) 第 5 节填三行环境变量即可开通，代码不用改。

---

## 1. 部署步骤（`wrangler login` 之后我来执行）

```bash
# 1) 建三个存储资源，并记下返回的 id
npx wrangler kv namespace create ROOM_DIRECTORY
npx wrangler d1 create debate-cage-clock-accounts
npx wrangler r2 bucket create debate-cage-clock-avatars

# 2) 把 KV 的 id 和 D1 的 database_id 填进 wrangler.toml

# 3) 在线上建账号相关的表
npx wrangler d1 migrations apply DB --remote

# 4) 配置密钥（口令你定，密钥用强随机串）
#    HOST_ADMIN_PASSWORD 请和本地 .dev.vars 里填同一个值：
#    线上 secret 和 .dev.vars 是两套独立存储，不会互相同步，
#    不一致时会表现为"本地能登、线上登不上"，而报错文案完全一样。
npx wrangler secret put HOST_ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET

# 5) 构建前端并部署
npm run build
npx wrangler deploy
```

> ⚠️ **千万不要把 `ENABLE_DEV_OUTBOX` 配到线上**。它只存在于本地 `.dev.vars`，
> 不会被部署；一旦配到线上，`/api/dev/outbox` 会公开返回验证码原文。

---

## 2. 部署后检查清单

**房间相关**

1. 主持人控制台能用后台口令登录
2. 能成功创建房间、生成四类链接
3. 观众进入后能看到同步计时
4. 正反方链接只能结束自己一方回合
5. 主持人操作能实时同步到其他设备
6. 弹幕实时同步
7. 语音能接通（需要 HTTPS，线上满足）
8. 手机端布局正常

**账号相关**

9. **能注册**（若报 1102，见风险 1）
10. 退出后能用邮箱密码重新登录
11. 改密码后其他设备被登出
12. 能上传头像，且 `accounts` 表里 `avatar_url` 是 `/api/avatars/...` 短地址而不是 `data:`
13. 访问 `/api/dev/outbox` 返回 **404**

本地跑 `npm run check:all`，可以先把类型和界面渲染过一遍。

---

## 3. 生产建议

- 主持人后台口令专人保管
- 每场比赛创建新房间，不复用旧房间链接
- 给主持人后台密码和 `ADMIN_SESSION_SECRET` 用足够强的随机值
- 先走 staging 子域让群内测试员压一轮，再切正式域名
