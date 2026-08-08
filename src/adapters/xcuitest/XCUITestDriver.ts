import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as nodeHttp from 'node:http';
import { randomUUID } from 'node:crypto';

import type {
  FrameworkKind,
  HealthCheckResult,
  ILogger,
  Platform,
  ResolvedRunConfig,
  XCUITestBridgeConfig,
  XCUITestFrameworkConfig,
} from '../../contracts/types';
import {
  AdapterNotInitializedError,
  BridgeError,
  DriverConnectionError,
  ElementNotFoundError,
} from '../../contracts/types';
import type { IFrameworkDriver } from '../../contracts/IActions';
import type { NativeSelector } from '../../contracts/IElementLocator';
import { sleep } from '../../utils/wait';
import type { BridgeQuery } from './XCUITestLocatorResolver';

/**
 * XCUITest 驱动：子进程 + NDJSON 桥接。
 *
 * 【为什么是子进程而不是 npm 包】
 * XCUITest 是 Xcode 的原生测试框架，只能由 `xcodebuild test-without-building` 在 macOS 上驱动，
 * 根本不存在可被 Node 直接调用的 JS SDK。所以本驱动的职责是：
 * 拉起 xcodebuild 子进程 → 与其中运行的 Swift Runner 建立一条命令通道 → 把统一动作翻译成桥接命令。
 *
 * 【为什么协议帧要加 `@OMNI@` 前缀】
 * xcodebuild 会往 stdout 狂喷编译/测试日志，Runner 的 NDJSON 帧混在其中。
 * 若只按「能 JSON.parse 的行」筛选，xcodebuild 偶尔输出的 JSON 片段会被误认成协议帧。
 * 加一个固定哨兵前缀，筛选就变成 O(1) 的字符串比较且零误判，非协议行原样降级为 debug 日志。
 *
 * 【本文件零第三方 import】
 * 只用 node 内置模块。XCUITest 不需要任何 npm 包，这也是它在 `requiredPackages` 为空的原因。
 */

/* ═══════════════ 协议常量与帧类型 ═══════════════ */

/** 协议帧行前缀哨兵 */
export const BRIDGE_LINE_PREFIX = '@OMNI@';

/** 本驱动实现的协议版本，与 Swift Runner 握手时比对 */
export const BRIDGE_PROTOCOL_VERSION = 1;

/** 默认 xcrun 路径 */
export const DEFAULT_XCRUN_PATH = '/usr/bin/xcrun';

/** Driver → Runner 的请求帧 */
export interface BridgeRequestFrame {
  readonly id: string;
  readonly type: 'request';
  readonly command: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Runner → Driver 的响应帧 */
export interface BridgeResponseFrame {
  readonly id: string;
  readonly type: 'response';
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: {
    readonly code?: string;
    readonly message: string;
    readonly stack?: string;
  };
}

/** Runner → Driver 的握手帧 */
export interface BridgeReadyFrame {
  readonly type: 'ready';
  readonly protocolVersion: number;
  readonly runnerVersion?: string;
  readonly appId?: string;
  readonly device?: Readonly<Record<string, unknown>>;
}

/** Runner → Driver 的日志帧 */
export interface BridgeLogFrame {
  readonly type: 'log';
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly message: string;
}

export type BridgeFrame = BridgeResponseFrame | BridgeReadyFrame | BridgeLogFrame;

/** 元素句柄：Runner 侧持有真正的 XCUIElement，Node 侧只拿一个不透明 id */
export interface XCUITestElementHandle {
  readonly handle: string;
  readonly description: string;
  /** Runner 返回的快照属性（可选，findElement 时顺带带回，省一次往返） */
  readonly snapshot?: XCUITestElementSnapshot;
}

/** 元素属性快照 */
export interface XCUITestElementSnapshot {
  readonly identifier?: string;
  readonly label?: string;
  readonly value?: string;
  readonly title?: string;
  readonly placeholderValue?: string;
  readonly elementType?: string;
  readonly enabled?: boolean;
  readonly selected?: boolean;
  readonly visible?: boolean;
  readonly hittable?: boolean;
  readonly frame?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

/** 暴露给上层的会话对象 */
export interface XCUITestSession {
  /** 下发一条桥接命令 */
  readonly send: <T = unknown>(
    command: string,
    params?: Readonly<Record<string, unknown>>,
    timeoutMs?: number,
  ) => Promise<T>;
  readonly isReady: () => boolean;
  readonly protocolVersion: number;
  readonly pid: number | undefined;
  readonly mode: 'stdio' | 'http';
}

/* ═══════════════ 传输层 ═══════════════ */

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  readonly timer: NodeJS.Timeout;
  readonly command: string;
}

/** 传输层抽象：stdio 与 http 两种模式共用同一套 send/dispose 语义 */
interface BridgeTransport {
  start(): Promise<BridgeReadyFrame>;
  send<T>(command: string, params: Readonly<Record<string, unknown>>, timeoutMs: number): Promise<T>;
  dispose(): Promise<void>;
  isAlive(): boolean;
  readonly pid: number | undefined;
}

interface TransportSpawnSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 基于 stdio 的 NDJSON 传输。
 * 请求写入子进程 stdin，响应从 stdout 逐行读出，用 id 在 pending 表中配对。
 */
class StdioBridgeTransport implements BridgeTransport {
  private child: ChildProcessWithoutNullStreams | undefined = undefined;
  private stdoutBuffer = '';
  private stderrTail: string[] = [];
  private readonly pending = new Map<string, PendingRequest>();
  private ready: BridgeReadyFrame | undefined = undefined;
  private exited = false;
  private exitInfo: { code: number | null; signal: NodeJS.Signals | null } | undefined = undefined;

