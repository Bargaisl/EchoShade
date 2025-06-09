import {
    setupMicrophone,
    startAudioProcessing,
    stopAudioProcessing
} from './audio_handler.js';
import muteManager from './mute-manager.js';
import { autofillForTesting } from './dev.js';
import { loadConfig, isDev, devLog, devWarn, devError } from './config.js';
import liveInterviewUI from './live-interview.js';
import hotkeyManager from './hotkeys.js';
import presetManager from './preset-manager.js';
import screenshotService from './screenshot-service.js';
import { getScreenVideoTrack, isScreenSharingAvailable } from './audio_handler.js';

// --- State Management ---
const appState = {
    onboardingData: {},
    socket: null,
    aiProviders: [],
    selectedProvider: {
        name: null,
        model: null,
    },
    selectedSecondaryProvider: {
        name: null,
        model: null,
    },
    selectedVisionProvider: {
        name: null,
        model: null,
    },
    selectedLanguages: [],
    currentPreset: null,
    availablePresets: [],
    systemStatus: null,
    visionMode: {
        isActive: false,
        screenshotQueue: [],
        maxScreenshots: 4
    }
};

// --- DOM Elements ---
const views = {
    onboarding: document.getElementById('onboarding-view'),
    preflight: document.getElementById('preflight-view'),
    live: document.getElementById('live-view'),
};

const onboardingForm = {
    name: document.getElementById('user-name'),
    company: document.getElementById('user-company'),
    role: document.getElementById('user-role'),
    resume: document.getElementById('user-resume'),
    focusCheckboxes: document.querySelectorAll('input[name="focus"]'),
    objectives: document.getElementById('user-objectives'),
    providerSelect: document.getElementById('ai-provider-select'),
    modelSelect: document.getElementById('ai-model-select'),
    secondaryProviderSelect: document.getElementById('ai-secondary-provider-select'),
    secondaryModelSelect: document.getElementById('ai-secondary-model-select'),
    visionProviderSelect: document.getElementById('vision-provider-select'),
    visionModelSelect: document.getElementById('vision-model-select'),
    languageCheckboxes: document.querySelectorAll('input[name="language"]'),
};

const checks = {
    micPermission: document.getElementById('check-mic-permission'),
    micSelection: document.getElementById('check-mic-selection'),
    backend: document.getElementById('check-backend'),
    deepgram: document.getElementById('check-deepgram'),
    aiProvider: document.getElementById('check-ai-provider'),
    aiSecondaryProvider: document.getElementById('check-ai-secondary-provider'),
    visionProvider: document.getElementById('check-vision-provider'),
};

const micSelect = document.getElementById('mic-select');
const proceedButton = document.getElementById('proceed-to-checks');
const startButton = document.getElementById('start-interview-button');
const backButton = document.getElementById('back-to-onboarding-btn');


// --- View Management ---
function switchView(targetView) {
    Object.values(views).forEach(view => view.classList.remove('active'));
    views[targetView].classList.add('active');
}


// --- Logic ---
function updateCheckStatus(checkElement, status, text) {
    const indicator = checkElement.querySelector('.indicator');
    const textNode = Array.from(checkElement.childNodes).find(node =>
        node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== ''
    );
    indicator.textContent = status === 'success' ? '🟢' : status === 'error' ? '🔴' : '⚪';
    if (textNode) {
        textNode.nodeValue = ` ${text}`;
    }
}

