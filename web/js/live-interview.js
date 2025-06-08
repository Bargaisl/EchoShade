// Live Interview Interface Module (Main Coordinator)
import { devLog, isDev } from './config.js';
import { LiveStreaming } from './live-streaming.js';
import { LiveControls } from './live-controls.js';

class LiveInterviewUI {
    constructor() {
        this.conversationStream = null;
        this.activityIndicator = null;
        this.endButton = null;
        this.muteButton = null;
        this.currentInterviewerElement = null; // Track interviewer message separately
        this.currentAIElement = null; // Track AI message separately
        this.isStreaming = false;
        
        // Smart scroll management
        this.userHasScrolled = false;
        this.lastScrollTop = 0;
        this.scrollTimeout = null;
        this.autoScrollEnabled = true;
        
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
        this.setupEventListeners();
    }

    setupEventListeners() {
        if (this.endButton) {
            this.endButton.addEventListener('click', () => {
                this.endInterview();
            });
        }
        
        if (this.muteButton) {
            this.muteButton.addEventListener('click', () => {
                this.toggleMute();
            });
        }
        
        // Setup smart scroll detection
        this.setupSmartScroll();
    }

    setupSmartScroll() {
        if (!this.conversationStream) return;
        
        // Detect user scrolling
        this.conversationStream.addEventListener('scroll', () => {
            const currentScrollTop = this.conversationStream.scrollTop;
            const maxScroll = this.conversationStream.scrollHeight - this.conversationStream.clientHeight;
            
            // Check if user scrolled up from bottom (not at bottom with tolerance)
            if (currentScrollTop < maxScroll - 100) { // 100px tolerance
                if (!this.userHasScrolled) {
                    this.userHasScrolled = true;
                    this.autoScrollEnabled = false;
                    console.log('👆 User scrolled up - auto-scroll temporarily disabled');
                }
                
                // Clear any existing timeout
                if (this.scrollTimeout) {
                    clearTimeout(this.scrollTimeout);
                }
                
                // Re-enable auto-scroll after 5 seconds of no scrolling
                this.scrollTimeout = setTimeout(() => {
                    this.userHasScrolled = false;
                    this.autoScrollEnabled = true;
                    console.log('🔄 Auto-scroll re-enabled after timeout');
                }, 5000);
                
            } else if (currentScrollTop >= maxScroll - 50) {
                // User scrolled back near bottom - immediately re-enable
                this.userHasScrolled = false;
                this.autoScrollEnabled = true;
                
                if (this.scrollTimeout) {
                    clearTimeout(this.scrollTimeout);
                    this.scrollTimeout = null;
                }
            }
            
            this.lastScrollTop = currentScrollTop;
        });
        
        // Detect mouse wheel for immediate but temporary override
        this.conversationStream.addEventListener('wheel', (e) => {
            if (e.deltaY < 0) { // Scrolling up
                this.userHasScrolled = true;
                this.autoScrollEnabled = false;
                
                // Clear any existing timeout
                if (this.scrollTimeout) {
                    clearTimeout(this.scrollTimeout);
                }
                
                // Re-enable after shorter timeout for wheel scroll
                this.scrollTimeout = setTimeout(() => {
                    this.userHasScrolled = false;
                    this.autoScrollEnabled = true;
                    console.log('🔄 Auto-scroll re-enabled after wheel scroll timeout');
                }, 3000);
                
                console.log('🖱️ User wheel scroll up - auto-scroll temporarily disabled');
            }
        });
    }

    // Show activity indicator
    showActivity(text = 'Listening...') {
        if (this.activityIndicator) {
            // Check if microphone is muted and update text accordingly
            if (typeof window.isMicrophoneMuted === 'function' && window.isMicrophoneMuted()) {
                text = 'Microphone Muted - Press Alt+M to unmute';
            }
            this.activityIndicator.querySelector('span').textContent = text;
            this.activityIndicator.classList.add('show');
        }
    }

    hideActivity() {
        if (this.activityIndicator) {
            this.activityIndicator.classList.remove('show');
        }
    }

