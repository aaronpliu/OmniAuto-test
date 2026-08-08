/**
 * mock App 业务流统一出口。
 *
 * 用例层只认这一层的语义（loginAs / gotoTab / suspendAndResume），
 * 不需要知道背后经过了几个页面对象。
 */
export {
  loginAs,
  loginExpectingFailure,
  submitEmptyLoginForm,
  logout,
  ensureLoggedIn,
  ensureLoggedOut,
} from './auth.workflow';

export {
  gotoTab,
  gotoHome,
  gotoProfile,
  openFirstProductAndGoBack,
  openFirstProductAndPressBack,
  suspendAndResume,
  cycleAllTabs,
} from './navigation.workflow';
