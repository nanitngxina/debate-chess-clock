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

  // 受保护页面在未登录时显示登录入口；公开页面（首页/指南/关于）任何人都能看
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
                <h1 className="gate__title">先登录，再进入</h1>
                <p className="gate__note">
                  主持人控制台和比赛房间需要账号；首页、使用指南和关于可以随便看。
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
            {route.name === "room" && <RoomPage roomId={route.roomId} account={session.account} />}
          </>
        )}
      </main>

      <footer className="app-footer">
        <div className="container app-footer__inner">
          <span>八角笼 DEBATE ARENA · 在线辩论赛实时计时平台</span>
          <nav className="app-footer__links">
            <button type="button" className="link-as-button" onClick={() => navigate("/guide")}>
              使用指南
            </button>
            <button type="button" className="link-as-button" onClick={() => navigate("/about")}>
              关于
            </button>
          </nav>
        </div>
      </footer>

      {showAuth && !session.hasAccount && (
        <div
          className="modal-backdrop"
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
        <div className="account-modal">
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
      )}
    </div>
  );
}
