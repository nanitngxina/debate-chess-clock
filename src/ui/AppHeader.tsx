import { AccountProfile } from "../shared/types";
import { AppRoute } from "../lib/router";
import { AccountAvatar } from "./AccountAvatar";
import { BrandMark } from "./BrandMark";

interface AppHeaderProps {
  route: AppRoute;
  account: AccountProfile | null;
  onNavigate: (path: string) => void;
  onOpenAuth: () => void;
  onOpenAccount: () => void;
}

const NAV_ITEMS = [
  { key: "home", label: "首页", path: "/" },
  { key: "guide", label: "使用指南", path: "/guide" },
  { key: "about", label: "关于", path: "/about" },
] as const;

export function AppHeader({
  route,
  account,
  onNavigate,
  onOpenAuth,
  onOpenAccount,
}: AppHeaderProps) {
  /*
   * 在房间里时，顶栏的导航一律改成"新标签页打开"。
   *
   * 原因：导航走的是 pushState + setRoute，会直接把 RoomPage 卸载掉 ——
   * 声音断开、语音退出、房间链接（带着 role 和 token）也从地址栏消失，
   * 想回来只能重新翻出那条链接。而房间是一个"正在进行中的现场"，
   * 不该被一个顺手点一下的导航干掉。
   *
   * 要离开房间就用房间顶栏里那个「退出房间」按钮：那是明确的动作。
   */
  const inRoom = route.name === "room";
  const hint = inRoom ? "在新标签页打开，不会退出房间" : undefined;

  return (
    <header className="app-header">
      <div className="container app-header__inner">
        {inRoom ? (
          <a className="brand" href="/" target="_blank" rel="noreferrer" title={hint}>
            <BrandMark className="brand__mark" size={30} />
            <span className="brand__text">
              <span className="brand__name">八角笼</span>
              <span className="brand__sub">Debate Arena</span>
            </span>
          </a>
        ) : (
          <button type="button" className="brand" onClick={() => onNavigate("/")}>
            <BrandMark className="brand__mark" size={30} />
            <span className="brand__text">
              <span className="brand__name">八角笼</span>
              <span className="brand__sub">Debate Arena</span>
            </span>
          </button>
        )}

        <nav className="app-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) =>
            inRoom ? (
              <a
                key={item.key}
                className="app-nav__link"
                href={item.path}
                target="_blank"
                rel="noreferrer"
                title={hint}
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.key}
                type="button"
                className={`app-nav__link ${route.name === item.key ? "app-nav__link--active" : ""}`}
                aria-current={route.name === item.key ? "page" : undefined}
                onClick={() => onNavigate(item.path)}
              >
                {item.label}
              </button>
            ),
          )}
        </nav>

        <div className="app-header__right">
          {/* 未登录时用次按钮：首页 hero 的「创建比赛」才是这一屏的主行动 */}
          {account ? (
            <button
              type="button"
              className="account-chip"
              title="账号设置"
              onClick={onOpenAccount}
            >
              <AccountAvatar
                displayName={account.displayName}
                avatarUrl={account.avatarUrl}
                className="avatar avatar--sm"
              />
              <span className="account-chip__name">{account.displayName}</span>
              {!account.emailVerified && <span className="dot" style={{ color: "var(--warn)" }} />}
            </button>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={onOpenAuth}>
              登录
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