    // Add interviewer question
    addInterviewerQuestion(question, isInterim = false) {
        if (isInterim) {
            // For interim results, update existing or create new
            if (!this.currentInterviewerElement) {
                this.currentInterviewerElement = this.createMessageElement('', 'interviewer');
                this.conversationStream.appendChild(this.currentInterviewerElement);
                this.updateEmptyState();
            }
            this.updateInterviewerMessage(this.currentInterviewerElement.querySelector('.streaming-text').textContent + ' ' + question);
        } else {
            // For final results
            if (this.currentInterviewerElement) {
                this.finalizeInterviewerMessage(question);
            } else {
                this.addMessage(question, 'interviewer');
            }
            this.hideActivity();
            this.updateEmptyState();
        }
    }

    // Add AI response
    addAIResponse(response) {
        this.currentAIElement = this.createMessageElement(response, 'ai-response');
        this.conversationStream.appendChild(this.currentAIElement);
        
        // Reset auto-scroll for new AI response (always auto-scroll new responses)
        this.autoScrollEnabled = true;
        this.userHasScrolled = false;
        
        this.startStreaming(this.currentAIElement, response, true); // true for AI response
        this.scrollToBottom();
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

    // Start streaming animation (delegated to streaming module)
    startStreaming(messageElement, content, isAI = false) {
        const contentDiv = messageElement.querySelector('.streaming-text');
        const speed = isAI ? this.streaming.config.aiStreamingSpeed : this.streaming.config.streamingSpeed;
        
        this.isStreaming = true;
        
        // Use streaming module with scroll callback
        this.streaming.streamContent(contentDiv, content, speed).then(() => {
            messageElement.classList.add('complete');
            this.isStreaming = false;
        });
        
        // Setup scroll callback for streaming
        const originalStreamSimpleText = this.streaming.streamSimpleText.bind(this.streaming);
        this.streaming.streamSimpleText = async (container, text, speed, onProgress) => {
            const scrollCallback = () => this.scrollToBottom();
            return originalStreamSimpleText(container, text, speed, scrollCallback);
        };
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

    // Smart scroll to bottom (respects user interaction)
    scrollToBottom() {
        if (this.conversationStream) {
            if (this.autoScrollEnabled && !this.userHasScrolled) {
                this.conversationStream.scrollTop = this.conversationStream.scrollHeight;
                // console.log('📜 Auto-scrolled to bottom');
            } else {
                // console.log('📜 Scroll blocked - user has scrolled up');
            }
        }
    }

    // Force scroll to bottom (ignores user interaction)
    forceScrollToBottom() {
        if (this.conversationStream) {
            this.conversationStream.scrollTop = this.conversationStream.scrollHeight;
            this.userHasScrolled = false;
            this.autoScrollEnabled = true;
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

    // Toggle microphone mute
    toggleMute() {
        if (typeof window.toggleMicrophoneMute === 'function') {
            const isMuted = window.toggleMicrophoneMute();
            this.updateMuteButton(isMuted);
            
            // Update activity indicator text based on mute state
            if (this.activityIndicator && this.activityIndicator.classList.contains('show')) {
                this.showActivity(); // This will check mute state and update text
            }
        }
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
        
        // Correctly set initial mute button state
        if (typeof window.isMicrophoneMuted === 'function') {
            this.updateMuteButton(window.isMicrophoneMuted());
        }
        
        // Set default mute state (muted by default for privacy)
        if (typeof window.isMicrophoneMuted === 'function') {
            const isMuted = window.isMicrophoneMuted();
            this.updateMuteButton(isMuted);
            console.log(`🎤 UI initialized with microphone ${isMuted ? 'muted' : 'unmuted'}`);
        }
        
        // Reset scroll state
        this.userHasScrolled = false;
        this.autoScrollEnabled = true;
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = null;
        }
        
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

// Smart scroll controls
window.forceScrollToBottom = () => {
    if (window.liveInterviewUI) {
        window.liveInterviewUI.forceScrollToBottom();
        console.log('📜 Forced scroll to bottom');
    }
};

window.enableAutoScroll = () => {
    if (window.liveInterviewUI) {
        window.liveInterviewUI.autoScrollEnabled = true;
        window.liveInterviewUI.userHasScrolled = false;
        console.log('🔄 Auto-scroll enabled');
    }
};

window.disableAutoScroll = () => {
    if (window.liveInterviewUI) {
        window.liveInterviewUI.autoScrollEnabled = false;
        console.log('⏸️ Auto-scroll disabled');
    }
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

export default window.liveInterviewUI; 