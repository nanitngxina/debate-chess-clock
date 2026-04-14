import { useEffect, useState } from "react";
import { DashboardPage } from "./DashboardPage";
import { useAccountSession } from "./hooks/useAccountSession";
import { MarketingPage } from "./MarketingPage";
import { RoomPage } from "./RoomPage";
import { parseRoute } from "./lib/router";
import { AccountAvatar } from "./ui/AccountAvatar";
import { AccountPanel } from "./ui/AccountPanel";

function navigate(pathname: string) {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  const [showAccountEditor, setShowAccountEditor] = useState(false);
  const accountSession = useAccountSession();

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
          className={`topbar__account ${accountSession.account ? "topbar__account--button" : ""}`}
          onClick={() => {
            if (accountSession.account) {
              setShowAccountEditor(true);
            }
          }}
        >
          {accountSession.account ? (
            <>
              <AccountAvatar
                displayName={accountSession.account.displayName}
                avatarUrl={accountSession.account.avatarUrl}
                className="account-avatar--small"
              />
              <div>
                <strong>{accountSession.account.displayName}</strong>
                <span>点击编辑档案</span>
              </div>
            </>
          ) : (
            <div>
              <strong>未创建档案</strong>
              <span>先完成角色创建</span>
            </div>
          )}
        </button>
      </header>

      {!accountSession.hasAccount ? (
        <main className="account-gate">
          <AccountPanel
            account={accountSession.account}
            loading={accountSession.loading}
            saving={accountSession.saving}
            error={accountSession.error}
            mode="gate"
            onRegister={accountSession.register}
            onUpdate={accountSession.update}
            onLogout={accountSession.logout}
          />
        </main>
      ) : (
        <>
          {showAccountEditor && (
            <div className="account-modal">
              <AccountPanel
                account={accountSession.account}
                loading={accountSession.loading}
                saving={accountSession.saving}
                error={accountSession.error}
                mode="modal"
                onRegister={accountSession.register}
                onUpdate={accountSession.update}
                onLogout={accountSession.logout}
                onClose={() => setShowAccountEditor(false)}
              />
            </div>
          )}

          {route.name === "home" && <MarketingPage onOpenDashboard={() => navigate("/dashboard")} />}
          {route.name === "dashboard" && (
            <DashboardPage onOpenRoom={(url) => window.location.assign(url)} />
          )}
          {route.name === "room" && <RoomPage roomId={route.roomId} account={accountSession.account} />}
        </>
      )}
    </div>
  );
}