  constructor(
    private readonly spec: TransportSpawnSpec,
    private readonly bridge: XCUITestBridgeConfig,
    private readonly logger: ILogger,
  ) {}

  get pid(): number | undefined {
    return this.child?.pid;
  }

  isAlive(): boolean {
    return this.child !== undefined && !this.exited;
  }

  async start(): Promise<BridgeReadyFrame> {
    const child = spawn(this.spec.command, [...this.spec.args], {
      cwd: this.spec.cwd,
      env: { ...process.env, ...this.spec.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;
    this.child = child;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    child.stderr.on('data', (chunk: string) => this.onStderr(chunk));

    child.on('error', (error: Error) => {
      this.exited = true;
      this.rejectAllPending(new BridgeError(`Runner 进程启动失败：${error.message}`, {
        command: this.spec.command,
      }, error));
    });
    child.on('exit', (code, signal) => {
      this.exited = true;
      this.exitInfo = { code, signal };
      this.rejectAllPending(new BridgeError(
        `Runner 进程已退出（code=${String(code)} signal=${String(signal)}）`,
        { code, signal, stderr: this.stderrTail.join('\n') },
      ));
    });

    return await this.awaitHandshake();
  }

  private async awaitHandshake(): Promise<BridgeReadyFrame> {
    const deadline = Date.now() + this.bridge.handshakeTimeoutMs;
    for (;;) {
      if (this.ready !== undefined) {
        return this.ready;
      }
      if (this.exited) {
        throw new BridgeError(
          `Runner 在完成握手前退出（code=${String(this.exitInfo?.code)}）`,
          { stderr: this.stderrTail.join('\n') },
        );
      }
      if (Date.now() >= deadline) {
        // 握手超时几乎总是「Swift 侧 Runner 尚未实现或未按协议输出 ready 帧」，
        // 这里把 stderr 尾部一起带出去，避免使用者对着一句「超时」无从下手
        throw new BridgeError(
          `等待 Runner 握手超时（${String(this.bridge.handshakeTimeoutMs)}ms）`,
          {
            expectPrefix: BRIDGE_LINE_PREFIX,
            expectFrame: { type: 'ready', protocolVersion: BRIDGE_PROTOCOL_VERSION },
            stderr: this.stderrTail.join('\n'),
          },
        );
      }
      await sleep(50);
    }
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newlineIndex = this.stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).replace(/\r$/, '');
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
      this.handleLine(line);
      newlineIndex = this.stdoutBuffer.indexOf('\n');
    }
  }

  private onStderr(chunk: string): void {
    for (const line of chunk.split('\n')) {
      if (line.trim() === '') {
        continue;
      }
      this.stderrTail.push(line);
      if (this.stderrTail.length > 50) {
        this.stderrTail.shift();
      }
      this.logger.debug(`[runner:stderr] ${line}`);
    }
  }

  private handleLine(rawLine: string): void {
    const line = rawLine.trim();
    if (line === '') {
      return;
    }
    if (!line.startsWith(BRIDGE_LINE_PREFIX)) {
      this.logger.debug(`[runner:stdout] ${line}`);
      return;
    }
    const payload = line.slice(BRIDGE_LINE_PREFIX.length);
    let frame: BridgeFrame;
    try {
      frame = JSON.parse(payload) as BridgeFrame;
    } catch (error) {
      this.logger.warn(`桥接帧解析失败，已忽略：${errorMessage(error)}`, { payload });
      return;
    }
    this.dispatchFrame(frame);
  }

  private dispatchFrame(frame: BridgeFrame): void {
    if (frame.type === 'ready') {
      this.ready = frame;
      this.logger.debug('收到 Runner 握手帧', {
        protocolVersion: frame.protocolVersion,
        runnerVersion: frame.runnerVersion,
      });
      return;
    }
    if (frame.type === 'log') {
      const level = frame.level;
      if (level === 'error') this.logger.error(`[runner] ${frame.message}`);
      else if (level === 'warn') this.logger.warn(`[runner] ${frame.message}`);
      else if (level === 'info') this.logger.info(`[runner] ${frame.message}`);
      else this.logger.debug(`[runner] ${frame.message}`);
      return;
    }
    const pending = this.pending.get(frame.id);
    if (pending === undefined) {
      this.logger.debug('收到无对应请求的响应帧，已忽略', { id: frame.id });
      return;
    }
    this.pending.delete(frame.id);
    clearTimeout(pending.timer);
    if (frame.ok) {
      pending.resolve(frame.result);
    } else {
      pending.reject(new BridgeError(
        frame.error?.message ?? `命令 ${pending.command} 执行失败`,
        { command: pending.command, code: frame.error?.code, stack: frame.error?.stack },
      ));
    }
  }

  private rejectAllPending(error: unknown): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async send<T>(
    command: string,
    params: Readonly<Record<string, unknown>>,
    timeoutMs: number,
  ): Promise<T> {
    const child = this.child;
    if (child === undefined || this.exited) {
      throw new BridgeError(`Runner 未运行，无法下发命令 ${command}`, { command });
    }
    const id = randomUUID();
    const frame: BridgeRequestFrame = { id, type: 'request', command, params };
    const line = `${BRIDGE_LINE_PREFIX}${JSON.stringify(frame)}\n`;

    return await new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BridgeError(`命令 ${command} 超时（${String(timeoutMs)}ms）`, { command, id }));
      }, timeoutMs);
      // unref 让超时定时器不阻止进程退出：命令超时本身已经是异常路径，
      // 不应该再把整个 node 进程钉在事件循环里
      if (typeof timer.unref === 'function') {
        timer.unref();
      }
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        command,
      });
      child.stdin.write(line, (error) => {
        if (error !== undefined && error !== null) {
          this.pending.delete(id);
          clearTimeout(timer);
          reject(new BridgeError(`写入 Runner stdin 失败：${error.message}`, { command }, error));
        }
      });
    });
  }

  async dispose(): Promise<void> {
    const child = this.child;
    if (child === undefined) {
      return;
    }
    if (!this.exited) {
      // 先请求优雅退出：Runner 收到 shutdown 后会 finish XCTest，产出完整的 result bundle。
      // 直接 kill 会让 .xcresult 残缺，排障时拿不到失败截图
      try {
        await this.send('shutdown', {}, Math.min(3000, this.bridge.commandTimeoutMs));
      } catch {
        // Runner 可能已经不响应，忽略
      }
      try {
        child.stdin.end();
      } catch {
        // stdin 可能已关闭
      }
      const exited = await this.waitForExit(3000);
      if (!exited) {
        child.kill(this.bridge.killSignal);
        const killed = await this.waitForExit(2000);
        if (!killed) {
          child.kill('SIGKILL');
          await this.waitForExit(1000);
        }
      }
    }
    this.rejectAllPending(new BridgeError('桥接已关闭', {}));
    this.child = undefined;
  }

  private async waitForExit(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.exited) {
        return true;
      }
      await sleep(50);
    }
    return this.exited;
  }
}

