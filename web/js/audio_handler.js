// --- audio_handler.js ---
// This module handles all interactions with the Web Media APIs
// for capturing and processing audio via an AudioWorklet.

let audioContext = null;
let micStream = null;
let systemStream = null;

/**
 * Requests permission to use the microphone and populates the dropdown.
 * @returns {Promise<boolean>} True if permission was granted, false otherwise.
 */
export async function setupMicrophone() {
    const micSelect = document.getElementById('mic-select');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioDevices = devices.filter(device => device.kind === 'audioinput');

        if (audioDevices.length === 0) return false;

        micSelect.innerHTML = '';
        audioDevices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = device.label || `Microphone ${micSelect.options.length + 1}`;
            micSelect.appendChild(option);
        });
        
        micSelect.disabled = false;
        return true;
    } catch (err) {
        console.error("Error setting up microphone:", err);
        return false;
    }
}

/**
 * Starts audio processing by setting up the AudioContext, loading the worklet,
 * and connecting the audio streams.
 * @param {string} micId - The deviceId of the selected microphone.
 * @param {function} onAudioData - Callback function to handle the processed PCM audio data.
 * @returns {Promise<boolean>} True if processing started successfully.
 */
export async function startAudioProcessing(micId, onAudioData) {
    try {
        // 1. Get Audio Streams
        micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: micId } } });
        systemStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });

        if (!micStream || !systemStream) {
            console.error("Could not get both audio streams.");
            stopAudioProcessing();
            return false;
        }

        // 2. Setup AudioContext and Worklet
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log(`🎵 AudioContext: ${audioContext.sampleRate}Hz`);
        await audioContext.audioWorklet.addModule('/static/js/audio_processor.js');
        
        // 3. Create a single mixed processor for better diarization
        const mixedProcessor = new AudioWorkletNode(audioContext, 'mixed-processor');

        // Handle mixed audio with volume-based speaker hints
        mixedProcessor.port.onmessage = (event) => {
            const { audioData, micLevel, systemLevel } = event.data;
            
            // Simple heuristic: if system audio is much louder, likely interviewer speaking
            const speakerHint = systemLevel > micLevel * 2 ? 'system' : 'microphone';
            onAudioData(audioData, speakerHint);
        };

        // 4. Connect both sources to the mixed processor
        const micSource = audioContext.createMediaStreamSource(micStream);
        const systemSource = audioContext.createMediaStreamSource(systemStream);
        
        micSource.connect(mixedProcessor);
        systemSource.connect(mixedProcessor);

        // The video track from getDisplayMedia is not needed.
        systemStream.getVideoTracks().forEach(track => track.stop());

        console.log("✅ Audio processing started successfully");
        return true;

    } catch (err) {
        console.error("❌ Error starting audio processing:", err);
        stopAudioProcessing();
        return false;
    }
}

/**
 * Stops all audio streams and closes the AudioContext.
 */
export function stopAudioProcessing() {
    console.log("Stopping audio processing.");
    if (micStream) {
        micStream.getTracks().forEach(track => track.stop());
        micStream = null;
    }
    if (systemStream) {
        systemStream.getTracks().forEach(track => track.stop());
        systemStream = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
    }
}