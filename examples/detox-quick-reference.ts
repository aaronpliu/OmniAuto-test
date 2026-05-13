/**
 * DetoxActions Quick Reference
 * 
 * Quick guide to using flexible selectors in DetoxActions
 */

import { DetoxActions } from '../framework/actions/DetoxActions';
import { by, element } from 'detox';

const actions = new DetoxActions();

// ============================================
// QUICK REFERENCE: SELECTOR STRATEGIES
// ============================================

// 1️⃣ STRING SELECTOR (Backward Compatible)
//    Uses by.id() automatically
await actions.click('loginButton');

// 2️⃣ STATIC HELPERS
await actions.click(DetoxActions.byId('loginBtn'));        // By test ID
await actions.click(DetoxActions.byText('Submit'));        // By text
await actions.tap(DetoxActions.byLabel('Menu'));           // By label
await actions.scroll(DetoxActions.byType('UIScrollView')); // By type

// 3️⃣ DIRECT MATCHERS
await actions.click(element(by.text('OK')));
await actions.expectVisible(element(by.label('Welcome')));

// 4️⃣ COMBINED MATCHERS
await actions.click(
  DetoxActions.byAll(
    by.id('btn'),
    by.text('Submit')
  )
);

// ============================================
// COMMON PATTERNS
// ============================================

// ✅ Element with testID
await actions.click('myButton');

// ✅ Button without testID
await actions.click(DetoxActions.byText('Login'));

// ✅ Input field by label
await actions.typeText(
  DetoxActions.byLabel('Email'),
  'user@example.com'
);

// ✅ Scroll view
await actions.scroll(DetoxActions.byType('UITableView'));

// ✅ Specific element (avoid duplicates)
await actions.click(
  DetoxActions.byAll(
    by.text('Submit'),
    by.id('form-submit')
  )
);

// ✅ Nested element
await actions.expectVisible(
  element(by.id('child').withAncestor(by.id('parent')))
);

// ============================================
// ALL AVAILABLE METHODS (Signature Reference)
// ============================================

/*
// Navigation
await actions.navigateTo();

// Interactions
await actions.click(selector: DetoxSelector);
await actions.doubleClick(selector: DetoxSelector);
await actions.tap(selector: DetoxSelector);
await actions.longPress(selector: DetoxSelector, duration?: number);

// Input
await actions.typeText(selector: DetoxSelector, text: string);
await actions.clearText(selector: DetoxSelector);
const text = await actions.getText(selector: DetoxSelector);

// Assertions
await actions.waitForElement(selector: DetoxSelector, timeout?: number);
await actions.expectVisible(selector: DetoxSelector);
await actions.expectNotVisible(selector: DetoxSelector);
await actions.expectText(selector: DetoxSelector, text: string);
await actions.expectContainsText(selector: DetoxSelector, text: string);
await actions.expectEnabled(selector: DetoxSelector);
await actions.expectDisabled(selector: DetoxSelector);

// Gestures
await actions.swipe(direction: 'up' | 'down' | 'left' | 'right', distance?: number);
await actions.scroll(toSelector: DetoxSelector);
await actions.pinch(scale: number, speed?: 'slow' | 'fast', angle?: number);

// Utilities
const path = await actions.takeScreenshot(name: string);
await actions.reload();
await actions.back();
await actions.close();

// Device
await actions.setOrientation(orientation: 'portrait' | 'landscape');
await actions.setLocation(latitude: number, longitude: number);
*/

// ============================================
// TYPE DEFINITION
// ============================================

type DetoxSelector = string | ReturnType<typeof element>;

// String → by.id()
// NativeElement → use directly

// ============================================
// WHEN TO USE WHAT
// ============================================

/*
HAS testID?
  → Use string or DetoxActions.byId()
  
NO testID, HAS text?
  → Use DetoxActions.byText()
  
NO testID, HAS label?
  → Use DetoxActions.byLabel()
  
GENERIC component?
  → Use DetoxActions.byType()
  
MULTIPLE matches?
  → Use DetoxActions.byAll() or .and()
  
NESTED element?
  → Use .withAncestor() or .withDescendant()
*/
