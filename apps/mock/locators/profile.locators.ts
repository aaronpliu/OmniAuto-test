import { defineLocator, defineLocators } from '@omni';

/**
 * 个人中心定位器集合。
 *
 * 本页大量控件都位于同一个可滚动的设置列表内，因此把列表容器抽成常量
 * 并作为各行的 ancestor —— 这样「列表整体换了 testId」只需改一行，
 * 也让 scrollTo 的容器参数与 ancestor 约束天然一致，不会出现
 * 「在 A 容器里滚动、却按 B 容器的层级去找元素」这种隐蔽错误。
 */

const settingsList = defineLocator({
  testId: 'profile_settings_list',
  type: 'scrollView',
  description: '个人中心设置项滚动容器',
});

const logoutConfirmDialog = defineLocator({
  testId: 'logout_confirm_dialog',
  type: 'alert',
  description: '退出登录二次确认弹窗',
});

export const profileLocators = defineLocators({
  screen: {
    testId: 'profile_screen',
    type: 'other',
    description: '个人中心根容器',
  },

  avatar: {
    testId: 'profile_avatar',
    type: 'image',
    description: '用户头像',
  },

  userName: {
    testId: 'profile_user_name',
    type: 'text',
    description: '用户昵称文本',
  },

  userEmail: {
    testId: 'profile_user_email',
    type: 'text',
    description: '用户邮箱文本',
  },

  memberBadge: {
    testId: 'profile_member_badge',
    type: 'text',
    description: '会员等级徽章',
  },

  orderCountValue: {
    testId: 'profile_order_count',
    type: 'text',
    description: '历史订单数量数值',
  },

  settingsList,

  /**
   * 【平台差异示例 ④】推送通知开关。
   *
   * iOS 是原生 UISwitch（profile_notification_switch）；
   * Android 侧因为要兼容低版本用了 SwitchCompat，构建时会给它带上 _compat 后缀。
   * 差异仅体现在 testId 上，ancestor（设置列表）两端一致 ——
   * flattenForPlatform 只覆盖 override 中显式给出的字段，
   * 所以这里不必把 ancestor 在覆盖块里重复一遍。
   */
  notificationSwitch: {
    testId: 'profile_notification_switch',
    type: 'switch',
    ancestor: settingsList,
    description: '设置列表中的「推送通知」开关',
    platform: {
      android: { testId: 'profile_notification_switch_compat' },
    },
  },

  darkModeSwitch: {
    testId: 'profile_dark_mode_switch',
    type: 'switch',
    ancestor: settingsList,
    description: '设置列表中的「深色模式」开关',
  },

  aboutRow: {
    testId: 'profile_about_row',
    type: 'cell',
    ancestor: settingsList,
    description: '设置列表中的「关于」行',
  },

  aboutVersionText: {
    testId: 'about_version_text',
    type: 'text',
    description: '关于页版本号文本',
  },

  /**
   * 【层级约束示例 ④】退出登录按钮。
   *
   * 它位于设置列表最底部，首屏不可见，必须先在 settingsList 内滚动才能命中；
   * ancestor 与滚动容器保持同一常量，避免两者失配。
   */
  logoutButton: {
    testId: 'profile_logout_button',
    type: 'button',
    ancestor: settingsList,
    description: '设置列表底部的「退出登录」按钮',
  },

  logoutConfirmDialog,

  /**
   * 【层级约束示例 ⑤】确认弹窗内的「确定」。
   *
   * 「确定」这种通用文案在 App 里到处都是，不用 ancestor 收敛几乎必然误命中。
   */
  logoutConfirmButton: {
    testId: 'logout_confirm_ok',
    type: 'button',
    ancestor: logoutConfirmDialog,
    description: '退出确认弹窗中的「确定」按钮',
  },

  logoutCancelButton: {
    testId: 'logout_confirm_cancel',
    type: 'button',
    ancestor: logoutConfirmDialog,
    description: '退出确认弹窗中的「取消」按钮',
  },
});
