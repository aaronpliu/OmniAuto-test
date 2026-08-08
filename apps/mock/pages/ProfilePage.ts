import { actions, type LocatorLike } from '@omni';

import { profileLocators } from '../locators';

import { BasePage } from './BasePage';

/**
 * 个人中心页面对象。
 *
 * 本页集中体现了三类容易写错的交互：可滚动列表里的元素、开关的幂等设置、
 * 带二次确认的破坏性操作。把它们封装成业务方法后，用例层不必关心
 * 「先滚再点」「先读再切」这些机械细节。
 */
export class ProfilePage extends BasePage {
  protected readonly pageName: string = '个人中心';
  protected readonly root: LocatorLike = profileLocators.screen;

  /* ═══════════════ 信息展示 ═══════════════ */

  /** 读取昵称 */
  async getUserName(): Promise<string> {
    return this.readText(profileLocators.userName);
  }

  /** 读取邮箱 */
  async getUserEmail(): Promise<string> {
    return this.readText(profileLocators.userEmail);
  }

  /** 读取会员等级徽章文案 */
  async getMemberBadge(): Promise<string> {
    return this.readText(profileLocators.memberBadge);
  }

  /** 读取订单数量文案（原样返回，不做数字解析，避免文案带单位时误判） */
  async getOrderCountText(): Promise<string> {
    return this.readText(profileLocators.orderCountValue);
  }

  /**
   * 断言账号基础信息与夹具一致。
   *
   * 昵称与邮箱用精确匹配（它们是账号数据，不该被文案改动影响）；
   * 徽章与订单数用 contains（真实 UI 常带「· 会员」「笔」之类的修饰后缀）。
   */
  async assertAccountInfo(displayName: string, email: string): Promise<void> {
    await actions.assertVisible(profileLocators.avatar, {
      message: '个人中心头像应可见',
    });
    await actions.assertText(profileLocators.userName, displayName, {
      message: `个人中心昵称应为「${displayName}」`,
    });
    await actions.assertText(profileLocators.userEmail, email, {
      message: `个人中心邮箱应为「${email}」`,
    });
  }

  /** 断言会员徽章包含指定文案 */
  async assertMemberBadgeContains(fragment: string): Promise<void> {
    await actions.assertText(profileLocators.memberBadge, fragment, {
      match: 'contains',
      message: `会员徽章应包含「${fragment}」`,
    });
  }

  /** 断言订单数量文案包含指定数字 */
  async assertOrderCountContains(count: number): Promise<void> {
    await actions.assertText(profileLocators.orderCountValue, String(count), {
      match: 'contains',
      message: `订单数量应包含「${String(count)}」`,
    });
  }

  /* ═══════════════ 设置列表滚动 ═══════════════ */

  /** 在设置列表内滚动，直到「关于」行可见 */
  async scrollToAboutRow(): Promise<void> {
    await this.scrollIntoView(profileLocators.settingsList, profileLocators.aboutRow);
  }

  /** 在设置列表内滚动，直到「退出登录」按钮可见 */
  async scrollToLogoutButton(): Promise<void> {
    await this.scrollIntoView(profileLocators.settingsList, profileLocators.logoutButton);
  }

  /** 断言退出登录按钮已进入可视区域 */
  async assertLogoutButtonVisible(): Promise<void> {
    await actions.assertVisible(profileLocators.logoutButton, {
      message: '滚动到底部后「退出登录」按钮应可见',
    });
  }

  /** 打开「关于」页并等待版本号渲染 */
  async openAbout(): Promise<void> {
    await this.scrollToAboutRow();
    await this.tapWhenReady(profileLocators.aboutRow, '「关于」行不可点击');
    await actions.waitForVisible(profileLocators.aboutVersionText, {
      message: '「关于」页版本号未展示',
    });
  }

  /* ═══════════════ 开关 ═══════════════ */

  /** 推送通知开关当前是否打开 */
  async isNotificationOn(): Promise<boolean> {
    return actions.isSelected(profileLocators.notificationSwitch);
  }

  /**
   * 把推送通知开关设置到指定状态。
   *
   * 交给 BasePage.setSwitch 处理幂等；本方法只负责「先把开关滚进可视区」这一业务前提 ——
   * 不可见的开关在部分框架下点击会静默失败（坐标落在屏幕外），是很难查的坑。
   */
  async toggleNotification(on: boolean): Promise<void> {
    await this.scrollIntoView(profileLocators.settingsList, profileLocators.notificationSwitch);
    await this.setSwitch(profileLocators.notificationSwitch, on);
  }

  /** 深色模式开关当前是否打开 */
  async isDarkModeOn(): Promise<boolean> {
    return actions.isSelected(profileLocators.darkModeSwitch);
  }

  /** 把深色模式开关设置到指定状态 */
  async toggleDarkMode(on: boolean): Promise<void> {
    await this.scrollIntoView(profileLocators.settingsList, profileLocators.darkModeSwitch);
    await this.setSwitch(profileLocators.darkModeSwitch, on);
  }

  /* ═══════════════ 退出登录 ═══════════════ */

  /** 点击退出登录并等待二次确认弹窗出现（不确认） */
  async requestLogout(): Promise<void> {
    await this.scrollToLogoutButton();
    await this.tapWhenReady(profileLocators.logoutButton, '「退出登录」按钮不可点击');
    await actions.waitForVisible(profileLocators.logoutConfirmDialog, {
      message: '点击退出登录后未弹出二次确认弹窗',
    });
  }

  /** 在确认弹窗中点「取消」，并等待弹窗消失 */
  async cancelLogout(): Promise<void> {
    await this.tapWhenReady(profileLocators.logoutCancelButton, '退出确认弹窗的「取消」不可点击');
    await actions.waitForGone(profileLocators.logoutConfirmDialog, {
      message: '取消后退出确认弹窗未关闭',
    });
  }

  /**
   * 完整退出登录：点按钮 → 确认弹窗 → 等待弹窗关闭。
   *
   * 这里不等待登录页出现 —— 「退出后应回到哪一页」是跨页面的业务判断，
   * 属于 Workflow 的职责。页面对象只对自己屏幕内发生的事负责，
   * 这条边界让 ProfilePage 在「退出后跳引导页」的产品改版中依然可用。
   */
  async logout(): Promise<void> {
    await this.requestLogout();
    await this.tapWhenReady(profileLocators.logoutConfirmButton, '退出确认弹窗的「确定」不可点击');
    await actions.waitForGone(profileLocators.logoutConfirmDialog, {
      message: '确认后退出确认弹窗未关闭',
    });
    this.logger.info('已确认退出登录');
  }
}