function handleOnboarding() {
    const requiredFields = {
        'user-name': 'Name',
        'user-company': 'Company',
        'user-role': 'Role',
        'user-resume': 'Resume',
        'ai-provider-select': 'AI Provider',
        'ai-model-select': 'AI Model'
    };

    let allValid = true;

    for (const [id, name] of Object.entries(requiredFields)) {
        const element = document.getElementById(id);
        if (!element.value) {
            alert(`${name} is a required field.`);
            allValid = false;
            break;
        }
    }

    const focusCheckboxes = Array.from(onboardingForm.focusCheckboxes).filter(cb => cb.checked);
    if (focusCheckboxes.length === 0) {
        alert('Please select at least one Interview Focus.');
        allValid = false;
    }

    if (!allValid) {
        return;
    }

    // Validate secondary provider selection (both provider and model must be selected together)
    const secondaryProvider = onboardingForm.secondaryProviderSelect.value;
    const secondaryModel = onboardingForm.secondaryModelSelect.value;
    
    if ((secondaryProvider && !secondaryModel) || (!secondaryProvider && secondaryModel)) {
        alert('If you select a secondary provider, you must also select a secondary model (or leave both empty).');
        return;
    }

    // Validate that primary and secondary are different (if both selected)
    if (secondaryProvider && secondaryModel) {
        const primaryProvider = onboardingForm.providerSelect.value;
        const primaryModel = onboardingForm.modelSelect.value;
        
        if (primaryProvider === secondaryProvider && primaryModel === secondaryModel) {
            alert('Primary and secondary AI models cannot be the same. Please select different models.');
            return;
        }
    }

    const focus = focusCheckboxes.map(cb => cb.value);

    appState.onboardingData = {
        name: onboardingForm.name.value,
        company: onboardingForm.company.value,
        role: onboardingForm.role.value,
        resume: onboardingForm.resume.value,
        focus: focus,
        objectives: onboardingForm.objectives.value,
    };

    appState.selectedProvider.name = onboardingForm.providerSelect.value;
    appState.selectedProvider.model = onboardingForm.modelSelect.value;
    
    // Secondary provider is optional but validated
    appState.selectedSecondaryProvider.name = secondaryProvider || null;
    appState.selectedSecondaryProvider.model = secondaryModel || null;

    // Vision provider validation (optional)
    const visionProvider = onboardingForm.visionProviderSelect.value;
    const visionModel = onboardingForm.visionModelSelect.value;
    
    if ((visionProvider && !visionModel) || (!visionProvider && visionModel)) {
        alert('If you select a vision provider, you must also select a vision model (or leave both empty).');
        return;
    }

    appState.selectedVisionProvider.name = visionProvider || null;
    appState.selectedVisionProvider.model = visionModel || null;

    // Programming languages selection
    const selectedLanguages = Array.from(onboardingForm.languageCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    
    appState.selectedLanguages = selectedLanguages;

    devLog("Onboarding data captured:", appState);
    switchView('preflight');
    runPreFlightChecks();
}

async function runPreFlightChecks() {
    // 1. Microphone Check
    updateCheckStatus(checks.micPermission, 'pending', 'Requesting Microphone...');
    const micPermission = await setupMicrophone();
    if (micPermission) {
        updateCheckStatus(checks.micPermission, 'success', 'Microphone Permission OK');
        updateCheckStatus(checks.micSelection, 'success', 'Microphone Selection Ready');
    } else {
        updateCheckStatus(checks.micPermission, 'error', 'Microphone Permission Denied');
        updateCheckStatus(checks.micSelection, 'error', 'Microphone Selection Failed');
        return;
    }

    // 2. Backend Connection
    connectWebSocket();

    // 3. Show secondary provider check if selected
    if (appState.selectedSecondaryProvider.name && appState.selectedSecondaryProvider.model) {
        checks.aiSecondaryProvider.style.display = 'flex';
        devLog('Secondary provider selected, will verify during preflight');
    } else {
        checks.aiSecondaryProvider.style.display = 'none';
        devLog('No secondary provider selected, skipping verification');
    }

    // 4. Show vision provider check if selected
    if (appState.selectedVisionProvider.name && appState.selectedVisionProvider.model) {
        checks.visionProvider.style.display = 'flex';
        devLog('Vision provider selected, will verify during preflight');
    } else {
        checks.visionProvider.style.display = 'none';
        devLog('No vision provider selected, skipping verification');
    }

    // 4. AI Provider Checks
    await verifyAiProviders();
}

async function verifyAiProviders() {
    // Verify primary provider (required)
    await verifyProvider(
        appState.selectedProvider, 
        checks.aiProvider, 
        'Primary'
    );
    
    // Verify secondary provider if selected (optional)
    if (appState.selectedSecondaryProvider.name && appState.selectedSecondaryProvider.model) {
        await verifyProvider(
            appState.selectedSecondaryProvider, 
            checks.aiSecondaryProvider, 
            'Secondary'
        );
    }
    
    // Verify vision provider if selected (optional)
    if (appState.selectedVisionProvider.name && appState.selectedVisionProvider.model) {
        await verifyVisionProvider(
            appState.selectedVisionProvider, 
            checks.visionProvider, 
            'Vision'
        );
    }
    
    checkAllSystemsGo();
}

async function verifyProvider(providerConfig, checkElement, providerType) {
    const { name, model } = providerConfig;
    updateCheckStatus(checkElement, 'pending', `Checking ${providerType} ${name}...`);
    
    try {
        const response = await fetch('/api/verify-provider', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, model }),
        });
        
        const result = await response.json();
        
        if (result.success) {
            updateCheckStatus(checkElement, 'success', `${providerType} ${name} (${model}) OK`);
            devLog(`✅ ${providerType} provider verification successful:`, { name, model });
        } else {
            updateCheckStatus(checkElement, 'error', `${providerType} ${name} Connection Failed`);
            console.error(`❌ ${providerType} provider verification failed:`, { name, model });
        }
    } catch (error) {
        updateCheckStatus(checkElement, 'error', `${providerType} Provider Check Failed`);
        console.error(`❌ ${providerType} provider check error:`, error);
    }
}

