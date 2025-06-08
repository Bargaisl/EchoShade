// Live Interview Interface Module
import { devLog, isDev } from './config.js';

class LiveInterviewUI {
    constructor() {
        this.conversationStream = null;
        this.activityIndicator = null;
        this.endButton = null;
        this.currentInterviewerElement = null; // Track interviewer message separately
        this.currentAIElement = null; // Track AI message separately
        this.isStreaming = false;
        
        // Configuration
        this.config = {
            enableStreaming: true,
            streamingSpeed: 15, // milliseconds between words (lower = faster)
            aiStreamingSpeed: 5, // 2x faster than before (was 40, now 20)
            bgTransparency: 0.85, // Background transparency (0-1)
            contentTransparency: 0.15, // Content transparency (0-1)
            codeTransparency: 0.25 // Code block transparency (0-1)
        };
    }

    // Initialize elements
    init() {
        this.conversationStream = document.getElementById('conversation-stream');
        this.activityIndicator = document.getElementById('activity-indicator');
        this.endButton = document.getElementById('end-interview-btn');
        this.setupEventListeners();
    }

    setupEventListeners() {
        if (this.endButton) {
            this.endButton.addEventListener('click', () => {
                this.endInterview();
            });
        }
    }

    // Show activity indicator
    showActivity(text = 'Listening...') {
        if (this.activityIndicator) {
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
            if (this.currentInterviewerElement) {
                this.updateInterviewerMessage(question);
            } else {
                this.currentInterviewerElement = this.createMessageElement(question, 'interviewer');
                this.conversationStream.appendChild(this.currentInterviewerElement);
                this.updateInterviewerMessage(question);
            }
        } else {
            // For final results
            if (this.currentInterviewerElement) {
                this.finalizeInterviewerMessage(question);
            } else {
                this.addMessage(question, 'interviewer');
            }
            this.hideActivity();
        }
    }

    // Add AI response
    addAIResponse(response) {
        this.currentAIElement = this.createMessageElement(response, 'ai-response');
        this.conversationStream.appendChild(this.currentAIElement);
        this.startStreaming(this.currentAIElement, response, true); // true for AI response
        this.scrollToBottom();
        this.hideActivity();
    }

    // Add message to conversation
    addMessage(content, type) {
        const messageElement = this.createMessageElement(content, type);
        this.conversationStream.appendChild(messageElement);
        this.startStreaming(messageElement, content);
        this.scrollToBottom();
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

    // Start streaming animation
    startStreaming(messageElement, content, isAI = false) {
        const contentDiv = messageElement.querySelector('.streaming-text');
        const speed = isAI ? this.config.aiStreamingSpeed : this.config.streamingSpeed;
        
        this.isStreaming = true;
        this.streamContent(contentDiv, content, speed);
    }

    // Stream content with typing effect
    async streamContent(container, content, speed = 25) {
        if (!this.config.enableStreaming) {
            // If streaming is disabled, show content immediately
            this.displayInstantText(container, content);
            container.parentElement.classList.add('complete');
            this.isStreaming = false;
            return;
        }

        // Check for code blocks
        if (content.includes('```')) {
            await this.streamComplexContent(container, content, speed);
        } else {
            await this.streamSimpleText(container, content, speed);
        }
        
        container.parentElement.classList.add('complete');
        this.isStreaming = false;
    }

    // Stream simple text
    async streamSimpleText(container, text, speed) {
        const words = text.split(' ');
        
        for (let i = 0; i < words.length; i++) {
            const wordSpan = document.createElement('span');
            wordSpan.className = 'word';
            wordSpan.textContent = words[i] + (i < words.length - 1 ? ' ' : '');
            
            container.appendChild(wordSpan);
            
            setTimeout(() => {
                wordSpan.style.opacity = '1';
            }, 10);
            
            await this.delay(speed);
            this.scrollToBottom();
        }
    }

    // Stream complex content with code
    async streamComplexContent(container, content, speed) {
        const parts = this.parseContent(content);
        
        for (const part of parts) {
            if (part.type === 'text') {
                await this.streamSimpleText(container, part.content, speed);
            } else if (part.type === 'code') {
                this.addCodeBlock(container, part.content, part.language);
                await this.delay(200); // Reduced delay for faster display
            }
            this.scrollToBottom();
        }
    }

    // Parse content for code blocks
    parseContent(content) {
        const parts = [];
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        let lastIndex = 0;
        let match;

        while ((match = codeBlockRegex.exec(content)) !== null) {
            // Add text before code block
            if (match.index > lastIndex) {
                const textPart = content.substring(lastIndex, match.index);
                if (textPart.trim()) {
                    parts.push({ type: 'text', content: textPart.trim() });
                }
            }
            
            // Add code block
            parts.push({
                type: 'code',
                language: match[1] || 'javascript',
                content: match[2].trim()
            });
            
            lastIndex = match.index + match[0].length;
        }
        
        // Add remaining text
        if (lastIndex < content.length) {
            const remainingText = content.substring(lastIndex);
            if (remainingText.trim()) {
                parts.push({ type: 'text', content: remainingText.trim() });
            }
        }
        
        // If no code blocks found, return as simple text
        if (parts.length === 0) {
            parts.push({ type: 'text', content: content });
        }
        
        return parts;
    }

    // Add code block
    addCodeBlock(container, code, language) {
        const codeBlockDiv = document.createElement('div');
        codeBlockDiv.className = 'code-block';
        
        const headerDiv = document.createElement('div');
        headerDiv.className = 'code-header';
        headerDiv.innerHTML = `
            <span class="language-tag">${language}</span>
            <button class="copy-btn" onclick="navigator.clipboard.writeText(\`${code.replace(/`/g, '\\`')}\`)">Copy</button>
        `;
        
