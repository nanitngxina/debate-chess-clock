import { useEffect, useState } from "react";
import { DashboardPage } from "./DashboardPage";
import { MarketingPage } from "./MarketingPage";
import { RoomPage } from "./RoomPage";
import { parseRoute } from "./lib/router";

function navigate(pathname: string) {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export default function App() {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));

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
          八角笼辩论棋钟
        </button>
        <nav className="topbar__nav">
          <button type="button" className="topbar__link" onClick={() => navigate("/")}>
            首页
          </button>
          <button type="button" className="topbar__link" onClick={() => navigate("/dashboard")}>
            主持人后台
          </button>
        </nav>
      </header>

      {route.name === "home" && <MarketingPage onOpenDashboard={() => navigate("/dashboard")} />}
      {route.name === "dashboard" && (
        <DashboardPage onOpenRoom={(url) => window.location.assign(url)} />
      )}
      {route.name === "room" && <RoomPage roomId={route.roomId} />}
    </div>
  );
}
