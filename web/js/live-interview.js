// Live Interview Interface Module (Main Coordinator)
import { devLog, isDev } from './config.js';
import { LiveStreaming } from './live-streaming.js';
import { LiveControls } from './live-controls.js';
import muteManager from './mute-manager.js';

class LiveInterviewUI {
    constructor() {
        this.conversationStream = null;
        this.activityIndicator = null;
        this.endButton = null;
        this.muteButton = null;
        this.currentInterviewerElement = null; // Track interviewer message separately
        this.currentAIElement = null; // Track AI message separately
        this.isStreaming = false;
        this.eventsInitialized = false;
        
        // Enhanced smart scroll management
        this.scrollState = {
            mode: 'live_bottom',           // 'live_bottom', 'ai_start', 'user_reading'
            userReadingMode: false,        // User has intentionally scrolled up to read
            lastUserScrollTime: 0,         // When user last scrolled
            lastUserScrollDirection: 'down', // 'up' or 'down'
            consecutiveUpScrolls: 0,       // Count of consecutive up scrolls (indicates intent)
            aiResponseStartElement: null,  // Reference to current AI response element
            isLiveSpeaking: false,         // Whether someone is currently speaking
            lastScrollPosition: 0,         // Track scroll position changes
            isNearBottom: true,            // Is the scroll position near the bottom?
            bottomThreshold: 100,          // Pixels from bottom to consider "near bottom"
            readingThreshold: 200,         // Pixels scrolled up to consider "reading mode"
            newContentPending: false,      // New content arrived while user is reading
            resumeScrollButton: null,      // Reference to resume button
        };
        
        // Initialize modules
        this.streaming = new LiveStreaming({
            enableStreaming: true,
            streamingSpeed: 15,
            aiStreamingSpeed: 5
        });
        
        this.controls = new LiveControls();
    }

    // Initialize elements
    init() {
        this.conversationStream = document.getElementById('conversation-stream');
        this.activityIndicator = document.getElementById('activity-indicator');
        this.endButton = document.getElementById('end-interview-btn');
        this.muteButton = document.getElementById('mute-btn');
        
        // Listen to the mute manager for state changes
        muteManager.on('stateChange', (status) => this.handleMuteStateChange(status));
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        if (this.eventsInitialized) return;

        if (this.endButton) {
            this.endButton.addEventListener('click', () => this.endInterview());
        }
        
        if (this.muteButton) {
            this.muteButton.addEventListener('click', () => this.toggleMute());
        }
        
        // Setup smart scroll detection
        this.setupSmartScroll();
        
        // Setup keyboard shortcuts for scroll control
        this.setupScrollKeyboardShortcuts();
        
        this.eventsInitialized = true;
    }

    setupSmartScroll() {
        if (!this.conversationStream) return;

        this.conversationStream.addEventListener('scroll', () => {
            this.handleScrollEvent();
        });

        // Track user scroll intent via wheel events
        this.conversationStream.addEventListener('wheel', (e) => {
            this.handleWheelEvent(e);
        }, { passive: true });

        // Create resume scroll button (initially hidden)
        this.createResumeScrollButton();
    }

    handleScrollEvent() {
        const { scrollTop, scrollHeight, clientHeight } = this.conversationStream;
        const currentPosition = scrollTop;
        const maxScrollTop = scrollHeight - clientHeight;
        
        // Determine scroll direction
        const direction = currentPosition > this.scrollState.lastScrollPosition ? 'down' : 'up';
        
        // Update state
        this.scrollState.lastScrollPosition = currentPosition;
        this.scrollState.lastUserScrollTime = Date.now();
        this.scrollState.isNearBottom = currentPosition >= maxScrollTop - this.scrollState.bottomThreshold;
        
        // Track scroll direction changes
        if (direction !== this.scrollState.lastUserScrollDirection) {
            this.scrollState.consecutiveUpScrolls = direction === 'up' ? 1 : 0;
        } else if (direction === 'up') {
            this.scrollState.consecutiveUpScrolls++;
        }
        
        this.scrollState.lastUserScrollDirection = direction;
        
        // Determine if user is intentionally reading (scrolled up significantly)
        const distanceFromBottom = maxScrollTop - currentPosition;
        const wasInReadingMode = this.scrollState.userReadingMode;
        
        if (distanceFromBottom > this.scrollState.readingThreshold && this.scrollState.consecutiveUpScrolls >= 2) {
            // User has scrolled up intentionally (multiple up scrolls + significant distance)
            this.enterReadingMode();
        } else if (this.scrollState.isNearBottom && this.scrollState.userReadingMode) {
            // User has returned to bottom - exit reading mode
            this.exitReadingMode();
        }
        
        devLog(`📜 Scroll: pos=${currentPosition}, dir=${direction}, nearBottom=${this.scrollState.isNearBottom}, reading=${this.scrollState.userReadingMode}`);
    }

