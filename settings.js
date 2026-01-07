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
    lowModelTemperature: 1.0, // Default 1.0 for O1 compatibility
    midModel: "gpt-5-mini",
    midModelTemperature: 1.0,
    highModel: "gpt-5.1",
    highModelTemperature: 1.0,
    promptProfile: "default",
    customPrompts: {
        agentPersona: "",
        agentPlan: "",
        agentReview: "",
        agentThought: "",
        agentFinal: "",
        agentCompress: "",
        summary: "",
        briefing: ""
    }
};

const DEFAULT_PROMPTS = {
    agentPersona: "You are an intelligent Thunderbird Email Agent.\nYour goal is to assist the user with email tasks.",
    agentPlan: "Based on the conversation, please create a concise text-based plan (3-5 steps) to solve the user's latest request. If the request is simple (like \"hi\"), just say \"No complex plan needed\".",
    agentReview: "Based on recent observations, is this plan still valid? If needed, provide a revised plan. If valid, just say \"Plan looks good\".",
    agentThought: "Task: Analyze the current situation. Do we need to use a tool to get more information, or can we answer the user now?",
    agentFinal: "Please provide the final answer to the user request.",
    agentCompress: "You are a memory management assistant. Please summarize the following conversation history into a concise summary, retaining all key facts, retrieved email info, and current progress so the Agent can continue.",
    briefing: "You are a executive secretary. Based on the following email summaries from the last 24 hours, generate a \"Daily Briefing\".\n\nFormat:\n1. **Overview**: 1-2 sentences overall status.\n2. **Top Priorities**: List 3 most urgent items (High urgency score).\n3. **Key Themes**: Group other items by topic (e.g. Work, News, Personal).\n4. **Action Plan**: Suggested order of processing.\n\nOutput in ${outputLang}. Use Markdown.",
    summary: "You are a smart email assistant. Please analyze the email provided by the user and output a JSON object with the following schema:"
};

var activeTasks = {}; // { headerMessageId: { status: 'loading' | 'success' | 'error', data: ..., error: ... } }

// 加载设置
async function loadSettings() {
    try {
        const result = await browser.storage.local.get("app_settings");

        if (result.app_settings) {
            // Use Object.assign to update the existing object reference, 
            // so that other modules holding a reference (like LLMService) see the updates.
            Object.assign(appSettings, result.app_settings);
        } else {
            // 尝试兼容旧的存储方式 (以防万一)
            const legacyResult = await browser.storage.local.get([
                "apiKey", "apiUrl", "temperature",
                "maxCacheEntries", "maxRequestsPerSecond", "maxConcurrentRequests",
                "popupWidth", "autoTagging", "maxTagsPerEmail",
                "briefingUrgency", "displayLanguage", "outputLanguage"
            ]);
            if (legacyResult.apiKey) {
                Object.assign(appSettings, legacyResult);
            }
        }
        console.log("Settings loaded:", appSettings);
    } catch (e) {
        console.error("Failed to load settings:", e);
    }
}
