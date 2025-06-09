// Screenshot Service for Vision AI Processing
// Handles screen capture, queue management, and vision model integration

class ScreenshotService {
    constructor() {
        this.screenshotQueue = [];
        this.maxScreenshots = 4;
        this.isCapturing = false;
        this.visionConfig = null;
        this.programmingLanguages = [];
        
        this.setupUI();
        this.setupStyles();
        console.log('📸 ScreenshotService initialized');
    }
    
    setupUI() {
        // Create screenshot queue UI element
        const queueContainer = document.createElement('div');
        queueContainer.id = 'screenshot-queue';
        queueContainer.className = 'screenshot-queue hidden';
        queueContainer.innerHTML = `
            <div class="queue-header">
                <span class="queue-title">📸 Screenshots Queue</span>
                <div class="queue-controls">
                    <button id="clear-queue-btn" class="queue-btn clear">Clear All</button>
                    <button id="process-queue-btn" class="queue-btn process" disabled>Process (0)</button>
                </div>
            </div>
            <div class="queue-grid" id="queue-grid">
                <!-- Screenshots will be added here -->
            </div>
        `;
        
        // Store reference for later insertion
        this.queueElement = queueContainer;
        
        // Setup event listeners
        this.setupQueueEventListeners();
    }
    
    setupQueueEventListeners() {
        // Will be set up after DOM insertion
    }
    
    insertQueueUI() {
        const liveView = document.getElementById('live-view');
        if (liveView && this.queueElement && !document.getElementById('screenshot-queue')) {
            const interviewContent = liveView.querySelector('.interview-content');
            if (interviewContent) {
                interviewContent.appendChild(this.queueElement);
                
                // Setup event listeners now that elements are in DOM
                document.getElementById('clear-queue-btn')?.addEventListener('click', () => {
                    this.clearQueue();
                });
                
                document.getElementById('process-queue-btn')?.addEventListener('click', () => {
                    this.processQueue();
                });
                
                console.log('✅ Screenshot queue UI added to live view');
            }
        }
    }
    
