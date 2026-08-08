import { defineLocator, defineLocators } from '@omni';

/**
 * 首页与底部主 Tab 栏的定位器集合。
 *
 * 拆成 homeLocators / tabBarLocators 两个导出，是因为 Tab 栏是**跨页面**的常驻控件：
 * 个人中心、发现页同样依赖它。放在首页命名空间下但独立导出，
 * 既保留了「谁拥有它」的语义，又避免其它页面对象反向依赖 HomePage 的私有细节。
 */

/**
 * 【平台差异示例 ②】底部 Tab 栏容器。
 *
 * iOS 是 UITabBar（main_tab_bar），Android 用的是 BottomNavigationView（main_bottom_nav）。
 * 容器标识不同会连带影响所有以它为 ancestor 的 Tab 项，
 * 所以这里抽成常量并让各 Tab 直接引用它 ——
 * flattenForPlatform 会递归展开 ancestor 的 platform 覆盖，
 * 因此四个 Tab 在两个平台上都能自动落到正确的父容器，无需任何一处平台判断。
 */
const tabBarRoot = defineLocator({
  testId: 'main_tab_bar',
  type: 'other',
  description: '底部主 Tab 栏容器',
  platform: {
    android: { testId: 'main_bottom_nav' },
  },
});

/** 首页商品瀑布流容器；被滚动、下拉刷新与 ancestor 约束三处复用，故抽为常量 */
const feedList = defineLocator({
  testId: 'home_feed_list',
  type: 'scrollView',
  description: '首页商品瀑布流滚动容器',
});

export const tabBarLocators = defineLocators({
  tabBar: tabBarRoot,

  /**
   * 【层级约束示例 ②】四个 Tab 均以 tabBarRoot 为祖先。
   *
   * 首页内容区里也存在「首页/发现」之类的文案按钮（运营位），
   * 不加 ancestor 时 text 型匹配会误命中内容区，导致用例偶发失败。
   */
  homeTab: {
    testId: 'tab_home',
    type: 'tab',
    ancestor: tabBarRoot,
    description: '底部 Tab：首页',
  },
  discoverTab: {
    testId: 'tab_discover',
    type: 'tab',
    ancestor: tabBarRoot,
    description: '底部 Tab：发现',
  },
  cartTab: {
    testId: 'tab_cart',
    type: 'tab',
    ancestor: tabBarRoot,
    description: '底部 Tab：购物车',
  },
  profileTab: {
    testId: 'tab_profile',
    type: 'tab',
    ancestor: tabBarRoot,
    description: '底部 Tab：我的',
  },
});

export const homeLocators = defineLocators({
  screen: {
    testId: 'home_screen',
    type: 'other',
    description: '首页根容器',
  },

  welcomeBanner: {
    testId: 'home_welcome_banner',
    type: 'text',
    description: '首页欢迎语横幅',
  },

  searchEntry: {
    testId: 'home_search_entry',
    type: 'input',
    description: '首页顶部搜索入口',
  },

  feedList,

  productCell: {
    testId: 'home_product_cell',
    type: 'cell',
    description: '首页商品卡片（预期多命中，用于计数与滚动判据）',
  },

  /**
   * 【层级约束示例 ③】商品列表中的第一个「立即购买」按钮。
   *
   * ancestor 负责把范围收敛到瀑布流内（顶部运营横幅里也有同 testId 的购买按钮），
   * index=0 再在收敛后的结果里取第一个。
   * 两者是「先筛范围、后定序号」的关系，缺一不可 ——
   * 只用 index 会把运营位算进去，只用 ancestor 会多命中报错。
   */
  firstProductBuyButton: {
    testId: 'product_buy_button',
    type: 'button',
    ancestor: feedList,
    index: 0,
    description: '商品列表中的第一个「立即购买」按钮',
  },

  productDetailScreen: {
    testId: 'product_detail_screen',
    type: 'other',
    description: '商品详情页根容器',
  },

  feedFooter: {
    testId: 'home_feed_footer',
    type: 'text',
    description: '瀑布流底部「没有更多了」文案',
  },

  refreshToast: {
    testId: 'home_refresh_toast',
    type: 'text',
    description: '下拉刷新完成后的轻提示',
  },

  /**
   * 【平台差异示例 ③】导航栏返回按钮。
   *
   * iOS 的返回按钮由 UINavigationController 提供（nav_back），
   * Android 用的是 Toolbar 的 navigationIcon（nav_back_android）。
   * 注意：Android 上还可以按系统返回键，那条路径走 device.pressBack()，
   * 由适配器负责在 iOS 上映射为导航返回 —— 脚本层两条路径都不需要平台判断。
   */
  navBackButton: {
    testId: 'nav_back',
    type: 'button',
    description: '导航栏返回按钮',
    platform: {
      android: { testId: 'nav_back_android' },
    },
  },
});