/** HTTP JSON 请求的最小封装（node:http，无第三方依赖） */
function httpJson<T>(
  options: nodeHttp.RequestOptions,
  body: unknown,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8');
    const request = nodeHttp.request(
      {
        ...options,
        headers: {
          'content-type': 'application/json',
          ...(payload !== undefined ? { 'content-length': String(payload.byteLength) } : {}),
          ...(options.headers ?? {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = response.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new BridgeError(`HTTP ${String(status)}：${text.slice(0, 500)}`, {
              path: options.path,
            }));
            return;
          }
          if (text === '') {
            resolve(undefined as T);
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch (error) {
            reject(new BridgeError(`响应不是合法 JSON：${text.slice(0, 200)}`, {}, error));
          }
        });
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`HTTP 请求超时（${String(timeoutMs)}ms）`));
    });
    request.on('error', (error: Error) => {
      reject(new BridgeError(`HTTP 请求失败：${error.message}`, { path: options.path }, error));
    });
    if (payload !== undefined) {
      request.write(payload);
    }
    request.end();
  });
}

/**
 * 基于 HTTP 的传输：仍然要拉起 xcodebuild（Runner 只能活在 XCTest 进程里），
 * 但命令走 Runner 内嵌的 HTTP server，避免 stdout 被 xcodebuild 日志淹没。
 */
