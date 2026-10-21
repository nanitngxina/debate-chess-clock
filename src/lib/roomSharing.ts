/** 只接受服务端提供的观众邀请链接；缺失时不得回退到当前授权地址。 */
export async function copyViewerLink(
  viewerLink: string | undefined,
  writeText: (text: string) => Promise<void>,
): Promise<string> {
  if (!viewerLink) {
    return "观众链接尚未加载，请稍后重试。";
  }

  try {
    await writeText(viewerLink);
    return "观众链接已复制，发给别人即可观看这场比赛。";
  } catch {
    return `复制失败，请手动复制：${viewerLink}`;
  }
}
