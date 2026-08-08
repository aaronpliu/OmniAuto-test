import type { AppConfig, ValidationIssue } from '../../contracts/types';
import { ERROR_CODES } from '../../contracts/types';

/**
 * Omni Mock App —— 工程自带、唯一「完整」的示例 App 配置。
 *
 * 设计要点：
 * - iOS / Android 双端 `appId` 一致（`com.omni.mock`），便于 demo 与 dry-run；
 * - `testIdAttribute` 显式声明两平台的 testId 落地属性，LocatorResolver 据此翻译；
 * - `permissions` 预授权相机/相册，规避首次启动的权限弹窗打断自动化；
 * - `binaryPath` 故意不填：mock 是纯 UI 冒烟，运行期由 CI 注入或复用已安装 App。
 */
export const mockAppConfig: AppConfig = {
  key: 'mock',
  displayName: 'Omni Mock App',
  supportedPlatforms: ['ios', 'android'],
  ios: {
    appId: 'com.omni.mock',
  },
  android: {
    appId: 'com.omni.mock',
  },
  testIdAttribute: {
    ios: 'accessibilityIdentifier',
    android: 'content-desc',
  },
  launchArgs: {},
  permissions: {
    camera: 'YES',
    photos: 'YES',
    location: 'unset',
  },
};

/** 校验 App 配置（纯函数，不读 I/O） */
export function validate(config: AppConfig = mockAppConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const platform of config.supportedPlatforms) {
    const binary = platform === 'ios' ? config.ios : config.android;
    if (binary === undefined || binary.appId.trim() === '') {
      issues.push({
        code: ERROR_CODES.CONFIG_MISSING_FIELD,
        path: `app.${platform}.appId`,
        message: `App "${config.key}" 在平台 ${platform} 缺少 appId`,
        severity: 'error',
      });
    }
  }

  if (config.testIdAttribute === undefined) {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'app.testIdAttribute',
      message: '缺少 testIdAttribute 约定，LocatorResolver 无法确定翻译策略',
      severity: 'warning',
      hint: '建议至少声明 ios 与 android 的 testId 属性名',
    });
  }

  return issues;
}
