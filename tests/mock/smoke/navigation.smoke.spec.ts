/**
 * 导航冒烟用例。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 【跨框架承诺】
 * 本文件不含任何框架判断，也不 import 任何框架 SDK：所有设备能力都来自 `@omni` 门面，
 * 所有业务动作都来自 `@apps/mock` 资产层。切换 `--framework=detox|appium|xcuitest`
 * 参数即可在三个框架上**原样运行**，一行代码都不用改。
 *
 * 注意本文件里的「返回」：`page.goBack()` 底层走 `device.pressBack()`，
 * 它在 Android 上是硬件返回键、在 iOS 上被适配器映射为导航返回。
 * 这条平台差异被完整封在适配器内部，用例层因此不需要任何分支。
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 覆盖范围：底部 Tab 切换、详情页两条返回通道、后台恢复、信息流滚动与下拉刷新。
 */

import { device } from '@omni';

import {
  HomePage,
  STANDARD_USER,
  cycleAllTabs,
  gotoHome,
  gotoProfile,
  gotoTab,
  loginAs,
  openFirstProductAndGoBack,
  openFirstProductAndPressBack,
  suspendAndResume,
} from '@apps/mock';

describe('导航冒烟', () => {
  /**
   * 每个用例前重启并重新登录。
   *
   * 导航用例全部以「已登录 + 停在首页」为前提。把这个前提放进 beforeEach 而不是
   * 让第一个用例登录、后续用例复用，是为了让任意单个用例都能用
   * `-t` 单独跑起来 —— 依赖执行顺序的用例集在排障时几乎无法使用。
   */
  beforeEach(async () => {
    await device.reloadApp();
    await loginAs(STANDARD_USER);
  });

  it('依次切换四个底部 Tab 后可以回到首页', async () => {
    const homePage = await cycleAllTabs();

    await homePage.assertLoaded();
    await homePage.assertTabSelected('home');
  });

  it('切到「我的」Tab 后个人中心正常渲染', async () => {
    const profilePage = await gotoProfile();

    await profilePage.assertLoaded();
    await profilePage.assertAccountInfo(STANDARD_USER.displayName, STANDARD_USER.email);
  });

  it('从「购物车」Tab 切回首页时首页状态保持可用', async () => {
    await gotoTab('cart');

    const homePage = await gotoHome();
    await homePage.assertLoaded();
    await homePage.assertTabSelected('home');
  });

  it('进入商品详情后点导航栏返回按钮可回到首页', async () => {
    const homePage = await openFirstProductAndGoBack();

    await homePage.assertLoaded();
    await homePage.assertTabSelected('home');
  });

  it('进入商品详情后使用系统返回可回到首页', async () => {
    // 与上一条走的是不同返回通道（系统返回 vs UI 按钮），线上出现过只挂其中一条的缺陷
    const homePage = await openFirstProductAndPressBack();

    await homePage.assertLoaded();
  });

  it('App 切后台再恢复后仍停留在首页且 Tab 栏可用', async () => {
    const homePage = await suspendAndResume(3);

    await homePage.assertLoaded();
    await homePage.assertTabSelected('home');

    /**
     * Tab 栏可见性用 expect 断言布尔快照：
     * 恢复前台后若 Tab 栏需要「再等等才出现」，那本身就是缺陷，
     * 不应该被带重试的断言掩盖过去。
     */
    expect(await homePage.isTabBarVisible()).toBe(true);
  });

  it('从后台恢复时若停留在「我的」Tab，恢复后仍在「我的」', async () => {
    const profilePage = await gotoProfile();
    await profilePage.backgroundAndResume(2);
    await profilePage.waitUntilLoaded();

    await profilePage.assertLoaded();
    await profilePage.assertAccountInfo(STANDARD_USER.displayName, STANDARD_USER.email);
  });

  it('首页信息流可以下拉刷新并滚动到底部', async () => {
    const homePage = new HomePage();

    await homePage.waitForFeedLoaded();
    await homePage.pullToRefreshFeed();
    await homePage.waitForFeedLoaded();

    await homePage.scrollToFeedBottom();
    await homePage.assertLoaded();
  });
});
