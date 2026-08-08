import type {
  AppConfig,
  AppKey,
  AppPlatformBinary,
  Platform,
  ValidationIssue,
} from '../../contracts/types';
import {
  BUILTIN_APP_KEYS,
  ConfigValidationError,
  ERROR_CODES,
  InvalidCombinationError,
} from '../../contracts/types';

import { buyerAppConfig, validate as validateBuyer } from './buyer.config';
import { mockAppConfig, validate as validateMock } from './mock.config';
import { sellerAppConfig, validate as validateSeller } from './seller.config';
import { walletAppConfig, validate as validateWallet } from './wallet.config';

/**
 * App 注册表 —— 五级合并链中「App 级」配置的唯一入口。
 *
 * 【为什么用注册表而不是 switch】
 * `resolveApp('mock')` 用 switch 实现的话，每新增一个业务 App 都要改动 CLI 的解析分支，
 * 而注册表让新增只需两步：写一个 `xxx.config.ts` + 在此表加一行。
 * 更关键的是，注册表可以被**反向遍历** ——
 * `--help` 要列出所有可用 App、dry-run 要体检所有 App 配置，
 * 这两件事在 switch 结构下无法实现（switch 无法枚举自己的分支）。
 *
 * 【未知 key 为什么抛 ConfigValidationError 而不是返回 undefined】
 * `AppKey` 的类型是 `BuiltinAppKey | (string & {})`，
 * 这个「开放字符串」设计允许用户扩展自己的 App，代价是**类型系统不再拦截拼写错误**。
 * 如果这里返回 `undefined`，错误会顺着调用链一路漂到
 * 「binaryPath 为 undefined → 安装失败 → 设备报 App not found」才暴露，
 * 那时的报错与真正的原因（`--app=moc` 少打一个 k）完全无关。
 * 所以在入口处就抛，并在 hint 里列出所有合法值 —— 这是排查成本最低的位置。
 */
export const APP_REGISTRY: Readonly<Record<string, AppConfig>> = {
  mock: mockAppConfig,
  buyer: buyerAppConfig,
  seller: sellerAppConfig,
  wallet: walletAppConfig,
};

/** 各 App 的独立校验函数表，供 validateAllApps 遍历调用 */
const APP_VALIDATORS: Readonly<Record<string, (config?: AppConfig) => ValidationIssue[]>> = {
  mock: validateMock,
  buyer: validateBuyer,
  seller: validateSeller,
  wallet: validateWallet,
};

/** 列出所有已注册的 App key */
export function listAppKeys(): string[] {
  return Object.keys(APP_REGISTRY);
}

/** 列出所有已注册的 App 配置 */
export function listApps(): AppConfig[] {
  return listAppKeys().map((key) => {
    const config = APP_REGISTRY[key];
    /* istanbul ignore next -- key 来自 Object.keys，必然存在 */
    if (config === undefined) {
      throw new Error(`APP_REGISTRY 内部不一致：key '${key}' 无对应配置`);
    }
    return config;
  });
}

/** 判断某个 key 是否已注册 */
export function isAppRegistered(key: AppKey): boolean {
  return Object.prototype.hasOwnProperty.call(APP_REGISTRY, String(key));
}

/**
 * 解析 App 配置。
 *
 * @throws {ConfigValidationError} key 未注册
 */
export function resolveApp(key: AppKey): AppConfig {
  const normalized = String(key).trim();
  const config = APP_REGISTRY[normalized];

  if (config === undefined) {
    const available = listAppKeys().join(' | ');
    throw new ConfigValidationError(
      [
        {
          code: ERROR_CODES.CONFIG_INVALID,
          path: 'options.app',
          message: `未知的 App key '${normalized}'`,
          severity: 'error',
          hint: `可用值：${available}。`
            + '若要新增业务 App，请在 src/configs/apps/ 下添加 <key>.config.ts 并注册到 APP_REGISTRY',
        },
      ],
      `未知的 App key '${normalized}'，可用值：${available}`,
    );
  }

  return config;
}

