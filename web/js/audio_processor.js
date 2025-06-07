// --- web/js/audio_processor.js ---

/**
 * Mixed audio processor that combines microphone and system audio
 * while tracking volume levels for speaker detection.
 */
class MixedProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.micInputIndex = 0;
        this.systemInputIndex = 1;
    }

    process(inputs, outputs, parameters) {
        // We expect two inputs: [0] = microphone, [1] = system audio
        const micInput = inputs[0] && inputs[0][0] ? inputs[0][0] : new Float32Array(128);
        const systemInput = inputs[1] && inputs[1][0] ? inputs[1][0] : new Float32Array(128);
        
        const frameLength = Math.max(micInput.length, systemInput.length);
        if (frameLength === 0) return true;

        // Mix the audio and calculate volume levels
        const mixedAudio = new Float32Array(frameLength);
        let micLevel = 0;
        let systemLevel = 0;

        for (let i = 0; i < frameLength; i++) {
            const micSample = i < micInput.length ? micInput[i] : 0;
            const systemSample = i < systemInput.length ? systemInput[i] : 0;
            
            // Mix the audio (simple addition with slight attenuation)
            mixedAudio[i] = (micSample + systemSample) * 0.7;
            
            // Track volume levels
            micLevel += Math.abs(micSample);
            systemLevel += Math.abs(systemSample);
        }

        // Average the volume levels
        micLevel /= frameLength;
        systemLevel /= frameLength;

        // Convert to 16-bit PCM
        const pcmData = new Int16Array(frameLength);
        for (let i = 0; i < frameLength; i++) {
            const s = Math.max(-1, Math.min(1, mixedAudio[i]));
            pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Send mixed audio with volume levels for speaker detection
        this.port.postMessage({
            audioData: pcmData.buffer,
            micLevel: micLevel,
            systemLevel: systemLevel
        }, [pcmData.buffer]);

        return true;
    }
}

registerProcessor('mixed-processor', MixedProcessor);