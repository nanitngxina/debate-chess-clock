import { FormEvent, useState } from "react";
import { HeroClock } from "./ui/HeroClock";
import {
  IconAudience,
  IconChat,
  IconCrown,
  IconMic,
  IconRefresh,
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
    Icon: IconCrown,
    label: "主持人",
    desc: "后台控制比赛，管理房间，操作计时与规则。",
  },
  {
    id: "sides",
    Icon: IconSides,
    label: "正方 / 反方",
    desc: "专属链接进入，只能结束自己一方的回合。",
  },
  {
    id: "viewer",
    Icon: IconAudience,
    label: "观众",
    desc: "观看比赛、发送弹幕、申请上麦，参与互动。",
  },
] as const;

const PILLARS = [
  { id: "timer", Icon: IconTimer, title: "双轨倒计时", caption: "正反方 + 总时长" },
  { id: "bonus", Icon: IconRefresh, title: "自动加时", caption: "按规则智能加时" },
  { id: "chat", Icon: IconChat, title: "弹幕交流", caption: "实时互动讨论" },
  { id: "voice", Icon: IconMic, title: "语音通话", caption: "WebRTC 低延迟" },
] as const;

const HERO_FEATURES = ["实时同步", "多端可用", "语音互动", "弹幕交流"] as const;

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
      {/*
        Hero = 在线辩论赛事主舞台。
        左栏是赛事信息，右栏是正在走的棋钟，背景是比赛现场。
        三栏栅格（文案 / 棋钟 / 留给背景的空白）让画面右侧始终能露出场地。
      */}
      <section className="hero">
        <div className="hero__art" aria-hidden="true" />

        <div className="container hero__inner">
          <div className="hero__grid">
            <div className="hero__copy">
              <p className="hero__eyebrow">Online Debate Timer</p>

              <h1 className="hero__title">
                <span className="hero__brand">八角笼</span>
                <span className="hero__tagline">
                  让每一场辩论
                  <br />
                  拥有一个共同的时间。
                </span>
              </h1>

              <p className="hero__roles">主持人 · 正方 · 反方 · 观众</p>

              <ul className="hero__features">
                {HERO_FEATURES.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>

              <div className="hero__actions">
                <button
                  type="button"
                  className="btn btn--lg hero__cta"
                  onClick={() => onNavigate("/dashboard")}
                >
                  创建比赛
                  <span className="hero__cta-arrow" aria-hidden="true">
                    →
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn--lg btn--ghost"
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

            {/* 第三列留空：让背景里的赛场一直露在右下方 */}
            <div className="hero__stage">
              <HeroClock />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 一条横向带：左半「四种身份」，右半「一个时钟」 */}
      <section className="band">
        <div className="container band__inner">
          <div className="band__col band__col--roles">
            <header className="band__head">
              <h2 className="band__title">
                四种身份
                <span className="band__title-sub">各司其职</span>
              </h2>
              <p className="band__note">不同的入口，相同的时间</p>
            </header>

            <div className="role-list">
              {ROLES.map((role) => (
                <article className="role" key={role.id}>
                  <div className="role__head">
                    <span className={`role__chip role__chip--${role.id}`}>
                      <role.Icon size={22} />
                    </span>
                    <h3 className="role__title">{role.label}</h3>
                  </div>

                  <p className="role__desc">{role.desc}</p>

                  <button
                    type="button"
                    className="role__link"
                    onClick={() => onNavigate("/guide")}
                  >
                    了解更多
                    <span aria-hidden="true">→</span>
                  </button>
                </article>
              ))}
            </div>
          </div>

          <div className="band__col band__col--pillars">
            <header className="band__head">
              <h2 className="band__title">
                一个时钟
                <span className="band__title-sub">实时同步</span>
              </h2>
              <p className="band__note">所有人都能在自己的设备上看到同一个时间。</p>
            </header>

            <div className="pillar-list">
              {PILLARS.map((pillar) => (
                <article className="pillar" key={pillar.id}>
                  <span className="pillar__chip">
                    <pillar.Icon size={20} />
                  </span>
                  <h3 className="pillar__title">{pillar.title}</h3>
                  <p className="pillar__caption">{pillar.caption}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
