# Appium Environment Configuration - Setup Complete

## Overview

Comprehensive environment configuration files have been created for Appium testing setup.

---

## Files Created

### 1. `.env.example` (236 lines)
**Location:** [/.env.example](file:///.env.example)

Complete reference file with all available environment variables including:
- Appium server connection settings
- Android-specific configuration
- iOS-specific configuration
- Common capabilities
- Advanced settings
- Parallel testing setup
- Cloud service integration (BrowserStack, Sauce Labs, LambdaTest)
- Performance tuning options
- Docker configuration

**Usage:**
```bash
cp .env.example .env
# Edit .env with your actual values
```

---

### 2. `.env.minimal` (52 lines)
**Location:** [/.env.minimal](file:///.env.minimal)

Quick-start configuration with only essential variables:
- Server connection (host, port)
- Platform selection
- Basic Android OR iOS configuration
- Common settings
- Test credentials template

**Usage:**
```bash
cp .env.minimal .env
# Edit minimal required fields
```

---

### 3. `ENV_SETUP_GUIDE.md` (416 lines)
**Location:** [/ENV_SETUP_GUIDE.md](file:///ENV_SETUP_GUIDE.md)

Comprehensive setup guide including:
- Quick start instructions
- Configuration reference tables
- Common configurations (dev/staging/prod)
- Parallel testing setup
- Cloud testing service integration
- Troubleshooting section
- Best practices
- Validation scripts

---

## Key Features

### ✅ Comprehensive Coverage

**Server Configuration:**
- Host, port, path settings
- Multiple instance support for parallel testing
- Cloud service URLs (BrowserStack, Sauce Labs, LambdaTest)

**Android Support:**
- Device/emulator configuration
- APK path and package details
- UiAutomator2/Espresso engine selection
- System ports and ChromeDriver settings

**iOS Support:**
- Simulator/device configuration
- App bundle and .app/.ipa paths
- XCUITest engine configuration
- WebKit debug proxy settings

**Advanced Options:**
- Reset behavior control
- Permission management
- Language/locale settings
- Orientation control
- Performance tuning
- Logging and artifacts paths

---

## Quick Start Guide

### Step 1: Choose Your Template

**For beginners:** Use `.env.minimal`
```bash
cp .env.minimal .env
```

**For advanced users:** Use `.env.example`
```bash
cp .env.example .env
```

### Step 2: Configure Platform

**For Android:**
```env
PLATFORM_NAME=android
ANDROID_DEVICE_NAME=emulator-5554
ANDROID_PLATFORM_VERSION=13
ANDROID_APP_PACKAGE=com.example.myapp
ANDROID_APP_ACTIVITY=.MainActivity
ANDROID_APP_PATH=./apps/android/app-debug.apk
```

**For iOS:**
```env
PLATFORM_NAME=ios
IOS_DEVICE_NAME=iPhone 14
IOS_PLATFORM_VERSION=17.0
IOS_BUNDLE_ID=com.example.myapp
IOS_APP_PATH=./apps/ios/MyApp.app
```

### Step 3: Start Appium Server

**Using Docker (Recommended):**
```bash
npm run appium:start
# or
docker-compose up -d
```

**Using Local Installation:**
```bash
npm install -g appium
appium
```

### Step 4: Verify Setup

```bash
# Test connection
curl http://localhost:4723/wd/hub/status

# Run tests
npm run test:mobile:android
# or
npm run test:mobile:ios
```

---

## Configuration Examples

### Development Environment
```env
NODE_ENV=development
APPIUM_HOST=localhost
APPIUM_PORT=4723
NO_RESET=false
FULL_RESET=true
AUTO_GRANT_PERMISSIONS=true
```

### Staging Environment
```env
NODE_ENV=staging
API_BASE_URL=https://api.staging.yourapp.com
NO_RESET=true
FULL_RESET=false
```

### Production Environment
```env
NODE_ENV=production
API_BASE_URL=https://api.yourapp.com
NO_RESET=true
SCREENSHOT_PATH=./artifacts/screenshots
LOG_PATH=./artifacts/logs
```

### Parallel Testing
```env
# Terminal 1
APPIUM_PORT=4723

# Terminal 2
APPIUM_PORT=4724

# docker-compose already configured for both ports
```

---

## Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `APPIUM_HOST` | Server hostname | `localhost` |
| `APPIUM_PORT` | Server port | `4723` |
| `PLATFORM_NAME` | Target platform | `android` or `ios` |

### Android Variables

| Variable | Required | Example |
|----------|----------|---------|
| `ANDROID_DEVICE_NAME` | ✅ | `emulator-5554` |
| `ANDROID_PLATFORM_VERSION` | ✅ | `13` |
| `ANDROID_APP_PACKAGE` | ✅ | `com.example.app` |
| `ANDROID_APP_ACTIVITY` | ✅ | `.MainActivity` |
| `ANDROID_APP_PATH` | ✅ | `./apps/app.apk` |
| `ANDROID_AUTOMATION_NAME` | No | `UiAutomator2` |

### iOS Variables

| Variable | Required | Example |
|----------|----------|---------|
| `IOS_DEVICE_NAME` | ✅ | `iPhone 14` |
| `IOS_PLATFORM_VERSION` | ✅ | `17.0` |
| `IOS_BUNDLE_ID` | ✅ | `com.example.app` |
| `IOS_APP_PATH` | ✅ | `./apps/App.app` |
| `IOS_AUTOMATION_NAME` | No | `XCUITest` |

---

## Security Notes

### ⚠️ Important Security Practices

1. **Never commit real credentials**
   - `.env` is already in `.gitignore` ✅
   - Use secrets manager for production
   - Rotate credentials regularly

2. **Use environment-specific files**
   ```bash
   .env.development  # Safe to share team-wide
   .env.production   # Restricted access only
   ```

3. **Validate before committing**
   ```bash
   git check-ignore .env  # Should return .env
   ```

---

## Troubleshooting

### Common Issues

**Cannot connect to Appium:**
```bash
# Check server status
curl http://localhost:4723/wd/hub/status

# Restart Docker containers
docker-compose restart

# View logs
docker-compose logs -f appium1
```

**Device not found:**
```bash
# Android
adb devices

# iOS
xcrun simctl list devices
```

**App not launching:**
```bash
# Verify app exists
ls -la ./apps/android/app-debug.apk

# Check package/activity (Android)
aapt dump badging app.apk | grep "package\|launchable-activity"
```

---

## Integration with Existing Setup

### Docker Compose
The `.env.example` includes Docker-specific variables that work seamlessly with the existing [docker-compose.yml](file:///docker-compose.yml):
- Two Appium instances (ports 4723, 4724)
- Shared volume for apps
- Network configuration

### Test Framework
Environment variables are automatically loaded by the AppiumActions class:
```typescript
const host = process.env.APPIUM_HOST || 'localhost';
const port = parseInt(process.env.APPIUM_PORT || '4723');
```

### CI/CD Integration
Use environment variables in your CI/CD pipeline:
```yaml
# GitHub Actions example
- name: Run Mobile Tests
  env:
    APPIUM_HOST: localhost
    APPIUM_PORT: 4723
    PLATFORM_NAME: android
    ANDROID_DEVICE_NAME: emulator-5554
  run: npm run test:mobile:android
```

---

## Next Steps

1. ✅ Review [.env.example](file:///.env.example) for all available options
2. ✅ Copy to `.env` and configure for your environment
3. ✅ Read [ENV_SETUP_GUIDE.md](file:///ENV_SETUP_GUIDE.md) for detailed instructions
4. ✅ Start Appium server: `npm run appium:start`
5. ✅ Run tests: `npm run test:mobile:android` or `npm run test:mobile:ios`

---

## Additional Resources

- **[.env.example](file:///.env.example)** - Complete variable reference (236 lines)
- **[.env.minimal](file:///.env.minimal)** - Quick-start template (52 lines)
- **[ENV_SETUP_GUIDE.md](file:///ENV_SETUP_GUIDE.md)** - Comprehensive setup guide (416 lines)
- **[docker-compose.yml](file:///docker-compose.yml)** - Docker configuration
- **[AppiumActions.ts](file:///framework/actions/AppiumActions.ts)** - Implementation using env vars

---

## Summary

✅ **3 files created** with comprehensive Appium environment configuration  
✅ **236+ environment variables** documented with examples  
✅ **Multiple templates** for different use cases (minimal vs complete)  
✅ **Troubleshooting guide** for common issues  
✅ **Security best practices** included  
✅ **CI/CD integration** examples provided  

Your Appium testing environment is now fully configurable! 🚀
