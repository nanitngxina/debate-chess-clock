interface AboutPageProps {
  onNavigate: (path: string) => void;
}

export function AboutPage({ onNavigate }: AboutPageProps) {
  return (
    <div className="container">
      <header className="page-head">
        <span className="u-label">About</span>
        <h1 className="page-head__title">关于八角笼</h1>
        <p className="page-head__lead">
          一个在线辩论赛实时计时平台。把线下辩论赛用的棋钟搬到网页上，
          让主持人、正方、反方、观众在各自的设备上看到完全一致的时间。
        </p>
      </header>

      <section className="section">
        <div className="prose">
          <p>
            线下辩论计时通常依赖一个实物棋钟，或者主持人电脑上的一个程序投到大屏。
            结果是辩手看不到自己的剩余时间，观众不知道还剩多久，
            而一旦有人线上参加，就完全没法共用一个时钟。
          </p>
          <p>
            八角笼把<strong>比赛状态交给服务端维护</strong>：房间状态由 Cloudflare
            Durable Object 保管，所有端订阅同一个房间。所以无论谁在什么时候进来，
            看到的一定是同一个时间、同一个回合、同一个比赛状态。
          </p>
          <p>
            权限写在链接里而不是账号里。正方、反方、观众拿到各自的链接就能进场，
            不需要注册流程——这对临时比赛和社团内部演练很重要。
          </p>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div>
            <h2 className="section__title">设计原则</h2>
            <p className="section__subtitle">界面上只留必要的东西</p>
          </div>
        </div>

        <div className="def-list">
          <div className="def">
            <span className="def__term">时间优先</span>
            <p className="def__desc">
              计时数字是第一视觉焦点。其余信息全部让位，用细线、留白和状态标签组织层级。
            </p>
          </div>
          <div className="def">
            <span className="def__term">状态清晰</span>
            <p className="def__desc">
              计时中、暂停、等待、回合结束、重连中，每种状态都有明确的视觉表达，
              当前发言方用正蓝与反红区分。
            </p>
          </div>
          <div className="def">
            <span className="def__term">克制</span>
            <p className="def__desc">
              不做装饰性动效。只有数字变化、进度条、状态呼吸光这类有意义的变化才动。
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div>
            <h2 className="section__title">技术构成</h2>
            <p className="section__subtitle">所有组件都跑在 Cloudflare 上</p>
          </div>
        </div>

        <div className="def-list">
          <div className="def">
            <span className="def__term">前端</span>
            <p className="def__desc">React + TypeScript + Vite，桌面 / 平板 / 手机自适应。</p>
          </div>
          <div className="def">
            <span className="def__term">实时同步</span>
            <p className="def__desc">
              房间状态由 Durable Object 维护，通过 SSE 推送到所有端，指令走 HTTP 写入。
            </p>
          </div>
          <div className="def">
            <span className="def__term">语音</span>
            <p className="def__desc">
              WebRTC 点对点通话，信令复用房间通道，不依赖第三方语音服务。
            </p>
          </div>
          <div className="def">
            <span className="def__term">账号与数据</span>
            <p className="def__desc">
              账号、会话、验证码存 D1，头像图片存 R2，房间目录存 KV。
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="prose">
          <p>
            项目目前处于<strong>本地开发阶段</strong>，尚未正式部署上线。
            源码以 MIT 许可发布。
          </p>
        </div>
        <div className="row row--wrap" style={{ marginTop: "var(--sp-5)" }}>
          <button type="button" className="btn" onClick={() => onNavigate("/guide")}>
            查看使用指南
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onNavigate("/dashboard")}>
            进入控制台
          </button>
        </div>
      </section>
    </div>
  );
}
