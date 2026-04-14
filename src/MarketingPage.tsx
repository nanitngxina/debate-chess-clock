interface MarketingPageProps {
  onOpenDashboard: () => void;
}

const heroStats = [
  {
    value: "4 类角色入口",
    label: "主持、正方、反方、观众链接一次生成，分享路径更清晰。",
  },
  {
    value: "实时房间同步",
    label: "计时、回合、弹幕和语音状态在同一房间内统一广播。",
  },
  {
    value: "桌面与手机同看",
    label: "主持后台和观众页都能快速进入同一场辩论。",
  },
];

const launchSteps = [
  {
    index: "01",
    title: "主持人开房",
    description: "在后台填写辩题、规则、双方名称和计时配置。",
  },
  {
    index: "02",
    title: "分发专属链接",
    description: "系统一次生成主持、正方、反方、观众四类访问入口。",
  },
  {
    index: "03",
    title: "全端同步观看",
    description: "所有成员进入同一房间后，回合状态会自动保持一致。",
  },
];

const focusPoints = [
  {
    title: "轻权限模型",
    description: "第一版不引入重账号系统，用链接和角色直接完成授权。",
  },
  {
    title: "主持台优先",
    description: "把开房、改题、调时、分发链接和控场集中到后台完成。",
  },
  {
    title: "服务端托管房间状态",
    description: "基于 Worker API 与 Durable Object 维护统一的房间时钟。",
  },
];

const featureCards = [
  {
    eyebrow: "在线同步",
    title: "同一房间，多端同屏",
    description: "主持操作、辩手回合、观众弹幕都会实时广播给房间内所有人。",
    meta: "减少“谁那边还没刷新”的割裂感",
    tone: "sync",
  },
  {
    eyebrow: "主持后台",
    title: "把控节奏更顺手",
    description: "建房、修改辩题、更新规则、控制棋钟和分享链接，都集中在一个后台完成。",
    meta: "适合活动主持、线上赛和社团内部演练",
    tone: "control",
  },
  {
    eyebrow: "权限模型",
    title: "基于链接的轻量授权",
    description: "正方、反方、主持人和观众各自拥有对应入口，进入即带权限，不需要额外注册流程。",
    meta: "更适合临时房间和快速开赛",
    tone: "access",
  },
  {
    eyebrow: "部署方向",
    title: "Cloudflare 友好",
    description: "仓库已经按静态前端、Worker API 和房间对象状态管理的方向完成重组。",
    meta: "便于持续部署，也更适合多人在线场景",
    tone: "deploy",
  },
] as const;

export function MarketingPage({ onOpenDashboard }: MarketingPageProps) {
  return (
    <main className="landing">
      <section className="hero hero--landing">
        <div className="hero__content">
          <div className="hero__headline">
            <span className="hero__eyebrow">餐社八角笼 Online</span>
            <div className="hero__status-row">
              <span className="hero__chip">多人同步</span>
              <span className="hero__chip">主持后台</span>
              <span className="hero__chip">移动端可看</span>
            </div>
            <h1>餐社八角笼</h1>
            <p>
              这一版支持多房间、多人同步观看、主持后台开房、正反方专属权限链接以及观众弹幕。
              房间状态由服务端统一维护，手机和桌面都能实时看到同一场辩论。
            </p>
          </div>

          <div className="hero__actions">
            <button type="button" className="button" onClick={onOpenDashboard}>
              进入主持人后台
            </button>
            <span className="hero__hint">先开房，再把不同角色链接发给对应成员。</span>
          </div>

          <div className="hero__stats">
            {heroStats.map((item) => (
              <article className="hero__stat" key={item.value}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </article>
            ))}
          </div>
        </div>

        <aside className="hero__panel">
          <section className="hero__panel-card hero__panel-card--primary">
            <div className="hero__panel-title">
              <strong>一场辩论，三步进入状态</strong>
              <span>从建房到同步上屏，流程足够直接，也适合现场快速组织。</span>
            </div>

            <div className="hero__flow">
              {launchSteps.map((step) => (
                <article className="hero__flow-step" key={step.index}>
                  <span className="hero__flow-index">{step.index}</span>
                  <div className="hero__flow-copy">
                    <strong>{step.title}</strong>
                    <span>{step.description}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="hero__panel-card">
            <div className="hero__panel-title">
              <strong>当前版本重点</strong>
              <span>先把实用性和一致性做好，再继续往更完整的线上辩论体验推进。</span>
            </div>

            <div className="hero__focus">
              {focusPoints.map((item) => (
                <article className="hero__focus-item" key={item.title}>
                  <span className="hero__focus-dot" aria-hidden="true" />
                  <div className="hero__focus-copy">
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>

      <section className="marketing-grid">
        {featureCards.map((card) => (
          <article className={`card card--feature card--feature-${card.tone}`} key={card.title}>
            <span className="card__eyebrow">{card.eyebrow}</span>
            <h3>{card.title}</h3>
            <p>{card.description}</p>
            <span className="card__meta">{card.meta}</span>
          </article>
        ))}
      </section>
    </main>
  );
}
