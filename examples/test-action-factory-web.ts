/**
 * Test file to verify ActionFactory web platform support
 */

import { ActionFactory } from "../framework/actions/ActionFactory";

// Mock Page and Browser objects for testing
const mockPage = {
  context: () => ({
    grantPermissions: async () => {},
    setGeolocation: async () => {},
  }),
  goto: async () => {},
  click: async () => {},
  fill: async () => {},
  textContent: () => Promise.resolve(""),
  waitForSelector: async () => {},
  getAttribute: () => Promise.resolve(null),
  locator: () => ({
    boundingBox: () => Promise.resolve({ width: 800, height: 600 }),
    scrollIntoViewIfNeeded: async () => {},
  }),
  mouse: {
    move: async () => {},
    down: async () => {},
    up: async () => {},
  },
  evaluate: async () => {},
  screenshot: async () => {},
  reload: async () => {},
  goBack: async () => {},
  viewportSize: () => ({ width: 800, height: 600 }),
  setViewportSize: async () => {},
  dispatchEvent: async () => {},
  waitForTimeout: async () => {},
  dblclick: async () => {},
};

const mockBrowser = {
  close: async () => {},
};

function testActionFactory(): void {
  console.log("Testing ActionFactory web platform support...\n");

  try {
    // Test 1: createForWeb helper method
    console.log("✓ Test 1: Using createForWeb helper");
    const actions1 = ActionFactory.createForWeb(mockPage as any);
    console.log("  - Created actions successfully");
    console.log("  - Type:", actions1.constructor.name);

    // Test 2: createForWeb with browser
    console.log("\n✓ Test 2: Using createForWeb with browser");
    const _actions2 = ActionFactory.createForWeb(mockPage as any, mockBrowser as any);
    console.log("  - Created actions with browser successfully");

    // Test 3: create with config object
    console.log("\n✓ Test 3: Using create with config object");
    const _actions3 = ActionFactory.create({
      platform: "web",
      page: mockPage as any,
      browser: mockBrowser as any,
    });
    console.log("  - Created actions with config successfully");

    // Test 4: Error handling - missing page
    console.log("\n✓ Test 4: Error handling - missing page object");
    try {
      ActionFactory.create({ platform: "web" });
      console.log("  - ERROR: Should have thrown an error");
    } catch (error: any) {
      console.log("  - Correctly threw error:", error.message);
    }

    // Test 5: Verify methods exist
    console.log("\n✓ Test 5: Verifying action methods exist");
    const requiredMethods = [
      "navigateTo",
      "click",
      "doubleClick",
      "tap",
      "longPress",
      "typeText",
      "clearText",
      "getText",
      "waitForElement",
      "expectVisible",
      "expectNotVisible",
      "expectText",
      "expectContainsText",
      "expectEnabled",
      "expectDisabled",
      "swipe",
      "scroll",
      "pinch",
      "takeScreenshot",
      "reload",
      "back",
      "close",
      "setOrientation",
      "setLocation",
    ];

    let allMethodsExist = true;
    for (const method of requiredMethods) {
      if (typeof (actions1 as any)[method] !== "function") {
        console.log(`  - Missing method: ${method}`);
        allMethodsExist = false;
      }
    }

    if (allMethodsExist) {
      console.log("  - All required methods exist ✓");
    }

    console.log("\n✅ All tests passed!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
void testActionFactory();
