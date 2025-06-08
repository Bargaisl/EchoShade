# Revised Implementation Plan

This plan addresses the persistent issues with AI provider loading and the pre-flight page layout based on the latest feedback and console logs.

## 1. Fix AI Provider Loading (Root Cause Identified)

**Problem**: The application fails to load the list of AI providers, preventing the default values from being set.

**Root Cause**: The application is trying to fetch providers from a backend API endpoint (`/api/ai-providers`) that does not exist, resulting in a 404 error. The data is stored in a local static file: `ai_providers.json`.

**Solution**:
- **File**: `web/js/main.js`
- **Action**: Modify the `loadAiProviders` function to fetch the data directly from the local JSON file.
- **Code Change**:
  ```javascript
  // Change this line:
  const response = await fetch('/api/ai-providers');
  
  // To this:
  const response = await fetch('ai_providers.json');
  ```

This change will correctly load the provider data, allowing the rest of the logic (which sets the default provider and model) to execute as intended.

## 2. Fix Pre-flight Page Layout and Scrolling (Robust Refactor)

**Problem**: The pre-flight check page is not centered vertically and has unnecessary scrolling.

**Root Cause**: The current CSS layout, which uses `position: absolute` for views and relies on container margins, is fragile and causes inconsistent scroll behavior when switching between views.

**Solution**:
- **File**: `web/css/main.css`
- **Action**: Refactor the core layout to use a modern, stable flexbox approach on the `body` element. This will simplify the layout, eliminate the need for absolute positioning of views, and provide reliable centering.
- **Code Changes**:

  **1. Refactor `body` styles:**
  ```css
  body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-color);
      color: var(--text-color);
      margin: 0;
      padding: 0;
      min-height: 100vh;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      /* Add these lines to make body a flex container */
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
  }
  ```

  **2. Refactor `.view` styles:**
  ```css
  .view {
      /* Remove absolute positioning and transforms */
      width: 100%;
      max-width: 900px; /* Match container width */
      padding: 1rem;
      box-sizing: border-box;
      /* Control visibility with display property */
      display: none;
      flex-direction: column;
      align-items: center;
  }

  .view.active {
      /* Show the active view as a flex item */
      display: flex;
  }
  ```

  **3. Remove redundant `.container` margin:**
  ```css
  .container {
      /* ... existing styles ... */
      /* Remove vertical margin, as body now handles centering */
      margin: 0 auto; 
  }
  ```

  **4. Simplify `#preflight-view` styles:**
  ```css
  #preflight-view {
      /* Flexbox on body now handles centering, so these are less critical */
      /* We just need to ensure it doesn't scroll internally */
      overflow-y: hidden;
      justify-content: center;
  }
  ```

This revised plan targets the specific root causes of the issues. Once you approve it, I will switch to Code mode to implement these changes.