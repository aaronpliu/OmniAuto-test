/**
 * Type checking test for DetoxActions selector resolution
 * This file verifies that all selector types compile correctly
 */

import { by, element } from "detox";
import { DetoxActions } from "../plugins/detox/DetoxActions";

// This file is for TypeScript compilation checking only
// It verifies that all selector types are accepted by the action methods

async function _demonstrateSelectorTypes() {
  const actions = new DetoxActions();

  // ============================================
  // TYPE 1: String selectors (test IDs)
  // ============================================

  // String is automatically converted to by.id()
  await actions.click("loginButton");
  await actions.click("submitBtn");
  await actions.typeText("usernameInput", "testuser");
  await actions.clearText("passwordInput");
  await actions.getText("welcomeText");
  await actions.waitForElement("homeScreen");
  await actions.expectVisible("dashboard");
  await actions.expectNotVisible("loadingSpinner");
  await actions.expectText("statusMessage", "Success");
  await actions.expectContainsText("description", "completed");
  await actions.expectEnabled("submitButton");
  await actions.expectDisabled("cancelButton");
  await actions.longPress("menuItem", 2000);
  await actions.doubleClick("icon");
  await actions.scroll("scrollView");

  // ============================================
  // TYPE 2: NativeElements (already wrapped)
  // ============================================

  // Pre-wrapped elements are used directly
  await actions.click(element(by.id("loginButton")));
  await actions.click(element(by.text("Submit")));
  await actions.typeText(element(by.label("Email")), "user@example.com");
  await actions.clearText(element(by.type("UITextField")));
  await actions.getText(element(by.id("title")));
  await actions.waitForElement(element(by.id("content")), 5000);
  await actions.expectVisible(element(by.label("Welcome")));
  await actions.expectNotVisible(element(by.id("error")));
  await actions.expectText(element(by.id("message")), "Hello");
  await actions.expectContainsText(element(by.text("Status")), "active");
  await actions.expectEnabled(element(by.id("btn")));
  await actions.expectDisabled(element(by.id("disabledBtn")));
  await actions.longPress(element(by.id("item")), 1500);
  await actions.doubleClick(element(by.id("icon")));
  await actions.scroll(element(by.type("UIScrollView")));

  // ============================================
  // TYPE 3: Raw matchers (automatically wrapped)
  // ============================================

  // Matchers like by.text(), by.label(), by.type() are automatically wrapped with element()
  await actions.click(by.text("Submit"));
  await actions.click(by.label("Menu Button"));
  await actions.typeText(by.id("email"), "test@test.com");
  await actions.clearText(by.label("Password Field"));
  await actions.getText(by.text("Username"));
  await actions.waitForElement(by.id("screen"));
  await actions.expectVisible(by.label("Header"));
  await actions.expectNotVisible(by.id("modal"));
  await actions.expectText(by.text("Title"), "Dashboard");
  await actions.expectContainsText(by.label("Description"), "info");
  await actions.expectEnabled(by.id("actionBtn"));
  await actions.expectDisabled(by.text("Inactive"));
  await actions.longPress(by.label("Option"), 1000);
  await actions.doubleClick(by.id("fastClick"));
  await actions.scroll(by.type("UITableView"));

  // ============================================
  // TYPE 4: Static helper methods
  // ============================================

  // Using DetoxActions static helpers
  await actions.click(DetoxActions.byId("loginBtn"));
  await actions.click(DetoxActions.byText("Login"));
  await actions.typeText(DetoxActions.byLabel("Email"), "user@test.com");
  await actions.clearText(DetoxActions.byType("UITextField"));
  await actions.getText(DetoxActions.byId("header"));
  await actions.waitForElement(DetoxActions.byText("Loading"), 3000);
  await actions.expectVisible(DetoxActions.byLabel("Success"));
  await actions.expectNotVisible(DetoxActions.byId("Error"));
  await actions.expectText(DetoxActions.byText("Status"), "OK");
  await actions.expectContainsText(DetoxActions.byLabel("Info"), "details");
  await actions.expectEnabled(DetoxActions.byId("submit"));
  await actions.expectDisabled(DetoxActions.byText("Disabled"));
  await actions.longPress(DetoxActions.byLabel("Item"), 800);
  await actions.doubleClick(DetoxActions.byId("button"));
  await actions.scroll(DetoxActions.byType("ScrollView"));

  // ============================================
  // TYPE 5: Combined matchers
  // ============================================

  // Using byAll to combine multiple conditions
  await actions.click(DetoxActions.byAll(by.id("submitBtn"), by.text("Submit")));

  await actions.click(DetoxActions.byAll(by.label("Action"), by.type("UIButton")));

  await actions.typeText(DetoxActions.byAll(by.id("input"), by.label("Username")), "testuser");

  // ============================================
  // TYPE 6: Complex/nested selectors
  // ============================================

  // Nested elements with ancestor/descendant
  await actions.click(element(by.id("child").withAncestor(by.id("parent"))));

  await actions.expectVisible(element(by.id("item").withDescendant(by.text("Content"))));

  await actions.click(element(by.text("Button").and(by.id("btn"))));

  // ============================================
  // TYPE 7: Regex matchers
  // ============================================

  await actions.click(element(by.text(/Submit \d+/)));
  await actions.expectVisible(element(by.label(/Welcome.*/)));
  await actions.getText(element(by.text(/User \w+/)));

  console.log("✅ All selector types compile successfully!");
}

// Export to make it a module
export {};