async function verifyVisionProvider(providerConfig, checkElement, providerType) {
    const { name, model } = providerConfig;
    updateCheckStatus(checkElement, 'pending', `Checking ${providerType} ${name}...`);
    
    try {
        const response = await fetch('/api/verify-vision-provider', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, model }),
        });
        
        const result = await response.json();
        
        if (result.success) {
            updateCheckStatus(checkElement, 'success', `${providerType} ${name} (${model}) OK`);
            devLog(`✅ ${providerType} provider verification successful:`, { name, model });
        } else {
            updateCheckStatus(checkElement, 'error', `${providerType} ${name} Connection Failed`);
            console.error(`❌ ${providerType} provider verification failed:`, { name, model });
        }
    } catch (error) {
        updateCheckStatus(checkElement, 'error', `${providerType} Provider Check Failed`);
        console.error(`❌ ${providerType} provider check error:`, error);
    }
}

function sendSocketMessage(type, payload) {
    if (appState.socket && appState.socket.readyState === WebSocket.OPEN) {
        appState.socket.send(JSON.stringify({ type, payload }));
    }
}

function sendAudioChunk(chunk, is_muted) {
    if (appState.socket && appState.socket.readyState === WebSocket.OPEN) {
        // Use a JSON object to send both the audio chunk and mute state
        const message = JSON.stringify({
            type: 'audio_chunk',
            payload: {
                audio: Array.from(new Uint8Array(chunk)), // Convert ArrayBuffer to array for JSON
                is_muted: is_muted
            }
        });
        appState.socket.send(message);
    }
}

function connectWebSocket() {
    updateCheckStatus(checks.backend, 'pending', 'Connecting to Backend...');
    const socket = new WebSocket("ws://127.0.0.1:8002/ws");
    appState.socket = socket;

    socket.onopen = function (e) {
        console.log("[open] Connection established");
        updateCheckStatus(checks.backend, 'success', 'Backend Connected');
        updateCheckStatus(checks.deepgram, 'pending', 'Checking Deepgram API...');
    };

    socket.onclose = function (event) {
        updateCheckStatus(checks.backend, 'error', 'Backend Disconnected');
    };

    socket.onerror = function (error) {
        updateCheckStatus(checks.backend, 'error', 'Backend Connection Failed');
    };

    socket.onmessage = function (event) {
        const data = JSON.parse(event.data);
        devLog("Received from backend:", data);

        if (data.type === 'api_key_status') {
            const { service, valid } = data.payload;
            const checkElement = service === 'deepgram' ? checks.deepgram : checks.aiProvider;
            const serviceName = service.charAt(0).toUpperCase() + service.slice(1);

            if (valid) {
                updateCheckStatus(checkElement, 'success', `${serviceName} API OK`);
            } else {
                updateCheckStatus(checkElement, 'error', `${serviceName} API Key Invalid`);
            }
            checkAllSystemsGo();
        } else if (data.type === 'transcript_update') {
            if (window.liveInterviewUI) {
                if (data.payload.is_final) {
                    liveInterviewUI.addInterviewerQuestion(data.payload.transcript, false);
                    liveInterviewUI.showActivity('Generating response...');
                } else {
                    liveInterviewUI.addInterviewerQuestion(data.payload.transcript, true);
                }
            }
        } else if (data.type === 'ai_answer') {
            if (window.liveInterviewUI) {
                const answer = data.payload.answer;
                const presetUsed = data.payload.preset_used;
                const success = data.payload.success;
                const errorInfo = data.payload.error_info;
                const fallbackInfo = data.payload.fallback_info;
                
                liveInterviewUI.addAIResponse(answer, {
                    preset: presetUsed,
                    success: success,
                    error: errorInfo,
                    fallback: fallbackInfo
                });
            }
        } else if (data.type === 'preset_initialized') {
            // Handle initial preset setup
            appState.currentPreset = data.payload.current_preset;
            appState.availablePresets = data.payload.available_presets;
            
            if (window.presetManager) {
                presetManager.updatePresetDisplay(data.payload.current_preset);
                presetManager.updateHealthStatus(data.payload.health_status);
            }
            
            devLog("Preset system initialized:", data.payload);
        } else if (data.type === 'preset_switched') {
            // Handle successful preset switches
            appState.currentPreset = data.payload.current_preset;
            
            if (window.presetManager) {
                presetManager.updatePresetDisplay(data.payload.current_preset);
                presetManager.showSwitchNotification(data.payload);
            }
            
            devLog("Preset switched:", data.payload);
        } else if (data.type === 'preset_switch_failed') {
            // Handle failed preset switches
            if (window.presetManager) {
                presetManager.showErrorNotification(data.payload.error, data.payload);
            }
            
            console.error("Preset switch failed:", data.payload);
        } else if (data.type === 'system_status') {
            // Handle system status updates
            appState.systemStatus = data.payload;
            devLog("System status update:", data.payload);
        } else if (data.type === 'vision_analysis_result') {
            // Handle vision analysis results
            const result = data.payload;
            
            if (result.success) {
                // Display analysis in conversation
                if (window.liveInterviewUI) {
                    liveInterviewUI.addVisionAnalysis(result.analysis, {
                        screenshotCount: result.screenshot_count,
                        model: result.metadata.model,
                        provider: result.metadata.provider,
                        languages: result.languages
                    });
                }
                
                // Notify screenshot service of successful processing
                if (window.visionAnalysisResolver) {
                    window.visionAnalysisResolver(result);
                    window.visionAnalysisResolver = null;
                }
                
                devLog("Vision analysis completed successfully:", result);
            } else {
                console.error("Vision analysis failed:", result.error);
                
                // Notify screenshot service of failed processing
                if (window.visionAnalysisResolver) {
                    window.visionAnalysisResolver({
                        success: false,
                        error: result.error
                    });
                    window.visionAnalysisResolver = null;
                }
            }
        } else if (data.type === 'error') {
            // Handle general errors
            console.error("WebSocket error:", data.payload);
            if (window.presetManager) {
                presetManager.showErrorNotification(data.payload.message);
            }
        }
    };
}

