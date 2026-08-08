/* eslint-disable */
/**
 * ============================================================================
 *  .detoxrc.js —— Detox CLI 根配置
 * ============================================================================
 *
 * 【本文件是 `src/configs/detox/` 的 JS 镜像，修改时两边必须同步】
 *
 * 镜像来源（一一对应，改了任何一边都要改另一边）：
 *   - apps / devices / configurations → src/configs/detox/index.ts
 *                                       （buildDetoxrcObject / buildConfigurationName / buildEntryKeys）
 *   - APP_BINARIES 表的值             → src/configs/apps/*.config.ts
 *                                       经 detox.ios.config.ts / detox.android.config.ts 派生
 *   - behavior / artifacts /
 *     testRunner / session            → src/configs/detox/detox.runner.config.ts
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 【本文件唯一的动态点：apps 段按 OMNI_APP 选包】
 * ────────────────────────────────────────────────────────────────────────────
 * 除了 `apps` 段的 `binaryPath` / `build` / `testBinaryPath` 三个字段会根据
 * `process.env.OMNI_APP` 从 APP_BINARIES 查表取值以外，**本文件其余部分全部是静态字面量**。
 * devices / configurations / behavior / artifacts / testRunner / session 均无任何分支。
 *
 * 为什么 app 维度不进 configuration 名：
 * `buildConfigurationName()` 是 CLI 与本文件之间的契约，格式恒为
 * `<platform>.<deviceShort>.<buildType>`。app 本质上只是「同一台设备装哪个包」，
 * 不该升格成 configuration 身份的一部分，否则要同时改 TS 源、CLI 拼接、文档三处。
 *
 * OMNI_APP 由 CLI 在 childEnv 注入（src/index.ts: `OMNI_APP: String(runConfig.options.app)`），
 * detox CLI 是我们 spawn 的子进程，能继承到。缺省回退 'mock'；未知 app 名直接 throw
 * 并列出可用清单 —— 绝不静默回退，否则会出现「对着错误的包调试半天」。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 【为什么必须是纯 JavaScript，不能 require 任何 .ts】
 * ────────────────────────────────────────────────────────────────────────────
 * Detox CLI 是独立外部进程，它在启动早期用**裸 node**读取本文件，此时既没有 tsx 的
 * loader，也没有 ts-node/register，更没有 tsconfig-paths（本工程未安装）。
 * 一旦本文件 require 了 .ts，或引用了 `@omni` / `@configs/*` 这类 tsconfig paths 别名，
 * detox 会在「还没开始起设备」的阶段就崩在 `Cannot find module`，报错位置极具误导性。
 * 因此这里把 buildDetoxrcObject() 的产物**静态展开成 JS 字面量**。
 *
 * 注意区分：`testRunner.args.config` 指向的是 .ts 的 jest 配置，那是给 jest 的 --config，
 * 由 jest 自带的 ts-node 通道加载（已实测可行），与「本文件自身必须纯 JS」是两件事。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 【运行前置条件 —— 不满足则 Detox 分支跑不起来】
 * ────────────────────────────────────────────────────────────────────────────
 * 1. **需先安装 detox**：`npm i -D detox@^20.20.0`
 *    本工程刻意把 detox / webdriverio 放在 peerDependencies + peerDependenciesMeta.optional，
 *    配合适配器内部 lazy dynamic import()，使得**不装任何框架 SDK 也能通过 tsc、
 *    跑 dry-run、跑定位器翻译**。所以默认 node_modules 里没有 detox，这是设计而非遗漏。
 *
 * 2. **binaryPath 指向的产物必须已构建出来**。四个 App 的 binaryPath 均未在
 *    src/configs/apps/*.config.ts 中显式配置，当前值是按 App key 派生的**约定路径**，
 *    不代表磁盘上已存在该文件。先跑 `build` 字段里的命令产出安装包。
 *
 * 3. **`android.attached.debug` 必须设 `OMNI_DEVICE_UDID`**。
 *    实测（validateDetoxrc 对本文件求值）：
 *      未设 → error=1：`[OMNI_E_CONFIG_MISSING_FIELD] detox.devices.device.adbName:
 *                       android.attached 必须指定 adbName（adb serial）`
 *      已设 → error=0 warning=0
 *    `ios.sim.debug` 与 `android.emu.debug` 两档不依赖该变量。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 【configuration 命名规则】
 * 严格等于 `buildConfigurationName(platform, deviceKind, buildType)`：
 * `<platform>.<deviceShort>.<buildType>`，deviceShort: emulator→emu、real→attached，iOS 恒为 sim。
 * 使用：`OMNI_APP=buyer npx detox test -c android.emu.debug`
 */

