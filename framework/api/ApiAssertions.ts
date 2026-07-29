/**
 * API 响应断言工具
 * API Response Assertion Utility
 *
 * 提供链式 API 响应断言能力，支持累积多个断言后统一执行。
 *
 * 使用方式 / Usage:
 *   import { ApiResponseAssertion } from '@framework/api/ApiAssertions';
 *
 *   const assertion = new ApiResponseAssertion(response);
 *   assertion
 *     .expectStatus(200)
 *     .expectJsonProperty('data.name', 'test')
 *     .expectHeader('content-type', /json/)
 *     .assert();
 */
import { Logger } from "../utils/logger";

const logger = Logger.getInstance();

interface ApiResponseLike {
  status: number;
  data: any;
  headers: Record<string, string>;
  responseTimeMs?: number;
}

type PendingAssertion = () => void;

/**
 * 通过点号路径访问嵌套对象属性
 */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => {
    if (acc === null || acc === undefined) {
      return undefined;
    }
    return acc[key];
  }, obj);
}

/**
 * 轻量级 JSON Schema 校验器
 * 支持 type, required, properties
 */
function validateSchema(data: any, schema: any, path: string): string[] {
  const errors: string[] = [];

  if (!schema || typeof schema !== "object") {
    return errors;
  }

  // 校验 type
  if (schema.type) {
    const actualType = Array.isArray(data) ? "array" : data === null ? "null" : typeof data;
    if (schema.type !== actualType) {
      errors.push(`Path "${path}": expected type "${schema.type}" but got "${actualType}"`);
      return errors; // 类型不匹配时跳过后续校验
    }
  }

  // 校验 required
  if (schema.required && Array.isArray(schema.required) && typeof data === "object" && data !== null) {
    for (const key of schema.required) {
      if (!(key in data)) {
        errors.push(`Path "${path}": missing required property "${key}"`);
      }
    }
  }

  // 校验 properties
  if (schema.properties && typeof schema.properties === "object" && typeof data === "object" && data !== null) {
    for (const [key, subSchema] of Object.entries(schema.properties)) {
      if (key in data) {
        const subErrors = validateSchema(data[key], subSchema, `${path}.${key}`);
        errors.push(...subErrors);
      }
    }
  }

  return errors;
}

export class ApiResponseAssertion {
  private response: ApiResponseLike;
  private pendingAssertions: PendingAssertion[] = [];

  constructor(response: ApiResponseLike) {
    this.response = response;
  }

  /**
   * 断言 HTTP 状态码等于预期值
   */
  expectStatus(status: number): this {
    this.pendingAssertions.push(() => {
      if (this.response.status !== status) {
        throw new Error(
          `Assertion Failed: expectStatus\n  Expected: ${status}\n  Actual:   ${this.response.status}`
        );
      }
    });
    return this;
  }

  /**
   * 断言 HTTP 状态码在预期列表中
   */
  expectStatusIn(statuses: number[]): this {
    this.pendingAssertions.push(() => {
      if (!statuses.includes(this.response.status)) {
        throw new Error(
          `Assertion Failed: expectStatusIn\n  Expected one of: [${statuses.join(", ")}]\n  Actual:          ${this.response.status}`
        );
      }
    });
    return this;
  }

  /**
   * 断言 JSON 响应中指定路径的属性值
   * @param path - 点号分隔的路径，如 "data.user.name"
   * @param value - 预期值（严格相等）
   */
  expectJsonProperty(path: string, value: any): this {
    this.pendingAssertions.push(() => {
      const actual = getNestedValue(this.response.data, path);
      if (actual !== value) {
        throw new Error(
          `Assertion Failed: expectJsonProperty\n  Path:     "${path}"\n  Expected: ${JSON.stringify(value)}\n  Actual:   ${JSON.stringify(actual)}`
        );
      }
    });
    return this;
  }

  /**
   * 断言 JSON 响应中指定路径存在（非 undefined）
   */
  expectJsonPathExists(path: string): this {
    this.pendingAssertions.push(() => {
      const actual = getNestedValue(this.response.data, path);
      if (actual === undefined) {
        throw new Error(
          `Assertion Failed: expectJsonPathExists\n  Path: "${path}"\n  Value is undefined (path does not exist)`
        );
      }
    });
    return this;
  }

