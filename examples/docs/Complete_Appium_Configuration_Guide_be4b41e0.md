# Complete Appium Configuration for Mobile UI Automation

## Overview
This guide provides detailed steps to configure Appium for Android and iOS mobile app UI automation using your existing framework structure.

---

## Step 1: Prerequisites Installation

### 1.1 Install Node.js and npm
- Ensure Node.js >= 22.22.0 is installed (as specified in package.json)
- Verify installation: `node --version` and `npm --version`

### 1.2 Install Java Development Kit (JDK) - For Android
- Install JDK 11 or 17 (recommended)
- Set JAVA_HOME environment variable
- Add Java bin directory to PATH
- Verify: `java -version`

### 1.3 Install Android SDK
- Download Android Studio or command-line tools
- Install Android SDK Platform for your target version (e.g., API 33 for Android 13)
- Install Android SDK Build-Tools
- Install Android Emulator
- Set ANDROID_HOME environment variable pointing to SDK location
- Add platform-tools and emulator to PATH
- Verify: `adb version` and `emulator -list-avds`

### 1.4 Install Xcode and Command Line Tools - For iOS (macOS only)
- Install Xcode from Mac App Store
- Install Xcode Command Line Tools: `xcode-select --install`
- Accept Xcode license: `sudo xcodebuild -license accept`
- Verify: `xcodebuild -version`

### 1.5 Install Carthage (iOS dependency manager)
- Install via Homebrew: `brew install carthage`
- Required for XCUITest driver

### 1.6 Install libimobiledevice and ios-deploy (iOS real devices)
- Install via Homebrew: `brew install libimobiledevice ios-deploy`
- Required for real iOS device testing

---

## Step 2: Appium Server Setup

### Option A: Using Docker (Recommended - Already Configured)

Your project already has docker-compose.yml configured with two Appium instances:

**2A.1 Start Appium Server**
```bash
npm run appium:start
# or
docker-compose up -d
```

**2A.2 Verify Appium is Running**
```bash
curl http://localhost:4723/wd/hub/status
```

**2A.3 Stop Appium Server**
```bash
npm run appium:stop
# or
docker-compose down
```

**Docker Configuration Details:**
- Instance 1: Port 4723 (mapped from container port 4723)
- Instance 2: Port 4724 (mapped from container port 4723)
- Volume mount: ./apps:/opt/apps (for APK/IPA files)
- Network: appium-network (bridge mode)
- Flags: --allow-cors, --relaxed-security, --log-timestamp, --log-no-colors

### Option B: Local Appium Installation

**2B.1 Install Appium CLI**
```bash
npm install -g appium
```

**2B.2 Install Required Drivers**
```bash
# For Android
appium driver install uiautomator2

# For iOS
appium driver install xcuitest
```

**2B.3 Install Required Plugins (Optional)**
```bash
appium plugin install images
appium plugin install execute-driver
```

**2B.4 Start Appium Server**
```bash
appium --allow-cors --relaxed-security --log-timestamp
```

**2B.5 Verify Installation**
```bash
appium driver list
appium --version
```

---

## Step 3: Environment Configuration

### 3.1 Create .env File
Copy the example configuration:
```bash
cp .env.example .env
```

### 3.2 Configure Android Settings in .env

Edit `.env` file with your Android configuration:

```env
# Platform Selection
PLATFORM_NAME=android

# Appium Server
APPIUM_HOST=localhost
APPIUM_PORT=4723
APPIUM_PATH=/wd/hub

# Android Device
ANDROID_DEVICE_NAME=emulator-5554
ANDROID_PLATFORM_VERSION=13
ANDROID_AUTOMATION_NAME=UiAutomator2

# App Configuration (Choose ONE method)
# Method 1: Package + Activity
ANDROID_APP_PACKAGE=com.example.myapp
ANDROID_APP_ACTIVITY=.MainActivity

# Method 2: Direct APK path
ANDROID_APP_PATH=./apps/android/app-debug.apk

# Optional Settings
ANDROID_SYSTEM_PORT=8200
AUTO_GRANT_PERMISSIONS=true
NO_RESET=false
FULL_RESET=false
NEW_COMMAND_TIMEOUT=60000
LANGUAGE=en
LOCALE=US
ORIENTATION=PORTRAIT
```