class HttpBridgeTransport implements BridgeTransport {
  private child: ChildProcessWithoutNullStreams | undefined = undefined;
  private exited = false;
  private ready: BridgeReadyFrame | undefined = undefined;
  private readonly stderrTail: string[] = [];

  constructor(
    private readonly spec: TransportSpawnSpec,
    private readonly bridge: XCUITestBridgeConfig,
    private readonly logger: ILogger,
  ) {}

  get pid(): number | undefined {
    return this.child?.pid;
  }

  isAlive(): boolean {
    return this.child !== undefined && !this.exited;
  }

  async start(): Promise<BridgeReadyFrame> {
    const child = spawn(this.spec.command, [...this.spec.args], {
      cwd: this.spec.cwd,
      env: { ...process.env, ...this.spec.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      for (const line of chunk.split('\n')) {
        if (line.trim() !== '') {
          this.logger.debug(`[runner:stdout] ${line}`);
        }
      }
    });
    child.stderr.on('data', (chunk: string) => {
      for (const line of chunk.split('\n')) {
        if (line.trim() === '') continue;
        this.stderrTail.push(line);
        if (this.stderrTail.length > 50) this.stderrTail.shift();
        this.logger.debug(`[runner:stderr] ${line}`);
      }
    });
    child.on('error', () => {
      this.exited = true;
    });
    child.on('exit', () => {
      this.exited = true;
    });

    const deadline = Date.now() + this.bridge.handshakeTimeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      if (this.exited) {
        throw new BridgeError('Runner 在 HTTP 握手完成前退出', {
          stderr: this.stderrTail.join('\n'),
        });
      }
      try {
        const frame = await httpJson<BridgeReadyFrame>(
          {
            host: this.bridge.host,
            port: this.bridge.port,
            path: '/health',
            method: 'GET',
          },
          undefined,
          Math.min(2000, this.bridge.commandTimeoutMs),
        );
        this.ready = frame;
        return frame;
      } catch (error) {
        lastError = error;
        await sleep(250);
      }
    }
    throw new BridgeError(
      `等待 Runner HTTP 服务就绪超时（${String(this.bridge.handshakeTimeoutMs)}ms）`,
      {
        url: `http://${this.bridge.host}:${String(this.bridge.port)}/health`,
        stderr: this.stderrTail.join('\n'),
        lastError: errorMessage(lastError),
      },
    );
  }

  async send<T>(
    command: string,
    params: Readonly<Record<string, unknown>>,
    timeoutMs: number,
  ): Promise<T> {
    const response = await httpJson<BridgeResponseFrame>(
      {
        host: this.bridge.host,
        port: this.bridge.port,
        path: '/command',
        method: 'POST',
      },
      { id: randomUUID(), type: 'request', command, params } satisfies BridgeRequestFrame,
      timeoutMs,
    );
    if (!response.ok) {
      throw new BridgeError(response.error?.message ?? `命令 ${command} 执行失败`, {
        command,
        code: response.error?.code,
      });
    }
    return response.result as T;
  }

