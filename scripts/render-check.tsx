/**
 * 静态渲染检查（不需要浏览器）。
 *
 * 为什么需要它：这次 UI 重构涉及大量组件改写，而 tsc 只能查类型、vite build 只查打包，
 * 都抓不到"组件在渲染时抛异常"这类问题（图标传错、props 少传、访问空值……）。
 * 这里用 react-dom/server 把关键界面渲染成字符串，并断言关键标记确实出现。
 *
 * 打包命令见 package.json 的 check:render。
 */
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { AboutPage } from "../src/pages/AboutPage";
import { DashboardPage } from "../src/DashboardPage";
import { GuidePage } from "../src/pages/GuidePage";
import { MarketingPage } from "../src/MarketingPage";
import { RoomPage } from "../src/RoomPage";
import { AppHeader } from "../src/ui/AppHeader";
import { AccountPanel } from "../src/ui/AccountPanel";
import { AuthPanel } from "../src/ui/AuthPanel";
import { BarragePanel } from "../src/ui/BarragePanel";
import { ShortcutHints } from "../src/ui/ShortcutHints";
import { TimerLab } from "../src/ui/TimerLab";
import { VoicePanel } from "../src/ui/VoicePanel";
import { AccountSession } from "../src/hooks/useAccountSession";
import { AccountProfile } from "../src/shared/types";
import { parseRoute } from "../src/lib/router";

interface Case {
  name: string;
  render: () => string;
  /** 渲染结果里必须出现这些片段 */
  expect: string[];
}

const noop = () => undefined;

/** AuthPanel 只读取这几个字段，构造一个最小替身即可（不在服务端跑副作用） */
const fakeAccount: AccountProfile = {
  accountId: "acct-test",
  email: "tester@example.com",
  displayName: "测试选手",
  avatarUrl: "",
  emailVerified: true,
  createdAt: 0,
  updatedAt: 0,
};

const fakeSession = {
  account: null,
  token: "",
  loading: false,
  saving: false,
  error: null,
  hasAccount: false,
  needsEmailVerification: false,
  register: async () => ({}) as never,
  login: async () => ({}) as never,
  logout: async () => undefined,
  updateProfile: async () => undefined,
  uploadAvatar: async () => "",
  changePassword: async () => undefined,
  verifyEmail: async () => undefined,
  resendVerification: async () => ({ ok: true }),
  requestReset: async () => ({ ok: true }),
  resetPassword: async () => undefined,
  clearError: noop,
} as unknown as AccountSession;

