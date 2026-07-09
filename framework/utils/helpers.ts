export class Helpers {
  /**
   * 固定等待指定毫秒数
   * @param ms 等待的毫秒数
   */
  static async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