function checkAllSystemsGo() {
    // Only check visible checks (secondary provider might be hidden)
    const visibleChecks = Object.values(checks).filter(check => 
        check.style.display !== 'none' && getComputedStyle(check).display !== 'none'
    );
    
    const allGreen = visibleChecks.every(
        check => check.querySelector('.indicator').textContent === '🟢'
    );
    
    if (allGreen) {
        startButton.disabled = false;
        console.log("All systems go! Ready to start interview.");
        
        // Log which providers were verified
        const verifiedProviders = [];
        if (checks.aiProvider.querySelector('.indicator').textContent === '🟢') {
            verifiedProviders.push(`Primary: ${appState.selectedProvider.name}`);
        }
        if (checks.aiSecondaryProvider.style.display !== 'none' && 
            checks.aiSecondaryProvider.querySelector('.indicator').textContent === '🟢') {
            verifiedProviders.push(`Secondary: ${appState.selectedSecondaryProvider.name}`);
        }
        if (checks.visionProvider.style.display !== 'none' && 
            checks.visionProvider.querySelector('.indicator').textContent === '🟢') {
            verifiedProviders.push(`Vision: ${appState.selectedVisionProvider.name}`);
        }
        
        devLog('✅ All verified providers:', verifiedProviders);
    } else {
        startButton.disabled = true;
        devLog('⚠️ Some checks are still pending or failed');
    }
}

async function startInterview() {
    switchView('live');
    liveInterviewUI.init(); // CRITICAL FIX: Initialize DOM elements first
    liveInterviewUI.initialize();
    hotkeyManager.setEnabled(true);

    const onAudioData = (audioData, speakerHint) => {
        // The audio_handler now controls whether data is sent.
        // We just need to pass the current mic mute state along with the chunk.
        sendAudioChunk(audioData, muteManager.isMicrophoneMuted());
    };

    const processingStarted = await startAudioProcessing(micSelect.value, onAudioData);

    if (!processingStarted) {
        alert("Could not start audio streams. Please check permissions and try again.");
        switchView('preflight');
        return;
    }

    const initialMuteStatus = muteManager.getMuteStatus();
    
    // Prepare payload with primary and optional secondary provider
    const interviewPayload = {
        aiProvider: appState.selectedProvider,
        onboardingData: appState.onboardingData,
        is_muted: initialMuteStatus.microphone,
        is_universally_muted: initialMuteStatus.universal,
        process_all_speakers: true, // Default enabled as per plan
    };
    
    // Add secondary provider if selected
    if (appState.selectedSecondaryProvider.name && appState.selectedSecondaryProvider.model) {
        interviewPayload.aiSecondaryProvider = appState.selectedSecondaryProvider;
    }
    
    sendSocketMessage('start_interview', interviewPayload);
}