  async dispose(): Promise<void> {
    const child = this.child;
    if (child === undefined) {
      return;
    }
    if (!this.exited) {
      try {
        await this.send('shutdown', {}, Math.min(3000, this.bridge.commandTimeoutMs));
      } catch {
        // 忽略：Runner 可能已经退出
      }
      const deadline = Date.now() + 3000;
      while (!this.exited && Date.now() < deadline) {
        await sleep(50);
      }
      if (!this.exited) {
        child.kill(this.bridge.killSignal);
        const killDeadline = Date.now() + 2000;
        while (!this.exited && Date.now() < killDeadline) {
          await sleep(50);
        }
        if (!this.exited) {
          child.kill('SIGKILL');
        }
      }
    }
    this.child = undefined;
  }
}

/* ═══════════════ 配置窄化与命令构造 ═══════════════ */

/**
 * 缺省桥接配置：配置层没提供 `config.bridge` 时的兜底，保证驱动单独可用。
 *
 * 正常路径下 `config.bridge` 总由 `toBridgeConfig(runner)` 投影出来
 * （`src/configs/xcuitest/index.ts`），所以这里通常走不到；但本常量是**对外导出的**
 * （见 `src/adapters/xcuitest/index.ts`），外部若直接引用它就会真正生效，
 * 因此默认值必须是可用的那一个。
 *
 * ⚠️ `mode` 必须是 `'http'` 而不是 `'stdio'`：xcodebuild 只把测试进程的 stdout
 * 汇聚转发回主机，**不会**把主机 stdin 接到跑在模拟器/真机里的 XCTest 进程
 * （那是另一台设备上的独立进程，stdin 基本是 /dev/null）。stdio 模式下 Runner
 * 能发出 ready 帧、握手成功，但永远收不到任何命令——表现为「握手通过 + 第一条
 * 命令超时」这种极具迷惑性的失败。详见 `runner/README.md`。
 */
export const DEFAULT_BRIDGE_CONFIG: XCUITestBridgeConfig = {
  mode: 'http',
  host: '127.0.0.1',
  port: 8642,
  handshakeTimeoutMs: 120_000,
  commandTimeoutMs: 30_000,
  killSignal: 'SIGTERM',
};

/** 把框架配置窄化为 XCUITest 配置 */
export function asXCUITestConfig(
  config: ResolvedRunConfig['frameworkConfig'],
): XCUITestFrameworkConfig | undefined {
  return (config as XCUITestFrameworkConfig).framework === 'xcuitest'
    ? (config as XCUITestFrameworkConfig)
    : undefined;
}

/**
 * 构造 xcodebuild 的 -destination 串。
 * 真机走 `platform=iOS,id=<udid>`，模拟器优先用 udid（唯一），否则用 name + OS。
 */
export function buildDestination(runConfig: ResolvedRunConfig): string {
  const device = runConfig.device;
  const isRealDevice = device.kind === 'real';
  const parts: string[] = [isRealDevice ? 'platform=iOS' : 'platform=iOS Simulator'];
  if (device.udid !== undefined && device.udid !== '') {
    parts.push(`id=${device.udid}`);
    return parts.join(',');
  }
  parts.push(`name=${device.deviceName}`);
  if (!isRealDevice && device.platformVersion !== undefined && device.platformVersion !== '') {
    parts.push(`OS=${device.platformVersion}`);
  }
  return parts.join(',');
}

/** 构造 xcodebuild 参数表 */
export function buildXcodebuildArgs(
  config: XCUITestFrameworkConfig,
  runConfig: ResolvedRunConfig,
): string[] {
  const args: string[] = ['xcodebuild', 'test-without-building'];
  if (config.workspacePath !== undefined && config.workspacePath !== '') {
    args.push('-workspace', config.workspacePath);
  } else if (config.projectPath !== undefined && config.projectPath !== '') {
    args.push('-project', config.projectPath);
  }
  args.push('-scheme', config.scheme);
  if (config.testPlan !== undefined && config.testPlan !== '') {
    args.push('-testPlan', config.testPlan);
  }
  args.push('-destination', buildDestination(runConfig));
  if (config.derivedDataPath !== '') {
    args.push('-derivedDataPath', config.derivedDataPath);
  }
  if (config.resultBundlePath !== '') {
    args.push('-resultBundlePath', config.resultBundlePath);
  }
  if (config.runnerTarget !== '') {
    args.push(`-only-testing:${config.runnerTarget}`);
  }
  // 关掉并发与代码签名交互，CI 上没有这两项会直接卡住
  args.push('-parallel-testing-enabled', 'NO');
  args.push('CODE_SIGNING_ALLOWED=NO');
  return args;
}

