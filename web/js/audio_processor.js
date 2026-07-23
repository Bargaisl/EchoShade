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
        // Collect all available input channels across all inputs
        let allChannels = [];
        let micLevel = 0;
        let systemLevel = 0;

        for (let inputIndex = 0; inputIndex < inputs.length; inputIndex++) {
            const input = inputs[inputIndex];
            if (input && input.length > 0) {
                for (let channelIndex = 0; channelIndex < input.length; channelIndex++) {
                    const channel = input[channelIndex];
                    if (channel && channel.length > 0) {
                        allChannels.push({ inputIndex, channel });
                    }
                }
            }
        }

        if (allChannels.length === 0) return true;

        const frameLength = allChannels[0].channel.length;
        if (frameLength === 0) return true;

        const mixedAudio = new Float32Array(frameLength);

        for (let i = 0; i < frameLength; i++) {
            let sampleSum = 0;
            for (let c = 0; c < allChannels.length; c++) {
                const sample = allChannels[c].channel[i] || 0;
                sampleSum += sample;
                if (allChannels[c].inputIndex === 0) {
                    micLevel += Math.abs(sample);
                } else {
                    systemLevel += Math.abs(sample);
                }
            }
            // Mix with normalization/attenuation
            mixedAudio[i] = Math.max(-1, Math.min(1, sampleSum * 0.8));
        }

        micLevel /= frameLength;
        systemLevel /= frameLength;

        // Convert to 16-bit PCM
        const pcmData = new Int16Array(frameLength);
        for (let i = 0; i < frameLength; i++) {
            const s = mixedAudio[i];
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