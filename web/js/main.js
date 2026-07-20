// Modular main.js - Entry point and coordination
import { StateManager } from './state-manager.js';
import { WebSocketHandler } from './websocket-handler.js';
import { ProviderManager } from './provider-manager.js';
import {
    setupMicrophone,
    startAudioProcessing,
    stopAudioProcessing,
    getScreenVideoTrack,
    isScreenSharingAvailable
} from './audio_handler.js';
import muteManager from './mute-manager.js';
import { autofillForTesting } from './dev.js';
import { loadConfig, isDev, devLog, devWarn, devError, applyConsoleGate } from './config.js';
import liveInterviewUI from './live-interview.js';
import hotkeyManager from './hotkeys.js';
import presetManager from './preset-manager.js';
import screenshotService from './screenshot-service.js';
import { ConfigManager } from './config-manager.js';
import { testStreamingMarkdown, testSampleMarkdown } from './streaming-markdown-demo.js';

// Initialize managers
const stateManager = new StateManager();
const webSocketHandler = new WebSocketHandler(stateManager);
const providerManager = new ProviderManager(stateManager, webSocketHandler);
const configManager = new ConfigManager(stateManager);

// Expose to window for inter-module integration
window.providerManager = providerManager;
window.configManager = configManager;

// --- Dependency Injection ---
// Wire the managers together to avoid race conditions and reliance on globals.
// This ensures the WebSocketHandler has a direct reference to the ProviderManager.
webSocketHandler.setProviderManager(providerManager);

// --- DOM Elements ---
const views = {
    onboarding: document.getElementById('onboarding-view'),
    preflight: document.getElementById('preflight-view'),
    live: document.getElementById('live-view'),
};

const micSelect = document.getElementById('mic-select');
const proceedButton = document.getElementById('proceed-to-checks');
const startButton = document.getElementById('start-interview-button');
const backButton = document.getElementById('back-to-onboarding-btn');

// --- Tab Management ---
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');

            // Update buttons
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update panes
            tabPanes.forEach(p => p.classList.remove('active'));
            const targetPane = document.getElementById(targetId);
            if (targetPane) targetPane.classList.add('active');

            // Refresh advanced config if switching to that tab
            if (targetId === 'advanced-config-tab') {
                configManager.loadInitialData();
            }
        });
    });

    // Wire up the Fill Demo Data button
    const fillDemoBtn = document.getElementById('fill-demo-btn');
    if (fillDemoBtn) {
        fillDemoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            autofillForTesting();
            fillDemoBtn.textContent = '✅ Filled!';
            setTimeout(() => { fillDemoBtn.textContent = '⚡ Demo'; }, 1500);
        });
    }
}


// --- View Management ---
function switchView(targetView) {
    Object.values(views).forEach(view => view.classList.remove('active'));
    views[targetView].classList.add('active');
    
    if (targetView === 'live') {
        const isMobile = document.body.classList.contains('mobile-client');
        const remoteControls = document.getElementById('mobile-remote-controls');
        const statusPill = document.getElementById('mobile-status-pill');
        if (remoteControls) {
            if (isMobile) {
                remoteControls.classList.remove('hidden');
                if (statusPill) statusPill.style.display = 'flex';
            } else {
                remoteControls.classList.add('hidden');
                if (statusPill) statusPill.style.display = 'none';
            }
        }
    }
}

function handleOnboarding() {
    if (stateManager.handleOnboarding()) {
        switchView('preflight');
        runPreFlightChecks();
    }
}