        const preElement = document.createElement('pre');
        const codeElement = document.createElement('code');
        codeElement.className = `language-${language}`;
        codeElement.textContent = code;
        
        preElement.appendChild(codeElement);
        codeBlockDiv.appendChild(headerDiv);
        codeBlockDiv.appendChild(preElement);
        
        container.appendChild(codeBlockDiv);
        
        // Apply syntax highlighting
        if (window.Prism) {
            window.Prism.highlightElement(codeElement);
        }
    }

    // Legacy method kept for compatibility - now unused
    updateCurrentMessage(content, type) {
        // This method is deprecated - use specific interviewer/AI methods instead
    }

    // Display text instantly (for interim updates)
    displayInstantText(container, text) {
        const words = text.split(' ');
        
        for (let i = 0; i < words.length; i++) {
            const wordSpan = document.createElement('span');
            wordSpan.className = 'word';
            wordSpan.style.opacity = '1'; // Show immediately
            wordSpan.textContent = words[i] + (i < words.length - 1 ? ' ' : '');
            container.appendChild(wordSpan);
        }
        
        this.scrollToBottom();
    }

    // Update interviewer message (for interim results)
    updateInterviewerMessage(content) {
        if (this.currentInterviewerElement) {
            const contentDiv = this.currentInterviewerElement.querySelector('.streaming-text');
            
            // Mark as interim to hide typing cursor
            this.currentInterviewerElement.classList.add('interim');
            
            // Clear and update instantly
            contentDiv.innerHTML = '';
            this.displayInstantText(contentDiv, content);
        }
    }

    // Finalize interviewer message (for final results)
    finalizeInterviewerMessage(content) {
        if (this.currentInterviewerElement) {
            // Remove interim class to show typing animation for final result
            this.currentInterviewerElement.classList.remove('interim');
            
            const contentDiv = this.currentInterviewerElement.querySelector('.streaming-text');
            contentDiv.innerHTML = '';
            this.streamContent(contentDiv, content, this.config.streamingSpeed);
            
            // Clear the reference since this is final
            this.currentInterviewerElement = null;
        }
    }

    // Configuration methods
    setStreamingEnabled(enabled) {
        this.config.enableStreaming = enabled;
    }

    setStreamingSpeed(speed) {
        this.config.streamingSpeed = Math.max(10, Math.min(100, speed)); // 10-100ms range
    }

    setAIStreamingSpeed(speed) {
        this.config.aiStreamingSpeed = Math.max(5, Math.min(50, speed)); // 5-50ms range
    }

    // Transparency configuration methods
    setBackgroundTransparency(transparency) {
        this.config.bgTransparency = Math.max(0, Math.min(1, transparency));
        this.updateCSSTransparency();
    }

    setContentTransparency(transparency) {
        this.config.contentTransparency = Math.max(0, Math.min(1, transparency));
        this.updateCSSTransparency();
    }

    setCodeTransparency(transparency) {
        this.config.codeTransparency = Math.max(0, Math.min(1, transparency));
        this.updateCSSTransparency();
    }

    // Update CSS transparency variables
    updateCSSTransparency() {
        const root = document.documentElement;
        root.style.setProperty('--bg-transparency', this.config.bgTransparency);
        root.style.setProperty('--content-transparency', this.config.contentTransparency);
        root.style.setProperty('--code-transparency', this.config.codeTransparency);
    }

    // Scroll to bottom
    scrollToBottom() {
        if (this.conversationStream) {
            this.conversationStream.scrollTop = this.conversationStream.scrollHeight;
        }
    }

    // Delay utility
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Clear conversation
    clearConversation() {
        if (this.conversationStream) {
            this.conversationStream.innerHTML = '';
        }
        this.currentInterviewerElement = null;
        this.currentAIElement = null;
        this.isStreaming = false;
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
        this.updateCSSTransparency(); // Apply initial transparency settings
        console.log('🎬 Live interview UI initialized');
    }
}