    handleWheelEvent(e) {
        // Additional intent detection: rapid up scrolls indicate reading intent
        if (e.deltaY < 0) { // Scrolling up
            this.scrollState.consecutiveUpScrolls++;
        } else {
            this.scrollState.consecutiveUpScrolls = 0;
        }
    }

    enterReadingMode() {
        if (!this.scrollState.userReadingMode) {
            this.scrollState.userReadingMode = true;
            this.scrollState.mode = 'user_reading';
            console.log('📚 User reading mode activated - auto-scroll paused');
            this.showResumeScrollButton();
        }
    }
    
    exitReadingMode() {
        if (this.scrollState.userReadingMode) {
            this.scrollState.userReadingMode = false;
            this.scrollState.newContentPending = false;
            this.setScrollMode('live_bottom');
            this.hideResumeScrollButton();
            console.log('📜 User returned to bottom - auto-scroll resumed');
        }
    }

    createResumeScrollButton() {
        // Inject CSS for the button if not already present
        if (!document.getElementById('resume-scroll-styles')) {
            const style = document.createElement('style');
            style.id = 'resume-scroll-styles';
            style.textContent = `
                .resume-scroll-btn {
                    position: fixed;
                    bottom: 30px;
                    right: 20px;
                    z-index: 1000;
                    background: rgba(255, 255, 255, 0.8);
                    color: rgb(0, 0, 0);;
                    border: none;
                    border-radius: 50%;
                    width: 32px;
                    height: 32px;
                    font-size: 14px;
                    font-weight:700;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(10px);
                    transition: all 0.2s ease;
                    transform: translateY(0);
                    opacity: 0.4;
                    line-height: 1;
                }
                
                .resume-scroll-btn.hidden {
                    transform: translateY(50px) scale(0.8);
                    opacity: 0;
                    pointer-events: none;
                }
                
                .resume-scroll-btn:hover {
                    background: rgba(40, 40, 40, 0.8);
                    color: #fff;
                    opacity: 0.9;
                    transform: scale(1.1);
                }
                
                .resume-scroll-btn.has-new-content {
                    background: rgba(34, 139, 34, 0.7);
                    color: #fff;
                    opacity: 0.8;
                    animation: subtlePulse 3s infinite;
                }
                
                .resume-scroll-btn.has-new-content:hover {
                    background: rgba(34, 139, 34, 0.9);
                    opacity: 1;
                }
                
                @keyframes subtlePulse {
                    0%, 100% { 
                        opacity: 0.6;
                        transform: scale(1);
                    }
                    50% { 
                        opacity: 0.9;
                        transform: scale(1.05);
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // Create a floating button that appears when user is in reading mode
        const button = document.createElement('button');
        button.className = 'resume-scroll-btn hidden';
        button.innerHTML = '↓';
        button.title = 'Resume auto-scroll (End key)';
        
        button.addEventListener('click', () => {
            this.resumeAutoScroll();
        });
        
        // Add to body (fixed positioning)
        document.body.appendChild(button);
        this.scrollState.resumeScrollButton = button;
    }

    showResumeScrollButton() {
        if (this.scrollState.resumeScrollButton) {
            this.scrollState.resumeScrollButton.classList.remove('hidden');
            
            // Update button based on whether new content is pending
            if (this.scrollState.newContentPending) {
                this.scrollState.resumeScrollButton.innerHTML = '•';
                this.scrollState.resumeScrollButton.title = 'New content available - Resume auto-scroll (End key)';
                this.scrollState.resumeScrollButton.classList.add('has-new-content');
            }
        }
    }

    hideResumeScrollButton() {
        if (this.scrollState.resumeScrollButton) {
            this.scrollState.resumeScrollButton.classList.add('hidden');
            this.scrollState.resumeScrollButton.classList.remove('has-new-content');
            this.scrollState.resumeScrollButton.innerHTML = '↓';
            this.scrollState.resumeScrollButton.title = 'Resume auto-scroll (End key)';
        }
    }

    resumeAutoScroll() {
        // Manually resume auto-scroll and go to bottom
        this.exitReadingMode();
        this.scrollToBottom();
        console.log('🎯 User manually resumed auto-scroll');
    }

    setupScrollKeyboardShortcuts() {
        // Add keyboard shortcuts for scroll control
        document.addEventListener('keydown', (e) => {
            // Only handle shortcuts when not typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Ctrl+End or End: Resume auto-scroll / go to bottom
            if (e.key === 'End') {
                e.preventDefault();
                this.resumeAutoScroll();
            }
            
            // Ctrl+Home or Home: Enter reading mode and go to top
            else if (e.key === 'Home') {
                e.preventDefault();
                this.enterReadingMode();
                if (this.conversationStream) {
                    this.conversationStream.scrollTop = 0;
                }
            }
            
            // Escape: Toggle reading mode
            else if (e.key === 'Escape' && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                if (this.scrollState.userReadingMode) {
                    this.resumeAutoScroll();
                } else {
                    this.enterReadingMode();
                }
            }
        });
    }

    // Show activity indicator
    showActivity(text = 'Listening...') {
        if (!this.activityIndicator) return;

        const status = muteManager.getMuteStatus();
        let indicatorText = text;
        
        if (status.universal) {
            indicatorText = '⏸️ System Paused - Press Alt+U to resume';
            this.activityIndicator.classList.add('paused');
        } else if (status.microphone) {
            indicatorText = '🔇 Microphone Muted - Press Alt+M to unmute';
            this.activityIndicator.classList.remove('paused');
        } else {
            this.activityIndicator.classList.remove('paused');
        }

        this.activityIndicator.querySelector('span').textContent = indicatorText;
        this.activityIndicator.classList.add('show');
    }

    hideActivity() {
        if (this.activityIndicator) {
            this.activityIndicator.classList.remove('show');
        }
    }

    // Add interviewer question
    addInterviewerQuestion(question, isInterim = false) {
        // Live speech is high priority - but respect reading mode
        if (!this.scrollState.userReadingMode) {
            this.setScrollMode('live_bottom');
        }
        this.scrollState.isLiveSpeaking = true;

        if (isInterim) {
            if (!this.currentInterviewerElement) {
                this.currentInterviewerElement = this.createMessageElement('', 'interviewer');
                this.conversationStream.appendChild(this.currentInterviewerElement);
                this.updateEmptyState();
            }
            this.updateInterviewerMessage(this.currentInterviewerElement.querySelector('.streaming-text').textContent + ' ' + question);
        } else {
            if (this.currentInterviewerElement) {
                this.finalizeInterviewerMessage(question);
            } else {
                this.addMessage(question, 'interviewer');
            }
            this.hideActivity();
            this.updateEmptyState();
            this.scrollState.isLiveSpeaking = false;
        }
        
        // For live speech, be more aggressive about scrolling (but still respect reading mode)
        if (!this.scrollState.userReadingMode) {
            this.scrollToBottom();
        } else {
            // Notify user of new content if they're reading
            this.scrollState.newContentPending = true;
            this.showResumeScrollButton();
        }
    }

    // Add AI response
    addAIResponse(response) {
        this.currentAIElement = this.createMessageElement(response, 'ai-response');
        this.conversationStream.appendChild(this.currentAIElement);

        this.setScrollMode('ai_start', this.currentAIElement);

        this.startStreaming(this.currentAIElement, response, true, () => {
            // On completion, set mode back to ready for live speech
            this.setScrollMode('live_bottom');
        });
        
        this.hideActivity();
        this.updateEmptyState();
    }

    // Add vision analysis response
    addVisionAnalysis(analysis, metadata = {}) {
        console.log('🎭 LiveInterviewUI.addVisionAnalysis called:', {
            analysisLength: analysis?.length || 0,
            provider: metadata?.provider,
            model: metadata?.model,
            screenshotCount: metadata?.screenshotCount
        });
        
        const visionElement = this.createVisionAnalysisElement(analysis, metadata);
        this.conversationStream.appendChild(visionElement);

        this.setScrollMode('ai_start', visionElement);

        this.startStreaming(visionElement, analysis, true, () => {
            // On completion, set mode back to ready for live speech
            this.setScrollMode('live_bottom');
            console.log('🎭 Vision analysis streaming completed');
        });
        
        this.hideActivity();
        this.updateEmptyState();
    }

    // Add message to conversation
    addMessage(content, type) {
        const messageElement = this.createMessageElement(content, type);
        this.conversationStream.appendChild(messageElement);
        this.startStreaming(messageElement, content);
        this.scrollToBottom();
        this.updateEmptyState();
    }

    // Create message element
    createMessageElement(content, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = type === 'interviewer' ? '🎤 Interviewer' : '🤖 AI Assistant';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'streaming-text';
        
        messageDiv.appendChild(label);
        messageDiv.appendChild(contentDiv);
        
        return messageDiv;
    }

    // Create vision analysis element with enhanced styling
    createVisionAnalysisElement(content, metadata = {}) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ai-response vision-analysis';
        
        // Create header with vision-specific information
        const headerDiv = document.createElement('div');
        headerDiv.className = 'vision-header';
        
        const label = document.createElement('span');
        label.className = 'label';
        label.innerHTML = '👁️ Vision AI Analysis';
        
        const metaInfo = document.createElement('div');
        metaInfo.className = 'vision-meta';
        
        let metaText = '';
        if (metadata.provider && metadata.model) {
            metaText += `${metadata.provider} - ${metadata.model}`;
        }
        if (metadata.screenshotCount) {
            metaText += ` • ${metadata.screenshotCount} screenshot${metadata.screenshotCount > 1 ? 's' : ''}`;
        }
        if (metadata.languages && metadata.languages.length > 0) {
            metaText += ` • ${metadata.languages.join(', ')}`;
        }
        
        metaInfo.textContent = metaText;
        
        headerDiv.appendChild(label);
        headerDiv.appendChild(metaInfo);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'streaming-text vision-content';
        
        messageDiv.appendChild(headerDiv);
        messageDiv.appendChild(contentDiv);
        
        // Add vision-specific styling if not already present
        this.addVisionStyles();
        
        return messageDiv;
    }

    // Add CSS styles for vision analysis elements
    addVisionStyles() {
        if (!document.getElementById('vision-analysis-styles')) {
            const style = document.createElement('style');
            style.id = 'vision-analysis-styles';
            style.textContent = `
                .message.vision-analysis {
                    border-left: 4px solid #6366f1;
                    background: linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(139, 92, 246, 0.05) 100%);
                }
                
                .vision-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid rgba(99, 102, 241, 0.2);
                }
                
