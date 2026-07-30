/**
 * API Plugin — 插件入口
 *
 * API 测试插件，封装 ApiClient 和 ApiAssertions。
 * API 插件不需要 IMediaProvider（无截图/录屏需求）。
 */
import { IPlugin, LifecycleHooks } from "../../core/interfaces/IPlugin";
import { IActions } from "../../core/interfaces/IActions";
import { PluginConfig, ActionConfig } from "../../core/interfaces/IConfigProvider";
import { ApiClient } from "./ApiClient";
import { ApiResponseAssertion } from "./ApiAssertions";

export class ApiPlugin implements IPlugin {
  readonly name = "api";
  readonly platforms = ["api"];
  readonly version = "1.0.0";

  private apiClient: ApiClient | null = null;

  async initialize(config: PluginConfig): Promise<void> {
    // API 插件无需特殊初始化，ApiClient 按需创建
  }

  createActions(_config: ActionConfig): IActions {
    throw new Error(
      "ApiPlugin does not support createActions(). " + "Use ApiClient directly for API testing."
    );
  }

  getLifecycleHooks(): LifecycleHooks {
    return {};
  }

  /** 获取 ApiClient 实例（懒创建） */
  getApiClient(baseURL?: string): ApiClient {
    if (!this.apiClient) {
      this.apiClient = new ApiClient(baseURL);
    }
    return this.apiClient;
  }

  /** 创建断言实例（便捷方法） */
  createAssertion(response: {
    status: number;
    data: any;
    headers: Record<string, string>;
    responseTimeMs?: number;
  }): ApiResponseAssertion {
    return new ApiResponseAssertion(response);
  }

  destroy(): Promise<void> {
    this.apiClient = null;
    return Promise.resolve();
  }
}
