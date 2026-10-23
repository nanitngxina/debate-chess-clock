import { useEffect, useState } from "react";
import { AboutPage } from "./pages/AboutPage";
import { DashboardPage } from "./DashboardPage";
import { GuidePage } from "./pages/GuidePage";
import { useAccountSession } from "./hooks/useAccountSession";
import { MarketingPage } from "./MarketingPage";
import { RoomPage } from "./RoomPage";
import { parseRoute, routeRequiresAccount } from "./lib/router";
import { AccountPanel } from "./ui/AccountPanel";
import { AppHeader } from "./ui/AppHeader";
import { AuthPanel } from "./ui/AuthPanel";
import { BrandMark } from "./ui/BrandMark";
import { VerifyEmailBanner } from "./ui/VerifyEmailBanner";

export default function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  const [showAuth, setShowAuth] = useState(false);
  const [showAccountEditor, setShowAccountEditor] = useState(false);
  const session = useAccountSession();

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseRoute(window.location.pathname));
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  // 登录成功后自动收起登录弹层
  useEffect(() => {
    if (session.hasAccount) {
      setShowAuth(false);
    }
  }, [session.hasAccount]);

  function navigate(path: string) {
    window.history.pushState({}, "", path);
    setRoute(parseRoute(path));
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  // 创建控制台要求账号；房间邀请链接使用自身的角色令牌授权，可免登录查看。
  const blocked = routeRequiresAccount(route) && !session.hasAccount;

  return (
    <div className="app-shell">
      <AppHeader
        route={route}
        account={session.account}
        onNavigate={navigate}
        onOpenAuth={() => setShowAuth(true)}
        onOpenAccount={() => setShowAccountEditor(true)}
      />

      {session.hasAccount && session.needsEmailVerification && <VerifyEmailBanner session={session} />}

      <main className="app-main">
        {blocked ? (
          <div className="gate">
            <div className="gate__inner">
              <div className="gate__brand">
                <BrandMark size={40} />
                <span className="u-label">主持人入口</span>
                <h1 className="gate__title">准备开赛</h1>
                <p className="gate__note">
                  登录后创建比赛；加入比赛只需主持人发来的邀请链接。
                </p>
              </div>

              {session.loading ? (
                <p className="empty">正在恢复登录状态…</p>
              ) : (
                <AuthPanel session={session} />
              )}
            </div>
          </div>
        ) : (
          <>
            {route.name === "home" && (
              <MarketingPage
                onNavigate={navigate}
                onJoinRoom={(href) => window.location.assign(href)}
              />
            )}
            {route.name === "guide" && <GuidePage onNavigate={navigate} />}
            {route.name === "about" && <AboutPage onNavigate={navigate} />}
            {route.name === "dashboard" && (
              <DashboardPage onOpenRoom={(url) => window.location.assign(url)} />
            )}
            {route.name === "room" && (
              <RoomPage roomId={route.roomId} account={session.account} onExit={() => navigate("/")} />
            )}
          </>
        )}
      </main>

      <footer className="app-footer">
        <div className="container app-footer__inner">
          <div className="app-footer__brand">
            <BrandMark className="app-footer__mark" size={30} />
            <span className="app-footer__brand-text">
              <span className="app-footer__name">八角笼</span>
              <span className="app-footer__sub">Debate Arena</span>
            </span>
          </div>

          <span className="app-footer__tagline">One room. One clock. Everyone synced.</span>

          <div className="app-footer__right">
            {/* 站点只有简体中文一种语言，这里只做标识，不做点了没反应的假切换器 */}
            <span className="app-footer__lang">简体中文</span>

            <nav className="app-footer__links" aria-label="页脚导航">
              <button type="button" className="link-as-button" onClick={() => navigate("/about")}>
                关于我们
              </button>
              <button type="button" className="link-as-button" onClick={() => navigate("/guide")}>
                使用指南
              </button>
              {/* 目前没有独立的帮助中心页面，帮助内容就在使用指南里 */}
              <button type="button" className="link-as-button" onClick={() => navigate("/guide")}>
                帮助中心
              </button>
            </nav>
          </div>
        </div>
      </footer>

      {showAuth && !session.hasAccount && (
        <div
          className="modal-backdrop"
          data-shortcut-block
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowAuth(false);
            }
          }}
        >
          <div className="modal" style={{ width: "min(460px, 100%)" }}>
            <div className="modal__body">
              <AuthPanel session={session} onClose={() => setShowAuth(false)} />
            </div>
          </div>
        </div>
      )}

      {showAccountEditor && session.account && (
        <div
          className="modal-backdrop"
          data-shortcut-block
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowAccountEditor(false);
            }
          }}
        >
          <div className="modal">
            <AccountPanel
              account={session.account}
              saving={session.saving}
              error={session.error}
              onUpdateProfile={session.updateProfile}
              onUploadAvatar={session.uploadAvatar}
              onChangePassword={session.changePassword}
              onLogout={async () => {
                await session.logout();
                setShowAccountEditor(false);
              }}
              onClose={() => setShowAccountEditor(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