async function endInterview() {
    stopAudioProcessing();
    sendSocketMessage('end_interview', {});
    hotkeyManager.setEnabled(false);

    if (window.liveInterviewUI) {
        liveInterviewUI.clearConversation();
    }

    switchView('onboarding');
}

async function loadAiProviders() {
    try {
        const response = await fetch('/api/ai-providers');
        appState.aiProviders = await response.json();

        // Populate primary provider dropdown
        const providerSelect = onboardingForm.providerSelect;
        providerSelect.innerHTML = '<option value="">Select AI Provider</option>';
        appState.aiProviders.forEach(p => {
            const option = document.createElement('option');
            option.value = p.name;
            option.textContent = p.name;
            providerSelect.appendChild(option);
        });

        // Populate secondary provider dropdown
        const secondaryProviderSelect = onboardingForm.secondaryProviderSelect;
        secondaryProviderSelect.innerHTML = '<option value="">Select Secondary Provider (Optional)</option>';
        appState.aiProviders.forEach(p => {
            const option = document.createElement('option');
            option.value = p.name;
            option.textContent = p.name;
            secondaryProviderSelect.appendChild(option);
        });

        // Populate vision provider dropdown (only providers that support vision)
        const visionProviderSelect = onboardingForm.visionProviderSelect;
        visionProviderSelect.innerHTML = '<option value="">Select Vision Provider (Optional)</option>';
        appState.aiProviders
            .filter(p => p.supportsVision && p.visionModels && p.visionModels.length > 0)
            .forEach(p => {
                const option = document.createElement('option');
                option.value = p.name;
                option.textContent = `${p.name} (Vision)`;
                visionProviderSelect.appendChild(option);
            });

        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            setDefaultAIProvider();
        });
    } catch (error) {
        console.error("Failed to load AI providers:", error);
    }
}

function setDefaultAIProvider() {
    try {
        const defaultProvider = appState.aiProviders.find(p => p.default);
        if (defaultProvider && onboardingForm.providerSelect) {
            // Set provider
            onboardingForm.providerSelect.value = defaultProvider.name;

            // Trigger change event to update model dropdown
            onboardingForm.providerSelect.dispatchEvent(new Event('change'));

            // Set default model after dropdown is populated
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

function updateModelDropdown() {
    const providerName = onboardingForm.providerSelect.value;
    const provider = appState.aiProviders.find(p => p.name === providerName);
    const modelSelect = onboardingForm.modelSelect;

    modelSelect.innerHTML = '<option value="">Select Model</option>';
    modelSelect.disabled = true;

    if (provider && provider.models) {
        provider.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelSelect.appendChild(option);
        });
        modelSelect.disabled = false;
    }
}

function updateSecondaryModelDropdown() {
    const providerName = onboardingForm.secondaryProviderSelect.value;
    const provider = appState.aiProviders.find(p => p.name === providerName);
    const modelSelect = onboardingForm.secondaryModelSelect;

    modelSelect.innerHTML = '<option value="">Select Secondary Model</option>';
    modelSelect.disabled = true;

    if (provider && provider.models) {
        provider.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelSelect.appendChild(option);
        });
        modelSelect.disabled = false;
    }
}

function updateVisionModelDropdown() {
    const providerName = onboardingForm.visionProviderSelect.value;
    const provider = appState.aiProviders.find(p => p.name === providerName);
    const modelSelect = onboardingForm.visionModelSelect;

    modelSelect.innerHTML = '<option value="">Select Vision Model</option>';
    modelSelect.disabled = true;

    if (provider && provider.visionModels && provider.visionModels.length > 0) {
        provider.visionModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model;
            option.textContent = model;
            modelSelect.appendChild(option);
        });
        modelSelect.disabled = false;
    }
}


// --- Preset Switching Functions ---
function switchPreset(presetKey) {
    if (appState.socket && appState.socket.readyState === WebSocket.OPEN) {
        sendSocketMessage('switch_preset', { preset_key: presetKey });
    } else {
        console.error('Cannot switch preset: WebSocket not connected');
    }
}