const cases: Case[] = [
  {
    name: "landing",
    render: () =>
      renderToString(createElement(MarketingPage, { onNavigate: noop, onJoinRoom: noop })),
    expect: [
      // 品牌识别（hero 里的大标题就是 h1）
      "八角笼",
      // 左栏赛事信息
      "Online Debate Timer",
      "让每一场辩论",
      "拥有一个共同的时间。",
      "主持人 · 正方 · 反方 · 观众",
      // 转播信息层：LIVE / 环节 / ROUND / 总时长
      "Live",
      "自由辩论",
      "Round 03 / 06",
      "总时长",
      // 两个计时器的读数（主体与百分秒分开放，便于给百分秒上阵营色）
      "正方",
      "08:42",
      ".31",
      "反方",
      "06:17",
      ".82",
      "12:34",
      // 操作入口
      "创建比赛",
      "进入房间",
      // 下方一条横向带：四种身份 + 一个时钟
      "四种身份",
      "各司其职",
      "不同的入口，相同的时间",
      "双轨倒计时",
      "自动加时",
      "弹幕交流",
      "语音通话",
      "一个时钟",
      "实时同步",
    ],
  },
  {
    name: "guide",
    render: () => renderToString(createElement(GuidePage, { onNavigate: noop })),
    expect: ["使用指南", "分发四条链接", "双轨倒计时", "归零即停", "四种身份"],
  },
  {
    name: "about",
    render: () => renderToString(createElement(AboutPage, { onNavigate: noop })),
    expect: ["关于八角笼", "设计原则", "技术构成", "MIT"],
  },
  {
    name: "header",
    render: () =>
      renderToString(
        createElement(AppHeader, {
          route: parseRoute("/"),
          account: null,
          onNavigate: noop,
          onOpenAuth: noop,
          onOpenAccount: noop,
        }),
      ),
    expect: ["八角笼", "Debate Arena", "首页", "使用指南", "关于", "登录"],
  },
  {
    name: "header-signed-in",
    render: () =>
      renderToString(
        createElement(AppHeader, {
          route: parseRoute("/dashboard"),
          account: {
            accountId: "acct-test",
            email: "tester@example.com",
            displayName: "测试选手",
            avatarUrl: "",
            emailVerified: false,
            createdAt: 0,
            updatedAt: 0,
          },
          onNavigate: noop,
          onOpenAuth: noop,
          onOpenAccount: noop,
        }),
      ),
    expect: ["测试选手"],
  },
  {
    name: "auth-login",
    render: () => renderToString(createElement(AuthPanel, { session: fakeSession })),
    expect: ["登录", "邮箱", "密码", "忘记密码", "显示密码"],
  },
  {
    name: "auth-register",
    render: () =>
      renderToString(createElement(AuthPanel, { session: fakeSession, initialMode: "register" })),
    expect: ["创建账号", "出场名称", "注册并进入"],
  },
  {
    name: "dashboard-login",
    // 服务端没有 localStorage，token 读不到 → 应渲染后台口令登录页
    render: () => renderToString(createElement(DashboardPage, { onOpenRoom: noop })),
    expect: ["主持人控制台", "后台口令", "登录后台"],
  },
  {
    name: "timer-lab",
    render: () =>
      renderToString(
        createElement(TimerLab, {
          variant: "room",
          phaseLabel: "自由辩论",
          roundLabel: "Round 03 / 06",
          elapsedLabel: "01:24:32",
          totalLabel: "12:34",
          sides: [
            { tone: "aff", label: "正方", remainingMs: 522_310, totalMs: 600_000, active: true },
            { tone: "neg", label: "反方", remainingMs: 377_820, totalMs: 600_000, active: false },
          ],
        }),
      ),
    expect: ["08:42.31", "06:17.82", "计时中", "等待", "12:34", "Total time"],
  },
  {
    name: "barrage-panel",
    render: () =>
      renderToString(
        createElement(BarragePanel, {
          account: fakeAccount,
          role: "viewer",
          items: [
            { id: "m1", nickname: "观众甲", content: "这一轮很精彩", role: "viewer", createdAt: 0 },
          ],
          onSend: async () => undefined,
        }),
      ),
    expect: ["Live chat", "观众甲", "这一轮很精彩", "发送", "测试选手"],
  },
  {
    name: "voice-panel",
    render: () =>
      renderToString(
        createElement(VoicePanel, {
          account: fakeAccount,
          role: "host",
          currentChannel: "public",
          participants: [
            {
              clientId: "c1",
              role: "host",
              channel: "public",
              nickname: "主持人",
              joinedAt: 0,
              muted: false,
            },
          ],
          publicRequests: [],
          remoteStreams: [],
          joining: false,
          isJoined: true,
          isMuted: false,
          canSpeakNow: true,
          hasPendingPublicRequest: false,
          error: null,
          onJoinVoice: noop,
          onLeaveVoice: noop,
          onToggleMute: noop,
          onRequestPublicVoice: noop,
        }),
      ),
    expect: ["Voice", "公共语音", "已加入", "主持人", "开麦中"],
  },
  {
    name: "shortcut-hints",
    render: () =>
      renderToString(
        createElement(ShortcutHints, {
          shortcuts: [
            { keys: ["space"], label: "Space", description: "暂停", run: noop },
            { keys: ["s"], label: "S", description: "切换发言方", run: noop },
            { keys: ["e"], label: "E", description: "结束当前回合", run: noop, disabled: true },
          ],
        }),
      ),
    expect: ["快捷键", "Space", "暂停", "切换发言方", "shortcut-hint--off"],
  },
  {
    name: "account-panel",
    render: () =>
      renderToString(
        createElement(AccountPanel, {
          account: fakeAccount,
          saving: false,
          error: null,
          onUpdateProfile: async () => undefined,
          onUploadAvatar: async () => "",
          onChangePassword: async () => undefined,
          onLogout: async () => undefined,
          onClose: noop,
        }),
      ),
    expect: [
      "编辑出场档案",
      "出场名称",
      "上传头像",
      "不使用头像",
      "保存档案",
      "修改密码",
      "退出登录",
      "邮箱已验证",
      "测试选手",
    ],
  },
  {
    name: "room-invalid-link",
    // 房间页从 URL query 读角色；服务端没有 window，这里给一个最小替身，
    // 验证"链接无效"分支能渲染（完整房间界面需要真实 payload，无法静态渲染）
    render: () => {
      (globalThis as Record<string, unknown>).window = { location: { search: "" } };
      return renderToString(createElement(RoomPage, { roomId: "room-demo", account: null }));
    },
    expect: ["链接无效", "请让主持人重新复制链接"],
  },
];

let failed = 0;

for (const testCase of cases) {
  let html = "";

  try {
    html = testCase.render();
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${testCase.name} 渲染抛异常: ${(error as Error).message}`);
    continue;
  }

  const missing = testCase.expect.filter((marker) => !html.includes(marker));

  if (missing.length > 0) {
    failed += 1;
    console.log(`FAIL  ${testCase.name} 缺少标记: ${missing.join(", ")}`);
    continue;
  }

  console.log(`OK    ${testCase.name}  (${html.length} 字符)`);
}

console.log(failed === 0 ? "\n渲染检查全部通过" : `\n渲染检查失败 ${failed} 项`);
process.exit(failed === 0 ? 0 : 1);
