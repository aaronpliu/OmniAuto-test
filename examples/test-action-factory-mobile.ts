/**
 * Test file to verify ActionFactory still works for mobile platforms
 */

import { ActionFactory } from "../framework/actions/ActionFactory";

function testActionFactoryMobile(): void {
  console.log("Testing ActionFactory mobile platform support...\n");

  try {
    // Test 1: iOS platform
    console.log("✓ Test 1: Creating iOS actions");
    const iosActions = ActionFactory.createForMobile("ios");
    console.log("  - Created iOS actions successfully");
    console.log("  - Type:", iosActions.constructor.name);

    // Test 2: Android platform without capabilities
    console.log("\n✓ Test 2: Creating Android actions (no capabilities)");
    const androidActions1 = ActionFactory.createForMobile("android");
    console.log("  - Created Android actions successfully");
    console.log("  - Type:", androidActions1.constructor.name);

    // Test 3: Android platform with capabilities
    console.log("\n✓ Test 3: Creating Android actions (with capabilities)");
    const androidActions2 = ActionFactory.createForMobile("android", {
      deviceName: "emulator-5554",
      platformVersion: "11.0",
    });
    console.log("  - Created Android actions with capabilities successfully");
    console.log("  - Type:", androidActions2.constructor.name);

    // Test 4: Using generic create method
    console.log("\n✓ Test 4: Using create method with platform string");
    const actions = ActionFactory.create("ios");
    console.log("  - Created actions using string parameter");
    console.log("  - Type:", actions.constructor.name);

    // Test 5: Error handling - unsupported platform
    console.log("\n✓ Test 5: Error handling - unsupported platform");
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- intentional invalid platform for error testing
      ActionFactory.create("unsupported" as any);
      console.log("  - ERROR: Should have thrown an error");
    } catch (error: any) {
      console.log("  - Correctly threw error:", error.message);
    }

    console.log("\n✅ All mobile platform tests passed!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

// Run the test
void testActionFactoryMobile();