/**
 * 取出 App 在指定平台上的二进制信息。
 *
 * @throws {InvalidCombinationError} App 不支持该平台，或缺少该平台的配置块
 */
export function resolveAppPlatform(app: AppConfig, platform: Platform): AppPlatformBinary {
  // 先查声明：supportedPlatforms 是 App 作者的显式意图，比「有没有 ios 字段」更权威
  if (!app.supportedPlatforms.includes(platform)) {
    throw new InvalidCombinationError(
      { app: app.key, platform },
      [
        {
          code: ERROR_CODES.INVALID_COMBINATION,
          path: 'options.platform',
          message: `App '${String(app.key)}'（${app.displayName}）不支持 ${platform} 平台`,
          severity: 'error',
          hint: `该 App 声明支持的平台为：${app.supportedPlatforms.join(' | ')}`,
        },
      ],
    );
  }

  const binary = platform === 'ios' ? app.ios : app.android;

  // 声明支持但没有配置块 —— 属于 App 配置自身的疏漏，报错要指向配置文件而非用户输入
  if (binary === undefined) {
    throw new InvalidCombinationError(
      { app: app.key, platform },
      [
        {
          code: ERROR_CODES.CONFIG_MISSING_FIELD,
          path: `app.${platform}`,
          message: `App '${String(app.key)}' 声明支持 ${platform}，但缺少对应的 ${platform} 配置块`,
          severity: 'error',
          hint: `请在 src/configs/apps/${String(app.key)}.config.ts 中补充 ${platform} 字段（至少需要 appId）`,
        },
      ],
    );
  }

  return binary;
}

/**
 * 解析 App 在指定平台上的应用标识（iOS bundleId / Android package）。
 *
 * @throws {InvalidCombinationError} 平台不受支持或配置缺失
 */
export function resolveAppId(app: AppConfig, platform: Platform): string {
  return resolveAppPlatform(app, platform).appId;
}

/**
 * 解析 App 在指定平台上的安装包路径（**保持原样，不做绝对化**）。
 *
 * 绝对化交给 `configs/index.ts#resolveRunConfig` 统一处理：
 * 本层是纯数据层，一旦在这里调 `toAbsolutePath` 就把工程根解析（含 fs 回溯）
 * 引入了每一次 App 查询，dry-run 与单测都会被文件系统绑架。
 *
 * @returns 未配置安装包时返回 undefined（部分 App 依赖设备上已装好的版本）
 */
export function resolveAppBinaryPath(app: AppConfig, platform: Platform): string | undefined {
  const binary = resolveAppPlatform(app, platform);
  const raw = binary.binaryPath;
  return raw !== undefined && raw.trim() !== '' ? raw : undefined;
}

/**
 * 校验单个 App 配置 = 该 App 的专属校验 + 通用结构校验，去重后返回。
 *
 * 【为什么两者都要跑，而不是「有专属就只跑专属」】
 * 早期实现是「专属校验器存在就直接 return」，实测结果是 `validateAppShape`
 * 对四个内置 App 全部形同虚设 —— 它里面那条「Android 缺 launchActivity」的告警
 * 从来没有机会触发，而这恰恰是最容易漏配、也最难排查的一项
 * （现象是 App 启动到了错误的 Activity，而不是干脆启动失败）。
 * 专属校验器负责业务约束，结构校验负责通用底线，两者是**互补**而非**替代**关系。
 *
 * 去重键取 `code + path + message` 三元组：
 * 两边都检查 appId 为空是正常的（各自的关注点碰巧重叠），
 * 但同一条问题在报告里出现两遍会显著降低可读性。
 */