                .vision-header .label {
                    color: #6366f1;
                    font-weight: 600;
                    font-size: 14px;
                }
                
                .vision-meta {
                    font-size: 11px;
                    color: #64748b;
                    font-weight: 500;
                    text-align: right;
                }
                
                .vision-content {
                    line-height: 1.6;
                }
                
                .vision-content h1,
                .vision-content h2,
                .vision-content h3 {
                    color: #6366f1;
                    margin-top: 20px;
                    margin-bottom: 10px;
                }
                
                .vision-content h1 {
                    font-size: 18px;
                    border-bottom: 2px solid rgba(99, 102, 241, 0.3);
                    padding-bottom: 5px;
                }
                
                .vision-content h2 {
                    font-size: 16px;
                }
                
                .vision-content h3 {
                    font-size: 14px;
                }
                
                .vision-content code {
                    background: rgba(99, 102, 241, 0.1);
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
                    font-size: 13px;
                }
                
                .vision-content pre {
                    background: rgba(15, 23, 42, 0.95);
                    border: 1px solid rgba(99, 102, 241, 0.3);
                    border-radius: 6px;
                    padding: 16px;
                    margin: 12px 0;
                    overflow-x: auto;
                    position: relative;
                }
                
                .vision-content pre code {
                    background: none;
                    padding: 0;
                    color: #e2e8f0;
                    font-size: 13px;
                    line-height: 1.5;
                }
                