'use strict';

/** 产物根目录：与 env.config.ts 的 pickString(entries,'OMNI_ARTIFACTS_DIR','reports') 等价 */
const artifactsRootDir = process.env.OMNI_ARTIFACTS_DIR || 'reports';

/**
 * android.attached 的 adb serial。
 * 留空时 detox 仅在「有且仅有一台已连接设备」时能自动选中，多台会报错。
 * 与 devices/android.real.config.ts 的 udid 校验语义一致。
 */
const attachedAdbName = process.env.OMNI_DEVICE_UDID || '';

/**
 * App 产物查找表 —— 值由 buildDetoxrcObject() 对四个 App 实跑反向导出，非手抄（零漂移）。
 *
 * 【Android 走 product flavor 维度，flavor 名恒等于 App key】
 * iOS 侧按 scheme 天然区分四个包；Android 侧必须对称地靠 Gradle product flavor 区分，
 * 否则四个 App 会回退到同一份 `app-debug.apk`，在 Android 上切换 OMNI_APP 形同虚设。
 * 约定（flavor = app key，首字母大写即为 Variant 前缀，如 buyer → Buyer）：
 *   binaryPath      : android/app/build/outputs/apk/<flavor>/<buildType>/app-<flavor>-<buildType>.apk
 *   testBinaryPath  : android/app/build/outputs/apk/androidTest/<flavor>/<buildType>/app-<flavor>-<buildType>-androidTest.apk
 *                       （注意：test apk 多嵌一层 androidTest/，与正式 apk 的目录布局不同）
 *   build           : cd android && ./gradlew assemble<Flavor><BuildType> assemble<Flavor><BuildType>AndroidTest -DtestBuildType=<buildType>
 *
 * ── 约束 1：显式配置优先级仍生效 ──
 * 若某个 App 在 apps/<key>.config.ts 显式填了 `android.binaryPath`，它**必须**覆盖上面的
 * flavor 约定推导（这是最先被打穿的一处）。约定推导只是「未填时的默认值」，绝不反向覆盖
 * 团队主动写死的值 —— 否则会让人对着一条自己从没设过的路径 debug 半天。
 *
 * ── 约束 3（前置条件，不满足则 spawn gradle 直接失败）：`android/app/build.gradle` 必须声明 ──
 *   android {
 *     flavorDimensions 'app'
 *     productFlavors {
 *       mock   {}
 *       buyer  {}
 *       seller {}
 *       wallet {}
 *     }
 *   }
 * 否则 `assembleBuyerDebug` / `assembleBuyerDebugAndroidTest` 这类按 flavor 拼出的 Gradle task
 * 根本不存在，build 字段一跑就报：
 *   > Task 'assembleBuyerDebug' not found in project ':app'.
 * 这是「约定推导」能成立的前提，必须先让宿主工程补齐 flavor 维度。
 */
