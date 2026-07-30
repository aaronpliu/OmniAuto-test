/**
 * API 响应断言工具 — API 插件
 *
 * 从 framework/api/ApiAssertions.ts 迁移。
 * import 路径已更新为 core/ 引用。
 */
import { Logger } from "../../core/utils/Logger";

const logger = Logger.getInstance();

interface ApiResponseLike {
  status: number;
  data: any;
  headers: Record<string, string>;
  responseTimeMs?: number;
}

type PendingAssertion = () => void;

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => {
    if (acc === null || acc === undefined) {
      return undefined;
    }
    return acc[key];
  }, obj);
}

function validateSchema(data: any, schema: any, path: string): string[] {
  const errors: string[] = [];
  if (!schema || typeof schema !== "object") {
    return errors;
  }
  if (schema.type) {
    const actualType = Array.isArray(data) ? "array" : data === null ? "null" : typeof data;
    if (schema.type !== actualType) {
      errors.push(`Path "${path}": expected type "${schema.type}" but got "${actualType}"`);
      return errors;
    }
  }
  if (
    schema.required &&
    Array.isArray(schema.required) &&
    typeof data === "object" &&
    data !== null
  ) {
    for (const key of schema.required) {
      if (!(key in data)) {
        errors.push(`Path "${path}": missing required property "${key}"`);
      }
    }
  }
  if (
    schema.properties &&
    typeof schema.properties === "object" &&
    typeof data === "object" &&
    data !== null
  ) {
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

  expectHeader(name: string, value?: string | RegExp): this {
    this.pendingAssertions.push(() => {
      const lowerName = name.toLowerCase();
      const headerEntry = Object.entries(this.response.headers).find(
        ([key]) => key.toLowerCase() === lowerName
      );
      if (!headerEntry) {
        throw new Error(`Assertion Failed: expectHeader\n  Header "${name}" not found in response`);
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

  get pendingCount(): number {
    return this.pendingAssertions.length;
  }
}
