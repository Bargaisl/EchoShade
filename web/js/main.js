import { 
    setupMicrophone, 
    startAudioProcessing, 
    stopAudioProcessing, 
    toggleMicrophoneMute, 
    setMicrophoneMute, 
    isMicrophoneMuted 
} from './audio_handler.js';
import { autofillForTesting } from './dev.js';
import { loadConfig, isDev, devLog, devWarn, devError } from './config.js';
import liveInterviewUI from './live-interview.js';
import hotkeyManager from './hotkeys.js';

// --- State Management ---
const appState = {
    onboardingData: {},
    socket: null,
    aiProviders: [],
    selectedProvider: {
        name: null,
        model: null,
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
};

const checks = {
    micPermission: document.getElementById('check-mic-permission'),
    micSelection: document.getElementById('check-mic-selection'),
    backend: document.getElementById('check-backend'),
    deepgram: document.getElementById('check-deepgram'),
    aiProvider: document.getElementById('check-ai-provider'),
};

const micSelect = document.getElementById('mic-select');
const proceedButton = document.getElementById('proceed-to-checks');
const startButton = document.getElementById('start-interview-button');


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
    const focus = Array.from(onboardingForm.focusCheckboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);

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
    
    // 3. AI Provider Check
    verifyAiProvider();
}

async function verifyAiProvider() {
    const { name, model } = appState.selectedProvider;
    updateCheckStatus(checks.aiProvider, 'pending', `Checking ${name}...`);
    try {
        const response = await fetch('/api/verify-provider', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, model }),
        });
        const result = await response.json();
        if (result.success) {
            updateCheckStatus(checks.aiProvider, 'success', `${name} (${model}) OK`);
        } else {
            updateCheckStatus(checks.aiProvider, 'error', `${name} Connection Failed`);
        }
    } catch (error) {
        updateCheckStatus(checks.aiProvider, 'error', 'AI Provider Check Failed');
    }
    checkAllSystemsGo();
}

function sendSocketMessage(type, payload) {
    if (appState.socket && appState.socket.readyState === WebSocket.OPEN) {
        appState.socket.send(JSON.stringify({ type, payload }));
    }
}

function sendAudioChunk(chunk) {
    if (appState.socket && appState.socket.readyState === WebSocket.OPEN) {
        appState.socket.send(chunk);
    }
}

function connectWebSocket() {
    updateCheckStatus(checks.backend, 'pending', 'Connecting to Backend...');
    const socket = new WebSocket("ws://127.0.0.1:8002/ws");
    appState.socket = socket;

    socket.onopen = function(e) {
        console.log("[open] Connection established");
        updateCheckStatus(checks.backend, 'success', 'Backend Connected');
        updateCheckStatus(checks.deepgram, 'pending', 'Checking Deepgram API...');
    };

    socket.onclose = function(event) {
        updateCheckStatus(checks.backend, 'error', 'Backend Disconnected');
    };

    socket.onerror = function(error) {
        updateCheckStatus(checks.backend, 'error', 'Backend Connection Failed');
    };

    socket.onmessage = function(event) {
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
                liveInterviewUI.addAIResponse(data.payload.answer);
            }
        }
    };
}

function checkAllSystemsGo() {
    const allGreen = Object.values(checks).every(
        check => check.querySelector('.indicator').textContent === '🟢'
    );
    if (allGreen) {
        startButton.disabled = false;
        console.log("All systems go! Ready to start interview.");
    }
}

async function startInterview() {
    switchView('live');
    liveInterviewUI.init(); // CRITICAL FIX: Initialize DOM elements first
    liveInterviewUI.initialize();
    hotkeyManager.setEnabled(true);
    
    const onAudioData = (audioData, speakerHint) => {
        sendAudioChunk(audioData);
    };

    const processingStarted = await startAudioProcessing(micSelect.value, onAudioData);
    
    if (!processingStarted) {
        alert("Could not start audio streams. Please check permissions and try again.");
        switchView('preflight');
        return;
    }
    
    sendSocketMessage('start_interview', {
        aiProvider: appState.selectedProvider,
        onboardingData: appState.onboardingData,
    });
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
        
        const providerSelect = onboardingForm.providerSelect;
        providerSelect.innerHTML = '<option value="">Select AI Provider</option>';
        appState.aiProviders.forEach(p => {
            const option = document.createElement('option');
            option.value = p.name;
            option.textContent = p.name;
            providerSelect.appendChild(option);
        });
    } catch (error) {
        console.error("Failed to load AI providers:", error);
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


// --- Event Listeners ---
proceedButton.addEventListener('click', handleOnboarding);
startButton.addEventListener('click', startInterview);
onboardingForm.providerSelect.addEventListener('change', updateModelDropdown);

window.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await loadAiProviders();
    liveInterviewUI.init(); // Initialize the UI elements as soon as the DOM is ready
    setupDeveloperShortcuts();
    hotkeyManager.setEnabled(false);
    switchView('onboarding');
});

// Make functions globally accessible
window.endInterview = endInterview;
window.toggleMicrophoneMute = toggleMicrophoneMute;
window.setMicrophoneMute = setMicrophoneMute;
window.isMicrophoneMuted = isMicrophoneMuted;

// --- Developer Shortcuts ---
function setupDeveloperShortcuts() {
    if (isDev()) {
        devLog('🛠️ Developer shortcuts enabled');
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'j') {
                e.preventDefault();
                devLog('🛠️ Auto-filling form via Ctrl+J');
                autofillForTesting(onboardingForm);
            }
        });
    }
}