import { FormEvent, useState } from "react";
import { ArenaBackdrop } from "./ui/ArenaBackdrop";
import { HeroClock } from "./ui/HeroClock";
import {
  IconAudience,
  IconBonus,
  IconChat,
  IconControl,
  IconMic,
  IconSides,
  IconTimer,
} from "./ui/icons";

interface MarketingPageProps {
  onNavigate: (path: string) => void;
  /** 粘贴房间链接后跳转（整页跳转，因为房间链接带 query 权限参数） */
  onJoinRoom: (href: string) => void;
}

const ROLES = [
  {
    id: "host",
    Icon: IconControl,
    label: "主持人",
    title: "掌控比赛节奏",
    items: ["后台控制比赛", "管理房间", "调整规则", "操作计时"],
  },
  {
    id: "sides",
    Icon: IconSides,
    label: "正方 / 反方",
    title: "只管自己这一方",
    items: ["专属链接进入", "查看自己的时间", "结束自己的回合", "自己计时时开启麦克风"],
  },
  {
    id: "viewer",
    Icon: IconAudience,
    label: "观众",
    title: "看比赛，也能参与",
    items: ["观看比赛", "发送弹幕", "申请上麦", "参与互动"],
  },
] as const;

const PILLARS = [
  {
    id: "timer",
    Icon: IconTimer,
    title: "双轨倒计时",
    desc: "正反方各自计时，同时还有一个总时长在走。",
  },
  {
    id: "bonus",
    Icon: IconBonus,
    title: "自动加时",
    desc: "每回合结束按规则给结束方加时，回合区间可配置。",
  },
  {
    id: "chat",
    Icon: IconChat,
    title: "弹幕交流",
    desc: "观众实时参与，不打断比赛节奏。",
  },
  {
    id: "voice",
    Icon: IconMic,
    title: "语音通话",
    desc: "辩手在自己计时时开麦，观众可申请上麦。",
  },
] as const;

/** 只接受真正的房间链接，避免把随便一个网址跳过去 */
function normalizeRoomHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, window.location.origin);
    if (!/^\/room\/[^/]+/.test(url.pathname)) {
      return null;
    }

    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

export function MarketingPage({ onNavigate, onJoinRoom }: MarketingPageProps) {
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinValue, setJoinValue] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  function handleJoin(event: FormEvent) {
    event.preventDefault();
    const href = normalizeRoomHref(joinValue);

    if (!href) {
      setJoinError("请粘贴完整的房间链接（形如 …/room/A482?role=viewer&token=…）");
      return;
    }

    setJoinError(null);
    onJoinRoom(href);
  }

  return (
    <div className="landing">
      {/* ---------------------------------------------------------------- */}
      <section className="hero">
        <div className="hero__backdrop" aria-hidden="true">
          <ArenaBackdrop />
        </div>

        <div className="container hero__inner">
          <div className="hero__content">
            <span className="u-label">Online Debate Timer</span>
            <h1 className="hero__title">八角笼</h1>
            <p className="hero__lead">
              让每一场辩论
              <br />
              拥有一个共同的时间。
            </p>
            <p className="hero__roles">主持人 · 正方 · 反方 · 观众</p>

            <ul className="hero__facts">
              <li>实时同步</li>
              <li>多端可用</li>
              <li>语音互动</li>
              <li>弹幕交流</li>
            </ul>

            <div className="hero__actions">
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={() => onNavigate("/dashboard")}
              >
                创建比赛
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--lg"
                aria-expanded={joinOpen}
                onClick={() => {
                  setJoinOpen((value) => !value);
                  setJoinError(null);
                }}
              >
                进入房间
              </button>
            </div>

            {joinOpen && (
              <form className="hero__join" onSubmit={handleJoin}>
                <input
                  className="input"
                  type="text"
                  value={joinValue}
                  placeholder="粘贴主持人发给你的房间链接"
                  aria-label="房间链接"
                  onChange={(event) => setJoinValue(event.target.value)}
                />
                <button type="submit" className="btn">
                  进入
                </button>
              </form>
            )}

            {joinError && <p className="feedback feedback--error">{joinError}</p>}
          </div>

          <div className="hero__clock">
            <HeroClock />
            <p className="hero__clock-caption">
              <span className="dim">房间内所有设备看到的是同一个时间 · 上图为实时演示</span>
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="section">
        <div className="container">
          <div className="section__head">
            <div>
              <h2 className="section__title">四种身份</h2>
              <p className="section__subtitle">不同的入口，相同的时间。</p>
            </div>
          </div>

          <div className="role-grid">
            {ROLES.map((role) => (
              <article className="role" key={role.id}>
                <div className="role__head">
                  <role.Icon className="role__icon" size={22} />
                  <span className="u-label">{role.label}</span>
                </div>
                <h3 className="role__title">{role.title}</h3>
                <ul className="role__items">
                  {role.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="section">
        <div className="container">
          <div className="section__head">
            <div>
              <h2 className="section__title">一个时钟</h2>
              <p className="section__subtitle">所有人都能在自己的设备上看到同一个时间。</p>
            </div>
            <button type="button" className="btn" onClick={() => onNavigate("/guide")}>
              使用指南
            </button>
          </div>

          <div className="pillar-grid">
            {PILLARS.map((pillar) => (
              <article className="pillar" key={pillar.id}>
                <pillar.Icon className="pillar__icon" size={20} />
                <h3 className="pillar__title">{pillar.title}</h3>
                <p className="pillar__desc">{pillar.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