const APP_BINARIES = {
  mock: {
    ios: {
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/OmniMock.app',
      build:
        'xcodebuild -workspace ios/OmniMock.xcworkspace -scheme OmniMock ' +
        '-configuration Debug -sdk iphonesimulator -derivedDataPath ios/build -quiet build',
    },
    android: {
      binaryPath: 'android/app/build/outputs/apk/mock/debug/app-mock-debug.apk',
      build: 'cd android && ./gradlew assembleMockDebug assembleMockDebugAndroidTest -DtestBuildType=debug',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/mock/debug/app-mock-debug-androidTest.apk',
    },
  },
  buyer: {
    ios: {
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/OmniBuyer.app',
      build:
        'xcodebuild -workspace ios/OmniBuyer.xcworkspace -scheme OmniBuyer ' +
        '-configuration Debug -sdk iphonesimulator -derivedDataPath ios/build -quiet build',
    },
    android: {
      binaryPath: 'android/app/build/outputs/apk/buyer/debug/app-buyer-debug.apk',
      build: 'cd android && ./gradlew assembleBuyerDebug assembleBuyerDebugAndroidTest -DtestBuildType=debug',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/buyer/debug/app-buyer-debug-androidTest.apk',
    },
  },
  seller: {
    ios: {
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/OmniSeller.app',
      build:
        'xcodebuild -workspace ios/OmniSeller.xcworkspace -scheme OmniSeller ' +
        '-configuration Debug -sdk iphonesimulator -derivedDataPath ios/build -quiet build',
    },
    android: {
      binaryPath: 'android/app/build/outputs/apk/seller/debug/app-seller-debug.apk',
      build: 'cd android && ./gradlew assembleSellerDebug assembleSellerDebugAndroidTest -DtestBuildType=debug',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/seller/debug/app-seller-debug-androidTest.apk',
    },
  },
  wallet: {
    ios: {
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/OmniWallet.app',
      build:
        'xcodebuild -workspace ios/OmniWallet.xcworkspace -scheme OmniWallet ' +
        '-configuration Debug -sdk iphonesimulator -derivedDataPath ios/build -quiet build',
    },
    android: {
      binaryPath: 'android/app/build/outputs/apk/wallet/debug/app-wallet-debug.apk',
      build: 'cd android && ./gradlew assembleWalletDebug assembleWalletDebugAndroidTest -DtestBuildType=debug',
      testBinaryPath: 'android/app/build/outputs/apk/androidTest/wallet/debug/app-wallet-debug-androidTest.apk',
    },
  },
};

/**
 * 解析当前 App。
 * 缺省 'mock'；未知名字**立即 throw 并列出可用清单**，不静默回退 ——
 * 静默回退会让人对着错误的包调试半天，是最昂贵的一类错误。
 */
function resolveAppBinaries() {
  const raw = process.env.OMNI_APP;
  const key = raw === undefined || raw.trim() === '' ? 'mock' : raw.trim();
  const entry = APP_BINARIES[key];
  if (entry === undefined) {
    const available = Object.keys(APP_BINARIES).join(' / ');
    throw new Error(
      `[.detoxrc.js] 未知的 OMNI_APP='${key}'。可用值：${available}。` +
        '（若确实新增了 App，请同步更新 src/configs/apps/ 与本文件的 APP_BINARIES 表）',
    );
  }
  return entry;
}

const appBinaries = resolveAppBinaries();

