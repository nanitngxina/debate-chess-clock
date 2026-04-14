const AVATAR_CANVAS_SIZE = 256;
const AVATAR_OUTPUT_QUALITY = 0.86;

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

export async function prepareAvatarUpload(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请上传图片文件");
  }

  if (file.size > 8 * 1024 * 1024) {
    throw new Error("头像图片不能超过 8MB");
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

  return canvas.toDataURL("image/jpeg", AVATAR_OUTPUT_QUALITY);
}
