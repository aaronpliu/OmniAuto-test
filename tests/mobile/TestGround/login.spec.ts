import { describe, it, beforeAll } from "@jest/globals";
import { ActionFactory } from "@omnitest/core/actions";
import { LoginPage } from "@tests/mobile/TestGround/pages/LoginPage";

describe("Mobile Login Tests", () => {
  let loginPage: LoginPage;

  beforeAll(() => {
    const platform = (process.env.TEST_PLATFORM || "ios") as "ios" | "android";
    loginPage = new LoginPage(ActionFactory.create(platform));
  });

  it.skip("should display login screen", async () => {
    await loginPage.isVisible();
  });

  it("should login successfully with valid credentials", async () => {
    await loginPage.login("admin", "123456");
    await loginPage.isVisible();
  });

  it.skip("should show error with invalid credentials", async () => {
    await loginPage.login("wronguser", "wrongpass");
    await loginPage.expectLoginError("Invalid username or password");
  });
});