/**
 * 构造投递给 Runner 的环境变量。
 * `SIMCTL_CHILD_` 前缀是 simctl 的约定：带该前缀的变量会被注入到**被测 App 进程**，
 * 不带前缀的只到 xcodebuild 自身。Runner 跑在 App 进程里，所以两份都要给。
 */
export function buildRunnerEnv(
  config: XCUITestFrameworkConfig,
  runConfig: ResolvedRunConfig,
): Record<string, string> {
  const bridge = config.bridge ?? DEFAULT_BRIDGE_CONFIG;
  const base: Record<string, string> = {
    OMNI_BRIDGE_MODE: bridge.mode,
    OMNI_BRIDGE_HOST: bridge.host,
    OMNI_BRIDGE_PORT: String(bridge.port),
    OMNI_BRIDGE_PREFIX: BRIDGE_LINE_PREFIX,
    OMNI_BRIDGE_PROTOCOL_VERSION: String(BRIDGE_PROTOCOL_VERSION),
    OMNI_RUN_ID: runConfig.runId,
    OMNI_APP_ID: runConfig.appId,
    OMNI_PLATFORM: runConfig.platform,
    OMNI_DEVICE_KIND: runConfig.deviceKind,
  };
  const withChildPrefix: Record<string, string> = { ...base };
  for (const [key, value] of Object.entries(base)) {
    withChildPrefix[`SIMCTL_CHILD_${key}`] = value;
  }
  return withChildPrefix;
}

/* ═══════════════ Driver ═══════════════ */

export class XCUITestDriver implements IFrameworkDriver<XCUITestSession, XCUITestElementHandle> {
  readonly framework: FrameworkKind = 'xcuitest';
  readonly platform: Platform = 'ios';

  private readonly runConfig: ResolvedRunConfig;
  private readonly logger: ILogger;
  private readonly config: XCUITestFrameworkConfig | undefined;
  private readonly bridge: XCUITestBridgeConfig;

  private transport: BridgeTransport | undefined = undefined;
  private session: XCUITestSession | undefined = undefined;
  private connected = false;

  constructor(runConfig: ResolvedRunConfig, logger: ILogger) {
    this.runConfig = runConfig;
    this.logger = logger.child('xcuitest:driver');
    this.config = asXCUITestConfig(runConfig.frameworkConfig);
    this.bridge = this.config?.bridge ?? DEFAULT_BRIDGE_CONFIG;
  }

  /** 单条命令的默认超时 */
  get commandTimeoutMs(): number {
    return this.bridge.commandTimeoutMs;
  }

  /** 显式等待的默认超时 */
  get waitTimeoutMs(): number {
    return this.runConfig.frameworkConfig.waitTimeoutMs;
  }

  isConnected(): boolean {
    return this.connected && this.transport?.isAlive() === true;
  }

  getSession(): XCUITestSession {
    if (this.session === undefined || !this.isConnected()) {
      throw new AdapterNotInitializedError('XCUITestDriver.getSession');
    }
    return this.session;
  }

