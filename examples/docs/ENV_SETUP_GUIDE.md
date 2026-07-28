# Environment Setup Guide for Appium

## Quick Start

### 1. Create Your Environment File

```bash
# Copy the example file
cp .env.example .env

# Edit with your configuration
nano .env  # or use your preferred editor
```

### 2. Configure for Your Platform

#### For Android Testing

```env
# Server Configuration
APPIUM_HOST=localhost
APPIUM_PORT=4723

# Android Settings
PLATFORM_NAME=android
ANDROID_DEVICE_NAME=emulator-5554
ANDROID_PLATFORM_VERSION=13
ANDROID_APP_PACKAGE=com.example.myapp
ANDROID_APP_ACTIVITY=.MainActivity
ANDROID_APP_PATH=./apps/android/app-debug.apk
ANDROID_AUTOMATION_NAME=UiAutomator2
```

#### For iOS Testing

```env
# Server Configuration
APPIUM_HOST=localhost
APPIUM_PORT=4723

# iOS Settings
PLATFORM_NAME=ios
IOS_DEVICE_NAME=iPhone 14
IOS_PLATFORM_VERSION=17.0
IOS_BUNDLE_ID=com.example.myapp
IOS_APP_PATH=./apps/ios/MyApp.app
IOS_AUTOMATION_NAME=XCUITest
```

### 3. Configure Appium Server

#### Option A: Connect to Remote Appium Server

Configure the Appium Server address in `configs/mobile.config.local.js`:

```json
{
  "platform": "android",
  "test": {
    "appium": {
      "host": "your-appium-server.com",
      "port": 4723
    }
  }
}
```

#### Option B: Local Installation (for debugging)

```bash
# Install Appium globally
npm install -g appium

# Start Appium server
appium

# Or with custom port
appium --port 4723
```

### 4. Verify Connection

```bash
# Test Appium server is running
curl http://localhost:4723/wd/hub/status

# Should return JSON with status "success"
```

---

## Configuration Reference

### Required Variables

| Variable        | Description            | Example            |
| --------------- | ---------------------- | ------------------ |
| `APPIUM_HOST`   | Appium server hostname | `localhost`        |
| `APPIUM_PORT`   | Appium server port     | `4723`             |
| `PLATFORM_NAME` | Target platform        | `android` or `ios` |

### Android-Specific Variables

| Variable                   | Description          | Required                   |
| -------------------------- | -------------------- | -------------------------- |
| `ANDROID_DEVICE_NAME`      | Device/emulator name | ✅ Yes                     |
| `ANDROID_PLATFORM_VERSION` | Android version      | ✅ Yes                     |
| `ANDROID_APP_PACKAGE`      | App package name     | ✅ Yes                     |
| `ANDROID_APP_ACTIVITY`     | Main activity        | ✅ Yes                     |
| `ANDROID_APP_PATH`         | Path to APK file     | ✅ Yes                     |
| `ANDROID_AUTOMATION_NAME`  | Automation engine    | No (default: UiAutomator2) |

### iOS-Specific Variables

| Variable               | Description            | Required               |
| ---------------------- | ---------------------- | ---------------------- |
| `IOS_DEVICE_NAME`      | Device/simulator name  | ✅ Yes                 |
| `IOS_PLATFORM_VERSION` | iOS version            | ✅ Yes                 |
| `IOS_BUNDLE_ID`        | App bundle identifier  | ✅ Yes                 |
| `IOS_APP_PATH`         | Path to .app/.ipa file | ✅ Yes                 |
| `IOS_AUTOMATION_NAME`  | Automation engine      | No (default: XCUITest) |

---

## Common Configurations

### Development Environment

```env
NODE_ENV=development
APPIUM_HOST=localhost
APPIUM_PORT=4723
NO_RESET=false
FULL_RESET=true
AUTO_GRANT_PERMISSIONS=true
LANGUAGE=en
LOCALE=US
```

### Staging Environment

```env
NODE_ENV=staging
API_BASE_URL=https://api.staging.yourapp.com
APP_BASE_URL=https://staging.yourapp.com
NO_RESET=true
FULL_RESET=false
```

### Production Environment

```env
NODE_ENV=production
API_BASE_URL=https://api.yourapp.com
APP_BASE_URL=https://yourapp.com
NO_RESET=true
FULL_RESET=false
SCREENSHOT_PATH=./artifacts/screenshots
LOG_PATH=./artifacts/logs
```

---

## Cloud Testing Services

### BrowserStack

