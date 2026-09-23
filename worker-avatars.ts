import { WorkerEnv } from "./worker-types";

/**
 * 头像对象存储（R2）。
 *
 * 为什么要有这个模块：
 * 之前头像是把 data URL 直接塞进账号记录的，而服务端有个 5000 字符的上限，
 * 但一张 256x256 的 JPEG 转成 data URL 通常就有 7000 多字符 —— 结果就是
 * 存进去的字符串被从中间截断，头像显示成坏图。
 *
 * 现在改成：图片本体存 R2，账号里只留一个很短的 URL。
 */

export const AVATAR_MAX_BYTES = 1024 * 1024;

export const AVATAR_KEY_PREFIX = "avatars/";
export const AVATAR_URL_PREFIX = "/api/avatars/";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

/** 对象 key 的形状：avatars/<accountId>/<file>，两段都只允许安全字符（天然挡掉 ../ 穿越） */
const AVATAR_KEY_PATTERN = /^avatars\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;

/**
 * 用文件头（magic bytes）判断真实图片类型。
 * 不能只信客户端给的 Content-Type —— 那是可以随便伪造的。
 */
export function detectImageMimeType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }

  return null;
}

export function extensionForMimeType(mimeType: string): string | null {
  return EXTENSION_BY_MIME[mimeType] ?? null;
}

/**
 * 生成唯一对象 key。
 * 文件名带时间戳 + 随机串，所以同一个 key 的内容永远不会变，
 * 可以放心地用 immutable 长缓存发给浏览器。
 */
export function buildAvatarObjectKey(accountId: string, extension: string): string {
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${AVATAR_KEY_PREFIX}${accountId}/${unique}.${extension}`;
}

export function avatarUrlForObjectKey(key: string): string {
  return `${AVATAR_URL_PREFIX}${key.slice(AVATAR_KEY_PREFIX.length)}`;
}

/** 从 /api/avatars/<accountId>/<file> 反解出 R2 对象 key；格式不合法返回 null */
export function parseAvatarObjectKey(pathname: string): string | null {
  if (!pathname.startsWith(AVATAR_URL_PREFIX)) {
    return null;
  }

  const key = `${AVATAR_KEY_PREFIX}${pathname.slice(AVATAR_URL_PREFIX.length)}`;
  return AVATAR_KEY_PATTERN.test(key) ? key : null;
}

/** 判断某个 avatarUrl 是不是「这个账号上传到 R2 的头像」 */
export function isOwnAvatarUrl(url: string, accountId: string): boolean {
  return typeof url === "string" && url.startsWith(`${AVATAR_URL_PREFIX}${accountId}/`);
}

export async function saveAvatarObject(
  env: WorkerEnv,
  accountId: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  const bucket = env.AVATARS;
  if (!bucket) {
    throw new Error("头像存储（R2）未配置");
  }

  const extension = extensionForMimeType(mimeType);
  if (!extension) {
    throw new Error(`不支持的头像类型：${mimeType}`);
  }

  const key = buildAvatarObjectKey(accountId, extension);

  await bucket.put(key, bytes, {
    httpMetadata: {
      contentType: mimeType,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });

  return avatarUrlForObjectKey(key);
}

export async function readAvatarObject(
  env: WorkerEnv,
  key: string,
): Promise<R2ObjectBody | null> {
  if (!env.AVATARS) {
    return null;
  }

  return env.AVATARS.get(key);
}

/** 尽力删除旧头像对象；删不掉不影响主流程（最多留一个孤儿对象） */
export async function deleteAvatarObject(env: WorkerEnv, url: string): Promise<void> {
  const key = parseAvatarObjectKey(url);
  if (!key || !env.AVATARS) {
    return;
  }

  try {
    await env.AVATARS.delete(key);
  } catch (error) {
    console.error(`[avatar] 删除旧头像对象失败 key=${key}`, error);
  }
}

export function mimeTypeForObjectKey(key: string): string {
  const extension = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}
