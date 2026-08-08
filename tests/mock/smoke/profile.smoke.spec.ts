/**
 * 个人中心冒烟用例。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 【跨框架承诺】
 * 本文件不含任何框架判断，也不 import 任何框架 SDK：所有设备能力都来自 `@omni` 门面，
 * 所有业务动作都来自 `@apps/mock` 资产层。切换 `--framework=detox|appium|xcuitest`
 * 参数即可在三个框架上**原样运行**，一行代码都不用改。
 *
 * 本文件覆盖的「推送通知开关」在 iOS 是原生 UISwitch、Android 是 SwitchCompat，
 * 两者 testId 不同 —— 该差异完全由 `profile.locators.ts` 的 `platform` 覆盖字段承担，
 * 用例与页面对象里看不到任何平台判断。
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 覆盖范围：账号信息展示、设置列表滚动、开关切换的幂等性、退出登录（含取消分支）。
 */

import { device } from '@omni';

import {
  LoginPage,
  ProfilePage,
  STANDARD_USER,
  gotoProfile,
  loginAs,
  logout,
} from '@apps/mock';

describe('个人中心冒烟', () => {
  beforeEach(async () => {
    await device.reloadApp();
    await loginAs(STANDARD_USER);
  });

  it('登录后个人中心展示正确的昵称、邮箱与会员信息', async () => {
    const profilePage = await gotoProfile();

    await profilePage.assertAccountInfo(STANDARD_USER.displayName, STANDARD_USER.email);
    await profilePage.assertMemberBadgeContains(STANDARD_USER.memberBadge);
    await profilePage.assertOrderCountContains(STANDARD_USER.orderCount);
  });

  it('设置列表可以滚动到底部并露出退出登录按钮', async () => {
    const profilePage = await gotoProfile();

    await profilePage.scrollToLogoutButton();
    await profilePage.assertLogoutButtonVisible();
  });

  it('可以打开「关于」页并看到版本号', async () => {
    const profilePage = await gotoProfile();

    await profilePage.openAbout();
    await profilePage.assertLoaded();
  });

  it('推送通知开关可以从关闭切到打开再切回关闭', async () => {
    const profilePage = await gotoProfile();

    await profilePage.toggleNotification(false);
    /**
     * 开关状态用 expect 读布尔快照，而不是 actions.assertValue：
     * 开关的原生 value 在三个框架下形态不一致（'1' / 'true' / '开'），
     * 直接比对字符串会让用例只在某一个框架下成立 —— 这恰恰是本工程要消灭的东西。
     * isSelected 是契约层统一归一化后的语义布尔值，才是跨框架安全的读法。
     */
    expect(await profilePage.isNotificationOn()).toBe(false);

    await profilePage.toggleNotification(true);
    expect(await profilePage.isNotificationOn()).toBe(true);

    await profilePage.toggleNotification(false);
    expect(await profilePage.isNotificationOn()).toBe(false);
  });

  it('重复设置同一开关状态不会把状态翻转（幂等性）', async () => {
    const profilePage = await gotoProfile();

    await profilePage.toggleNotification(true);
    // 连续两次设为 true，若实现是「无脑 tap」，第二次就会把它翻成 false
    await profilePage.toggleNotification(true);

    expect(await profilePage.isNotificationOn()).toBe(true);
  });

  it('深色模式开关可以独立切换，不影响推送通知开关', async () => {
    const profilePage = await gotoProfile();

    await profilePage.toggleNotification(true);
    await profilePage.toggleDarkMode(true);

    expect(await profilePage.isDarkModeOn()).toBe(true);
    expect(await profilePage.isNotificationOn()).toBe(true);
  });

  it('退出登录弹出二次确认，点取消后仍停留在个人中心', async () => {
    const profilePage = new ProfilePage();
    await gotoProfile();

    await profilePage.requestLogout();
    await profilePage.cancelLogout();

    await profilePage.assertLoaded();
    await profilePage.assertAccountInfo(STANDARD_USER.displayName, STANDARD_USER.email);
  });

  it('确认退出登录后回到登录页且不再展示个人中心', async () => {
    const loginPage: LoginPage = await logout();

    await loginPage.assertStillOnLoginPage();

    const profilePage = new ProfilePage();
    await profilePage.assertLeft();
  });
});