  async connect(): Promise<void> {
    if (this.isConnected()) {
      return;
    }
    const config = this.config;
    if (config === undefined) {
      throw new DriverConnectionError(
        this.framework,
        'frameworkConfig.framework 不是 "xcuitest"，无法构造 xcodebuild 命令',
      );
    }
    if (process.platform !== 'darwin') {
      throw new DriverConnectionError(
        this.framework,
        `XCUITest 只能运行在 macOS，当前平台为 ${process.platform}`,
      );
    }
    const xcrunPath = config.xcrunPath !== '' ? config.xcrunPath : DEFAULT_XCRUN_PATH;
    if (!existsSync(xcrunPath)) {
      throw new DriverConnectionError(
        this.framework,
        `未找到 xcrun（${xcrunPath}），请先安装 Xcode Command Line Tools`,
      );
    }

    const spec: TransportSpawnSpec = {
      command: xcrunPath,
      args: buildXcodebuildArgs(config, this.runConfig),
      env: buildRunnerEnv(config, this.runConfig),
      cwd: this.runConfig.paths.projectRoot,
    };
    this.logger.info('拉起 XCTest Runner', {
      command: spec.command,
      destination: buildDestination(this.runConfig),
      mode: this.bridge.mode,
    });
    this.logger.debug(`完整命令：${spec.command} ${spec.args.join(' ')}`);

    const transport: BridgeTransport = this.bridge.mode === 'http'
      ? new HttpBridgeTransport(spec, this.bridge, this.logger)
      : new StdioBridgeTransport(spec, this.bridge, this.logger);
    this.transport = transport;

    let ready: BridgeReadyFrame;
    try {
      ready = await transport.start();
    } catch (error) {
      await transport.dispose().catch(() => undefined);
      this.transport = undefined;
      if (error instanceof BridgeError) {
        throw error;
      }
      throw new DriverConnectionError(this.framework, errorMessage(error), error);
    }

    if (ready.protocolVersion !== BRIDGE_PROTOCOL_VERSION) {
      await transport.dispose().catch(() => undefined);
      this.transport = undefined;
      throw new BridgeError(
        `协议版本不匹配：Driver=${String(BRIDGE_PROTOCOL_VERSION)} Runner=${String(ready.protocolVersion)}`,
        { driver: BRIDGE_PROTOCOL_VERSION, runner: ready.protocolVersion },
      );
    }

    this.session = {
      send: <T = unknown>(
        command: string,
        params: Readonly<Record<string, unknown>> = {},
        timeoutMs: number = this.bridge.commandTimeoutMs,
      ): Promise<T> => transport.send<T>(command, params, timeoutMs),
      isReady: () => transport.isAlive(),
      protocolVersion: ready.protocolVersion,
      pid: transport.pid,
      mode: this.bridge.mode,
    };
    this.connected = true;
    this.logger.info('XCTest Runner 已就绪', {
      pid: transport.pid,
      runnerVersion: ready.runnerVersion,
    });
  }

  async disconnect(): Promise<void> {
    const transport = this.transport;
    this.connected = false;
    this.session = undefined;
    this.transport = undefined;
    if (transport === undefined) {
      return;
    }
    try {
      await transport.dispose();
      this.logger.info('XCTest Runner 已关闭');
    } catch (error) {
      // disconnect 必须幂等且不抛：清理失败只记日志，否则会掩盖用例本身的失败原因
      this.logger.warn(`关闭 Runner 时出错：${errorMessage(error)}`);
    }
  }

  /** 下发一条桥接命令（供 Adapter 使用） */
  async send<T = unknown>(
    command: string,
    params: Readonly<Record<string, unknown>> = {},
    timeoutMs?: number,
  ): Promise<T> {
    const session = this.getSession();
    return await session.send<T>(command, params, timeoutMs ?? this.bridge.commandTimeoutMs);
  }

  async execute<TResult = unknown>(
    command: string,
    args: Readonly<Record<string, unknown>> = {},
  ): Promise<TResult> {
    return await this.send<TResult>(command, args);
  }

  /** 从 NativeSelector 取出 BridgeQuery；缺失时兜底用 value 反序列化 */
  private toQuery(selector: NativeSelector): BridgeQuery {
    const raw = selector.raw;
    if (raw !== undefined && raw !== null && typeof raw === 'object') {
      return raw as BridgeQuery;
    }
    try {
      return JSON.parse(selector.value) as BridgeQuery;
    } catch (error) {
      throw new BridgeError(
        `无法还原 BridgeQuery：${selector.value.slice(0, 200)}`,
        { using: selector.using },
        error,
      );
    }
  }

