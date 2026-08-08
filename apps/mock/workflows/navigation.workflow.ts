import { getLogger } from '@omni';

import { HomePage, ProfilePage, type MainTabKey } from '../pages';

/**
 * 导航相关的跨页面业务流。
 *
 * 【Workflow 与 Page 的分工】
 * Page 回答「在这一屏能做什么」，Workflow 回答「怎样从 A 屏走到 B 屏」。
 * 因此本文件**只调用 Page 的方法**，一次都不碰 actions / device ——
 * 一旦 Workflow 开始直接操作元素，它就变成了「披着函数外衣的测试脚本」，
 * 页面结构一改就要同时修 Page 和 Workflow 两处，分层的收益归零。
 *
 * 页面对象在函数内 new：它们无参、无状态、零副作用，
 * 创建成本可以忽略，换来的是函数之间不共享可变状态、可任意并发组合。
 */

/** 切换底部主 Tab，并确认切换后该 Tab 处于选中态 */
export async function gotoTab(tab: MainTabKey): Promise<void> {
  const home = new HomePage();
  await home.gotoTab(tab);
  await home.assertTabSelected(tab);
}

/** 回到首页 Tab 并等待信息流就绪，返回可继续操作的 HomePage */
export async function gotoHome(): Promise<HomePage> {
  const home = new HomePage();
  await home.gotoTab('home');
  await home.waitUntilLoaded();
  await home.waitForFeedLoaded();
  return home;
}

/** 切到「我的」Tab 并等待个人中心就绪 */
export async function gotoProfile(): Promise<ProfilePage> {
  const home = new HomePage();
  await home.gotoTab('profile');

  const profile = new ProfilePage();
  await profile.waitUntilLoaded();
  return profile;
}

/**
 * 进入首个商品详情页，再用导航栏返回按钮回到首页。
 *
 * 把「进入—返回」封装成一个动作，是因为它们必须成对出现：
 * 只进不返会让后续用例的起始页面变得不确定，
 * 而用例层最容易忘的就是收尾。
 */
export async function openFirstProductAndGoBack(): Promise<HomePage> {
  const home = new HomePage();
  await home.buyFirstProduct();
  await home.assertOnProductDetail();
  await home.tapNavBack();
  await home.waitUntilLoaded();
  return home;
}

/**
 * 用系统返回（Android 硬件键 / iOS 导航返回）从详情页退回首页。
 *
 * 与 openFirstProductAndGoBack 并存，是因为两者走的是**不同的返回通道**：
 * 一条走 UI 按钮，一条走系统手势/按键，线上确实出现过只有其中一条会崩的缺陷。
 */
export async function openFirstProductAndPressBack(): Promise<HomePage> {
  const home = new HomePage();
  await home.buyFirstProduct();
  await home.assertOnProductDetail();
  await home.goBack();
  await home.waitUntilLoaded();
  return home;
}

/**
 * 将 App 切后台再恢复，并确认主框架仍然存活。
 *
 * @param seconds 后台停留秒数，默认 3 秒 —— 足以触发大多数系统的内存回收路径，
 *                又不至于让用例整体耗时明显变长。
 */
export async function suspendAndResume(seconds: number = 3): Promise<HomePage> {
  const logger = getLogger().child('navigation.workflow');
  const home = new HomePage();

  await home.backgroundAndResume(seconds);
  await home.waitUntilLoaded();
  logger.info(`App 从后台恢复后首页仍然就绪（停留 ${String(seconds)} 秒）`);
  return home;
}

/**
 * 遍历全部底部 Tab 一圈后回到首页。
 *
 * 冒烟阶段最有价值的导航检查：任何一个 Tab 的初始化崩溃都会在这里暴露。
 */
export async function cycleAllTabs(): Promise<HomePage> {
  const order: readonly MainTabKey[] = ['home', 'discover', 'cart', 'profile'];
  for (const tab of order) {
    await gotoTab(tab);
  }
  return gotoHome();
}