// Create global instance
window.liveInterviewUI = new LiveInterviewUI();

// Add global configuration functions for easy control
window.setInterviewStreaming = (enabled) => {
    window.liveInterviewUI.setStreamingEnabled(enabled);
    console.log(`🎬 Streaming ${enabled ? 'enabled' : 'disabled'}`);
};

window.setInterviewSpeed = (speed) => {
    window.liveInterviewUI.setStreamingSpeed(speed);
    console.log(`⚡ Interviewer streaming speed set to ${speed}ms`);
};

window.setAISpeed = (speed) => {
    window.liveInterviewUI.setAIStreamingSpeed(speed);
    console.log(`🤖 AI streaming speed set to ${speed}ms`);
};

// Transparency configuration functions
window.setBackgroundTransparency = (transparency) => {
    window.liveInterviewUI.setBackgroundTransparency(transparency);
    console.log(`🌙 Background transparency set to ${transparency}`);
};

window.setContentTransparency = (transparency) => {
    window.liveInterviewUI.setContentTransparency(transparency);
    console.log(`🖼️ Content transparency set to ${transparency}`);
};

window.setCodeTransparency = (transparency) => {
    window.liveInterviewUI.setCodeTransparency(transparency);
    console.log(`💻 Code transparency set to ${transparency}`);
};

// Transparency presets
window.setMinimalMode = () => {
    window.setBackgroundTransparency(0.95);
    window.setContentTransparency(0.05);
    window.setCodeTransparency(0.15);
    console.log('👤 Minimal mode activated');
};

window.setGhostMode = () => {
    window.setBackgroundTransparency(0.98);
    window.setContentTransparency(0.02);
    window.setCodeTransparency(0.08);
    console.log('👻 Ghost mode activated - maximum transparency');
};

window.setStealthMode = () => {
    window.setBackgroundTransparency(0.90);
    window.setContentTransparency(0.10);
    window.setCodeTransparency(0.20);
    console.log('🥷 Stealth mode activated');
};

window.setDefaultTransparency = () => {
    window.setBackgroundTransparency(0.85);
    window.setContentTransparency(0.15);
    window.setCodeTransparency(0.25);
    console.log('🎨 Default transparency restored');
};

// Windows-level transparency controls
window.setWindowTransparency = async (transparency) => {
    try {
        const response = await fetch('/api/transparency', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transparency: transparency })
        });
        const result = await response.json();
        if (result.success) {
            console.log(`🪟 ${result.message}`);
        } else {
            console.error('❌ Failed to set window transparency');
        }
    } catch (error) {
        console.error('❌ Error setting window transparency:', error);
    }
};

window.setWindowTransparencyPercent = async (percent) => {
    try {
        const response = await fetch('/api/transparency/percent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ percent: percent })
        });
        const result = await response.json();
        if (result.success) {
            console.log(`🪟 ${result.message}`);
        } else {
            console.error('❌ Failed to set window transparency');
        }
    } catch (error) {
        console.error('❌ Error setting window transparency:', error);
    }
};

// Window transparency presets
window.setInterviewMode = async () => {
    try {
        const response = await fetch('/api/transparency/presets/transparent', {
            method: 'POST'
        });
        const result = await response.json();
        if (result.success) {
            console.log('🎯 Interview mode activated - window is now 40% opaque');
        }
    } catch (error) {
        console.error('❌ Error setting interview mode:', error);
    }
};

window.setSemiTransparentMode = async () => {
    try {
        const response = await fetch('/api/transparency/presets/semi-transparent', {
            method: 'POST'
        });
        const result = await response.json();
        if (result.success) {
            console.log('🌫️ Semi-transparent mode activated - window is now 70% opaque');
        }
    } catch (error) {
        console.error('❌ Error setting semi-transparent mode:', error);
    }
};

window.setOpaqueMode = async () => {
    try {
        const response = await fetch('/api/transparency/presets/opaque', {
            method: 'POST'
        });
        const result = await response.json();
        if (result.success) {
            console.log('🎨 Opaque mode activated - window is now 100% opaque');
        }
    } catch (error) {
        console.error('❌ Error setting opaque mode:', error);
    }
};

window.getTransparencyInfo = async () => {
    try {
        const response = await fetch('/api/transparency');
        const info = await response.json();
        console.log('🪟 Window Transparency Info:', info);
        return info;
    } catch (error) {
        console.error('❌ Error getting transparency info:', error);
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