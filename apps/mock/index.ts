/**
 * mock App 资产统一出口。
 *
 * 【为什么用例只从这一个入口取资产】
 * 用例文件里出现 `../../apps/mock/pages/LoginPage` 这类深路径，等于把目录结构
 * 焊死进了用例。资产重构时上百个用例要跟着改路径 —— 这正是「资产层」应当屏蔽的成本。
 * 统一出口把「资产的内部结构」变成实现细节，用例只依赖 `@apps/mock` 这一个稳定契约。
 *
 * 导出顺序按依赖自底向上：定位器 → 页面对象 → 业务流 → 夹具，
 * 便于阅读时建立分层心智。
 */

/* 定位器：一般只在页面对象内部使用，导出是为了排障时能直接打印 */
export { loginLocators, homeLocators, tabBarLocators, profileLocators } from './locators';

/* 页面对象 */
export { BasePage, LoginPage, HomePage, ProfilePage, type MainTabKey } from './pages';

/* 跨页面业务流 */
export {
  loginAs,
  loginExpectingFailure,
  submitEmptyLoginForm,
  logout,
  ensureLoggedIn,
  ensureLoggedOut,
  gotoTab,
  gotoHome,
  gotoProfile,
  openFirstProductAndGoBack,
  openFirstProductAndPressBack,
  suspendAndResume,
  cycleAllTabs,
} from './workflows';

/* 测试数据夹具 */
export {
  STANDARD_USER,
  LOCKED_USER,
  WRONG_PASSWORD_USER,
  EMPTY_CREDENTIALS_USER,
  USERS,
  LOGIN_FAILURE_USERS,
  getUser,
  type TestUser,
  type TestUserKey,
} from './fixtures/users';
