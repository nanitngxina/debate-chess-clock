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
  return (
    <header className="app-header">
      <div className="container app-header__inner">
        <button type="button" className="brand" onClick={() => onNavigate("/")}>
          <BrandMark className="brand__mark" size={30} />
          <span className="brand__text">
            <span className="brand__name">八角笼</span>
            <span className="brand__sub">Debate Arena</span>
          </span>
        </button>

        <nav className="app-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`app-nav__link ${route.name === item.key ? "app-nav__link--active" : ""}`}
              aria-current={route.name === item.key ? "page" : undefined}
              onClick={() => onNavigate(item.path)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="app-header__right">
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
            <button type="button" className="btn btn--primary" onClick={onOpenAuth}>
              登录
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
