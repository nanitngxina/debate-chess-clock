import { useEffect, useState } from "react";
import { DashboardPage } from "./DashboardPage";
import { useAccountSession } from "./hooks/useAccountSession";
import { MarketingPage } from "./MarketingPage";
import { RoomPage } from "./RoomPage";
import { parseRoute } from "./lib/router";
import { AccountAvatar } from "./ui/AccountAvatar";
import { AccountPanel } from "./ui/AccountPanel";
import { AuthPanel } from "./ui/AuthPanel";
import { VerifyEmailBanner } from "./ui/VerifyEmailBanner";

function navigate(pathname: string) {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => navigate("/")}>
          餐社八角笼
        </button>

        <nav className="topbar__nav">
          <button
            type="button"
            className={`topbar__link ${route.name === "home" ? "topbar__link--active" : ""}`}
            onClick={() => navigate("/")}
          >
            首页
          </button>
          <button
            type="button"
            className={`topbar__link ${route.name === "dashboard" ? "topbar__link--active" : ""}`}
            onClick={() => navigate("/dashboard")}
          >
            主持人后台
          </button>
        </nav>

        <button
          type="button"
          className={`topbar__account ${session.account ? "topbar__account--button" : ""}`}
          onClick={() => {
            if (session.account) {
              setShowAccountEditor(true);
            }
          }}
        >
          {session.account ? (
            <>
              <AccountAvatar
                displayName={session.account.displayName}
                avatarUrl={session.account.avatarUrl}
                className="account-avatar--small"
              />
              <div>
                <strong>{session.account.displayName}</strong>
                <span>{session.account.emailVerified ? "点击编辑档案" : "邮箱未验证"}</span>
              </div>
            </>
          ) : (
            <div>
              <strong>未登录</strong>
              <span>登录或注册账号</span>
            </div>
          )}
        </button>
      </header>

      {session.hasAccount && session.needsEmailVerification && <VerifyEmailBanner session={session} />}

      {!session.hasAccount ? (
        <main className="account-gate">
          {session.loading ? (
            <p className="account-gate__loading">正在恢复登录状态...</p>
          ) : (
            <AuthPanel session={session} />
          )}
        </main>
      ) : (
        <>
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

          {route.name === "home" && <MarketingPage onOpenDashboard={() => navigate("/dashboard")} />}
          {route.name === "dashboard" && (
            <DashboardPage onOpenRoom={(url) => window.location.assign(url)} />
          )}
          {route.name === "room" && <RoomPage roomId={route.roomId} account={session.account} />}
        </>
      )}
    </div>
  );
}