async function runPreFlightChecks() {
    // --- 1. Microphone Check ---
    // First, ensure we have microphone permissions as this is a prerequisite.
    const micPermissionCheck = document.getElementById('check-mic-permission');
    const micSelectionCheck = document.getElementById('check-mic-selection');

    providerManager.webSocketHandler.updateCheckStatus(micPermissionCheck, 'pending', 'Requesting Microphone...');
    const micPermission = await setupMicrophone();
    if (micPermission) {
        providerManager.webSocketHandler.updateCheckStatus(micPermissionCheck, 'success', 'Microphone Permission OK');
        providerManager.webSocketHandler.updateCheckStatus(micSelectionCheck, 'success', 'Microphone Selection Ready');
    } else {
        providerManager.webSocketHandler.updateCheckStatus(micPermissionCheck, 'error', 'Microphone Permission Denied');
        providerManager.webSocketHandler.updateCheckStatus(micSelectionCheck, 'error', 'Microphone Selection Failed');
        return;
    }

    // --- 2. Backend Connection and Session Establishment (NEW ASYNC FLOW) ---
    // We now `await` the connection. The `connect` method returns a promise that
    // only resolves after the WebSocket is open AND the server has confirmed
    // that a session (new or resumed) is established.
    try {
        providerManager.webSocketHandler.updateCheckStatus(providerManager.checks.backend, 'pending', 'Connecting to Backend...');
        await webSocketHandler.connect();
        providerManager.webSocketHandler.updateCheckStatus(providerManager.checks.backend, 'success', 'Backend Connected');
    } catch (error) {
        providerManager.webSocketHandler.updateCheckStatus(providerManager.checks.backend, 'error', 'Backend Connection Failed');
        console.error("Failed to establish WebSocket connection and session:", error);
        // The error status is already set within the WebSocketHandler's onError method.
        return; // Stop checks if backend connection fails.
    }

    // --- 3. AI Provider and Deepgram API Verification ---
    // These checks are now only run *after* the backend session is confirmed to be ready.
    // This ensures that the verification messages can be sent reliably.
    await providerManager.runPreFlightChecks();
}

// These functions are now handled by the modules

// This function is now handled by WebSocketHandler

// This function is now handled by WebSocketHandler

async function startInterview() {
    switchView('live');
    liveInterviewUI.init();
    liveInterviewUI.initialize();
    hotkeyManager.setEnabled(true);

    const onAudioData = (audioData, speakerHint) => {
        webSocketHandler.sendAudioChunk(audioData, muteManager.isMicrophoneMuted());
    };

    const processingStarted = await startAudioProcessing(micSelect.value, onAudioData);

    if (!processingStarted) {
        alert("Could not start audio streams. Please check permissions and try again.");
        switchView('preflight');
        return;
    }

    webSocketHandler.startInterview();
}

async function endInterview() {
    console.log('🔚 Ending interview and clearing state...');

    // Stop all audio processing
    stopAudioProcessing();

    // Send end interview signal to backend
    webSocketHandler.endInterview();

    // Disable hotkeys
    hotkeyManager.setEnabled(false);

    // Clear conversation UI
    if (window.liveInterviewUI) {
        liveInterviewUI.clearConversation();
    }

    // Comprehensive state clearing
    stateManager.clearInterviewState();

    // Reset preset manager if available
    if (window.presetManager) {
        presetManager.clearNotifications?.();
    }

    // Switch back to onboarding
    switchView('onboarding');

    console.log('✅ Interview ended and state cleared successfully');
}

async function resetInterview() {
    console.log('🔄 Resetting interview...');

    // Send reset signal to backend
    webSocketHandler.sendMessage('reset_session', {});

    // Clear conversation UI
    if (window.liveInterviewUI) {
        liveInterviewUI.clearConversation();
        liveInterviewUI.showActivity('Listening...');
    }

    console.log('✅ Interview reset successfully');
}

// Provider management functions are now handled by ProviderManager


// --- Preset Switching Functions ---
function switchPreset(presetKey) {
    return webSocketHandler.switchPreset(presetKey);
}

// --- Transparency Functions ---
async function setTransparency(level) {
    return await liveInterviewUI.setTransparency(level);
}

function getSystemStatus() {
    return stateManager.getSystemStatus();
}

// --- Vision Mode Functions ---
function switchVisionModel() {
    return stateManager.switchVisionModel();
}

function toggleVisionMode() {
    return stateManager.toggleVisionMode();
}

// --- Screenshot Functions ---
async function captureScreenshot() {
    return await stateManager.captureScreenshot();
}

async function processScreenshots() {
    return await stateManager.processScreenshots();
}

async function resetScreenshotQueue() {
    return await stateManager.resetScreenshotQueue();
}

// --- Audio Toggle Functions ---
function toggleMicMute() {
    return stateManager.toggleMicMute();
}

function toggleUniversalMute() {
    return stateManager.toggleUniversalMute();
}