function getSystemStatus() {
    if (appState.socket && appState.socket.readyState === WebSocket.OPEN) {
        sendSocketMessage('get_system_status', {});
    }
}

// Make preset switching globally accessible
window.switchPreset = switchPreset;
window.getSystemStatus = getSystemStatus;

// Make screen capture functions globally accessible
window.getScreenVideoTrack = getScreenVideoTrack;
window.isScreenSharingAvailable = isScreenSharingAvailable;

// --- Vision Mode Functions ---
function toggleVisionMode() {
    if (!appState.selectedVisionProvider.name || !appState.selectedVisionProvider.model) {
        console.warn('⚠️ Vision mode requires a vision model to be configured');
        if (window.presetManager) {
            presetManager.showErrorNotification('Vision model not configured. Please set up a vision provider in onboarding.');
        }
        return false;
    }
    
    appState.visionMode.isActive = !appState.visionMode.isActive;
    
    if (appState.visionMode.isActive) {
        // Enable vision mode
        screenshotService.setVisionConfig(
            appState.selectedVisionProvider.name,
            appState.selectedVisionProvider.model
        );
        screenshotService.setProgrammingLanguages(appState.selectedLanguages);
        screenshotService.showVisionMode(true);
        
        // Pause audio processing when entering vision mode
        if (window.muteManager) {
            muteManager.setUniversalMute(true);
        }
        
        devLog('👁️ Vision mode activated');
        console.log('👁️ Vision mode activated - Audio processing paused');
    } else {
        // Disable vision mode
        screenshotService.showVisionMode(false);
        
        // Resume audio processing when exiting vision mode
        if (window.muteManager) {
            muteManager.setUniversalMute(false);
        }
        
        devLog('👁️ Vision mode deactivated');
        console.log('👁️ Vision mode deactivated - Audio processing resumed');
    }
    
    return appState.visionMode.isActive;
}

async function captureScreenshot() {
    if (!appState.visionMode.isActive) {
        console.warn('⚠️ Screenshots can only be taken in vision mode');
        return false;
    }
    
    return await screenshotService.captureScreenshot();
}

async function processScreenshots() {
    if (!appState.visionMode.isActive) {
        console.warn('⚠️ Screenshots can only be processed in vision mode');
        return false;
    }
    
    return await screenshotService.processQueue();
}

// Make vision functions globally accessible
window.toggleVisionMode = toggleVisionMode;
window.captureScreenshot = captureScreenshot;
window.processScreenshots = processScreenshots;
window.sendSocketMessage = sendSocketMessage;

// --- Event Listeners ---
proceedButton.addEventListener('click', handleOnboarding);
startButton.addEventListener('click', startInterview);
backButton.addEventListener('click', () => switchView('onboarding'));
onboardingForm.providerSelect.addEventListener('change', updateModelDropdown);
onboardingForm.secondaryProviderSelect.addEventListener('change', updateSecondaryModelDropdown);
onboardingForm.visionProviderSelect.addEventListener('change', updateVisionModelDropdown);

window.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await loadAiProviders();
    liveInterviewUI.init(); // Initialize the UI elements as soon as the DOM is ready
    setupDeveloperShortcuts();
    setupPresetHotkeys(); // Initialize preset switching hotkeys
    hotkeyManager.setEnabled(false);
    switchView('onboarding');
});

// Make functions globally accessible
window.endInterview = endInterview;
// The mute functions are now globally exposed via mute-manager.js
window.sendSocketMessage = sendSocketMessage; // Expose for global config

// --- Developer Shortcuts ---
function setupDeveloperShortcuts() {
    devLog('🛠️ Developer shortcuts enabled');
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'j') {
            e.preventDefault();
            devLog('🛠️ Auto-filling form via Ctrl+J');
            autofillForTesting(onboardingForm);
        }
    });
}

function setupPresetHotkeys() {
    devLog('🎹 Setting up preset switching and vision hotkeys');
    document.addEventListener('keydown', (e) => {
        // Only work during live interview and if not focusing on input fields
        if (!e.target.matches('input, textarea, select') && isLiveInterviewActive()) {
            if (e.altKey && !e.ctrlKey && !e.shiftKey) {
                switch(e.key.toLowerCase()) {
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
                    case 'p':
                        e.preventDefault();
                        processScreenshots();
                        devLog('🔄 Hotkey: Processing screenshots');
                        break;
                }
            }
        }
    });
}

function isLiveInterviewActive() {
    const currentView = document.querySelector('.view.active');
    return currentView && currentView.id === 'live-view';
}