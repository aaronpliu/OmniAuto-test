# Cross-Platform Test Automation Framework

A comprehensive TypeScript-based test automation framework supporting React Native iOS (Detox), Android (Appium), Web (Playwright), and API testing.

## Features

- **Unified Action Layer**: Common interface for all platforms with platform-specific implementations
- **Shared Mobile Tests**: Write tests once, run on both iOS and Android
- **Standalone Web Tests**: Direct Playwright integration for web testing
- **API Testing**: Built-in HTTP client for REST API testing
- **TypeScript**: Full type safety with TypeScript 5.x
- **Allure Reporting**: Rich test reports with screenshots and logs
- **Docker Support**: Appium server running in Docker for multiple instances
- **Logging**: Winston-based structured logging
- **Configuration Management**: Environment-specific configurations

## Project Structure

```
AppAuto/
├── framework/              # Core framework components
│   ├── actions/           # Platform action implementations
│   ├── api/               # API testing utilities
│   ├── hooks/             # Test lifecycle hooks
│   ├── types/             # TypeScript type definitions
│   └── utils/             # Utilities (logger, config)
├── applications/          # Application-specific business logic
│   └── your-app/
│       └── pages/         # Page Object Models
├── tests/                 # Test scripts
│   ├── mobile/            # Shared mobile tests (iOS + Android)
│   ├── web/               # Web-specific tests
│   └── api/               # API tests
├── configs/               # Environment configurations
└── artifacts/             # Test outputs (gitignored)
```

## Prerequisites

- Node.js >= 22.22.0
- npm or yarn
- Docker (for Appium)
- Xcode (for iOS testing)
- Android Studio (for Android testing)

## Installation

```bash
# Install dependencies
npm install

# Start Appium servers (for Android testing)
npm run appium:start
```

## Running Tests

### Mobile Tests (Shared iOS & Android)

```bash
# Run on iOS (uses Detox)
TEST_PLATFORM=ios npm run test:mobile:ios

# Run on Android (uses Appium)
TEST_PLATFORM=android npm run test:mobile:android

# Run on both platforms
npm run test:mobile
```

### Web Tests

```bash
# Run on all browsers
npm run test:web

# Run on specific browser
npm run test:web:chromium
npm run test:web:firefox
npm run test:web:webkit
```

### API Tests

```bash
npm run test:api
```

### All Tests

```bash
npm run test:all
```

## Generating Reports

```bash
# Generate Allure report
npm run report:generate

# Open Allure report
npm run report:open
```

## Configuration

Environment configurations are stored in `configs/` directory:
- `development.json` - Development environment
- `staging.json` - Staging environment
- `production.json` - Production environment

Set the environment using:
```bash
NODE_ENV=staging npm run test:mobile
```

## Writing Tests

### Mobile Tests (Shared)

```typescript
import { ActionFactory } from '@framework/actions/ActionFactory';
import { LoginPage } from '@applications/your-app/pages/LoginPage';

describe('Mobile Login Tests', () => {
  let loginPage: LoginPage;

  beforeAll(async () => {
    const platform = process.env.TEST_PLATFORM || 'ios';
    const actions = ActionFactory.create(platform);
    loginPage = new LoginPage(actions);
  });

  it('should login successfully', async () => {
    await loginPage.login('user', 'pass');
  });
});
```

### Web Tests

```typescript
import { test } from '@playwright/test';
import { PlaywrightActions } from '@framework/actions/PlaywrightActions';

test('should login', async ({ page }) => {
  const actions = new PlaywrightActions(page);
  await actions.navigateTo('https://app.com');
  await actions.typeText('#username', 'user');
  await actions.click('#login');
});
```

### API Tests

```typescript
import { ApiClient } from '@framework/api/ApiClient';

const apiClient = new ApiClient();

it('should get user data', async () => {
  const user = await apiClient.get('/users/1');
  expect(user).toHaveProperty('name');
});
```

## Architecture

### Action Abstraction Layer

The framework uses an abstract base class pattern to provide a unified interface across platforms:

- **BaseActions**: Abstract class defining the common interface
- **DetoxActions**: iOS implementation using Detox
- **AppiumActions**: Android implementation using Appium/WebdriverIO
- **PlaywrightActions**: Web implementation using Playwright

### Factory Pattern

Platform selection is handled by the `ActionFactory`:

```typescript
// For mobile (iOS/Android)
const actions = ActionFactory.create('ios'); // or 'android'

// For web, use PlaywrightActions directly
const actions = new PlaywrightActions(page);
```

## Key Design Decisions

1. **Shared Mobile Tests**: Single test suite runs on both iOS and Android via platform abstraction
2. **Standalone Web Tests**: Web tests use Playwright's native features directly
3. **Path Aliases**: Clean imports using `@framework`, `@applications`, `@tests`
4. **Separation of Concerns**: Framework, application logic, and tests are clearly separated
5. **Docker for Appium**: Enables parallel Android test execution

## Available Actions

The framework provides these common actions across all platforms:

- Navigation: `navigateTo()`, `reload()`, `back()`
- Interactions: `click()`, `tap()`, `doubleClick()`, `longPress()`
- Input: `typeText()`, `clearText()`, `getText()`
- Assertions: `waitForElement()`, `expectVisible()`, `expectText()`
- Gestures: `swipe()`, `scroll()`, `pinch()`
- Utilities: `takeScreenshot()`, `setOrientation()`, `setLocation()`

## Logging

Logs are stored in `artifacts/logs/` with timestamps. Set log level:

```bash
LOG_LEVEL=debug npm run test:mobile
```

## Troubleshooting

### iOS Tests Fail
- Ensure Xcode is installed and configured
- Check simulator is available: `xcrun simctl list`
- Verify Detox is properly set up

### Android Tests Fail
- Ensure Docker is running: `docker ps`
- Check Appium containers: `docker-compose ps`
- Verify Android emulator/device is connected

### Web Tests Fail
- Ensure Playwright browsers are installed: `npx playwright install`
- Check network connectivity to test URL

## Contributing

1. Follow TypeScript best practices
2. Add tests for new features
3. Update documentation
4. Run linter before committing: `npm run lint`

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

### Summary

- ✅ You can use, modify, and distribute this software
- ✅ You must disclose source code when distributing
- ✅ You must include the same license in derivative works
- ❌ You cannot use this in proprietary/closed-source software
- ❌ No warranty provided

For more information, visit: https://www.gnu.org/licenses/gpl-3.0.html
