import { setupMicrophone, startAudioProcessing, stopAudioProcessing } from './audio_handler.js';
import { autofillForTesting } from './dev.js';

// --- Config ---
const DEV_MODE = true; // Enables developer shortcuts

// --- State Management ---
const appState = {
    onboardingData: {},
    socket: null,
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
};

const checks = {
    // System audio check is now implicit in starting the interview
    micPermission: document.getElementById('check-mic-permission'),
    micSelection: document.getElementById('check-mic-selection'),
    backend: document.getElementById('check-backend'),
    deepgram: document.getElementById('check-deepgram'),
    groq: document.getElementById('check-groq'),
};

const micSelect = document.getElementById('mic-select');
const proceedButton = document.getElementById('proceed-to-checks');
const startButton = document.getElementById('start-interview-button');
// The old visualizer divs are no longer needed with this more direct approach.
// We'll build the proper UI in Phase 2c.


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
    console.log("Onboarding data captured:", appState.onboardingData);
    switchView('preflight');
    runPreFlightChecks();
}

async function runPreFlightChecks() {
    // System audio check is removed from pre-flight to avoid double permission prompt.
    // It will be requested along with the microphone when the interview starts.
    
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
    
    // 2. Backend Connection and API Key Checks
    connectWebSocket();
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
        updateCheckStatus(checks.groq, 'pending', 'Checking Groq API...');
    };

    socket.onclose = function(event) {
        updateCheckStatus(checks.backend, 'error', 'Backend Disconnected');
    };

    socket.onerror = function(error) {
        updateCheckStatus(checks.backend, 'error', 'Backend Connection Failed');
    };

    socket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        // We will add logging here for the transcript and suggestion messages
        console.log("Received from backend:", data);

        if (data.type === 'api_key_status') {
            const { service, valid } = data.payload;
            const checkElement = service === 'deepgram' ? checks.deepgram : checks.groq;
            const serviceName = service.charAt(0).toUpperCase() + service.slice(1);

            if (valid) {
                updateCheckStatus(checkElement, 'success', `${serviceName} API OK`);
            } else {
                updateCheckStatus(checkElement, 'error', `${serviceName} API Key Invalid`);
            }
            checkAllSystemsGo();
        } else if (data.type === 'transcript_update') {
            console.log('TRANSCRIPT:', data.payload);
        } else if (data.type === 'suggestion_update') {
            console.log('SUGGESTION:', data.payload.suggestion);
        }
    };
}

function checkAllSystemsGo() {
    // Filter out the systemAudio check as it's no longer part of pre-flight
    const relevantChecks = Object.values(checks).filter(el => el.id !== 'check-system-audio');
    const allGreen = relevantChecks.every(
        check => check.querySelector('.indicator').textContent === '🟢'
    );
    if (allGreen) {
        startButton.disabled = false;
        console.log("All systems go! Ready to start interview.");
    }
}

async function startInterview() {
    switchView('live');
    
    // Define the callback that sends audio data over the socket
    const onAudioData = (audioData, speakerHint) => {
        // Send raw audio data - let Deepgram handle diarization
        sendAudioChunk(audioData);
    };

    const processingStarted = await startAudioProcessing(micSelect.value, onAudioData);
    
    if (!processingStarted) {
        alert("Could not start audio streams. Please check permissions and try again.");
        switchView('preflight');
        return;
    }
    
    sendSocketMessage('start_interview', appState.onboardingData);
}

function endInterview() {
    stopAudioProcessing();
    sendSocketMessage('end_interview', {});
    switchView('onboarding');
}

// --- Event Listeners ---
proceedButton.addEventListener('click', handleOnboarding);
startButton.addEventListener('click', startInterview);

window.addEventListener('DOMContentLoaded', () => {
    // Remove the temporary visualizer elements since they are no longer used
    const micVolume = document.getElementById('mic-volume');
    const systemVolume = document.getElementById('system-volume');
    if (micVolume) micVolume.parentElement.parentElement.remove();
    
    // Also remove the now-unused system audio check from the preflight view
    const systemAudioCheck = document.getElementById('check-system-audio');
    if(systemAudioCheck) systemAudioCheck.remove();

    switchView('onboarding');
});

// --- Developer Shortcut ---
if (DEV_MODE) {
    window.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'j') {
            e.preventDefault();
            autofillForTesting(onboardingForm);
        }
    });
}