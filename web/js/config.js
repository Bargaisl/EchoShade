// Configuration loader - fetches centralized config from backend
let appConfig = {
    DEV_MODE: false, // Default fallback
    LOG_LEVEL: 'INFO'
};

// Fetch configuration from backend
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            appConfig = await response.json();
            console.log('📋 Configuration loaded:', appConfig);
        } else {
            console.warn('⚠️ Could not load config from backend, using defaults');
        }
    } catch (error) {
        console.warn('⚠️ Config loading failed, using defaults:', error);
    }
    return appConfig;
}

// Utility functions for cleaner code
export function isDev() {
    return appConfig.DEV_MODE;
}

export function shouldLog(level = 'INFO') {
    const levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR'];
    const currentLevel = levels.indexOf(appConfig.LOG_LEVEL);
    const requestedLevel = levels.indexOf(level);
    return requestedLevel >= currentLevel;
}

// Enhanced console logging that respects DEV_MODE
export function devLog(...args) {
    if (isDev()) {
        console.log('[DEV]', ...args);
    }
}

export function devWarn(...args) {
    if (isDev()) {
        console.warn('[DEV]', ...args);
    }
}

export function devError(...args) {
    if (isDev()) {
        console.error('[DEV]', ...args);
    }
}

// Initialize configuration and export it
export { loadConfig, appConfig };
export default appConfig; 