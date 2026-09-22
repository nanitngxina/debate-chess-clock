export type AppRoute =
  | { name: "home" }
  | { name: "guide" }
  | { name: "about" }
  | { name: "dashboard" }
  | { name: "room"; roomId: string };

export function parseRoute(pathname: string): AppRoute {
  if (pathname === "/guide") {
    return { name: "guide" };
  }

  if (pathname === "/about") {
    return { name: "about" };
  }

  if (pathname === "/dashboard") {
    return { name: "dashboard" };
  }

  const roomMatch = pathname.match(/^\/room\/([^/]+)$/);
  if (roomMatch) {
    return {
      name: "room",
      roomId: decodeURIComponent(roomMatch[1]),
    };
  }

  return { name: "home" };
}

/** 需要登录才能进入的页面 */
export function routeRequiresAccount(route: AppRoute): boolean {
  return route.name === "dashboard" || route.name === "room";
}