  /**
   * 断言响应头
   * @param name - 响应头名称（不区分大小写）
   * @param value - 预期值（可选，不传则仅断言头存在）
   */
  expectHeader(name: string, value?: string | RegExp): this {
    this.pendingAssertions.push(() => {
      // 响应头名称不区分大小写
      const lowerName = name.toLowerCase();
      const headerEntry = Object.entries(this.response.headers).find(
        ([key]) => key.toLowerCase() === lowerName
      );
      if (!headerEntry) {
        throw new Error(
          `Assertion Failed: expectHeader\n  Header "${name}" not found in response`
        );
      }
      if (value !== undefined) {
        const actual = headerEntry[1];
        if (value instanceof RegExp) {
          if (!value.test(actual)) {
            throw new Error(
              `Assertion Failed: expectHeader\n  Header:  "${name}"\n  Expected: /${value.source}/\n  Actual:   "${actual}"`
            );
          }
        } else {
          if (actual !== value) {
            throw new Error(
              `Assertion Failed: expectHeader\n  Header:  "${name}"\n  Expected: "${value}"\n  Actual:   "${actual}"`
            );
          }
        }
      }
    });
    return this;
  }

  /**
   * 断言 Content-Type 响应头包含指定类型
   */
  expectContentType(type: string): this {
    this.pendingAssertions.push(() => {
      const lowerName = "content-type";
      const headerEntry = Object.entries(this.response.headers).find(
        ([key]) => key.toLowerCase() === lowerName
      );
      const actual = headerEntry ? headerEntry[1] : "";
      if (!actual.includes(type)) {
        throw new Error(
          `Assertion Failed: expectContentType\n  Expected: "${type}"\n  Actual:   "${actual}"`
        );
      }
    });
    return this;
  }

  /**
   * 断言 JSON 数组的长度
   * @param path - 数组在 JSON 中的路径
   * @param length - 预期长度
   */
  expectArrayLength(path: string, length: number): this {
    this.pendingAssertions.push(() => {
      const arr = getNestedValue(this.response.data, path);
      if (!Array.isArray(arr)) {
        throw new Error(
          `Assertion Failed: expectArrayLength\n  Path: "${path}"\n  Value is not an array: ${JSON.stringify(arr)}`
        );
      }
      if (arr.length !== length) {
        throw new Error(
          `Assertion Failed: expectArrayLength\n  Path:     "${path}"\n  Expected: ${length}\n  Actual:   ${arr.length}`
        );
      }
    });
    return this;
  }

  /**
   * 断言 JSON 响应包含指定属性（不校验值）
   */
  expectHasProperty(path: string): this {
    this.pendingAssertions.push(() => {
      const actual = getNestedValue(this.response.data, path);
      if (actual === undefined) {
        throw new Error(
          `Assertion Failed: expectHasProperty\n  Path: "${path}"\n  Property does not exist`
        );
      }
    });
    return this;
  }

  /**
   * 断言 JSON 响应符合指定的 Schema（轻量级实现，支持 type 和 required）
   *
   * 支持的 schema 字段：
   * - `type`: "object" | "array" | "string" | "number" | "boolean" | "null"
   * - `required`: string[] — 必须存在的属性名列表
   * - `properties`: Record<string, Schema> — 子属性 schema
   *
   * 如需完整 JSON Schema 校验，可集成 ajv 库扩展此方法。
   *
   * @example
   *   assertion.expectJsonSchema({
   *     type: 'object',
   *     required: ['id', 'name'],
   *     properties: {
   *       id: { type: 'number' },
   *       name: { type: 'string' }
   *     }
   *   });
   */
  expectJsonSchema(schema: object): this {
    this.pendingAssertions.push(() => {
      const errors = validateSchema(this.response.data, schema, "$");
      if (errors.length > 0) {
        throw new Error(
          `Assertion Failed: expectJsonSchema\n${errors.map((e) => `  - ${e}`).join("\n")}`
        );
      }
    });
    return this;
  }

  /**
   * 断言响应时间不超过指定毫秒数
   */
  expectResponseTime(maxMs: number): this {
    this.pendingAssertions.push(() => {
      const responseTime = this.response.responseTimeMs;
      if (responseTime === undefined) {
        throw new Error(
          `Assertion Failed: expectResponseTime\n  Response time not available (pass responseTimeMs in response object)`
        );
      }
      if (responseTime > maxMs) {
        throw new Error(
          `Assertion Failed: expectResponseTime\n  Expected: <= ${maxMs}ms\n  Actual:   ${responseTime}ms`
        );
      }
    });
    return this;
  }

  /**
   * 执行所有累积的断言
   * 任一断言失败时立即抛出第一个错误
   * @returns 自身以支持链式调用
   */
  assert(): this {
    const errors: Error[] = [];
    for (const assertion of this.pendingAssertions) {
      try {
        assertion();
      } catch (e: any) {
        errors.push(e);
      }
    }
    this.pendingAssertions = [];

    if (errors.length > 0) {
      if (errors.length === 1) {
        throw errors[0];
      }
      const messages = errors.map((e, i) => `  ${i + 1}. ${e.message}`).join("\n");
      throw new Error(`API Assertion Failed (${errors.length} failures):\n${messages}`);
    }

    logger.debug("All API assertions passed");
    return this;
  }

  /**
   * 返回当前累积的断言数量
   */
  get pendingCount(): number {
    return this.pendingAssertions.length;
  }
}
