// settings.js - 处理配置加载和全局变量

console.log("Loading settings.js...");

// 全局变量
var appSettings = {
    maxCacheEntries: 500,
    maxRequestsPerSecond: 5,
    maxConcurrentRequests: 20,
    popupWidth: 400,
    autoTagging: false,
    maxTagsPerEmail: 3,
    temperature: 1.0,
    briefingUrgency: 5,
    displayLanguage: "en",
    outputLanguage: "English",
    lowModel: "gpt-5-nano",
    midModel: "gpt-5-mini",
    highModel: "gpt-5.1"
};

var activeTasks = {}; // { headerMessageId: { status: 'loading' | 'success' | 'error', data: ..., error: ... } }

// 加载设置
async function loadSettings() {
    try {
        const result = await browser.storage.local.get("app_settings");

        if (result.app_settings) {
            appSettings = { ...appSettings, ...result.app_settings };
        } else {
            // 尝试兼容旧的存储方式 (以防万一)
            const legacyResult = await browser.storage.local.get([
                "apiKey", "apiUrl", "temperature",
                "maxCacheEntries", "maxRequestsPerSecond", "maxConcurrentRequests",
                "popupWidth", "autoTagging", "maxTagsPerEmail",
                "briefingUrgency", "displayLanguage", "outputLanguage"
            ]);
            if (legacyResult.apiKey) {
                appSettings = { ...appSettings, ...legacyResult };
            }
        }
        console.log("Settings loaded:", appSettings);
    } catch (e) {
        console.error("Failed to load settings:", e);
    }
}