  async findElement(
    selector: NativeSelector,
    timeoutMs?: number,
  ): Promise<XCUITestElementHandle> {
    const effectiveTimeout = timeoutMs ?? this.waitTimeoutMs;
    const query = this.toQuery(selector);
    const result = await this.send<{
      handle?: string;
      found?: boolean;
      snapshot?: XCUITestElementSnapshot;
    }>(
      'element.find',
      {
        query,
        index: selector.index ?? query.index,
        timeoutMs: effectiveTimeout,
      },
      // 桥接超时必须严格大于元素等待超时，否则会先报「命令超时」而不是语义更准确的「元素未找到」
      effectiveTimeout + this.bridge.commandTimeoutMs,
    );
    if (result.found === false || result.handle === undefined || result.handle === '') {
      throw new ElementNotFoundError(selector.description, effectiveTimeout);
    }
    return {
      handle: result.handle,
      description: selector.description,
      snapshot: result.snapshot,
    };
  }

  async findElements(selector: NativeSelector): Promise<XCUITestElementHandle[]> {
    const query = this.toQuery(selector);
    const result = await this.send<{
      handles?: readonly string[];
      snapshots?: readonly XCUITestElementSnapshot[];
    }>('element.findAll', { query });
    const handles = result.handles ?? [];
    return handles.map((handle, position) => ({
      handle,
      description: `${selector.description}[${String(position)}]`,
      snapshot: result.snapshots?.[position],
    }));
  }

  async screenshot(): Promise<Buffer> {
    const result = await this.send<{ base64?: string }>('device.screenshot', {});
    const base64 = result.base64 ?? '';
    if (base64 === '') {
      throw new BridgeError('Runner 返回的截图为空', {});
    }
    return Buffer.from(base64, 'base64');
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const checks: { name: string; ok: boolean; detail?: string }[] = [];

    const isDarwin = process.platform === 'darwin';
    checks.push({
      name: 'platform-darwin',
      ok: isDarwin,
      detail: isDarwin ? undefined : `当前平台 ${process.platform}，XCUITest 仅支持 macOS`,
    });

    const xcrunPath = this.config?.xcrunPath !== undefined && this.config.xcrunPath !== ''
      ? this.config.xcrunPath
      : DEFAULT_XCRUN_PATH;
    const xcrunExists = existsSync(xcrunPath);
    checks.push({
      name: 'xcrun-available',
      ok: xcrunExists,
      detail: xcrunExists ? xcrunPath : `未找到 ${xcrunPath}，请安装 Xcode Command Line Tools`,
    });

    if (isDarwin && xcrunExists) {
      const probe = spawnSync(xcrunPath, ['xcodebuild', '-version'], {
        encoding: 'utf8',
        timeout: 15_000,
      });
      const versionOk = probe.status === 0;
      checks.push({
        name: 'xcodebuild-version',
        ok: versionOk,
        detail: versionOk
          ? (probe.stdout ?? '').split('\n')[0]
          : `xcodebuild -version 退出码 ${String(probe.status)}`,
      });
    }

    const config = this.config;
    const hasProject = config !== undefined
      && ((config.workspacePath !== undefined && config.workspacePath !== '')
        || (config.projectPath !== undefined && config.projectPath !== ''));
    checks.push({
      name: 'project-configured',
      ok: hasProject,
      detail: hasProject
        ? (config?.workspacePath ?? config?.projectPath)
        : '未配置 workspacePath / projectPath，无法执行 xcodebuild test-without-building',
    });

    const hasScheme = config !== undefined && config.scheme !== '';
    checks.push({
      name: 'scheme-configured',
      ok: hasScheme,
      detail: hasScheme ? config?.scheme : '未配置 scheme',
    });

    if (this.isConnected()) {
      try {
        await this.send('ping', {}, 5000);
        checks.push({ name: 'bridge-ping', ok: true, detail: `mode=${this.bridge.mode}` });
      } catch (error) {
        checks.push({ name: 'bridge-ping', ok: false, detail: errorMessage(error) });
      }
    } else {
      checks.push({
        name: 'bridge-connected',
        ok: false,
        detail: '桥接尚未建立（connect() 之前这是预期状态）',
      });
    }

    return {
      ok: checks.every((check) => check.ok),
      framework: this.framework,
      checks,
    };
  }
}

/** 便捷工厂 */
export function createXCUITestDriver(
  runConfig: ResolvedRunConfig,
  logger: ILogger,
): XCUITestDriver {
  return new XCUITestDriver(runConfig, logger);
}
