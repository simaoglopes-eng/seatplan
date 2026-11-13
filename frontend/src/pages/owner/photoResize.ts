export function fitPhoto(width: number, height: number, maximum = 1600): { width: number; height: number } {
  if (![width, height, maximum].every(n => Number.isFinite(n) && n > 0)) throw new Error("This image has invalid dimensions.");
  const ratio = Math.min(1, maximum / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

function jpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not resize this image.")), "image/jpeg", 0.82));
}
function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Could not read this image.")); reader.readAsDataURL(blob); });
}
export async function resizePhoto(file: File): Promise<{ content_type: "image/jpeg"; data_base64: string }> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15_000_000) throw new Error("Choose a JPEG, PNG or WebP image up to 15 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await image.decode().catch(() => { throw new Error("This file is not a readable image."); });
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot resize images.");
    let blob: Blob | null = null;
    for (const maximum of [1600, 1200]) {
      const size = fitPhoto(image.naturalWidth, image.naturalHeight, maximum);
      canvas.width = size.width; canvas.height = size.height;
      context.fillStyle = "white"; context.fillRect(0, 0, size.width, size.height);
      context.drawImage(image, 0, 0, size.width, size.height);
      blob = await jpeg(canvas);
      if (blob.size <= 800_000) return { content_type: "image/jpeg", data_base64: await base64(blob) };
    }
    throw new Error("This photo is still over 800 KB after resizing. Choose a smaller image.");
  } finally { URL.revokeObjectURL(url); }
}