module.exports = {
  /* ══════════════════ apps：装哪个包、怎么构建（唯一动态段） ══════════════════ */
  apps: {
    // 键名来自 buildEntryKeys() → `ios.${buildType}`
    'ios.debug': {
      type: 'ios.app',
      binaryPath: appBinaries.ios.binaryPath,
      build: appBinaries.ios.build,
      launchArgs: {},
    },
    // 键名来自 buildEntryKeys() → `android.${buildType}`
    'android.debug': {
      type: 'android.apk',
      binaryPath: appBinaries.android.binaryPath,
      // assembleAndroidTest 不能省：Detox 的 Android 驱动依赖 androidTest apk 注入
      build: appBinaries.android.build,
      testBinaryPath: appBinaries.android.testBinaryPath,
      launchArgs: {},
    },
  },

  /* ══════════════════ devices：起哪台设备（静态） ══════════════════ */
  devices: {
    'ios.simulator': {
      type: 'ios.simulator',
      device: {
        type: 'iPhone 15',
        os: 'iOS 17.5',
      },
    },
    'android.emulator': {
      type: 'android.emulator',
      device: {
        avdName: 'Pixel_6_API_34',
      },
      // -no-snapshot 保证每轮从干净状态起，避免上一轮残留状态污染用例
      bootArgs: '-no-snapshot -no-boot-anim -no-audio',
      headless: false,
      gpuMode: 'auto',
    },
    'android.attached': {
      type: 'android.attached',
      device: {
        adbName: attachedAdbName,
      },
    },
  },

  /* ══════════════════ configurations：CLI -c 用的就是这些键（静态） ══════════════════ */
  configurations: {
    'ios.sim.debug': {
      device: 'ios.simulator',
      app: 'ios.debug',
    },
    'android.emu.debug': {
      device: 'android.emulator',
      app: 'android.debug',
    },
    'android.attached.debug': {
      device: 'android.attached',
      app: 'android.debug',
    },
  },

  /* ══════════════════ behavior（静态） ══════════════════ */
  behavior: {
    init: {
      /**
       * 恒为 false：Detox 默认把 device/element/by/expect 注入全局，
       * 会诱导用例作者写出 Detox 专有 API（编译期不报错、换框架才崩），
       * 违反本工程「一份脚本零改动跑三套框架」的承诺。
       * 注意：关掉后用例里需显式 `import { device, element, by } from 'detox'`。
       */
      exposeGlobals: false,
      reinstallApp: true,
    },
    launchApp: 'auto',
    cleanup: {
      // 不关设备：下一轮可复用已启动的模拟器，省 30~90s 冷启动
      shutdownDevice: false,
    },
  },

  /* ══════════════════ artifacts（静态） ══════════════════ */
  artifacts: {
    rootDir: artifactsRootDir,
    plugins: {
      screenshot: {
        enabled: true,
        shouldTakeAutomaticSnapshots: false,
        keepOnlyFailedTestsArtifacts: true,
        takeWhen: {
          testStart: false,
          testDone: true,
          appNotReady: true,
        },
      },
      video: 'none',
      log: 'all',
      instruments: 'none',
      uiHierarchy: 'disabled',
    },
  },

  /* ══════════════════ testRunner：Detox 反向拉起 jest（静态） ══════════════════ */
  testRunner: {
    args: {
      $0: 'jest',
      /**
       * 指向 TS 版 jest 配置。已实测 jest 能直接加载 .ts 配置：
       *   ./node_modules/.bin/jest --config src/configs/jest/jest.detox.config.ts --showConfig
       * 成功输出完整 config（ts-node 已装，且该链路只用相对导入、不含 paths 别名）。
       * 所以不需要再造一个纯 JS 的 jest 配置入口（那会制造第二个真相源）。
       */
      config: 'src/configs/jest/jest.detox.config.ts',
      // 恒为 1：单设备下多 worker 会互相抢占设备
      maxWorkers: 1,
      _: [],
    },
    jest: {
      // 180000 来自 defaultTestConfig.timeouts.hookMs（不是 runner 默认的 300000）
      setupTimeout: 180000,
      teardownTimeout: 60000,
      retryAfterCircusRetries: false,
    },
    // 透传宿主机环境变量，否则 .env 里的凭据在用例进程里读不到
    forwardEnv: true,
    // 重试统一交给 jest / 本工程管理，避免两层重试相乘
    retries: 0,
  },

  /* ══════════════════ session（静态） ══════════════════ */
  session: {
    autoStart: true,
    // 等待 App 空闲超过 10s 时打印 busy 资源清单——排查 Detox 超时的唯一有效手段
    debugSynchronization: 10000,
  },
};