### 3.3 Configure iOS Settings in .env (if testing iOS)

```env
# Platform Selection
PLATFORM_NAME=ios

# Appium Server
APPIUM_HOST=localhost
APPIUM_PORT=4723

# iOS Device
IOS_DEVICE_NAME=iPhone 14
IOS_PLATFORM_VERSION=17.0
IOS_AUTOMATION_NAME=XCUITest

# App Configuration (Choose ONE method)
# Method 1: Bundle ID (for already installed apps)
IOS_BUNDLE_ID=com.example.myapp

# Method 2: App path
IOS_APP_PATH=./apps/ios/MyApp.app

# Optional Settings
AUTO_ACCEPT_ALERTS=false
NO_RESET=false
FULL_RESET=false
NEW_COMMAND_TIMEOUT=60000
```

### 3.4 Load Environment Variables
The framework automatically loads environment variables. Ensure your shell loads the .env file:
```bash
source .env
# Or use a tool like dotenv-cli
```

---

## Step 4: Prepare Test Application

### 4.1 Create Apps Directory Structure
```bash
mkdir -p apps/android
mkdir -p apps/ios
```

### 4.2 Place Android APK
- Copy your Android APK to: `./apps/android/app-debug.apk`
- Ensure the APK is built with debug signing for easier testing
- Verify APK can be installed: `adb install ./apps/android/app-debug.apk`

### 4.3 Place iOS App (if applicable)
- For Simulator: Copy .app bundle to `./apps/ios/MyApp.app`
- For Real Device: Copy .ipa file to `./apps/ios/MyApp.ipa`
- Build with appropriate provisioning profile

### 4.4 Verify App Installation
```bash
# Android
adb install ./apps/android/app-debug.apk
adb shell pm list packages | grep your.package.name

# iOS Simulator
xcrun simctl install booted ./apps/ios/MyApp.app
```

---

## Step 5: Configure Android Emulator or Device

### 5.1 Create Android Virtual Device (AVD)

**Using Android Studio:**
1. Open AVD Manager
2. Create Virtual Device
3. Select device definition (e.g., Pixel 5)
4. Select system image (e.g., Android 13, API 33)
5. Configure AVD settings
6. Launch emulator

**Using Command Line:**
```bash
# List available system images
sdkmanager --list | grep system-images

# Create AVD
avdmanager create avd -n Pixel_5_API_33 -k "system-images;android-33;google_apis;x86_64" -d pixel_5

# Start emulator
emulator -avd Pixel_5_API_33
```

### 5.2 Get Emulator/Device ID
```bash
adb devices
# Output: emulator-5554    device
```

Update `.env` with the correct device ID:
```env
ANDROID_DEVICE_NAME=emulator-5554
```

### 5.3 Enable Developer Options on Physical Device
1. Go to Settings > About Phone
2. Tap "Build Number" 7 times
3. Enable USB Debugging in Developer Options
4. Connect device via USB
5. Authorize USB debugging prompt
6. Verify: `adb devices`

---

## Step 6: Install Framework Dependencies

### 6.1 Install npm Dependencies
```bash
npm install
```

This installs:
- webdriverio (^8.27.0) - Appium client library
- @wdio/cli (^8.27.0) - WebDriverIO CLI
- jest (^29.7.0) - Test runner
- ts-jest (^29.1.1) - TypeScript support
- allure-commandline (^2.25.0) - Reporting
- winston (^3.11.0) - Logging

### 6.2 Verify Installation
```bash
npm list webdriverio
npm list jest
```

---

## Step 7: Understand the Framework Architecture

