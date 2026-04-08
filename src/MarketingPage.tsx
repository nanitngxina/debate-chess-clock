interface MarketingPageProps {
  onOpenDashboard: () => void;
}

export function MarketingPage({ onOpenDashboard }: MarketingPageProps) {
  return (
    <main className="landing">
      <section className="hero">
        <span className="hero__eyebrow">赛博八角笼 Online</span>
        <h1>把主持人电脑上的本地棋钟，升级成可在线围观和协作的辩论房间。</h1>
        <p>
          这一版支持多房间、多人同步观看、主持人后台开房、正反方专属权限链接，以及观众弹幕。
          房间状态由服务端统一维护，手机和桌面都能实时看到同一场辩论。
        </p>
        <div className="hero__actions">
          <button type="button" className="button" onClick={onOpenDashboard}>
            进入主持人后台
          </button>
          <a className="button button--ghost" href="https://github.com/new" target="_blank" rel="noreferrer">
            新建 GitHub 仓库
          </a>
        </div>
      </section>

      <section className="marketing-grid">
        <article className="card">
          <span className="card__eyebrow">在线同步</span>
          <h3>同一房间，多端同屏</h3>
          <p>主持人操作、辩手结束回合、观众弹幕，都会实时广播给房间内所有人。</p>
        </article>
        <article className="card">
          <span className="card__eyebrow">权限模型</span>
          <h3>基于链接的轻量权限</h3>
          <p>第一版不做重型用户系统，直接生成主持人、正方、反方、观众四类链接。</p>
        </article>
        <article className="card">
          <span className="card__eyebrow">部署方向</span>
          <h3>Cloudflare 友好</h3>
          <p>仓库已按静态前端 + Worker API + Durable Object 房间状态管理的方向重组。</p>
        </article>
      </section>
    </main>
  );
}
