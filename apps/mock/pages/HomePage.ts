import { actions, type LocatorDescriptor, type LocatorLike } from '@omni';

import { homeLocators, tabBarLocators } from '../locators';

import { BasePage } from './BasePage';

/** 底部主 Tab 的业务键名 */
export type MainTabKey = 'home' | 'discover' | 'cart' | 'profile';

/**
 * Tab 键名 → Locator 的映射表。
 *
 * 用**数据表**而不是 switch/if 来做分发：新增一个 Tab 只是往表里加一行，
 * 不需要动任何控制流。这与「平台差异用 platform 字段表达而非 if 分支」是同一条原则 ——
 * 能用数据描述的差异，就不要升级成代码分支。
 */
const TAB_LOCATORS: Readonly<Record<MainTabKey, LocatorDescriptor>> = {
  home: tabBarLocators.homeTab,
  discover: tabBarLocators.discoverTab,
  cart: tabBarLocators.cartTab,
  profile: tabBarLocators.profileTab,
};

/** Tab 键名 → 中文名，仅用于日志与失败信息，让报错能被非技术同学读懂 */
const TAB_TITLES: Readonly<Record<MainTabKey, string>> = {
  home: '首页',
  discover: '发现',
  cart: '购物车',
  profile: '我的',
};

/**
 * 首页页面对象，同时承载底部主 Tab 栏的操作。
 *
 * Tab 栏在视觉上属于全局，但它的宿主是主框架页（首页），
 * 放在这里可以避免再造一个只有四个方法的 TabBarPage，也避免其它页面互相依赖。
 */
export class HomePage extends BasePage {
  protected readonly pageName: string = '首页';
  protected readonly root: LocatorLike = homeLocators.screen;

  /* ═══════════════ Tab 导航 ═══════════════ */

  /** 切换到指定底部 Tab，并等待 Tab 栏本身先渲染出来 */
  async gotoTab(tab: MainTabKey): Promise<void> {
    await actions.waitForVisible(tabBarLocators.tabBar, {
      message: '底部 Tab 栏未渲染，无法切换 Tab',
    });
    await this.tapWhenReady(TAB_LOCATORS[tab], `Tab「${TAB_TITLES[tab]}」不可点击`);
    this.logger.info(`已切换到 Tab：${TAB_TITLES[tab]}`);
  }

  /**
   * 断言指定 Tab 处于选中态。
   *
   * 选中态用 isSelected 语义读取，而不是比对高亮颜色或图标资源名 ——
   * 后者在三个框架下的可读属性完全不同，根本无法统一。
   */
  async assertTabSelected(tab: MainTabKey): Promise<void> {
    await actions.assertVisible(TAB_LOCATORS[tab], {
      message: `Tab「${TAB_TITLES[tab]}」应可见`,
    });
    const selected: boolean = await actions.isSelected(TAB_LOCATORS[tab]);
    if (!selected) {
      throw new Error(`期望 Tab「${TAB_TITLES[tab]}」处于选中态，实际未选中`);
    }
  }

  /** 指定 Tab 是否处于选中态（探测用，不抛异常） */
  async isTabSelected(tab: MainTabKey): Promise<boolean> {
    return actions.isSelected(TAB_LOCATORS[tab]);
  }

  /** 底部 Tab 栏是否可见；后台恢复后用它确认主框架仍在 */
  async isTabBarVisible(): Promise<boolean> {
    return actions.isVisible(tabBarLocators.tabBar);
  }

  /* ═══════════════ 首页内容 ═══════════════ */

  /** 读取欢迎语文案 */
  async getWelcomeText(): Promise<string> {
    return this.readText(homeLocators.welcomeBanner);
  }

  /** 断言欢迎语包含指定片段（通常是用户昵称） */
  async assertWelcomeContains(fragment: string): Promise<void> {
    await actions.assertText(homeLocators.welcomeBanner, fragment, {
      match: 'contains',
      message: `首页欢迎语应包含「${fragment}」`,
    });
  }

  /** 等待商品瀑布流出内容：容器可见且至少有一张卡片 */
  async waitForFeedLoaded(): Promise<void> {
    await actions.waitForVisible(homeLocators.feedList, {
      message: '首页商品列表容器未渲染',
    });
    await actions.waitUntil(
      async () => (await actions.count(homeLocators.productCell)) > 0,
      { message: '首页商品列表长时间没有任何卡片' },
    );
  }

  /** 当前渲染出的商品卡片数量 */
  async getProductCount(): Promise<number> {
    return actions.count(homeLocators.productCell);
  }

  /** 下拉刷新首页信息流 */
  async pullToRefreshFeed(): Promise<void> {
    await actions.pullToRefresh(homeLocators.feedList);
    this.logger.info('已触发首页下拉刷新');
  }

  /** 向下滚动信息流一屏 */
  async scrollFeedDown(): Promise<void> {
    await actions.scroll(homeLocators.feedList, { direction: 'down' });
  }

  /** 滚动直到底部「没有更多了」文案可见 */
  async scrollToFeedBottom(): Promise<void> {
    await this.scrollIntoView(homeLocators.feedList, homeLocators.feedFooter, 'down', 20);
  }

  /**
   * 点击列表中第一个「立即购买」并进入商品详情。
   *
   * 先确保列表有内容再点：空列表时点击会退化成「元素未找到」，
   * 报错指向购买按钮，掩盖了真正的原因（数据没加载出来）。
   */
  async buyFirstProduct(): Promise<void> {
    await this.waitForFeedLoaded();
    await this.tapWhenReady(homeLocators.firstProductBuyButton, '首个商品的购买按钮不可点击');
    await actions.waitForVisible(homeLocators.productDetailScreen, {
      message: '点击购买后商品详情页未打开',
    });
  }

  /** 断言当前停留在商品详情页 */
  async assertOnProductDetail(): Promise<void> {
    await actions.assertVisible(homeLocators.productDetailScreen, {
      message: '期望停留在商品详情页',
    });
  }

  /** 通过导航栏返回按钮离开详情页（与系统返回键是两条不同路径） */
  async tapNavBack(): Promise<void> {
    await this.tapWhenReady(homeLocators.navBackButton, '导航栏返回按钮不可点击');
  }
}
