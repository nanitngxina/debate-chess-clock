import { WorkerEnv } from "./worker-types";

/**
 * 头像对象存储。
 *
 * 为什么要有这个模块：
 * 之前头像是把 data URL 直接塞进账号记录的，而服务端有个 5000 字符的上限，
 * 但一张 256x256 的 JPEG 转成 data URL 通常就有 7000 多字符 —— 结果就是
 * 存进去的字符串被从中间截断，头像显示成坏图。
 *
 * 现在改成：图片本体存对象存储，账号里只留一个很短的 URL。
 *
 * 后端有两种，上传时优先用 R2，其次 KV；读取时两个都查：
 *   - R2 需要在后台开通且要求账上有支付方式，暂时用不了；
 *   - KV 免费、无需绑卡，是当前线上实际使用的后端。
 * 对调用方来说两者没有区别 —— 都通过下面这三个函数访问。
 */

export const AVATAR_MAX_BYTES = 1024 * 1024;

export const AVATAR_KEY_PREFIX = "avatars/";
export const AVATAR_URL_PREFIX = "/api/avatars/";

/** 读取头像时统一返回的形状，把 R2 / KV 的差异挡在这个模块内部 */
export interface AvatarObject {
  body: ReadableStream;
  contentType: string;
}

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
  const kv = env.AVATAR_OBJECTS;

  if (!bucket && !kv) {
    throw new Error("头像存储未配置（R2 与 KV 都没有绑定）");
  }

  const extension = extensionForMimeType(mimeType);
  if (!extension) {
    throw new Error(`不支持的头像类型：${mimeType}`);
  }

  const key = buildAvatarObjectKey(accountId, extension);

  if (bucket) {
    await bucket.put(key, bytes, {
      httpMetadata: {
        contentType: mimeType,
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
  } else if (kv) {
    // KV 没有 httpMetadata，把类型放进自定义 metadata，读取时再取出来
    await kv.put(key, bytes, { metadata: { contentType: mimeType } });
  }

  return avatarUrlForObjectKey(key);
}

export async function readAvatarObject(
  env: WorkerEnv,
  key: string,
): Promise<AvatarObject | null> {
  if (env.AVATARS) {
    const object = await env.AVATARS.get(key);
    if (object) {
      return {
        body: object.body,
        contentType: object.httpMetadata?.contentType ?? mimeTypeForObjectKey(key),
      };
    }
  }

  if (env.AVATAR_OBJECTS) {
    const stored = await env.AVATAR_OBJECTS.getWithMetadata<{ contentType?: string }>(
      key,
      "arrayBuffer",
    );

    if (stored.value) {
      const body = new Response(stored.value).body;
      if (body) {
        return {
          body,
          contentType: stored.metadata?.contentType ?? mimeTypeForObjectKey(key),
        };
      }
    }
  }

  return null;
}

/** 尽力删除旧头像对象；删不掉不影响主流程（最多留一个孤儿对象） */
export async function deleteAvatarObject(env: WorkerEnv, url: string): Promise<void> {
  const key = parseAvatarObjectKey(url);
  if (!key) {
    return;
  }

  try {
    // 两个后端都删：换后端的过程中可能同一个 key 在两边都存在
    if (env.AVATARS) {
      await env.AVATARS.delete(key);
    }

    if (env.AVATAR_OBJECTS) {
      await env.AVATAR_OBJECTS.delete(key);
    }
  } catch (error) {
    console.error(`[avatar] 删除旧头像对象失败 key=${key}`, error);
  }
}

export function mimeTypeForObjectKey(key: string): string {
  const extension = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}