// --- Event Listeners ---
function setupEventListeners() {
    proceedButton?.addEventListener('click', handleOnboarding);
    startButton?.addEventListener('click', startInterview);
    backButton?.addEventListener('click', () => switchView('onboarding'));

    // Provider change listeners
    const providerSelect = document.getElementById('ai-provider-select');
    const secondaryProviderSelect = document.getElementById('ai-secondary-provider-select');
    const visionProviderSelect = document.getElementById('vision-provider-select');
    const visionSecondaryProviderSelect = document.getElementById('vision-secondary-provider-select');

    providerSelect?.addEventListener('change', providerManager.updateModelDropdown.bind(providerManager));
    secondaryProviderSelect?.addEventListener('change', providerManager.updateSecondaryModelDropdown.bind(providerManager));
    visionProviderSelect?.addEventListener('change', providerManager.updateVisionModelDropdown.bind(providerManager));
    visionSecondaryProviderSelect?.addEventListener('change', providerManager.updateSecondaryVisionModelDropdown.bind(providerManager));

    // Mobile remote controls event listeners
    document.getElementById('remote-btn-toggle-vision')?.addEventListener('click', () => {
        if (typeof window.sendSocketMessage === 'function') {
            window.sendSocketMessage('phone_toggle_vision_mode', {});
        }
    });
    
    document.getElementById('remote-btn-capture')?.addEventListener('click', () => {
        if (typeof window.sendSocketMessage === 'function') {
            window.sendSocketMessage('phone_capture_screenshot', {});
        }
    });
    
    document.getElementById('remote-btn-process')?.addEventListener('click', () => {
        if (typeof window.sendSocketMessage === 'function') {
            window.sendSocketMessage('phone_process_screenshots', {});
        }
    });
    
    document.getElementById('remote-btn-clear')?.addEventListener('click', () => {
        if (typeof window.sendSocketMessage === 'function') {
            window.sendSocketMessage('phone_reset_screenshot_queue', {});
        }
    });
    
    document.getElementById('remote-btn-regenerate')?.addEventListener('click', () => {
        if (typeof window.sendSocketMessage === 'function') {
            liveInterviewUI.removeLastMessage();
            window.sendSocketMessage('regenerate_response', {});
        }
    });

    // Pill interactive event listeners
    document.getElementById('pill-vision')?.addEventListener('click', () => {
        if (typeof window.sendSocketMessage === 'function') {
            window.sendSocketMessage('phone_toggle_vision_mode', {});
        }
    });
    
    document.getElementById('pill-queue')?.addEventListener('click', () => {
        if (typeof window.sendSocketMessage === 'function') {
            window.sendSocketMessage('phone_process_screenshots', {});
        }
    });
    
    document.getElementById('pill-mic')?.addEventListener('click', () => {
        if (typeof window.sendSocketMessage === 'function') {
            window.sendSocketMessage('phone_toggle_mic_mute', {});
        }
    });
    
    document.getElementById('pill-universal')?.addEventListener('click', () => {
        if (typeof window.sendSocketMessage === 'function') {
            window.sendSocketMessage('phone_toggle_universal_mute', {});
        }
    });
}

// Main initialization
// Main initialization
window.addEventListener('DOMContentLoaded', async () => {
    // Detect environment and set client class using User Agent matching
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        document.body.classList.add('mobile-client');
        console.log("📱 Running in mobile client mode");
    } else {
        document.body.classList.add('desktop-client');
        console.log("🖥️ Running in desktop client mode");
    }

    await loadConfig();
    applyConsoleGate(); // Suppress console.log/debug/info when DEV_MODE is off
    await providerManager.loadAiProviders();
    liveInterviewUI.init();
    setupEventListeners();
    setupDeveloperShortcuts();
    setupPresetHotkeys();
    setupTabs();
    hotkeyManager.setEnabled(false);
    switchView(isMobile ? 'live' : 'onboarding');
    
    // Register switchView globally
    window.switchView = switchView;

    // Expose toggle mute helpers globally for remote client commands
    window.toggleMicMute = () => {
        import('./mute-manager.js').then(m => {
            m.default.toggleMicrophoneMute();
        });
    };
    window.toggleUniversalMute = () => {
        import('./mute-manager.js').then(m => {
            m.default.toggleUniversalMute();
        });
    };

    // Connect to WebSocket automatically to check for active sessions
    try {
        console.log("🔌 Attempting automatic background connection...");
        await webSocketHandler.connect();
        console.log("🔌 Background connection established successfully.");
    } catch (e) {
        console.warn("🔌 Background connection failed (backend might not be running yet):", e);
    }
});