### 7.1 Key Components

**AppiumActions Class** ([framework/actions/AppiumActions.ts](file:///Users/aaronliu/Documents/repositories/AppAuto/framework/actions/AppiumActions.ts))
- Extends BaseActions for platform-agnostic interface
- Uses WebdriverIO to communicate with Appium server
- Supports flexible selectors: strings (accessibility IDs), WebdriverIO Elements
- Provides methods: click, typeText, swipe, scroll, waitForElement, assertions, etc.

**ActionFactory** ([framework/actions/ActionFactory.ts](file:///Users/aaronliu/Documents/repositories/AppAuto/framework/actions/ActionFactory.ts))
- Creates appropriate action instance based on platform
- Returns AppiumActions for 'android' platform
- Returns DetoxActions for 'ios' platform

**Test Setup Hook** ([framework/hooks/appiumSetup.ts](file:///Users/aaronliu/Documents/repositories/AppAuto/framework/hooks/appiumSetup.ts))
- Verifies Appium server connection
- Logs server configuration

**Jest Configuration** ([jest.android.config.js](file:///Users/aaronliu/Documents/repositories/AppAuto/jest.android.config.js))
- Matches mobile test files: `**/tests/mobile/**/*.spec.ts`
- Runs global setup and Appium setup hooks
- Sets platform to 'android'

### 7.2 Selector Strategy

AppiumActions supports multiple selector types:

```typescript
// String selector (uses accessibility ID with ~ prefix)
await actions.click('loginButton');  // Resolves to ~loginButton

// WebdriverIO Element (created via static helpers)
const element = await AppiumActions.byId(driver, 'loginBtn');
await actions.click(element);

// Custom selectors
const element = await AppiumActions.byText(driver, 'Submit');
const element = await AppiumActions.byXPath(driver, '//android.widget.Button');
```

---

## Step 8: Write Your First Test

### 8.1 Example Test Structure

Tests are located in `tests/mobile/`. Example from [login.spec.ts](file:///Users/aaronliu/Documents/repositories/AppAuto/tests/mobile/login.spec.ts):

```typescript
import { describe, it, beforeAll, afterAll } from '@jest/globals';
import { ActionFactory } from '@framework/actions';
import { LoginPage } from '@applications/your-app/pages/LoginPage';
import { HomePage } from '@applications/your-app/pages/HomePage';

describe('Mobile Login Tests', () => {
  let loginPage: LoginPage;
  let homePage: HomePage;

  beforeAll(async () => {
    const platform = (process.env.TEST_PLATFORM || 'android') as 'ios' | 'android';
    const actions = ActionFactory.create(platform);
    loginPage = new LoginPage(actions);
    homePage = new HomePage(actions);
  });

  it('should display login screen', async () => {
    await loginPage.isVisible();
  });

  it('should login successfully', async () => {
    await loginPage.login('testuser', 'password123');
    await homePage.isVisible();
  });
});
```

### 8.2 Page Object Pattern

Create page objects in `applications/your-app/pages/`:

```typescript
import { BaseActions } from '@framework/actions';

export class LoginPage {
  constructor(private actions: BaseActions) {}

  async isVisible(): Promise<void> {
    await this.actions.waitForElement('loginScreen');
  }

  async login(username: string, password: string): Promise<void> {
    await this.actions.typeText('usernameField', username);
    await this.actions.typeText('passwordField', password);
    await this.actions.click('loginButton');
  }

  async expectLoginError(message: string): Promise<void> {
    await this.actions.expectContainsText('errorMessage', message);
  }
}
```

---

## Step 9: Run Tests

### 9.1 Run Android Tests

```bash
# Set environment and run
TEST_PLATFORM=android npm run test:mobile:android

# Or directly with Jest
TEST_PLATFORM=android npx jest tests/mobile --config jest.android.config.js
```

### 9.2 Run Specific Test File

```bash
TEST_PLATFORM=android npx jest tests/mobile/login.spec.ts --config jest.android.config.js
```

### 9.3 Run with Verbose Output

```bash
TEST_PLATFORM=android npx jest tests/mobile --config jest.android.config.js --verbose
```

### 9.4 Run with Watch Mode (Development)

```bash
TEST_PLATFORM=android npx jest tests/mobile --config jest.android.config.js --watch
```

---

## Step 10: Debugging and Troubleshooting

### 10.1 Check Appium Server Logs

**Docker:**
```bash
docker-compose logs -f appium1
```

**Local:**
Logs appear in terminal where Appium is running

### 10.2 Inspect App UI Hierarchy

**Android - Using Appium Inspector:**
1. Download Appium Inspector: https://github.com/appium/appium-inspector
2. Connect to Appium server (localhost:4723)
3. Enter desired capabilities:
   ```json
   {
     "platformName": "Android",
     "appium:deviceName": "emulator-5554",
     "appium:appPackage": "com.example.myapp",
     "appium:appActivity": ".MainActivity",
     "appium:automationName": "UiAutomator2"
   }
   ```
4. Start session and inspect elements
5. Find accessibility IDs, text, XPath for elements

**Alternative - Using uiautomatorviewer:**
```bash
uiautomatorviewer
```

**iOS - Using Xcode Accessibility Inspector:**
1. Open Xcode > Developer Tools > Accessibility Inspector
2. Select simulator/device
3. Inspect UI elements

### 10.3 Common Issues and Solutions

**Issue: Appium server not reachable**
```bash
# Check if server is running
curl http://localhost:4723/wd/hub/status

# Restart Docker containers
docker-compose restart
```

**Issue: Device not found**
```bash
# List connected devices
adb devices

# Restart ADB server
adb kill-server
adb start-server
```

**Issue: App fails to launch**
- Verify APK path is correct in .env
- Check appPackage and appActivity are correct
- Use `adb logcat` to see Android logs
- Use `adb shell dumpsys activity activities` to find correct activity

**Issue: Element not found**
- Use Appium Inspector to verify element attributes
- Try different selector strategies (accessibility ID, text, XPath)
- Add explicit waits: `await actions.waitForElement('elementId', 10000)`
- Check if element is in a scrollable container

**Issue: Timeout errors**
- Increase NEW_COMMAND_TIMEOUT in .env
- Add retry logic with waitForElementWithRetry
- Check network connectivity between test runner and Appium

### 10.4 Enable Detailed Logging

Add to `.env`:
```env
APPIUM_LOG_LEVEL=debug
```

View logs:
```bash
# Docker
docker-compose logs -f appium1

# Capture test logs
cat artifacts/logs/test-*.log
```

---

## Step 11: Advanced Configuration

### 11.1 Parallel Testing

Use multiple Appium instances (already configured in docker-compose.yml):

**.env for parallel tests:**
```env
# First instance
APPIUM_HOST=localhost
APPIUM_PORT=4723

# Second instance
APPIUM_HOST_2=localhost
APPIUM_PORT_2=4724
```

Run tests in parallel using Jest workers:
```bash
TEST_PLATFORM=android npx jest tests/mobile --config jest.android.config.js --maxWorkers=2
```

### 11.2 Real Device Testing

**Android Real Device:**
```env
ANDROID_DEVICE_NAME=<device_serial_from_adb_devices>
ANDROID_APP_PATH=./apps/android/app-release.apk
```

**iOS Real Device:**
```env
IOS_DEVICE_NAME=<device_udid>
IOS_APP_PATH=./apps/ios/MyApp.ipa
IOS_PLATFORM_VERSION=17.0
```

Get iOS device UDID:
```bash
idevice_id -l
# or
xcrun simctl list devices
```

### 11.3 Cloud Testing Services

Configure for BrowserStack, Sauce Labs, or LambdaTest by uncommenting sections in `.env.example`:

```env
BROWSERSTACK_USER=your_username
BROWSERSTACK_KEY=your_access_key
APPIUM_HOST=hub-cloud.browserstack.com
APPIUM_PORT=443
APPIUM_PATH=/wd/hub
```

### 11.4 Custom Capabilities

Add custom Appium capabilities in `.env`:
```env
CUSTOM_CAPABILITIES={"appium:showXcodeLog": true, "appium:newCommandTimeout": 120}
```

Or modify [AppiumActions.ts](file:///Users/aaronliu/Documents/repositories/AppAuto/framework/actions/AppiumActions.ts) buildDefaultCapabilities() method.

---

## Step 12: CI/CD Integration

### 12.1 GitHub Actions Example

Create `.github/workflows/mobile-tests.yml`:

```yaml
name: Mobile Tests

on: [push, pull_request]

jobs:
  android-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
          
      - name: Install dependencies
        run: npm install
        
      - name: Start Appium
        run: docker-compose up -d
        
      - name: Start Android Emulator
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 33
          target: google_apis
          arch: x86_64
          script: |
            adb wait-for-device
            TEST_PLATFORM=android npm run test:mobile:android
            
      - name: Generate Allure Report
        if: always()
        run: npm run report:generate
        
      - name: Upload Allure Report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: allure-report
          path: artifacts/allure-report
```

### 12.2 Jenkins Pipeline

```groovy
pipeline {
    agent any
    
    stages {
        stage('Setup') {
            steps {
                sh 'npm install'
                sh 'docker-compose up -d'
            }
        }
        
        stage('Android Tests') {
            steps {
                sh 'TEST_PLATFORM=android npm run test:mobile:android'
            }
        }
        
        stage('Generate Report') {
            steps {
                sh 'npm run report:generate'
                allure includeProperties: false, jdk: '', results: [[path: 'artifacts/allure-results']]
            }
        }
    }
    
    post {
        always {
            sh 'docker-compose down'
        }
    }
}
```

---

## Step 13: Best Practices

### 13.1 Test Organization
- Use Page Object Model (POM) pattern
- Keep tests independent and isolated
- Use descriptive test names
- Group related tests in describe blocks

### 13.2 Wait Strategies
- Avoid hardcoded sleeps
- Use explicit waits: `waitForElement`, `waitForElementToExist`
- Use conditional waits: `waitForText`, `waitForElementToBeEnabled`
- Set reasonable timeouts (10-15 seconds for most cases)

### 13.3 Selector Strategy Priority
1. Accessibility ID (testID in React Native) - Most reliable
2. Text content - Good for buttons/labels
3. Label/Accessibility Label - Alternative to ID
4. XPath - Last resort (brittle)

### 13.4 Error Handling
- Wrap critical operations in try-catch
- Take screenshots on failure: `await actions.takeScreenshot('error_state')`
- Log meaningful error messages
- Clean up resources in afterAll/afterEach

### 13.5 Performance Optimization
- Reuse driver sessions when possible
- Minimize unnecessary waits
- Use NO_RESET=true during development
- Parallelize independent tests

---

## Quick Reference Commands

```bash
# Start Appium
npm run appium:start

# Run Android tests
TEST_PLATFORM=android npm run test:mobile:android

# Run iOS tests
TEST_PLATFORM=ios npm run test:mobile:ios

# Run all mobile tests
npm run test:mobile

# View logs
docker-compose logs -f appium1

# Generate report
npm run report:generate
npm run report:open

# Clean up
npm run clean
```

---

## Summary

This complete configuration enables you to:
1. Set up Appium server (Docker or local)
2. Configure Android/iOS environments
3. Prepare test applications
4. Write cross-platform tests using ActionFactory
5. Execute tests with proper wait strategies
6. Debug issues using Appium Inspector
7. Integrate with CI/CD pipelines
8. Follow best practices for maintainable tests

The framework abstracts platform differences through ActionFactory, allowing you to write tests once and run on both iOS (Detox) and Android (Appium).
