/**
 * mock App 的测试账号夹具。
 *
 * 【为什么账号是数据而不是散落在用例里的字面量】
 * 同一批账号会被登录、导航、个人中心三个冒烟文件反复使用。
 * 一旦服务端把 standard_user 改名，散落写法要改 N 处、漏一处就是偶发失败；
 * 收敛成常量后只改一处。更重要的是：期望的昵称/邮箱/会员等级与账号绑定在一起，
 * 用例断言时直接引用同一份真理源，杜绝「账号换了但断言里的昵称没换」的低级错误。
 *
 * 本文件不 import 任何东西：夹具是纯数据，不应对框架、页面对象产生依赖。
 */

/** 单个测试账号的完整画像 */
export interface TestUser {
  /** 夹具键名，便于日志定位 */
  readonly key: string;
  readonly username: string;
  readonly password: string;
  /** 登录成功后个人中心应展示的昵称 */
  readonly displayName: string;
  /** 登录成功后个人中心应展示的邮箱 */
  readonly email: string;
  /** 会员等级徽章文案 */
  readonly memberBadge: string;
  /** 历史订单数（个人中心展示值） */
  readonly orderCount: number;
  /** 该账号是否预期能登录成功 */
  readonly canLogin: boolean;
  /** 预期登录失败时，错误提示条中应包含的文案；canLogin 为 true 时为空串 */
  readonly expectedLoginError: string;
}

/** 标准账号：全流程主路径都用它 */
export const STANDARD_USER: TestUser = {
  key: 'standard',
  username: 'standard_user',
  password: 'Passw0rd!',
  displayName: '标准用户',
  email: 'standard_user@omni.test',
  memberBadge: '黄金会员',
  orderCount: 12,
  canLogin: true,
  expectedLoginError: '',
};

/** 被锁定账号：验证服务端风控提示能正确透传到 UI */
export const LOCKED_USER: TestUser = {
  key: 'locked',
  username: 'locked_user',
  password: 'Passw0rd!',
  displayName: '锁定用户',
  email: 'locked_user@omni.test',
  memberBadge: '普通会员',
  orderCount: 0,
  canLogin: false,
  expectedLoginError: '账号已被锁定',
};

/** 密码错误账号：用户名存在但密码不对，验证凭据校验分支 */
export const WRONG_PASSWORD_USER: TestUser = {
  key: 'wrongPassword',
  username: 'standard_user',
  password: 'definitely-wrong',
  displayName: '标准用户',
  email: 'standard_user@omni.test',
  memberBadge: '黄金会员',
  orderCount: 12,
  canLogin: false,
  expectedLoginError: '用户名或密码错误',
};

/**
 * 空凭据「账号」：不是真实账号，而是把「什么都不填」这一输入组合也建模成夹具。
 * 这样表单必填校验用例与其它登录用例保持同一种书写形态，读起来更一致。
 */
export const EMPTY_CREDENTIALS_USER: TestUser = {
  key: 'empty',
  username: '',
  password: '',
  displayName: '',
  email: '',
  memberBadge: '',
  orderCount: 0,
  canLogin: false,
  expectedLoginError: '请输入用户名和密码',
};

/** 全部夹具的索引表，供参数化用例遍历 */
export const USERS = {
  standard: STANDARD_USER,
  locked: LOCKED_USER,
  wrongPassword: WRONG_PASSWORD_USER,
  empty: EMPTY_CREDENTIALS_USER,
} as const;

export type TestUserKey = keyof typeof USERS;

/**
 * 按键名取账号。
 *
 * 相比直接访问 USERS[key]，函数形式能在未来引入「按环境切换账号池」时
 * 保持调用点不变（例如预发环境用另一批账号），是留给后续演进的接缝。
 */
export function getUser(key: TestUserKey): TestUser {
  return USERS[key];
}

/** 预期登录失败的账号集合，供参数化失败用例直接遍历 */
export const LOGIN_FAILURE_USERS: readonly TestUser[] = [
  WRONG_PASSWORD_USER,
  LOCKED_USER,
];