// --- Developer Shortcuts ---
function setupDeveloperShortcuts() {

    devLog('🛠️ Developer shortcuts enabled');

    // Console helper functions
    if (isDev) {
        console.log(`
🧪 === ECHOSHADE DEVELOPER TOOLS ===
Available testing functions:
• testSampleMarkdown() - Test with sample markdown content  
• testStreamingMarkdown() - Test with comprehensive scenarios
• closeAllTestWindows() - Close all test windows manually
• closeTestWindow('id') - Close specific test window
• autofillForTesting() - Auto-fill onboarding form
• Ctrl+J - Auto-fill form shortcut

📝 Real-time Markdown Testing:
The new hybrid streaming markdown parser integrates with the existing 
MarkdownProcessor to provide real-time rendering that's compatible 
with code blocks, syntax highlighting, and all existing features.

🕒 Auto-Close Feature:
Test windows now auto-close after 10 seconds with countdown display.
Manual close (× button) cancels auto-close timer.

Try: testSampleMarkdown()

🔧 Code Block Fix Applied:
• Fixed missing code blocks in streaming responses
• Added proper syntax highlighting with Prism.js
• Integrated with existing MarkdownProcessor system
• Real-time code block rendering during streaming
        `);
    }

    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'j') {
            e.preventDefault();
            devLog('🛠️ Auto-filling form via Ctrl+J');
            autofillForTesting();
        }
    });
}

function setupPresetHotkeys() {
    devLog('🎹 Setting up preset switching and vision hotkeys');
    document.addEventListener('keydown', (e) => {
        // Only work during live interview and if not focusing on input fields
        if (!e.target.matches('input, textarea, select') && stateManager.isLiveInterviewActive()) {
            if (e.altKey && !e.ctrlKey && !e.shiftKey) {
                switch (e.key.toLowerCase()) {
                    case 'q':
                        e.preventDefault();
                        switchPreset('primary');
                        devLog('🔄 Hotkey: Switching to primary preset');
                        break;
                    case 'w':
                        e.preventDefault();
                        switchPreset('secondary');
                        devLog('🔄 Hotkey: Switching to secondary preset');
                        break;
                    case 'e':
                        e.preventDefault();
                        switchPreset('auto');
                        devLog('🔄 Hotkey: Auto-selecting best preset');
                        break;
                    case 't':
                        e.preventDefault();
                        switchVisionModel();
                        devLog('🔄 Hotkey: Switching vision model');
                        break;
                    case 'v':
                        e.preventDefault();
                        toggleVisionMode();
                        devLog('👁️ Hotkey: Toggling vision mode');
                        break;
                    case 's':
                        e.preventDefault();
                        captureScreenshot();
                        devLog('📸 Hotkey: Capturing screenshot');
                        break;
                    case 'a':
                        e.preventDefault();
                        processScreenshots();
                        devLog('🔄 Hotkey: Processing screenshots');
                        break;
                }
            }
        }
    });
}

// --- Global Exports ---
// Make functions globally accessible for hotkeys and external calls
window.switchPreset = switchPreset;
window.setTransparency = setTransparency;
window.getSystemStatus = getSystemStatus;
window.switchVisionModel = switchVisionModel;
window.toggleVisionMode = toggleVisionMode;
window.captureScreenshot = captureScreenshot;
window.processScreenshots = processScreenshots;
window.resetScreenshotQueue = resetScreenshotQueue;
window.toggleMicMute = toggleMicMute;
window.toggleUniversalMute = toggleUniversalMute;
window.endInterview = endInterview;
window.resetInterview = resetInterview;
window.regenerateResponse = () => webSocketHandler.regenerateResponse();
window.getScreenVideoTrack = getScreenVideoTrack;
window.isScreenSharingAvailable = isScreenSharingAvailable;
window.testStreamingMarkdown = testStreamingMarkdown;
window.testSampleMarkdown = testSampleMarkdown;

// Export managers for other modules
window.appState = stateManager.getState();
window.sendSocketMessage = (type, payload) => webSocketHandler.sendMessage(type, payload);
window.webSocketHandler = webSocketHandler;

// Export for external use
export { switchView, startInterview, endInterview, stateManager, webSocketHandler, providerManager };