import { getLogger } from '@omni';

import type { TestUser } from '../fixtures/users';
import { HomePage, LoginPage, ProfilePage } from '../pages';

import { gotoProfile } from './navigation.workflow';

/**
 * 登录态相关的跨页面业务流。
 *
 * 与 navigation.workflow 一样，本文件只编排 Page，不直接调用 actions / device。
 * 依赖方向是单向的：auth → navigation → pages，
 * 不允许 navigation 反向 import auth，否则会形成循环依赖，
 * 在 ts-jest 的 CommonJS 转译下表现为「某个导出运行时为 undefined」这类极难排查的问题。
 */

/**
 * 用指定账号登录，成功后返回已就绪的首页。
 *
 * 返回 HomePage 而不是 void：调用方几乎总要接着操作首页，
 * 顺手把对象交出去可以省掉一次 `new HomePage()`，也强调了「登录的终点是首页」这个契约。
 */
export async function loginAs(user: TestUser): Promise<HomePage> {
  const logger = getLogger().child('auth.workflow');
  const loginPage = new LoginPage();
  const homePage = new HomePage();

  logger.info(`登录账号：${user.username}（${user.key}）`);
  await loginPage.waitUntilLoaded();
  await loginPage.login(user.username, user.password);

  await homePage.waitUntilLoaded();
  await homePage.waitForFeedLoaded();
  logger.info(`账号 ${user.username} 登录成功，已进入首页`);
  return homePage;
}

/**
 * 用预期会失败的账号登录，并断言错误提示与「未跳转」。
 *
 * 断言写在 Workflow 里而不是留给用例，是因为「失败登录」的正确表现
 * 由三件事共同定义：有错误提示、提示文案正确、仍停留在登录页。
 * 三者缺一都算漏测，集中在这里能保证每个失败用例都检查齐全。
 *
 * @param expectedMessage 缺省取账号夹具上登记的期望文案
 */
export async function loginExpectingFailure(
  user: TestUser,
  expectedMessage?: string,
): Promise<LoginPage> {
  const logger = getLogger().child('auth.workflow');
  const loginPage = new LoginPage();

  logger.info(`以预期失败的账号登录：${user.username}（${user.key}）`);
  await loginPage.waitUntilLoaded();
  await loginPage.login(user.username, user.password);

  await loginPage.assertLoginFailed(expectedMessage ?? user.expectedLoginError);
  await loginPage.assertStillOnLoginPage();
  return loginPage;
}

/**
 * 提交空表单并断言必填校验。
 *
 * 单独成一个流程而不是复用 loginExpectingFailure：
 * 空表单的预期表现是**字段级必填提示**，与「服务端返回错误」是两条不同的产品路径，
 * 混在一起会让断言变得含糊（到底该检查 banner 还是检查 hint）。
 */
export async function submitEmptyLoginForm(): Promise<LoginPage> {
  const loginPage = new LoginPage();

  await loginPage.waitUntilLoaded();
  await loginPage.clearForm();
  await loginPage.submit();

  await loginPage.assertUsernameRequired();
  await loginPage.assertPasswordRequired();
  await loginPage.assertStillOnLoginPage();
  return loginPage;
}

/**
 * 退出登录：我的 Tab → 退出 → 确认 → 回到登录页。
 *
 * 返回 LoginPage，让调用方可以立刻用另一个账号登录，形成可串联的流程。
 */
export async function logout(): Promise<LoginPage> {
  const logger = getLogger().child('auth.workflow');

  const profilePage: ProfilePage = await gotoProfile();
  await profilePage.logout();

  const loginPage = new LoginPage();
  await loginPage.waitUntilLoaded();
  logger.info('已退出登录并回到登录页');
  return loginPage;
}

/**
 * 保证处于已登录状态：已登录则直接复用，未登录才走登录流程。
 *
 * 用于那些「不关心怎么进来的，只要是登录态」的用例。
 * 判断依据是首页是否已渲染，而不是任何持久化标记 ——
 * UI 层能看到的状态才是用例真正依赖的状态。
 */
export async function ensureLoggedIn(user: TestUser): Promise<HomePage> {
  const homePage = new HomePage();
  if (await homePage.isLoaded()) {
    getLogger().child('auth.workflow').debug('已处于登录态，跳过登录步骤');
    return homePage;
  }
  return loginAs(user);
}

/**
 * 保证处于未登录状态：已在登录页则直接返回，否则先退出。
 *
 * 与 ensureLoggedIn 成对提供，避免用例为了「回到干净起点」
 * 各自拼一段 if 判断 —— 那类临时代码是用例互相污染的主要来源。
 */
export async function ensureLoggedOut(): Promise<LoginPage> {
  const loginPage = new LoginPage();
  if (await loginPage.isLoaded()) {
    return loginPage;
  }
  return logout();
}
