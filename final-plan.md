# Final Plan: Fixing Pre-Flight Scrolling and AI Provider Loading

This plan outlines a robust solution to permanently fix the layout issues on the pre-flight check page and correct the AI provider loading mechanism.

## 1. Goal: A Stable, Centered, Non-Scrolling Pre-Flight Page

The primary objective is to ensure that when the user navigates to the "Aura Pre-Flight Check" view:
- The content is perfectly centered vertically and horizontally.
- There is no scrollbar if the content fits on the screen.
- The view is not scrolled to the bottom by default.
- The solution is responsive and does not negatively impact other views.

## 2. Root Cause Analysis

- **Scrolling Issue**: The core problem is the use of `position: absolute` on the `.view` elements. This removes them from the normal document flow, leading to inconsistent height calculations and unpredictable scrolling behavior when views are switched.
- **AI Provider Issue**: A `404 Not Found` error occurs because the code tries to `fetch` from a non-existent `/api/ai-providers` endpoint instead of the local `ai_providers.json` file.

## 3. Implementation Strategy: Refactor the Core Layout

### Step 1: Fix AI Provider Loading Path (in `web/js/main.js`)
This is a quick and essential fix to make the onboarding form work correctly.

- **In `loadAiProviders()` function:**
  - **FROM:** `const response = await fetch('/api/ai-providers');`
  - **TO:** `const response = await fetch('ai_providers.json');`

### Step 2: Refactor CSS for a Stable Flexbox Layout (in `web/css/main.css`)
This is the main fix for the scrolling and centering issue. It is a global change designed to improve the layout foundation for **all views**.

- **On the `body` element:**
  - Add `display: flex`, `justify-content: center`, and `align-items: center`. This turns the entire page's body into a flexbox container that will handle centering of its children.
  ```css
  body {
      /* ... existing styles ... */
      display: flex;
      flex-direction: column; /* Stack views vertically */
      justify-content: center;
      align-items: center;
      min-height: 100vh;
  }
  ```

- **On the `.view` class:**
  - Remove `position: absolute` and related properties (`transform`, `opacity`, `pointer-events`, `transition`).
  - Control visibility using `display: none` by default. This is a more robust way to toggle views.
  ```css
  .view {
      display: none; /* Hide all views */
      width: 100%;
      max-width: 900px; /* Match container width */
      /* No absolute positioning */
  }
  ```

- **On the `.view.active` class:**
  - Use `display: flex` to show the currently active view. This makes the active view a flex item that will be centered by the `body`.
  ```css
  .view.active {
      display: flex; /* Show the active view */
      flex-direction: column;
      align-items: center;
  }
  ```

- **On the `.container` class:**
  - Remove the vertical margin, as the new flexbox `body` now handles all the centering work.
  ```css
  .container {
      /* ... existing styles ... */
      margin: 0 auto; /* Remove top/bottom margin */
  }
  ```

## 4. Assurance of No Negative Side-Effects

**This change is designed to be a net positive for all views.**

- **How it works**: We are replacing a fragile system where each view was positioned independently with a single, unified system where the `body` manages the layout.
- **Onboarding & Live Views**: These views will now be centered by the same robust flexbox mechanism, preserving their appearance while increasing layout stability. The `max-width` of the content area remains unchanged, so there will be no visual difference other than the removal of the buggy behavior.
- **Verification**: After implementation, I will explicitly ask for verification that the Onboarding, Pre-flight, and Live Interview views all look and function correctly.

## 5. Expected Outcome
- The AI provider dropdown will populate correctly, and the default provider/model will be selected.
- When switching to the pre-flight view, the content will appear instantly centered without any scrolling.
- The layout for **all views** will be more robust and predictable across all modern browsers and devices.