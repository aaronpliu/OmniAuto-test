/**
 * 截图缩放工具
 * 将全分辨率截图缩小为适合 Web 报告查看的尺寸
 */
import sharp from "sharp";
import { renameSync } from "fs";

/** 默认最大宽度 800px，保持纵横比 */
const MAX_WIDTH = 800;

/**
 * 缩放截图文件
 * @param inputPath  原始截图路径
 * @param maxWidth   最大宽度（默认 800px）
 * @returns          处理后的文件路径（同 inputPath，原地覆盖）
 */
export async function resizeScreenshot(inputPath: string, maxWidth = MAX_WIDTH): Promise<string> {
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  // 只缩小，不放大
  if (metadata.width && metadata.width > maxWidth) {
    await image
      .resize({ width: maxWidth, withoutEnlargement: true })
      .toFile(`${inputPath}.resized`);
    // 原地覆盖
    renameSync(`${inputPath}.resized`, inputPath);
  }

  return inputPath;
}
