/**
 * 登录冒烟用例。
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 【跨框架承诺】
 * 本文件不含任何框架判断，也不 import 任何框架 SDK：所有设备能力都来自 `@omni` 门面，
 * 所有业务动作都来自 `@apps/mock` 资产层。切换 `--framework=detox|appium|xcuitest`
 * 参数即可在三个框架上**原样运行**，一行代码都不用改。
 * 平台差异（iOS / Android）已在 locators 的 `platform` 覆盖字段里表达完毕，
 * 用例层因此看不到、也不需要看到平台的存在。
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 覆盖范围：正向登录、密码错误、账号锁定、空输入必填校验、密码显隐切换。
 */

import { device } from '@omni';

import {
  LOCKED_USER,
  LoginPage,
  STANDARD_USER,
  WRONG_PASSWORD_USER,
  loginAs,
  loginExpectingFailure,
  submitEmptyLoginForm,
} from '@apps/mock';

describe('登录冒烟', () => {
  /**
   * 每个用例前重启 App。
   *
   * 用 reloadApp 而不是「上个用例结束时手动退出登录」来复位：
   * 后者依赖上一个用例正常结束，一旦它中途失败，残留状态会连累后面所有用例，
   * 制造一串看不懂的连锁失败。重启是唯一能保证起点确定的手段。
   */
  beforeEach(async () => {
    await device.reloadApp();
  });

  it('标准账号可以成功登录并进入首页', async () => {
    const homePage = await loginAs(STANDARD_USER);

    await homePage.assertLoaded();
    await homePage.assertWelcomeContains(STANDARD_USER.displayName);
    await homePage.assertTabSelected('home');
  });

  it('密码错误时停留在登录页并展示错误提示', async () => {
    // loginExpectingFailure 内部已断言「有提示 + 文案正确 + 未跳转」三件事
    await loginExpectingFailure(WRONG_PASSWORD_USER);
  });

  it('账号被锁定时展示风控提示且不跳转', async () => {
    await loginExpectingFailure(LOCKED_USER, LOCKED_USER.expectedLoginError);
  });

  it('用户名与密码均为空时提交，展示必填校验且不跳转', async () => {
    await submitEmptyLoginForm();
  });

  it('仅填写用户名时提交，只出现密码必填提示', async () => {
    const loginPage = new LoginPage();

    await loginPage.waitUntilLoaded();
    await loginPage.clearForm();
    await loginPage.enterUsername(STANDARD_USER.username);
    await loginPage.submit();

    await loginPage.assertPasswordRequired();
    await loginPage.assertStillOnLoginPage();
  });

  it('切换密码显隐后表单仍可正常提交登录', async () => {
    const loginPage = new LoginPage();

    await loginPage.waitUntilLoaded();
    await loginPage.enterUsername(STANDARD_USER.username);
    await loginPage.enterPassword(STANDARD_USER.password);

    // 显隐切换只影响渲染方式，不应影响已输入的内容 —— 这是历史上真实出过的缺陷
    await loginPage.togglePasswordVisibility();
    await loginPage.togglePasswordVisibility();

    await loginPage.submit();
    await loginPage.assertNoError();
    await loginPage.assertLeft();
  });

  it('提交按钮在登录页初次渲染时即为可用状态', async () => {
    const loginPage = new LoginPage();
    await loginPage.waitUntilLoaded();

    /**
     * 这里用 expect 而不是 actions.assertEnabled：
     * 本用例要断言的是一个**布尔快照**（"初次渲染时"），不需要轮询重试；
     * 若用带等待的断言，反而可能等到表单校验联动之后才通过，掩盖真实缺陷。
     * 其余场景一律优先用 actions.assertXxx（内部带等待与重试）。
     */
    expect(await loginPage.isSubmitEnabled()).toBe(true);
  });
});