                .vision-content ul,
                .vision-content ol {
                    margin: 12px 0;
                    padding-left: 20px;
                }
                
                .vision-content li {
                    margin: 6px 0;
                    line-height: 1.5;
                }
                
                .vision-content strong {
                    color: #6366f1;
                    font-weight: 600;
                }
                
                .vision-content blockquote {
                    border-left: 3px solid #6366f1;
                    margin: 16px 0;
                    padding: 12px 16px;
                    background: rgba(99, 102, 241, 0.05);
                    border-radius: 0 4px 4px 0;
                }
            `;
            document.head.appendChild(style);
        }
    }

    // Start streaming animation (delegated to streaming module)
    startStreaming(messageElement, content, isAI = false, onCompletion = null) {
        const contentDiv = messageElement.querySelector('.streaming-text');
        const speed = isAI ? this.streaming.config.aiStreamingSpeed : this.streaming.config.streamingSpeed;

        this.isStreaming = true;

        const scrollCallback = () => {
            // Only auto-scroll during live speech streaming
            if (this.scrollState.mode === 'live_bottom') {
                this.scrollToBottom();
            }
        };

        this.streaming.streamContent(contentDiv, content, speed, scrollCallback).then(() => {
            messageElement.classList.add('complete');
            this.isStreaming = false;
            if (onCompletion) {
                onCompletion();
            }
        });
    }

    // Update interviewer message (for interim results)
    updateInterviewerMessage(content) {
        if (this.currentInterviewerElement) {
            const contentDiv = this.currentInterviewerElement.querySelector('.streaming-text');
            
            // Mark as interim to hide typing cursor
            this.currentInterviewerElement.classList.add('interim');
            
            // Clear and update instantly using streaming module
            contentDiv.innerHTML = '';
            this.streaming.displayInstantText(contentDiv, content);
        }
    }

    // Finalize interviewer message (for final results)
    finalizeInterviewerMessage(content) {
        if (this.currentInterviewerElement) {
            // Remove interim class to show typing animation for final result
            this.currentInterviewerElement.classList.remove('interim');
            
            const contentDiv = this.currentInterviewerElement.querySelector('.streaming-text');
            contentDiv.innerHTML = '';
            
            // Use streaming module for final content
            this.streaming.streamContent(contentDiv, content, this.streaming.config.streamingSpeed).then(() => {
                if (this.currentInterviewerElement) {
                    this.currentInterviewerElement.classList.add('complete');
                }
            });
            
            // Clear the reference since this is final
            this.currentInterviewerElement = null;
            
            // Reset auto-scroll for new response
            this.autoScrollEnabled = true;
        }
    }

    // --- New Smart Scrolling System ---

    setScrollMode(mode, targetElement = null) {
        this.scrollState.mode = mode;
        devLog(`📜 Scroll mode set to: ${mode}`);

        switch (mode) {
            case 'live_bottom':
                this.scrollToBottom();
                break;
            case 'ai_start':
                if (targetElement) {
                    this.scrollState.aiResponseStartElement = targetElement;
                    this.scrollToAiResponseStart();
                }
                break;
            case 'user_reading':
                // In this mode, we don't trigger any automatic scrolling
                // but we mark that new content is pending
                this.scrollState.newContentPending = true;
                this.showResumeScrollButton();
                break;
        }
    }

    scrollToBottom() {
        if (this.scrollState.userReadingMode) {
            // Don't interrupt user reading - just mark that new content is available
            this.scrollState.newContentPending = true;
            this.showResumeScrollButton();
            devLog('📜 Scroll to bottom deferred - user is reading');
            return;
        }
        if (this.conversationStream) {
            this.conversationStream.scrollTop = this.conversationStream.scrollHeight;
        }
    }

    scrollToAiResponseStart() {
        if (this.scrollState.userReadingMode) {
            // Don't interrupt user reading - just mark that new content is available
            this.scrollState.newContentPending = true;
            this.showResumeScrollButton();
            devLog('📜 Scroll to AI response start deferred - user is reading');
            return;
        }
        if (this.scrollState.aiResponseStartElement) {
            this.scrollState.aiResponseStartElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    // Clear conversation
    clearConversation() {
        if (this.conversationStream) {
            this.conversationStream.innerHTML = '';
        }
        this.currentInterviewerElement = null;
        this.currentAIElement = null;
        this.isStreaming = false;
        this.updateEmptyState();
    }

    // Update empty state class
    updateEmptyState() {
        if (!this.conversationStream) return;
        
        const messageCount = this.conversationStream.querySelectorAll('.message').length;
        if (messageCount === 0) {
            this.conversationStream.classList.add('no-messages');
        } else {
            this.conversationStream.classList.remove('no-messages');
        }
    }

    // Toggle microphone mute via the UI button
    toggleMute() {
        // The hotkey manager and mute manager now handle the logic.
        // This just needs to trigger the toggle.
        muteManager.toggleMicrophoneMute();
    }

    // Central handler for all mute state changes
    handleMuteStateChange(status) {
        this.updateMuteButton(status.microphone);
        this.showActivity(); // Re-evaluates the activity indicator text
        devLog(`UI updated for mute state: Mic=${status.microphone}, Universal=${status.universal}`);
    }

    // Update mute button appearance
    updateMuteButton(isMuted) {
        if (this.muteButton) {
            if (isMuted) {
                this.muteButton.classList.add('muted');
                this.muteButton.title = 'Unmute microphone input to app (Alt+M)';
            } else {
                this.muteButton.classList.remove('muted');
                this.muteButton.title = 'Mute microphone input to app (Alt+M)';
            }
        }
    }

    // End interview
    endInterview() {
        if (typeof window.endInterview === 'function') {
            window.endInterview();
        }
    }

    // Initialize
    initialize() {
        this.clearConversation();
        this.showActivity('Listening...');
        this.controls.initialize(); // Initialize controls module
        this.updateEmptyState();
        
        // Set initial UI state from the mute manager
        const initialStatus = muteManager.getMuteStatus();
        this.updateMuteButton(initialStatus.microphone);
        console.log(`🎤 UI initialized with microphone ${initialStatus.microphone ? 'muted' : 'unmuted'}`);
        
        // Reset scroll state
        this.scrollState = {
            mode: 'live_bottom',
            userReadingMode: false,
            lastUserScrollTime: 0,
            lastUserScrollDirection: 'down',
            consecutiveUpScrolls: 0,
            aiResponseStartElement: null,
            isLiveSpeaking: false,
            lastScrollPosition: 0,
            isNearBottom: true,
            bottomThreshold: 100,
            readingThreshold: 200,
            newContentPending: false,
            resumeScrollButton: this.scrollState?.resumeScrollButton || null, // Preserve button reference
        };
        
        console.log('🎬 Live interview UI initialized');
    }

    // Get current configuration
    getConfig() {
        return {
            streaming: this.streaming.getConfig(),
            transparency: this.controls.getConfig()
        };
    }
}

// Create global instance
window.liveInterviewUI = new LiveInterviewUI();

// Add global configuration functions for easy control
window.setInterviewStreaming = (enabled) => {
    window.liveInterviewUI.streaming.setStreamingEnabled(enabled);
    console.log(`🎬 Streaming ${enabled ? 'enabled' : 'disabled'}`);
};

window.setInterviewSpeed = (speed) => {
    window.liveInterviewUI.streaming.setStreamingSpeed(speed);
    console.log(`⚡ Interviewer streaming speed set to ${speed}ms`);
};

window.setAISpeed = (speed) => {
    window.liveInterviewUI.streaming.setAIStreamingSpeed(speed);
    console.log(`🤖 AI streaming speed set to ${speed}ms`);
};

window.setMarkdownEnabled = (enabled) => {
    window.liveInterviewUI.streaming.setMarkdownEnabled(enabled);
    console.log(`📝 Markdown processing ${enabled ? 'enabled' : 'disabled'}`);
};

window.setMarkdownSpeed = (speed) => {
    window.liveInterviewUI.streaming.setMarkdownSpeed(speed);
    console.log(`📝 Markdown element speed set to ${speed}ms`);
};

// Process All Speakers Configuration
window.setProcessAllSpeakers = (enabled) => {
    // This function will be fully implemented in main.js where the socket is managed
    if (typeof window.sendSocketMessage === 'function') {
        window.sendSocketMessage('config_update', {
            processAllSpeakers: enabled
        });
        console.log(`🎯 Process All Speakers config sent: ${enabled}`);
    } else {
        console.warn('sendSocketMessage not defined yet. Make sure it is globally available.');
    }
};

window.enableAllSpeakers = () => {
    window.setProcessAllSpeakers(true);
    console.log('🎯 All speakers mode activated - AI will respond to everyone');
};

window.disableAllSpeakers = () => {
    window.setProcessAllSpeakers(false);
    console.log('🎯 Interviewer-only mode activated - AI will only respond to interviewer');
};

// Smart scroll controls
window.setScrollMode = (mode) => {
    if (window.liveInterviewUI) {
        window.liveInterviewUI.setScrollMode(mode);
    }
};

window.getScrollState = () => {
    if (window.liveInterviewUI) {
        return window.liveInterviewUI.scrollState;
    }
    return null;
};

// Enhanced scroll control functions
window.enterReadingMode = () => {
    if (window.liveInterviewUI) {
        window.liveInterviewUI.enterReadingMode();
        console.log('📚 Manually entered reading mode');
    }
};

window.exitReadingMode = () => {
    if (window.liveInterviewUI) {
        window.liveInterviewUI.exitReadingMode();
        console.log('📜 Manually exited reading mode');
    }
};

window.resumeAutoScroll = () => {
    if (window.liveInterviewUI) {
        window.liveInterviewUI.resumeAutoScroll();
    }
};

window.isInReadingMode = () => {
    if (window.liveInterviewUI) {
        return window.liveInterviewUI.scrollState.userReadingMode;
    }
    return false;
};

// Quick presets
window.setFastStreaming = () => {
    window.setInterviewSpeed(15);
    window.setAISpeed(8);
    console.log('🚀 Fast streaming mode activated');
};

window.setSlowStreaming = () => {
    window.setInterviewSpeed(50);
    window.setAISpeed(30);
    console.log('🐌 Slow streaming mode activated');
};

window.setInstantMode = () => {
    window.setInterviewStreaming(false);
    console.log('⚡ Instant mode activated - no streaming animations');
};

// Markdown-specific presets
window.setFastMarkdown = () => {
    window.setMarkdownEnabled(true);
    window.setMarkdownSpeed(50);
    window.setInterviewSpeed(8);
    window.setAISpeed(3);
    console.log('📝 Fast markdown mode activated');
};

window.setSlowMarkdown = () => {
    window.setMarkdownEnabled(true);
    window.setMarkdownSpeed(150);
    window.setInterviewSpeed(20);
    window.setAISpeed(6);
    console.log('📝 Slow markdown mode activated');
};

window.disableMarkdown = () => {
    window.setMarkdownEnabled(false);
    console.log('📝 Markdown processing disabled - plain text only');
};

window.enableMarkdown = () => {
    window.setMarkdownEnabled(true);
    console.log('📝 Markdown processing enabled - formatted text');
};

export default window.liveInterviewUI; 