```env
APPIUM_HOST=hub-cloud.browserstack.com
APPIUM_PORT=443
APPIUM_PATH=/wd/hub

BROWSERSTACK_USER=your_username
BROWSERSTACK_KEY=your_access_key

# Add to capabilities in your test config
CAPABILITIES_BROWSERSTACK_USER=your_username
CAPABILITIES_BROWSERSTACK_KEY=your_access_key
```

### Sauce Labs

```env
APPIUM_HOST=ondemand.us-west-1.saucelabs.com
APPIUM_PORT=443
APPIUM_PATH=/wd/hub

SAUCELABS_USER=your_username
SAUCELABS_KEY=your_access_key
```

### LambdaTest

```env
APPIUM_HOST=mobile-api.lambdatest.com
APPIUM_PORT=443
APPIUM_PATH=/wd/hub

LAMBDATEST_USER=your_username
LAMBDATEST_KEY=your_access_key
```

---

## Troubleshooting

### Issue: Cannot connect to Appium

**Solution:**

```bash
# Check if Appium is running
curl http://localhost:4723/wd/hub/status

# If using local Appium, check if it's running
ps aux | grep appium

# If using remote Appium, check network connectivity
ping your-appium-server.com

# View Appium logs for errors
# (Check the log location configured for your Appium Server)
```

### Issue: Device not found

**Android:**

```bash
# List connected devices
adb devices

# Start emulator if needed
emulator -avd <emulator_name>

# Update ANDROID_DEVICE_NAME in .env
ANDROID_DEVICE_NAME=emulator-5554
```

**iOS:**

```bash
# List available simulators
xcrun simctl list devices

# Update IOS_DEVICE_NAME in .env
IOS_DEVICE_NAME=iPhone 14
```

### Issue: App not launching

**Check app path:**

```bash
# Verify app file exists
ls -la ./apps/android/app-debug.apk
ls -la ./apps/ios/MyApp.app

# Update path in .env
ANDROID_APP_PATH=./apps/android/app-debug.apk
```

**Check package/activity (Android):**

```bash
# Get package and activity from APK
aapt dump badging ./apps/android/app-debug.apk | grep "package\|launchable-activity"

# Update .env accordingly
ANDROID_APP_PACKAGE=com.example.myapp
ANDROID_APP_ACTIVITY=.MainActivity
```

### Issue: Permission errors

**Android:**

```env
# Auto-grant all permissions
AUTO_GRANT_PERMISSIONS=true
```

**iOS:**

```env
# Auto-accept system alerts
AUTO_ACCEPT_ALERTS=true
```

---

## Best Practices

### 1. Never Commit Real Credentials

```bash
# .env is already in .gitignore ✅
# But double-check:
git check-ignore .env

# Use secrets manager for production
# AWS Secrets Manager, HashiCorp Vault, etc.
```

### 2. Use Environment-Specific Files

```bash
# Create environment-specific files
.env.development
.env.staging
.env.production

# Load appropriate file
export $(cat .env.development | xargs)
```

### 3. Validate Configuration

```bash
# Create a validation script
cat > validate-env.sh << 'EOF'
#!/bin/bash

echo "Validating environment configuration..."

# Check required variables
required_vars=("APPIUM_HOST" "APPIUM_PORT" "PLATFORM_NAME")

for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    echo "❌ Missing required variable: $var"
    exit 1
  fi
done

echo "✅ All required variables are set"

# Check platform-specific variables
if [ "$PLATFORM_NAME" = "android" ]; then
  echo "Checking Android configuration..."
  # Add Android-specific checks
elif [ "$PLATFORM_NAME" = "ios" ]; then
  echo "Checking iOS configuration..."
  # Add iOS-specific checks
fi

echo "✅ Configuration valid"
EOF

chmod +x validate-env.sh
./validate-env.sh
```

### 4. Document Custom Capabilities

```env
# Add comments for custom capabilities
# Enable Xcode logs for iOS debugging
CUSTOM_CAPABILITIES={"appium:showXcodeLog": true}

# Disable animations for faster tests
CUSTOM_CAPABILITIES={"appium:disableWindowAnimation": true}
```

---

## Additional Resources

- [Appium Documentation](https://appium.io/docs/en/latest/)
- [Desired Capabilities Reference](https://appium.io/docs/en/latest/guides/caps/)
- [UiAutomator2 Driver](https://github.com/appium/appium-uiautomator2-driver)
- [XCUITest Driver](https://github.com/appium/appium-xcuitest-driver)

---

## Support

For issues or questions:

1. Check Appium logs (location depends on your Appium Server setup)
2. Review [.env.example](./.env.example) for all available options
3. See [WAIT_MECHANISMS.md](./WAIT_MECHANISMS.md) for test wait strategies
4. Check project README for general setup instructions
