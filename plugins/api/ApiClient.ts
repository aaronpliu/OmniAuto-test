/**
 * API Client — API 插件
 *
 * 从 framework/api/ApiClient.ts 迁移。
 * import 路径已更新为 core/ 引用。
 */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { Logger } from "../../core/utils/Logger";
import { config } from "../../core/config/ConfigManager";
import { unifiedConfig } from "../../core/config/UnifiedConfigLoader";
import { ApiResponseAssertion } from "./ApiAssertions";

const logger = Logger.getInstance();

export class ApiClient {
  private client: AxiosInstance;

  constructor(baseURL?: string) {
    const apiConfig = unifiedConfig.getApiConfig();
    this.client = axios.create({
      baseURL: baseURL || config.getApiBaseUrl() || apiConfig.baseURL,
      timeout: apiConfig.timeout,
      headers: apiConfig.headers,
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.client.interceptors.request.use(
      (requestConfig) => {
        logger.info(`API Request: ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`);
        return requestConfig;
      },
      (error) => {
        logger.error(`API Request Error: ${error.message}`);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        logger.info(`API Response: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        logger.error(`API Response Error: ${error.message}`);
        return Promise.reject(error);
      }
    );
  }

  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }

  async patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  setAuthToken(token: string): void {
    this.client.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  }

  clearAuthToken(): void {
    delete this.client.defaults.headers.common["Authorization"];
  }

  async getWithAssertion(url: string, config?: AxiosRequestConfig): Promise<ApiResponseAssertion> {
    return this.requestWithAssertion("get", url, undefined, config);
  }

  async postWithAssertion(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponseAssertion> {
    return this.requestWithAssertion("post", url, data, config);
  }

  async requestWithAssertion(
    method: "get" | "post" | "put" | "delete" | "patch",
    url: string,
    data?: any,
    reqConfig?: AxiosRequestConfig
  ): Promise<ApiResponseAssertion> {
    const startTime = Date.now();
    let response: AxiosResponse;
    try {
      response = await this.client.request({ method, url, data, ...reqConfig });
    } catch (error: any) {
      if (error.response) {
        response = error.response;
      } else {
        throw error;
      }
    }
    const responseTimeMs = Date.now() - startTime;
    return new ApiResponseAssertion({
      status: response.status,
      data: response.data,
      headers: response.headers as Record<string, string>,
      responseTimeMs,
    });
  }
}
