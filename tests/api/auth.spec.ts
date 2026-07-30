import { describe, it, beforeAll } from "@jest/globals";
import { ApiClient } from "@omnitest/plugins/api/ApiClient";

describe("API Authentication Tests", () => {
  let apiClient: ApiClient;

  beforeAll(() => {
    apiClient = new ApiClient();
  });

  it("should authenticate user with valid credentials", async () => {
    const response = await apiClient.post("/auth/login", {
      username: "testuser",
      password: "password123",
    });

    expect(response).toHaveProperty("token");
    expect(response).toHaveProperty("userId");
  });

  it("should return error with invalid credentials", async () => {
    try {
      await apiClient.post("/auth/login", {
        username: "wronguser",
        password: "wrongpass",
      });
      fail("Expected request to fail");
    } catch (error: any) {
      expect(error.response.status).toBe(401);
    }
  });
});
