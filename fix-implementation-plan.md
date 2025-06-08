# Fix Implementation Plan: Default AI Provider & Preflight Page Layout

## Issues Identified

### Issue 1: Default AI Provider Not Selected
**Problem**: The default AI provider (Cerebras) and model (llama-3.3-70b) are not being selected in the dropdown menus on page load.

**Root Cause Analysis**:
- In `loadAiProviders()` function (lines 293-301), the default selection logic exists but has timing issues
- The function sets `onboardingForm.providerSelect.value = defaultProvider.name` but this happens asynchronously
- The model dropdown update might not be triggered properly
- DOM elements might not be fully initialized when defaults are set

### Issue 2: Preflight Page Layout & Scrolling
**Problem**: 
- Preflight page appears scrolled down when loaded
- Unnecessary scrolling behavior
- Content not properly centered
- Not optimized for the compact content size

**Root Cause Analysis**:
- `.view` class uses `align-items: flex-start` (line 32 in CSS) pushing content to top
- `overflow-y: auto` (line 37) enables scrolling when not needed
- No specific centering for preflight view content
- Container margins and positioning cause initial scroll offset

## Implementation Plan

### Phase 1: Fix Default AI Provider Selection

#### Step 1.1: Improve Timing in loadAiProviders()
```javascript
// Add proper timing mechanism
async function loadAiProviders() {
    try {
        const response = await fetch('/api/ai-providers');
        appState.aiProviders = await response.json();
        
        const providerSelect = onboardingForm.providerSelect;
        providerSelect.innerHTML = '<option value="">Select AI Provider</option>';
        appState.aiProviders.forEach(p => {
            const option = document.createElement('option');
            option.value = p.name;
            option.textContent = p.name;
            providerSelect.appendChild(option);
        });
        
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            setDefaultAIProvider();
        });
    } catch (error) {
        console.error("Failed to load AI providers:", error);
    }
}
```

#### Step 1.2: Create Dedicated Default Setting Function
```javascript
function setDefaultAIProvider() {
    const defaultProvider = appState.aiProviders.find(p => p.default);
    if (defaultProvider) {
        // Set provider
        onboardingForm.providerSelect.value = defaultProvider.name;
        
        // Trigger change event to update model dropdown
        onboardingForm.providerSelect.dispatchEvent(new Event('change'));
        
        // Set default model after a brief delay
        setTimeout(() => {
            const defaultModel = defaultProvider.models.find(m => m === 'llama-3.3-70b');
            if (defaultModel && onboardingForm.modelSelect) {
                onboardingForm.modelSelect.value = defaultModel;
            }
        }, 100);
    }
}
```

### Phase 2: Fix Preflight Page Layout

#### Step 2.1: Create Specific Preflight View Styling
```css
/* Specific styling for preflight view */
#preflight-view {
    align-items: center !important;
    overflow-y: hidden !important;
    padding: 1rem;
}

#preflight-view .container {
    margin: 0 auto;
    max-height: calc(100vh - 2rem);
    display: flex;
    flex-direction: column;
    justify-content: center;
}

/* Ensure checks section doesn't overflow */
#checks {
    max-height: 60vh;
    overflow-y: auto;
}
```

#### Step 2.2: Responsive Design for Preflight
```css
@media (max-width: 768px) {
    #preflight-view {
        padding: 0.5rem;
    }
    
    #preflight-view .container {
        max-height: calc(100vh - 1rem);
        padding: 1.5rem;
    }
    
    #checks {
        max-height: 50vh;
    }
}

@media (max-height: 600px) {
    #preflight-view .container {
        max-height: 95vh;
    }
    
    #checks {
        max-height: 40vh;
    }
}
```

### Phase 3: Additional Improvements

#### Step 3.1: Smooth View Transitions
```javascript
function switchView(targetView) {
    Object.values(views).forEach(view => view.classList.remove('active'));
    views[targetView].classList.add('active');
    
    // Reset scroll position for preflight view
    if (targetView === 'preflight') {
        views[targetView].scrollTop = 0;
    }
}
```

#### Step 3.2: Enhanced Error Handling
```javascript
function setDefaultAIProvider() {
    try {
        const defaultProvider = appState.aiProviders.find(p => p.default);
        if (defaultProvider && onboardingForm.providerSelect) {
            onboardingForm.providerSelect.value = defaultProvider.name;
            onboardingForm.providerSelect.dispatchEvent(new Event('change'));
            
            setTimeout(() => {
                if (onboardingForm.modelSelect && !onboardingForm.modelSelect.disabled) {
                    const defaultModel = defaultProvider.models.find(m => m === 'llama-3.3-70b') || defaultProvider.models[0];
                    if (defaultModel) {
                        onboardingForm.modelSelect.value = defaultModel;
                    }
                }
            }, 150);
        }
    } catch (error) {
        console.error("Error setting default AI provider:", error);
    }
}
```

## Testing Checklist

### Default AI Provider Testing
- [ ] Page loads with Cerebras selected in provider dropdown
- [ ] Model dropdown shows llama-3.3-70b selected by default
- [ ] Manual provider changes still work correctly
- [ ] Form validation recognizes pre-selected values

### Preflight Page Layout Testing
- [ ] Preflight page loads with content centered vertically
- [ ] No initial scroll offset
- [ ] Content fits within viewport without scrolling
- [ ] Back button and start button are visible
- [ ] Responsive design works on mobile devices
- [ ] View transitions are smooth

### Cross-functionality Testing
- [ ] Navigation between views works smoothly
- [ ] Form submission works with default values
- [ ] Pre-flight checks complete successfully
- [ ] No JavaScript errors in console

## File Changes Required

1. **web/js/main.js**:
   - Modify `loadAiProviders()` function
   - Add `setDefaultAIProvider()` function
   - Update `switchView()` function

2. **web/css/main.css**:
   - Add `#preflight-view` specific styling
   - Update responsive design rules
   - Add overflow management for checks

## Implementation Priority

1. **High Priority**: Fix default AI provider selection (affects user experience significantly)
2. **High Priority**: Fix preflight page centering (affects professional appearance)
3. **Medium Priority**: Add responsive design improvements
4. **Low Priority**: Enhanced error handling and logging

## Success Criteria

- Default AI provider and model are pre-selected on page load
- Preflight page content is properly centered without scrolling
- All functionality remains intact
- Responsive design works across devices
- No JavaScript errors or console warnings