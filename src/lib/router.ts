export type AppRoute =
  | { name: "home" }
  | { name: "dashboard" }
  | { name: "room"; roomId: string };

export function parseRoute(pathname: string): AppRoute {
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