export function validateApp(app: AppConfig): ValidationIssue[] {
  const validator = APP_VALIDATORS[String(app.key)];
  const specific = validator !== undefined ? validator(app) : [];
  const shape = validateAppShape(app);

  const seen = new Set<string>();
  const merged: ValidationIssue[] = [];

  for (const issue of [...specific, ...shape]) {
    const dedupeKey = `${issue.code}|${issue.path}|${issue.message}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    merged.push(issue);
  }

  return merged;
}

/**
 * 通用 App 结构校验（对任意 AppConfig 生效，不依赖具体 App 的校验器）。
 *
 * 与各 `xxx.config.ts` 里的 `validate()` 是互补关系：
 * 后者检查该 App 的业务专属约束（如 mock 必须有 testIdAttribute），
 * 这里只检查**任何 App 都必须满足**的结构性要求。
 */
export function validateAppShape(app: AppConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const key = String(app.key);

  if (key.trim() === '') {
    issues.push({
      code: ERROR_CODES.CONFIG_MISSING_FIELD,
      path: 'app.key',
      message: 'App key 不能为空',
      severity: 'error',
    });
  }

  if (app.supportedPlatforms.length === 0) {
    issues.push({
      code: ERROR_CODES.CONFIG_INVALID,
      path: `app.${key}.supportedPlatforms`,
      message: `App '${key}' 未声明任何支持的平台，无论怎么调用都会被判为非法组合`,
      severity: 'error',
      hint: "至少声明 ['ios'] 或 ['android'] 之一",
    });
  }

  for (const platform of app.supportedPlatforms) {
    const binary = platform === 'ios' ? app.ios : app.android;
    if (binary === undefined) {
      issues.push({
        code: ERROR_CODES.CONFIG_MISSING_FIELD,
        path: `app.${key}.${platform}`,
        message: `声明支持 ${platform} 却没有 ${platform} 配置块`,
        severity: 'error',
      });
      continue;
    }

    if (binary.appId.trim() === '') {
      issues.push({
        code: ERROR_CODES.CONFIG_MISSING_FIELD,
        path: `app.${key}.${platform}.appId`,
        message: `${platform} 的 appId 为空，无法定位 App`,
        severity: 'error',
        hint: platform === 'ios' ? '填写 bundleId，如 com.omni.mock' : '填写 package name，如 com.omni.mock',
      });
    }

    // Android 没有 launchActivity 时，Appium 需要靠 dumpsys 猜测入口，偶发失败且难排查
    if (platform === 'android' && (binary.launchActivity === undefined || binary.launchActivity.trim() === '')) {
      issues.push({
        code: ERROR_CODES.CONFIG_MISSING_FIELD,
        path: `app.${key}.android.launchActivity`,
        message: '未配置 launchActivity，框架需自行推断启动入口，多 Activity 的 App 上可能启动到错误页面',
        severity: 'warning',
        hint: '可执行 `adb shell dumpsys package <package> | grep -A1 MAIN` 查看',
      });
    }
  }

  return issues;
}

/**
 * 校验全部已注册 App。
 *
 * 返回聚合后的问题列表而**不抛错** —— 这是给 `--dry-run` 体检报告用的，
 * 目的是一次性把所有 App 的问题都摊开给用户看。
 * 真正的「有 error 就中止」由 `configs/index.ts#resolveRunConfig` 针对**本次要用的那个 App** 执行。
 */
export function validateAllApps(): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const key of listAppKeys()) {
    const app = APP_REGISTRY[key];
    if (app === undefined) {
      continue;
    }
    issues.push(...validateApp(app));
  }

  // 内置 key 必须全部在注册表里，否则 --help 会漏列
  for (const builtinKey of BUILTIN_APP_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(APP_REGISTRY, builtinKey)) {
      issues.push({
        code: ERROR_CODES.CONFIG_MISSING_FIELD,
        path: 'APP_REGISTRY',
        message: `内置 App '${builtinKey}' 在 BUILTIN_APP_KEYS 中声明，却未注册到 APP_REGISTRY`,
        severity: 'error',
        hint: '两者必须保持同步，否则 CLI 的 --help 与实际可用值不一致',
      });
    }
  }

  return issues;
}

export { buyerAppConfig } from './buyer.config';
export { mockAppConfig } from './mock.config';
export { sellerAppConfig } from './seller.config';
export { walletAppConfig } from './wallet.config';
export { validate as validateBuyerApp } from './buyer.config';
export { validate as validateMockApp } from './mock.config';
export { validate as validateSellerApp } from './seller.config';
export { validate as validateWalletApp } from './wallet.config';
