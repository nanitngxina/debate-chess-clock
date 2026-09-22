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
import { GuidePage } from "../src/pages/GuidePage";
import { MarketingPage } from "../src/MarketingPage";
import { AppHeader } from "../src/ui/AppHeader";
import { AuthPanel } from "../src/ui/AuthPanel";
import { TimerLab } from "../src/ui/TimerLab";
import { AccountSession } from "../src/hooks/useAccountSession";
import { parseRoute } from "../src/lib/router";

interface Case {
  name: string;
  render: () => string;
  /** 渲染结果里必须出现这些片段 */
  expect: string[];
}

const noop = () => undefined;

/** AuthPanel 只读取这几个字段，构造一个最小替身即可（不在服务端跑副作用） */
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
      "八角笼",
      "让每一场辩论",
      "拥有一个共同的时间",
      "主持人 · 正方 · 反方 · 观众",
      "实时同步",
      "创建比赛",
      "进入房间",
      "四种身份",
      "不同的入口，相同的时间",
      "双轨倒计时",
      "自动加时",
      "弹幕交流",
      "语音通话",
      "一个时钟",
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
