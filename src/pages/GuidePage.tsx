interface GuidePageProps {
  onNavigate: (path: string) => void;
}

export function GuidePage({ onNavigate }: GuidePageProps) {
  return (
    <div className="container">
      <header className="page-head">
        <span className="u-label">How it works</span>
        <h1 className="page-head__title">使用指南</h1>
        <p className="page-head__lead">
          从开房到开赛，只需要分发四条链接。所有设备看到的是同一个时间。
        </p>
      </header>

      <section className="section">
        <ol className="steps">
          <li className="step">
            <span className="step__index">01</span>
            <div>
              <h2 className="step__title">主持人开房</h2>
              <p className="step__body">
                进入控制台，用后台口令登录，填写辩题、双方名称和计时配置，创建房间。
                系统会为这一场比赛生成一个房间号。
              </p>
            </div>
          </li>

          <li className="step">
            <span className="step__index">02</span>
            <div>
              <h2 className="step__title">分发四条链接</h2>
              <p className="step__body">
                每个房间生成四种入口，权限写在链接里，进入即带身份，不需要额外授权：
              </p>
              <ul>
                <li>主持人链接 —— 完整控制权</li>
                <li>正方链接 / 反方链接 —— 只能结束自己一方的回合</li>
                <li>观众链接 —— 观看、弹幕，可申请上麦</li>
              </ul>
            </div>
          </li>

          <li className="step">
            <span className="step__index">03</span>
            <div>
              <h2 className="step__title">比赛进行中</h2>
              <p className="step__body">
                主持人在控制台按开始、暂停、切换发言方、结束回合，随时为任一方或总时长加减时间。
                所有操作会实时同步到房间里每一台设备。
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="section">
        <div className="section__head">
          <div>
            <h2 className="section__title">计时规则</h2>
            <p className="section__subtitle">棋钟的行为方式</p>
          </div>
          <button type="button" className="btn" onClick={() => onNavigate("/dashboard")}>
            进入控制台
          </button>
        </div>

        <div className="def-list">
          <div className="def">
            <span className="def__term">双轨倒计时</span>
            <p className="def__desc">
              正方和反方各有一份独立剩余时间，同时还有一个总时长在走。三方同时倒数。
            </p>
          </div>
          <div className="def">
            <span className="def__term">归零即停</span>
            <p className="def__desc">
              任意一方的剩余时间或总时长归零，计时立即停止，不会继续扣时间。
            </p>
          </div>
          <div className="def">
            <span className="def__term">自动加时</span>
            <p className="def__desc">
              每结束一个回合，系统按配置的规则给「结束这一回合的一方」加时。
              规则可以按回合区间设置，例如第 3 到第 5 回合，每回合加 30 秒。
            </p>
          </div>
          <div className="def">
            <span className="def__term">手动调整</span>
            <p className="def__desc">
              主持人可以对任一方或总时长做 ±10 秒 / ±30 秒的微调，用于纠正现场误差。
            </p>
          </div>
          <div className="def">
            <span className="def__term">回合记录</span>
            <p className="def__desc">
              每个回合由哪一方结束、加了多少秒，都会记录下来，赛后可复查。
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div>
            <h2 className="section__title">快捷键</h2>
            <p className="section__subtitle">比赛进行中，主持人可以不离开键盘</p>
          </div>
        </div>

        <div className="def-list">
          <div className="def">
            <span className="def__term">
              <kbd className="kbd">Space</kbd>
            </span>
            <p className="def__desc">主持人：开始 / 暂停。辩手：结束本回合。</p>
          </div>
          <div className="def">
            <span className="def__term">
              <kbd className="kbd">S</kbd>
            </span>
            <p className="def__desc">主持人：切换发言方。</p>
          </div>
          <div className="def">
            <span className="def__term">
              <kbd className="kbd">E</kbd>
            </span>
            <p className="def__desc">主持人：结束当前回合。</p>
          </div>
          <div className="def">
            <span className="def__term">
              <kbd className="kbd">−</kbd> <kbd className="kbd">+</kbd>
            </span>
            <p className="def__desc">主持人：给选中的对象 −10 / +10 秒（计时暂停时可用）。</p>
          </div>
          <div className="def">
            <span className="def__term">
              <kbd className="kbd">M</kbd>
            </span>
            <p className="def__desc">辩手：加入语音 / 开关麦克风。</p>
          </div>
        </div>

        <p className="def__desc" style={{ marginTop: "var(--sp-4)" }}>
          焦点在输入框里时快捷键不生效，正常打字不会被误触发。
          重置没有快捷键 —— 它会清空回合记录，必须手动点击并确认。
        </p>
      </section>

      <section className="section">
        <div className="section__head">
          <div>
            <h2 className="section__title">四种身份</h2>
            <p className="section__subtitle">不同的入口，相同的时间</p>
          </div>
        </div>

        <div className="def-list">
          <div className="def">
            <span className="def__term">主持人</span>
            <p className="def__desc">
              控制整场比赛：开始、暂停、切换发言方、结束回合、重置、加减时间、调整辩题与规则，
              并审批观众上麦。
            </p>
          </div>
          <div className="def">
            <span className="def__term">正方 / 反方</span>
            <p className="def__desc">
              用专属链接进入，直接看到自己一方的时间。只能结束自己一方的回合；
              只有在自己一方计时时才能打开麦克风。
            </p>
          </div>
          <div className="def">
            <span className="def__term">观众</span>
            <p className="def__desc">
              无需登录即可观看，发送弹幕参与互动；想发言可以申请上麦，由主持人批准。
            </p>
          </div>
          <div className="def">
            <span className="def__term">账号（可选）</span>
            <p className="def__desc">
              注册账号后，你的出场名称和头像会跟着账号走，换设备也在，
              并且能在忘记密码时自助找回。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
