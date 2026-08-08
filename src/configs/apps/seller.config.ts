import type { AppConfig, ValidationIssue } from '../../contracts/types';
import { ERROR_CODES } from '../../contracts/types';

/**
 * seller App —— 占位配置（PRD Q-5）。
 * `binaryPath` 故意留空：真实安装包由团队在接入时填充，
 * 空值仅产生 warning 级 issue，不阻塞 dry-run 与配置加载。
 */
export const sellerAppConfig: AppConfig = {
  key: 'seller',
  displayName: 'Omni Seller App',
  supportedPlatforms: ['ios', 'android'],
  ios: {
    appId: 'com.omni.seller',
  },
  android: {
    appId: 'com.omni.seller',
  },
  testIdAttribute: {
    ios: 'accessibilityIdentifier',
    android: 'content-desc',
  },
};

/** 校验 seller App 配置（纯函数，不读 I/O） */
export function validate(config: AppConfig = sellerAppConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (config.ios?.binaryPath === undefined) {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'app.ios.binaryPath',
      message: 'seller App 的 iOS 安装包路径尚未配置',
      severity: 'warning',
      hint: '接入真实 App 后通过 ios.binaryPath 填入 .app/.ipa 路径',
    });
  }
  if (config.android?.binaryPath === undefined) {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'app.android.binaryPath',
      message: 'seller App 的 Android 安装包路径尚未配置',
      severity: 'warning',
      hint: '接入真实 App 后通过 android.binaryPath 填入 .apk 路径',
    });
  }
  return issues;
}
