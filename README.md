# OmniAutoTest — Cross-Platform Test Automation Framework

A TypeScript-based test automation framework supporting **iOS (Detox / Appium
XCUITest)**, **Android (Appium UiAutomator2 / Detox)**, **Web (Playwright)**,
and **API testing** — all from the same test scripts.

## Features

| Feature                         | Description                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| 🔀 **Write Once, Run Anywhere** | Same test script runs on iOS Detox, iOS Appium, Android Appium, Android Detox                     |
| 🎯 **Unified Selectors**        | `by.id()` / `by.text()` / `by.label()` / `by.xpath()` / `by.platform()` work across all platforms |
| 📝 **Auto Step Recording**      | Every click/typeText/assertion automatically logged to Allure report                              |
| 📸 **Failure Screenshots**      | Step-level + test-level screenshots embedded in report                                            |
| 🎥 **Screen Recording**         | Appium-based video recording (`VIDEO_RECORDING=true`)                                             |
| 📊 **Allure Reports**           | Rich HTML reports with steps, screenshots, and logs                                               |
| 🧭 **Interactive Menu**         | Node.js-powered direction-key menu (`./start.sh`)                                                 |

## Quick Start

```bash
# Install dependencies
./start.sh install

# Run tests
./start.sh test:ios              # iOS Detox
./start.sh test:ios:appium       # iOS Appium (XCUITest)
./start.sh test:android          # Android Appium (UiAutomator2)
./start.sh test:android:detox    # Android Detox

# Enable recording / disable screenshots
./start.sh test:android --recording --no-screenshot

# View report
./start.sh report
```

## Supported Platforms & Modes

| Platform | Mode             | Framework             | Switch                          |
| -------- | ---------------- | --------------------- | ------------------------------- |
| iOS      | Detox (default)  | Detox                 | —                               |
| iOS      | Appium           | Appium + XCUITest     | `IOS_AUTOMATION_MODE=appium`    |
| Android  | Appium (default) | Appium + UiAutomator2 | —                               |
| Android  | Detox            | Detox                 | `ANDROID_AUTOMATION_MODE=detox` |
| Web      | —                | Playwright            | `./start.sh test:web`           |
| API      | —                | Jest + Axios          | `./start.sh test:api`           |

## Project Structure

```
OmniAutoTest/
├── cli/                       # CLI helpers (menu.js)
├── framework/                 # Core framework
│   ├── actions/               # Platform actions (Detox/Appium/Playwright)
│   ├── hooks/                 # Lifecycle hooks (screenshot, recording)
│   ├── reporters/             # Custom Allure reporter for Detox
│   ├── types/                 # TypeScript type definitions
│   └── utils/                 # Logger, config, selectors, etc.
├── applications/              # Legacy - use tests/<project>/pages/ instead
│   └── TestGround/pages/      # LoginPage, HomePage
├── tests/                     # Test scripts
│   ├── mobile/                # Mobile tests (iOS + Android shared)
│   ├── web/                   # Web tests
│   └── api/                   # API tests
├── configs/                   # Environment configs
└── start.sh                   # Entry point (CLI + menu)
```

## Writing Tests

```typescript
import { describe, it, beforeAll } from "@jest/globals";
import { ActionFactory } from "@framework/actions";
import { LoginPage } from "@tests/TestGround/pages/LoginPage";

describe("Login Tests", () => {
  let loginPage: LoginPage;

  beforeAll(async () => {
    const platform = (process.env.TEST_PLATFORM || "ios") as "ios" | "android";
    loginPage = new LoginPage(ActionFactory.create(platform));
  });

  it("should login successfully", async () => {
    await loginPage.login("admin", "123456");
    await loginPage.isVisible();
  });
});
```

## Page Object Example

```typescript
import { by } from "@framework/utils";
// by.id() / by.text() / by.label() — unified across all platforms

export class LoginPage {
  constructor(private actions: BaseActions) {}

  async login(user: string, pass: string) {
    await this.actions.navigateTo();
    await this.actions.typeText(by.id("usernameInput"), user);
    await this.actions.typeText(by.id("passwordInput"), pass);
    await this.actions.click(by.id("loginButton"));
    await this.actions.waitForElement(by.id("logoutButton"), 10000);
  }
}
```

## Report Features

- **Test Steps**: Every action automatically logged (click, typeText, expect*,
  waitFor*)
- **Failure Screenshots**: Step-level + test-level screenshots on failure
- **Screen Recording**: Appium-based, enable with `--recording` flag
- **Allure Report**: `./start.sh report` generates and opens HTML report

## CLI Flags

```
--screenshot, --ss         Enable failure screenshots (default: on)
--no-screenshot, --no-ss   Disable failure screenshots
--recording, --rec         Enable screen recording (default: off)
--no-recording, --no-rec   Disable screen recording

Examples:
  ./start.sh test:android --recording
  ./start.sh test:ios:appium --no-screenshot --recording
```

## Environment Variables

| Variable                  | Default     | Description                            |
| ------------------------- | ----------- | -------------------------------------- |
| `TEST_PLATFORM`           | `ios`       | Target platform (`ios` / `android`)    |
| `IOS_AUTOMATION_MODE`     | `detox`     | iOS framework (`detox` / `appium`)     |
| `ANDROID_AUTOMATION_MODE` | `appium`    | Android framework (`appium` / `detox`) |
| `SCREENSHOT_ON_FAILURE`   | `true`      | Auto screenshot on failure             |
| `VIDEO_RECORDING`         | `false`     | Enable video recording                 |
| `APPIUM_HOST`             | `localhost` | Appium server address                  |
| `APPIUM_PORT`             | `4723`      | Appium server port                     |

## Prerequisites

- **Node.js** >= 22.22.0
- **Appium drivers**: `appium driver install uiautomator2 xcuitest`
- **iOS (Appium)**: Xcode + iOS simulator or real device
- **Android (Detox)**: Android SDK + emulator/device

## License

MIT
