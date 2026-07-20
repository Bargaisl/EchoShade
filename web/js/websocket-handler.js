import { devLog } from './config.js';
import liveInterviewUI from './live-interview.js';

export class WebSocketHandler {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.socket = null;
        this.providerManager = null; // Direct reference to the ProviderManager
        this.session_id = sessionStorage.getItem('aura_session_id') || null;
        this.reconnect_attempts = 0;
        this.max_reconnect_attempts = 5;
        this.is_intentionally_closing = false;
        this.checks = {};
        this.initializeCheckElements();
    }

    initializeCheckElements() {
        this.checks = {
            micPermission: document.getElementById('check-mic-permission'),
            micSelection: document.getElementById('check-mic-selection'),
            backend: document.getElementById('check-backend'),
            deepgram: document.getElementById('check-deepgram'),
            aiProvider: document.getElementById('check-ai-provider'),
            aiSecondaryProvider: document.getElementById('check-ai-secondary-provider'),
            visionProvider: document.getElementById('check-vision-provider'),
            visionSecondaryProvider: document.getElementById('check-vision-secondary-provider'),
        };
    }

    connect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            this.is_intentionally_closing = false;
            const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            let url = `${wsProtocol}//${window.location.host}/ws`;
            if (this.session_id) {
                url += `?session_id=${this.session_id}`;
            }

            this.updateCheckStatus(this.checks.backend, 'pending', 'Connecting...');
            this.socket = new WebSocket(url);
            this.stateManager.setSocket(this.socket);

            // Store the promise's resolver to be called when session is confirmed.
            this.resolveConnectionPromise = resolve;

            // Clear any old listeners before attaching new ones
            this.socket.onopen = null;
            this.socket.onclose = null;
            this.socket.onerror = null;
            this.socket.onmessage = null;
            
            // Use addEventListener for all events for consistency and robustness.
            this.socket.addEventListener('open', this.onOpen.bind(this));
            this.socket.addEventListener('close', this.onClose.bind(this));
            this.socket.addEventListener('error', (err) => {
                this.onError(err);
                reject(new Error("WebSocket connection failed."));
            });
            this.socket.addEventListener('message', this.onMessage.bind(this));
        });
    }

    onOpen(event) {
        console.log("[open] Connection established");
        // This is now handled by the ProviderManager
        // this.updateCheckStatus(this.checks.backend, 'success', 'Backend Connected');
        this.reconnect_attempts = 0;
    }

    onClose(event) {
        console.log(`[close] Connection closed. Intentional: ${this.is_intentionally_closing}`);
        // This is now handled by the ProviderManager
        // this.updateCheckStatus(this.checks.backend, 'error', 'Disconnected');
        if (!this.is_intentionally_closing) {
            this.handleReconnect();
        }
    }

    onError(error) {
        console.error(`[error] WebSocket error:`, error);
        // This is now handled by the ProviderManager
        // this.updateCheckStatus(this.checks.backend, 'error', 'Connection Failed');
    }
    
    onMessage(event) {
        const data = JSON.parse(event.data);
        devLog("Received from backend:", data);

        if (data.type === 'session_created') {
            this.session_id = data.payload.session_id;
            sessionStorage.setItem('aura_session_id', this.session_id);
            console.log(`🚀 New session started: ${this.session_id}`);
            // Resolve the connection promise now that session is confirmed.
            if (this.resolveConnectionPromise) {
                this.resolveConnectionPromise();
                this.resolveConnectionPromise = null; // Ensure it's only called once
            }
        } else if (data.type === 'session_resumed') {
            console.log(`✅ Session resumed: ${data.payload.session_id}`);
            this.session_id = data.payload.session_id;
            sessionStorage.setItem('aura_session_id', this.session_id);
            
            // Also resolve the promise on resume.
            if (this.resolveConnectionPromise) {
                this.resolveConnectionPromise();
                this.resolveConnectionPromise = null;
            }
            
            if (data.payload.is_active) {
                console.log("🎯 Active session found on connect. Restoring live view...");
                this.restoreLiveInterview(data.payload.conversation_history);
                if (data.payload.state) {
                    this.handleStateUpdated(data.payload.state);
                }
            } else {
                liveInterviewUI.addMessage("Connection restored. Your session has been resumed.", "system-message");
            }
        }
        
        this.handleMessage(data);
    }

    handleReconnect() {
        if (this.reconnect_attempts < this.max_reconnect_attempts) {
            this.reconnect_attempts++;
            const delay = Math.pow(2, this.reconnect_attempts) * 1000;
            console.log(`Attempting to reconnect in ${delay / 1000}s... (Attempt ${this.reconnect_attempts})`);
            liveInterviewUI.addMessage(`Connection lost. Reconnecting... (Attempt ${this.reconnect_attempts})`, "system-error", true);
            
            setTimeout(() => this.connect(), delay);
        } else {
            console.error("Max reconnect attempts reached.");
            liveInterviewUI.addMessage("Could not reconnect to the server. Please restart the interview.", "system-error");
        }
    }

    disconnect() {
        this.is_intentionally_closing = true;
        if (this.socket) {
            this.socket.close();
        }
        this.session_id = sessionStorage.getItem('aura_session_id') || null; // Clear session on intentional disconnect
        sessionStorage.removeItem('aura_session_id'); // Clear session cache
    }

    handleMessage(data) {
        const shouldExecuteLocal = !document.body.classList.contains('mobile-client');
        switch (data.type) {
            case 'api_key_status':
                this.handleApiKeyStatus(data.payload);
                break;
            case 'transcript_update':
                this.handleTranscriptUpdate(data.payload);
                break;
            case 'ai_processing_started':
                this.handleAiProcessingStarted(data.payload);
                break;
            case 'ai_answer_chunk':
                this.handleAiAnswerChunk(data.payload);
                break;
            case 'ai_answer_complete':
                this.handleAiAnswerComplete(data.payload);
                break;
            case 'preset_initialized':
                this.handlePresetInitialized(data.payload);
                break;
            case 'preset_switched':
                this.handlePresetSwitched(data.payload);
                break;
            case 'preset_switch_failed':
                this.handlePresetSwitchFailed(data.payload);
                break;
            case 'vision_analysis_result':
                this.handleVisionAnalysisResult(data.payload);
                break;
            case 'interview_ended':
                this.handleInterviewEnded(data.payload);
                break;
            case 'toggle_vision_mode':
                console.log("👁️ Received remote command: toggle_vision_mode");
                if (shouldExecuteLocal && typeof window.toggleVisionMode === 'function') {
                    window.toggleVisionMode();
                }
                break;
            case 'capture_screenshot':
                console.log("📸 Received remote command: capture_screenshot");
                if (shouldExecuteLocal && typeof window.captureScreenshot === 'function') {
                    window.captureScreenshot();
                }
                break;
            case 'process_screenshots':
                console.log("🚀 Received remote command: process_screenshots");
                if (shouldExecuteLocal && typeof window.processScreenshots === 'function') {
                    window.processScreenshots();
                }
                break;
            case 'reset_screenshot_queue':
                console.log("🗑️ Received remote command: reset_screenshot_queue");
                if (shouldExecuteLocal && typeof window.resetScreenshotQueue === 'function') {
                    window.resetScreenshotQueue();
                }
                break;
            case 'toggle_mic_mute':
                console.log("🎤 Received remote command: toggle_mic_mute");
                if (shouldExecuteLocal && typeof window.toggleMicMute === 'function') {
                    window.toggleMicMute();
                }
                break;
            case 'toggle_universal_mute':
                console.log("⏸️ Received remote command: toggle_universal_mute");
                if (shouldExecuteLocal && typeof window.toggleUniversalMute === 'function') {
                    window.toggleUniversalMute();
                }
                break;
            case 'state_updated':
                this.handleStateUpdated(data.payload);
                break;
            case 'error':
                this.handleError(data.payload);
                break;
            // Ignore session messages as they are handled in onMessage
            case 'session_created':
            case 'session_resumed':
                break;
            case 'session_reset_complete':
                console.log('✅ Session reset confirmed by backend');
                break;
            default:
                console.warn('Unknown message type:', data.type);
        }
    }

    // ... (All other handle... methods from the original file)
    // NOTE: This is a simplified representation. The actual file will contain the full implementations.
    setProviderManager(manager) {
        this.providerManager = manager;
    }

    handleApiKeyStatus(payload) {
        // This is the crucial fix: Delegate the UI update to the ProviderManager,
        // which now has a direct, guaranteed reference.
        if (this.providerManager) {
            this.providerManager.handleApiKeyStatus(payload);
        } else {
            console.error("Fatal Error: ProviderManager not injected into WebSocketHandler.");
        }
    }

    handleTranscriptUpdate(payload) {
        // With diarization disabled, all speech comes from speaker 0 and should be labeled as Interviewer
        // With diarization enabled, speaker 0 = candidate, speaker 1+ = interviewer(s)
        const speakerId = payload.speaker !== undefined ? payload.speaker : 0;
        
        // Since diarization is disabled, all speech (speaker 0) should be treated as interviewer
        if (payload.is_final) {
            liveInterviewUI.addInterviewerQuestion(payload.transcript, false);
        } else {
            liveInterviewUI.addInterviewerQuestion(payload.transcript, true);
        }
    }
    
    handleAiProcessingStarted(payload) {
        liveInterviewUI.startStreamingAIResponse(payload);
    }

    handleAiAnswerChunk(payload) {
        liveInterviewUI.appendStreamingChunk(payload.chunk);
    }

    handleAiAnswerComplete(payload) {
        liveInterviewUI.finalizeStreamingResponse(payload);
    }

    handlePresetInitialized(payload) {
        this.stateManager.updateState({
            currentPreset: payload.current_preset,
            availablePresets: payload.available_presets,
            isLiveInterviewActive: true
        });
        
        // Auto-switch to live view if not already there
        const liveView = document.getElementById('live-view');
        if (liveView && !liveView.classList.contains('active')) {
            console.log("🎬 Interview started by another device. Switching to live view...");
            if (typeof window.switchView === 'function') {
                window.switchView('live');
            } else {
                document.getElementById('onboarding-view').classList.remove('active');
                document.getElementById('preflight-view').classList.remove('active');
                liveView.classList.add('active');
            }
            liveInterviewUI.init();
            liveInterviewUI.initialize();
        }
        
        if (window.presetManager) {
            presetManager.updatePresetDisplay(payload.current_preset);
            presetManager.updateHealthStatus(payload.health_status);
        }
    }

    handlePresetSwitched(payload) {
        this.stateManager.updateState({ currentPreset: payload.current_preset });
        if (window.presetManager) {
            presetManager.updatePresetDisplay(payload.current_preset);
            presetManager.showSwitchNotification(payload);
        }
    }

    handlePresetSwitchFailed(payload) {
        if (window.presetManager) {
            presetManager.showErrorNotification(payload.error, payload);
        }
    }
    
    handleVisionAnalysisResult(result) {
        console.log('📸 Vision analysis result received:', result.success ? 'SUCCESS' : 'FAILED');
        
        // Hide processing status if it exists
        if (this.hideVisionProcessingStatus) {
            this.hideVisionProcessingStatus();
        }
        
        // Resolve the promise in screenshot-service.js
        if (window.visionAnalysisResolver) {
            window.visionAnalysisResolver(result);
            window.visionAnalysisResolver = null; // Clear the resolver
        }
        
        // Display the result in the specialized vision UI
        if (result.success && result.analysis) {
            // Use the dedicated vision analysis method with proper metadata
            const metadata = {
                provider: result.provider,
                model: result.model,
                screenshotCount: result.screenshot_count,
                languages: result.languages
            };
            liveInterviewUI.addVisionAnalysis(result.analysis, metadata);
        } else if (!result.success && result.error) {
            liveInterviewUI.addMessage(`❌ Vision analysis failed: ${result.error}`, "system-error");
        }
    }

    handleError(payload) {
        console.error("WebSocket error:", payload);
        if (window.presetManager) {
            presetManager.showErrorNotification(payload.message);
        }
    }

    sendMessage(type, payload) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type, payload }));
        } else {
            console.error(`Cannot send message ${type}: WebSocket not connected.`);
        }
    }

    sendAudioChunk(chunk, is_muted) {
        this.sendMessage('audio_chunk', {
            audio: Array.from(new Uint8Array(chunk)),
            is_muted: is_muted
        });
    }

    startInterview() {
        const state = this.stateManager.getState();
        const initialMuteStatus = window.muteManager?.getMuteStatus() || { microphone: false, universal: false };
        
        const interviewPayload = {
            aiProvider: {
                provider: state.selectedProvider.name,
                model: state.selectedProvider.model
            },
            onboardingData: { ...state.onboardingData, selectedLanguages: state.selectedLanguages },
            is_muted: initialMuteStatus.microphone,
            is_universally_muted: initialMuteStatus.universal,
            process_all_speakers: true,
            aiSecondaryProvider: state.selectedSecondaryProvider.name ? {
                provider: state.selectedSecondaryProvider.name,
                model: state.selectedSecondaryProvider.model
            } : null,
            visionProvider: state.selectedVisionProvider.name ? {
                provider: state.selectedVisionProvider.name,
                model: state.selectedVisionProvider.model
            } : null,
            visionSecondaryProvider: state.selectedSecondaryVisionProvider.name ? {
                provider: state.selectedSecondaryVisionProvider.name,
                model: state.selectedSecondaryVisionProvider.model
            } : null,
        };
        this.sendMessage('start_interview', interviewPayload);
    }

    endInterview() {
        this.sendMessage('end_interview', {});
        this.disconnect();
    }
    
    switchPreset(presetKey) {
        if (!this.stateManager.isLiveInterviewActive()) {
            presetManager.showErrorNotification('Start the interview first.');
            return;
        }
        this.sendMessage('switch_preset', { preset_key: presetKey });
    }

    regenerateResponse() {
        if (!this.stateManager.isLiveInterviewActive()) {
            if (window.presetManager) {
                presetManager.showErrorNotification('Start the interview first.');
            }
            return;
        }
        
        // Remove the last message from the UI
        liveInterviewUI.removeLastMessage();
        
        // Send regenerate request to backend
        this.sendMessage('regenerate_response', {});
    }

    updateCheckStatus(checkElement, status, text) {
        if (!checkElement) {
            devLog(`[updateCheckStatus] Warning: Attempted to update a null checkElement.`);
            return;
        }
        const indicator = checkElement.querySelector('.indicator');
        const textNode = Array.from(checkElement.childNodes).find(node =>
            node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== ''
        );
        if (indicator) {
            indicator.textContent = status === 'success' ? '🟢' : status === 'error' ? '🔴' : '⚪';
        }
        if (textNode) {
            textNode.nodeValue = ` ${text}`;
        }
        devLog(`[UI UPDATE] Set ${checkElement.id} to ${status}: ${text}`);
    }

    checkAllSystemsGo() {
        // Delegate to ProviderManager which owns the UI elements
        if (this.providerManager) {
            return this.providerManager.checkAllSystemsGo();
        } else {
            console.error("Fatal Error: ProviderManager not injected into WebSocketHandler for checkAllSystemsGo.");
            return false;
        }
    }

    restoreLiveInterview(conversationHistory) {
        console.log("🔄 Restoring live interview view from active session...");
        
        // 1. Switch to live view
        if (typeof window.switchView === 'function') {
            window.switchView('live');
        } else {
            document.getElementById('onboarding-view').classList.remove('active');
            document.getElementById('preflight-view').classList.remove('active');
            document.getElementById('live-view').classList.add('active');
        }
        
        // 2. Initialize live UI
        liveInterviewUI.init();
        liveInterviewUI.initialize();
        
        // 3. Setup client configurations: only enable mic & hotkeys on desktop (pywebview)
        const isDesktop = !!window.pywebview;
        if (isDesktop) {
            console.log("🖥️ Desktop client detected. Enabling hotkeys and mic checks...");
            import('./hotkeys.js').then(module => {
                module.default.setEnabled(true);
            });
            // Desktop automatic audio recording recovery:
            const micSelect = document.getElementById('mic-select');
            const micValue = micSelect ? micSelect.value : 'default';
            import('./audio_handler.js').then(module => {
                module.startAudioProcessing(micValue, (audioData) => {
                    this.sendAudioChunk(audioData, window.muteManager?.isMicrophoneMuted?.() || false);
                });
            });
        } else {
            console.log("📱 Mobile/Remote client detected. Disabling mic and hotkeys (mirror mode).");
        }
        
        // 4. Update state manager
        this.stateManager.updateState({ isLiveInterviewActive: true });
        
        // 5. Clear conversation UI before repopulating
        liveInterviewUI.clearConversation();
        
        // 6. Populate conversation history instantly (no animation)
        if (conversationHistory && conversationHistory.length > 0) {
            console.log(`📜 Rendering ${conversationHistory.length} messages from history...`);
            conversationHistory.forEach(exchange => {
                if (exchange.ai_response && exchange.ai_response.startsWith('[VISION ANALYSIS]')) {
                    const cleanAnalysis = exchange.ai_response.replace('[VISION ANALYSIS] ', '');
                    liveInterviewUI.addMessageInstant(cleanAnalysis, 'vision-analysis', {
                        provider: exchange.provider || "Historical",
                        model: exchange.model || "Vision Mode"
                    });
                } else {
                    if (exchange.interviewer_question) {
                        liveInterviewUI.addMessageInstant(exchange.interviewer_question, 'interviewer');
                    }
                    if (exchange.candidate_response) {
                        liveInterviewUI.addMessageInstant(exchange.candidate_response, 'candidate');
                    }
                    if (exchange.ai_response) {
                        liveInterviewUI.addMessageInstant(exchange.ai_response, 'ai-response', {
                            preset: { model: exchange.model || "AI Assistant" }
                        });
                    }
                }
            });
        }
        
        liveInterviewUI.hideActivity();
    }

    handleInterviewEnded(payload) {
        console.log("🔚 Interview ended by another device or backend");
        
        // Clear local session ID and storage
        this.session_id = null;
        sessionStorage.removeItem('aura_session_id');
        
        // Stop audio processing
        import('./audio_handler.js').then(module => {
            module.stopAudioProcessing();
        });
        
        // Disable hotkeys
        import('./hotkeys.js').then(module => {
            module.default.setEnabled(false);
        });
        
        // Clear UI conversation
        liveInterviewUI.clearConversation();
        
        // Clear state
        this.stateManager.clearInterviewState();
        
        // Switch back to onboarding view
        if (typeof window.switchView === 'function') {
            window.switchView('onboarding');
        } else {
            document.getElementById('live-view').classList.remove('active');
            document.getElementById('preflight-view').classList.remove('active');
            document.getElementById('onboarding-view').classList.add('active');
        }
    }

    handleStateUpdated(payload) {
        console.log("🔄 State updated from server:", payload);
        
        const isDesktop = !!window.pywebview;
        
        // Track previous queue count to show notification on increase
        const oldQueueCount = this.stateManager.getState().screenshotQueueCount || 0;
        const newQueueCount = payload.screenshot_queue_count || 0;
        
        this.stateManager.updateState({
            screenshotQueueCount: newQueueCount,
            visionModeActive: payload.vision_mode_active,
            isMuted: payload.is_muted,
            isUniversallyMuted: payload.is_universally_muted,
            processAllSpeakers: payload.process_all_speakers
        });
        
        // Update the remote status capsule elements
        const pillVision = document.getElementById('pill-vision');
        const pillQueue = document.getElementById('pill-queue');
        const pillMic = document.getElementById('pill-mic');
        const pillUniversal = document.getElementById('pill-universal');
        
        if (pillVision) {
            pillVision.textContent = `👁️ Vision: ${payload.vision_mode_active ? 'ON' : 'OFF'}`;
            pillVision.className = payload.vision_mode_active ? 'active' : '';
        }
        
        if (pillQueue) {
            pillQueue.textContent = `📸 ${newQueueCount}`;
            pillQueue.className = newQueueCount > 0 ? 'success' : '';
        }
        
        if (pillMic) {
            pillMic.textContent = payload.is_muted ? '🎤 Muted' : '🎤 Active';
            pillMic.className = payload.is_muted ? 'danger' : 'success';
        }
        
        if (pillUniversal) {
            pillUniversal.textContent = payload.is_universally_muted ? '⏸️ Paused' : '▶️ Run';
            pillUniversal.className = payload.is_universally_muted ? 'danger' : 'success';
        }
        
        // Update the bottom buttons active state
        const btnVision = document.getElementById('remote-btn-toggle-vision');
        if (btnVision) {
            if (payload.vision_mode_active) {
                btnVision.classList.add('active');
            } else {
                btnVision.classList.remove('active');
            }
        }
        
        const badge = document.getElementById('remote-queue-badge');
        if (badge) {
            badge.textContent = newQueueCount;
            if (newQueueCount > 0) {
                badge.classList.add('visible');
            } else {
                badge.classList.remove('visible');
            }
        }
        
        const btnProcess = document.getElementById('remote-btn-process');
        if (btnProcess) {
            if (newQueueCount > 0) {
                btnProcess.classList.add('glow');
            } else {
                btnProcess.classList.remove('glow');
            }
        }
        
        // Show alert notification on remote client when queue size changes
        if (!isDesktop) {
            if (newQueueCount > oldQueueCount) {
                if (window.screenshotService && typeof window.screenshotService.showNotification === 'function') {
                    window.screenshotService.showNotification(
                        '📸 Скриншот сделан', 
                        `Снимок добавлен в очередь на ноутбуке (${newQueueCount}/4)`, 
                        'success'
                    );
                }
            } else if (newQueueCount < oldQueueCount && newQueueCount === 0 && oldQueueCount > 0) {
                if (window.screenshotService && typeof window.screenshotService.showNotification === 'function') {
                    window.screenshotService.showNotification(
                        '🗑️ Очередь очищена', 
                        'Все скриншоты удалены с ноутбука', 
                        'warning'
                    );
                }
            }
        }
    }
}