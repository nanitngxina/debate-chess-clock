const AVATAR_CANVAS_SIZE = 256;
const AVATAR_OUTPUT_QUALITY = 0.86;
const AVATAR_MAX_INPUT_BYTES = 8 * 1024 * 1024;

export interface PreparedAvatar {
  /** 仅用于本地即时预览的 data URL —— 不会上传、也不会存进账号 */
  previewUrl: string;
  /** 裁好的 JPEG，交给服务端存进 R2 */
  blob: Blob;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("头像文件读取失败"));
        return;
      }

      resolve(result);
    };
    reader.onerror = () => reject(new Error("头像文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("头像图片解析失败"));
    image.src = source;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error("头像处理失败，请换一张图片试试"));
        }
      },
      "image/jpeg",
      AVATAR_OUTPUT_QUALITY,
    );
  });
}

/**
 * 把用户选的图片裁成正方形头像。
 *
 * 返回预览用的 data URL（只在浏览器里用）和真正要上传的 Blob。
 * 图片本体不再以 data URL 存进账号 —— 服务端会把它放进 R2，账号里只留一个短 URL。
 */
export async function prepareAvatarUpload(file: File): Promise<PreparedAvatar> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请上传图片文件");
  }

  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    throw new Error(`头像图片不能超过 ${Math.floor(AVATAR_MAX_INPUT_BYTES / 1024 / 1024)}MB`);
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_CANVAS_SIZE;
  canvas.height = AVATAR_CANVAS_SIZE;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("当前浏览器不支持头像处理");
  }

  const cropSize = Math.min(image.width, image.height);
  const cropX = (image.width - cropSize) / 2;
  const cropY = (image.height - cropSize) / 2;

  context.drawImage(
    image,
    cropX,
    cropY,
    cropSize,
    cropSize,
    0,
    0,
    AVATAR_CANVAS_SIZE,
    AVATAR_CANVAS_SIZE,
  );

  return {
    previewUrl: canvas.toDataURL("image/jpeg", AVATAR_OUTPUT_QUALITY),
    blob: await canvasToBlob(canvas),
  };
}