    setupStyles() {
        if (!document.getElementById('screenshot-service-styles')) {
            const style = document.createElement('style');
            style.id = 'screenshot-service-styles';
            style.textContent = `
                .screenshot-queue {
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    width: 320px;
                    background: rgba(0, 0, 0, 0.95);
                    border: 1px solid #333;
                    border-radius: 8px;
                    backdrop-filter: blur(15px);
                    z-index: 1000;
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
                    transition: all 0.3s ease;
                }
                
                .screenshot-queue.hidden {
                    opacity: 0;
                    pointer-events: none;
                    transform: translateY(-10px);
                }
                
                .queue-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }
                
                .queue-title {
                    font-size: 12px;
                    font-weight: 600;
                    color: #ffffff;
                }
                
                .queue-controls {
                    display: flex;
                    gap: 6px;
                }
                
                .queue-btn {
                    padding: 4px 8px;
                    font-size: 10px;
                    border: 1px solid #333;
                    border-radius: 4px;
                    background: rgba(255, 255, 255, 0.1);
                    color: #ffffff;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                .queue-btn:hover:not(:disabled) {
                    background: rgba(255, 255, 255, 0.2);
                    border-color: #555;
                }
                
                .queue-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .queue-btn.clear {
                    border-color: #f56565;
                    color: #f56565;
                }
                
                .queue-btn.clear:hover:not(:disabled) {
                    background: rgba(245, 101, 101, 0.2);
                }
                
                .queue-btn.process {
                    border-color: #48bb78;
                    color: #48bb78;
                }
                
                .queue-btn.process:hover:not(:disabled) {
                    background: rgba(72, 187, 120, 0.2);
                }
                
                .queue-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                    padding: 12px;
                    max-height: 240px;
                    overflow-y: auto;
                }
                
                .screenshot-item {
                    position: relative;
                    border-radius: 4px;
                    overflow: hidden;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    background: rgba(255, 255, 255, 0.05);
                }
                
                .screenshot-image {
                    width: 100%;
                    height: 80px;
                    object-fit: cover;
                    display: block;
                }
                
                .screenshot-info {
                    padding: 6px;
                    font-size: 9px;
                    color: #a0aec0;
                    text-align: center;
                }
                
                .screenshot-remove {
                    position: absolute;
                    top: 4px;
                    right: 4px;
                    width: 16px;
                    height: 16px;
                    background: rgba(245, 101, 101, 0.9);
                    border: none;
                    border-radius: 50%;
                    color: white;
                    font-size: 10px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s ease;
                }
                
                .screenshot-remove:hover {
                    background: #f56565;
                    transform: scale(1.1);
                }
                
                .vision-mode-indicator {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.9);
                    color: white;
                    padding: 20px 30px;
                    border-radius: 8px;
                    border: 2px solid #6366f1;
                    backdrop-filter: blur(15px);
                    z-index: 10000;
                    text-align: center;
                    animation: fadeInScale 0.3s ease-out;
                }
                
                .vision-mode-content h3 {
                    margin: 0 0 10px 0;
                    color: #6366f1;
                    font-size: 18px;
                }
                
                .vision-mode-content p {
                    margin: 0 0 15px 0;
                    color: #a0aec0;
                    font-size: 14px;
                }
                
                .vision-hotkeys {
                    display: flex;
                    gap: 15px;
                    justify-content: center;
                }
                
                .vision-hotkey {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 5px;
                }
                
                .vision-hotkey kbd {
                    background: #6366f1;
                    color: white;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                }
                
                .vision-hotkey span {
                    font-size: 10px;
                    color: #718096;
                }
                
                @keyframes fadeInScale {
                    from {
                        opacity: 0;
                        transform: translate(-50%, -50%) scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: translate(-50%, -50%) scale(1);
                    }
                }
                
                .capture-notification {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: rgba(0, 0, 0, 0.9);
                    color: white;
                    padding: 12px 20px;
                    border-radius: 6px;
                    border-left: 4px solid #48bb78;
                    z-index: 10000;
                    animation: slideInRight 0.3s ease-out;
                }
                
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // Configuration methods
    setVisionConfig(visionProvider, visionModel) {
        this.visionConfig = {
            provider: visionProvider,
            model: visionModel
        };
        console.log('🔧 Vision config set:', this.visionConfig);
    }
    
    setProgrammingLanguages(languages) {
        this.programmingLanguages = languages;
        console.log('💻 Programming languages set:', this.programmingLanguages);
    }
    
    // Screenshot capture methods
    async captureScreenshot() {
        if (this.isCapturing) {
            console.log('⚠️ Screenshot capture already in progress');
            return false;
        }
        
        if (this.screenshotQueue.length >= this.maxScreenshots) {
            this.showNotification('❌ Queue Full', 'Remove some screenshots before taking more', 'error');
            return false;
        }
        
        this.isCapturing = true;
        
        try {
            // Try to use existing screen video track first
            let videoTrack = null;
            
            // Import audio handler to get existing screen track
            if (window.getScreenVideoTrack && window.isScreenSharingAvailable) {
                if (window.isScreenSharingAvailable()) {
                    videoTrack = window.getScreenVideoTrack();
                    console.log('📹 Using existing screen video track for screenshot');
                } else {
                    console.warn('⚠️ Screen sharing not available, requesting new permission');
                }
            }
            
            // Fallback to requesting new permission if no existing track
            if (!videoTrack) {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                    throw new Error('Screen capture not supported in this browser');
                }
                
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: {
                        mediaSource: 'screen',
                        width: { max: 1920 },
                        height: { max: 1080 }
                    }
                });
                
                videoTrack = stream.getVideoTracks()[0];
                if (!videoTrack) {
                    throw new Error('No video track available from screen capture');
                }
                
                console.log('📹 Created new screen capture stream for screenshot');
            }
            
            // Create video element to capture frame
            const video = document.createElement('video');
            video.srcObject = new MediaStream([videoTrack]);
            video.play();
            
            // Wait for video to load
            await new Promise((resolve, reject) => {
                video.onloadedmetadata = resolve;
                video.onerror = reject;
                // Add timeout to prevent hanging
                setTimeout(() => reject(new Error('Video load timeout')), 5000);
            });
            
            // Create canvas and capture frame
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);
            
            // Convert to blob
            const blob = await new Promise(resolve => {
                canvas.toBlob(resolve, 'image/jpeg', 0.8);
            });
            
            // Only stop the track if we created a new one (not reusing existing)
            if (!window.getScreenVideoTrack || videoTrack !== window.getScreenVideoTrack()) {
                videoTrack.stop();
                console.log('📹 Stopped temporary screen capture track');
            }
            
            // Clean up video element
            video.srcObject = null;
            
            // Add to queue
            const screenshot = {
                id: Date.now(),
                blob: blob,
                dataUrl: canvas.toDataURL('image/jpeg', 0.8),
                timestamp: new Date(),
                size: blob.size
            };
            
            this.addToQueue(screenshot);
            this.showNotification('📸 Screenshot Captured', `Added to queue (${this.screenshotQueue.length}/${this.maxScreenshots})`, 'success');
            
            return true;
            
        } catch (error) {
            console.error('❌ Screenshot capture failed:', error);
            
            if (error.name === 'NotAllowedError') {
                this.showNotification('❌ Permission Denied', 'Screen capture permission was denied', 'error');
            } else if (error.message.includes('timeout')) {
                this.showNotification('❌ Capture Timeout', 'Screenshot capture took too long', 'error');
            } else {
                this.showNotification('❌ Capture Failed', error.message, 'error');
            }
            
            return false;
        } finally {
            this.isCapturing = false;
        }
    }
    
    // Queue management methods
    addToQueue(screenshot) {
        this.screenshotQueue.push(screenshot);
        this.updateQueueUI();
        console.log('📸 Screenshot added to queue:', screenshot.id);
    }
    
    removeFromQueue(screenshotId) {
        this.screenshotQueue = this.screenshotQueue.filter(s => s.id !== screenshotId);
        this.updateQueueUI();
        console.log('🗑️ Screenshot removed from queue:', screenshotId);
    }
    
    clearQueue() {
        this.screenshotQueue = [];
        this.updateQueueUI();
        this.showNotification('🗑️ Queue Cleared', 'All screenshots removed', 'warning');
        console.log('🗑️ Screenshot queue cleared');
    }
    
    updateQueueUI() {
        const queueGrid = document.getElementById('queue-grid');
        const processBtn = document.getElementById('process-queue-btn');
        
        if (!queueGrid || !processBtn) return;
        
        // Update process button
        processBtn.textContent = `Process (${this.screenshotQueue.length})`;
        processBtn.disabled = this.screenshotQueue.length === 0 || !this.visionConfig;
        
        // Update grid
        queueGrid.innerHTML = '';
        
        this.screenshotQueue.forEach(screenshot => {
            const item = document.createElement('div');
            item.className = 'screenshot-item';
            item.innerHTML = `
                <img src="${screenshot.dataUrl}" alt="Screenshot" class="screenshot-image">
                <button class="screenshot-remove" onclick="screenshotService.removeFromQueue(${screenshot.id})">×</button>
                <div class="screenshot-info">
                    ${new Date(screenshot.timestamp).toLocaleTimeString()}
                    <br>${this.formatFileSize(screenshot.size)}
                </div>
            `;
            queueGrid.appendChild(item);
        });
    }
    
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + 'B';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
        return Math.round(bytes / (1024 * 1024)) + 'MB';
    }
    
    // Vision processing methods
    async processQueue() {
        if (this.screenshotQueue.length === 0) {
            this.showNotification('❌ No Screenshots', 'Take some screenshots first', 'error');
            return;
        }
        
        if (!this.visionConfig) {
            this.showNotification('❌ No Vision Model', 'Configure a vision model in settings', 'error');
            return;
        }
        
        const processBtn = document.getElementById('process-queue-btn');
        if (processBtn) {
            processBtn.disabled = true;
            processBtn.textContent = 'Processing...';
        }
        
        try {
            const prompt = this.generateCodingPrompt();
            const screenshots = this.screenshotQueue.map(s => s.dataUrl);
            
            console.log('🔄 Processing comprehensive multi-screenshot analysis...');
            console.log(`📸 Analyzing ${screenshots.length} screenshots together as one complete problem`);
            console.log('🧠 Generating two distinct solution approaches with full implementations');
            
            // Send to vision processing service
            const result = await this.sendToVisionAI(prompt, screenshots);
            
            if (result.success) {
                // Display result in conversation
                if (window.liveInterviewUI) {
                    liveInterviewUI.addVisionAnalysis(result.analysis, {
                        screenshotCount: screenshots.length,
                        model: this.visionConfig.model,
                        provider: this.visionConfig.provider,
                        languages: this.programmingLanguages
                    });
                }
                
                // Clear queue after successful processing
                this.clearQueue();
                this.showNotification('✅ Comprehensive Analysis Complete', 
                    `${screenshots.length} screenshots analyzed with 2 solution approaches`, 'success');
            } else {
                this.showNotification('❌ Analysis Failed', result.error || 'Vision AI processing failed', 'error');
            }
            
        } catch (error) {
            console.error('❌ Vision processing error:', error);
            this.showNotification('❌ Processing Error', error.message, 'error');
        } finally {
            if (processBtn) {
                processBtn.disabled = false;
                processBtn.textContent = `Process (${this.screenshotQueue.length})`;
            }
        }
    }
    
    generateCodingPrompt() {
        const languageContext = this.programmingLanguages.length > 0 
            ? `Focus on solutions in: ${this.programmingLanguages.join(', ')}`
            : 'Provide solutions in popular programming languages';
            
        return `You are an expert coding interview assistant. Analyze the provided screenshot(s) of coding problems and provide comprehensive help.

Please provide:

1. **Problem Understanding**: 
   - Clearly explain what the problem is asking
   - Identify key constraints and requirements
   - Point out any edge cases to consider

2. **Approach & Algorithm**:
   - Explain the optimal approach(es) to solve this problem
   - Discuss time and space complexity
   - Compare different approaches if multiple exist

3. **Code Solution**:
   - ${languageContext}
   - Provide clean, well-commented code
   - Include proper variable names and structure

4. **Step-by-Step Explanation**:
   - Walk through the solution logic
   - Explain key insights and techniques used

5. **Test Cases & Examples**:
   - Show how the solution works with examples
   - Include edge cases if relevant

6. **Alternative Approaches**:
   - Mention other ways to solve this problem
   - Discuss trade-offs between different approaches

7. **Interview Tips**:
   - How to communicate this solution in an interview
   - Common mistakes to avoid
   - Follow-up questions the interviewer might ask

Focus on being educational and helping understand both the solution and the underlying concepts.`;
    }
    
    async sendToVisionAI(prompt, screenshots) {
        try {
            console.log(`🔍 Sending ${screenshots.length} screenshots for comprehensive analysis`);
            console.log('📝 Enhanced prompt for multi-screenshot analysis');
            
            const payload = {
                prompt: prompt,
                screenshots: screenshots,
                visionConfig: this.visionConfig,
                languages: this.programmingLanguages
            };
            
            // Send via WebSocket if available
            if (window.sendSocketMessage) {
                window.sendSocketMessage('vision_analysis', payload);
                
                // Return a promise that resolves when we get the response
                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Vision analysis timeout (60s)'));
                    }, 60000); // 60 second timeout
                    
                    // This would be handled by the WebSocket message handler
                    window.visionAnalysisResolver = (result) => {
                        clearTimeout(timeout);
                        console.log(`✅ Vision analysis resolver called with result:`, result.success ? 'SUCCESS' : 'FAILED');
                        resolve(result);
                    };
                });
            } else {
                throw new Error('WebSocket not available - please ensure interview is active');
            }
            
        } catch (error) {
            console.error('❌ Vision AI request failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // UI methods
    showVisionMode(isActive) {
        if (isActive) {
            this.insertQueueUI();
            const queueElement = document.getElementById('screenshot-queue');
            if (queueElement) {
                queueElement.classList.remove('hidden');
            }
            
            this.showVisionModeIndicator();
        } else {
            const queueElement = document.getElementById('screenshot-queue');
            if (queueElement) {
                queueElement.classList.add('hidden');
            }
            
            this.hideVisionModeIndicator();
        }
    }
    
    showVisionModeIndicator() {
        // Remove existing indicator
        this.hideVisionModeIndicator();
        
        const indicator = document.createElement('div');
        indicator.id = 'vision-mode-indicator';
        indicator.className = 'vision-mode-indicator';
        indicator.innerHTML = `
            <div class="vision-mode-content">
                <h3>👁️ Vision Mode Active</h3>
                <p>Ready to capture and analyze screenshots</p>
                <div class="vision-hotkeys">
                    <div class="vision-hotkey">
                        <kbd>Alt+S</kbd>
                        <span>Capture</span>
                    </div>
                    <div class="vision-hotkey">
                        <kbd>Alt+P</kbd>
                        <span>Process</span>
                    </div>
                    <div class="vision-hotkey">
                        <kbd>Alt+V</kbd>
                        <span>Exit Vision</span>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(indicator);
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            this.hideVisionModeIndicator();
        }, 3000);
    }
    
    hideVisionModeIndicator() {
        const indicator = document.getElementById('vision-mode-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
    
    showNotification(title, message, type = 'info') {
        // Remove existing notification
        const existing = document.getElementById('capture-notification');
        if (existing) existing.remove();
        
        const notification = document.createElement('div');
        notification.id = 'capture-notification';
        notification.className = `capture-notification ${type}`;
        notification.innerHTML = `
            <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
            <div style="font-size: 12px; opacity: 0.8;">${message}</div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }
    
    // Public API methods
    getQueueStatus() {
        return {
            count: this.screenshotQueue.length,
            maxCount: this.maxScreenshots,
            totalSize: this.screenshotQueue.reduce((sum, s) => sum + s.size, 0),
            isConfigured: !!this.visionConfig
        };
    }
    
    isReady() {
        return !!this.visionConfig && this.programmingLanguages.length > 0;
    }
}

// Create global instance
const screenshotService = new ScreenshotService();

// Make it globally accessible
window.screenshotService = screenshotService;

export default screenshotService; 