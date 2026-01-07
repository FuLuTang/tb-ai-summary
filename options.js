document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);
document.getElementById('clearBtn').addEventListener('click', clearCache);
const displayLanguageSelect = document.getElementById('displayLanguage');
if (displayLanguageSelect) {
    displayLanguageSelect.addEventListener('change', (e) => {
        const lang = e.target.value || "en";
        updateUIText(lang);
    });
}

// Tab Switching Logic
document.querySelectorAll('.tab-btn').forEach(button => {
    button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');

        // Remove active class from all buttons and contents
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // Add active class to clicked button and target content
        button.classList.add('active');
        document.getElementById(tabId).classList.add('active');
    });
});

// Link the AI tab save button to the main save function
const saveBtnAI = document.getElementById('saveBtnAI');
if (saveBtnAI) {
    saveBtnAI.addEventListener('click', saveOptions);
}
const saveBtnPrompts = document.getElementById('saveBtnPrompts');
if (saveBtnPrompts) {
    saveBtnPrompts.addEventListener('click', saveOptions);
}

function restoreOptions() {
    // Use the global appSettings defined in settings.js, but ensure it's populated from storage
    // We can't rely on settings.js loadSettings() because we need the callback here.
    browser.storage.local.get("app_settings").then((res) => {
        const loaded = res.app_settings || {};

        // Merge with existing defaults in global variable to ensure structure
        appSettings = { ...appSettings, ...loaded };

        // Ensure promptProfile default
        if (!appSettings.promptProfile) appSettings.promptProfile = "default";

        document.getElementById('displayLanguage').value = appSettings.displayLanguage || "en";
        document.getElementById('outputLanguage').value = appSettings.outputLanguage || "English";

        updateUIText(appSettings.displayLanguage || "en");
        document.getElementById('maxCache').value = appSettings.maxCacheEntries;
        document.getElementById('apiKey').value = appSettings.apiKey || "";
        document.getElementById('apiUrl').value = appSettings.apiUrl || "https://api.openai.com/v1/chat/completions";

        document.getElementById('lowModel').value = appSettings.lowModel || "gpt-5-nano";
        document.getElementById('midModel').value = appSettings.midModel || "gpt-5-mini";
        document.getElementById('highModel').value = appSettings.highModel || "gpt-5.1";

        const defaultTemp = appSettings.temperature !== undefined ? appSettings.temperature : 1.0;
        document.getElementById('lowModelTemperature').value = appSettings.lowModelTemperature !== undefined ? appSettings.lowModelTemperature : 1.0;
        document.getElementById('midModelTemperature').value = appSettings.midModelTemperature !== undefined ? appSettings.midModelTemperature : 1.0;
        document.getElementById('highModelTemperature').value = appSettings.highModelTemperature !== undefined ? appSettings.highModelTemperature : 1.0;

        document.getElementById('maxRps').value = appSettings.maxRequestsPerSecond || 5;
        document.getElementById('maxConcurrent').value = appSettings.maxConcurrentRequests || 20;
        document.getElementById('popupWidth').value = appSettings.popupWidth || 400;
        document.getElementById('autoTagging').checked = !!appSettings.autoTagging;
        document.getElementById('maxTagsPerEmail').value = appSettings.maxTagsPerEmail || 3;
        document.getElementById('briefingUrgency').value = appSettings.briefingUrgency || 5;

        // Trigger change event to update UI state (enable/disable dependent fields)
        updateTagSettingsState();

        document.getElementById('promptProfile').value = appSettings.promptProfile;
        document.getElementById('promptProfile').value = appSettings.promptProfile;

        const isCustom = (appSettings.promptProfile === "custom");

        updatePromptFields(isCustom, appSettings);

        document.getElementById('customSummaryPrompt').value = (appSettings.customPrompts && appSettings.customPrompts.summary) || "";

        // Update the state of dependent controls
        updateTagSettingsState();
    });

    document.getElementById('promptProfile').addEventListener('change', (e) => {
        const isCustom = e.target.value === "custom";
        if (!isCustom) {
            updatePromptFields(false, {}); // {} triggers using DEFAULT_PROMPTS
        } else {
            // Restore saved custom prompts from global state
            updatePromptFields(true, appSettings);
        }
    });
}

function updatePromptFields(isCustom, currentSettings) {
    const fields = [
        ['customAgentPrompt', 'agentPersona'],
        ['customAgentPlan', 'agentPlan'],
        ['customAgentReview', 'agentReview'],
        ['customAgentThought', 'agentThought'],
        ['customAgentFinal', 'agentFinal'],
        ['customAgentCompress', 'agentCompress'],
        ['customSummaryPrompt', 'summary'],
        ['customBriefingPrompt', 'briefing']
    ];

    const customs = currentSettings ? (currentSettings.customPrompts || {}) : {};

    fields.forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (isCustom) {
            // If custom, use settings value
            if (customs[key] !== undefined) {
                el.value = customs[key];
            }
            // If empty, fill with default as placeholder/start (except summary which is empty by default)
            if (!el.value && key !== 'summary') {
                el.value = DEFAULT_PROMPTS[key] || "";
            }
        } else {
            // Default mode
            el.value = DEFAULT_PROMPTS[key] || "";
        }
    });

    togglePromptFields(isCustom);
}

function togglePromptFields(enabled) {
    const ids = [
        'customAgentPrompt', 'customAgentPlan', 'customAgentReview',
        'customAgentThought', 'customAgentFinal', 'customAgentCompress',
        'customSummaryPrompt', 'customBriefingPrompt'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        el.readOnly = !enabled;
        el.style.opacity = "1"; // Always visible text
        el.style.backgroundColor = enabled ? "#ffffff" : "#f8f9fa";
        el.style.color = enabled ? "#333" : "#6c757d";
        el.style.cursor = "text";
        el.style.resize = "vertical";


        // Also gray out the wrapper to make it obvious
        const wrapper = el.parentElement;
        if (wrapper) wrapper.classList.toggle('disabled', !enabled); // assuming css class exists or just rely on input style
    });
}

function updateTagSettingsState() {
    const isAutoTaggingEnabled = document.getElementById('autoTagging').checked;
    const maxTagsGroup = document.getElementById('groupMaxTags');

    if (isAutoTaggingEnabled) {
        maxTagsGroup.classList.remove('disabled');
    } else {
        maxTagsGroup.classList.add('disabled');
    }
}

// Listen for autoTagging toggle changes
document.getElementById('autoTagging').addEventListener('change', updateTagSettingsState);

function saveOptions() {
    /* Saving... visual removed per request */
    let maxCache = parseInt(document.getElementById('maxCache').value);
    if (isNaN(maxCache)) maxCache = 500;

    const apiKey = document.getElementById('apiKey').value.trim();
    const apiUrl = document.getElementById('apiUrl').value.trim();

    let maxRps = parseInt(document.getElementById('maxRps').value);
    if (isNaN(maxRps)) maxRps = 5;

    let maxConcurrent = parseInt(document.getElementById('maxConcurrent').value);
    if (isNaN(maxConcurrent)) maxConcurrent = 20;

    let popupWidth = parseInt(document.getElementById('popupWidth').value);
    if (isNaN(popupWidth)) popupWidth = 400;

    const autoTagging = document.getElementById('autoTagging').checked;

    let maxTagsPerEmail = parseInt(document.getElementById('maxTagsPerEmail').value);
    if (isNaN(maxTagsPerEmail)) maxTagsPerEmail = 3;

    let briefingUrgency = parseInt(document.getElementById('briefingUrgency').value);
    if (isNaN(briefingUrgency)) briefingUrgency = 5;
    const displayLanguage = document.getElementById('displayLanguage').value;
    const outputLanguage = document.getElementById('outputLanguage').value;
    const lowModel = document.getElementById('lowModel').value.trim();
    const midModel = document.getElementById('midModel').value.trim();
    const highModel = document.getElementById('highModel').value.trim();

    const lowModelTemp = parseFloat(document.getElementById('lowModelTemperature').value);
    const midModelTemp = parseFloat(document.getElementById('midModelTemperature').value);
    const highModelTemp = parseFloat(document.getElementById('highModelTemperature').value);

    const promptProfile = document.getElementById('promptProfile').value;

    const customAgentPrompt = document.getElementById('customAgentPrompt').value;
    const customAgentPlan = document.getElementById('customAgentPlan').value;
    const customAgentReview = document.getElementById('customAgentReview').value;
    const customAgentThought = document.getElementById('customAgentThought').value;
    const customAgentFinal = document.getElementById('customAgentFinal').value;
    const customAgentCompress = document.getElementById('customAgentCompress').value;
    const customSummaryPrompt = document.getElementById('customSummaryPrompt').value;
    const customBriefingPrompt = document.getElementById('customBriefingPrompt').value;

    if (!maxCache || maxCache < 1) {
        showStatus("请输入有效的最大缓存数量", "error");
        return;
    }

    if (!apiKey) {
        showStatus("请输入 API Key", "error");
        return;
    }

    if (!maxRps || maxRps < 1) {
        showStatus("请设置每秒请求上限 (至少 1)", "error");
        return;
    }

    if (!maxConcurrent || maxConcurrent < 1) {
        showStatus("请设置并发请求上限 (至少 1)", "error");
        return;
    }

    const customPrompts = {
        agentPersona: document.getElementById('customAgentPrompt').value,
        agentPlan: document.getElementById('customAgentPlan').value,
        agentReview: document.getElementById('customAgentReview').value,
        agentThought: document.getElementById('customAgentThought').value,
        agentFinal: document.getElementById('customAgentFinal').value,
        agentCompress: document.getElementById('customAgentCompress').value,
        summary: document.getElementById('customSummaryPrompt').value,
        briefing: document.getElementById('customBriefingPrompt').value
    };

    const settings = {
        maxCacheEntries: maxCache,
        apiKey: apiKey,
        apiUrl: apiUrl || "https://api.openai.com/v1/chat/completions",
        // temperature: ... (removed/handled later)
        maxRequestsPerSecond: maxRps,
        maxConcurrentRequests: maxConcurrent,
        popupWidth: isNaN(popupWidth) ? 400 : popupWidth,
        autoTagging: autoTagging,
        maxTagsPerEmail: isNaN(maxTagsPerEmail) ? 3 : maxTagsPerEmail,
        briefingUrgency: isNaN(briefingUrgency) ? 5 : briefingUrgency,
        displayLanguage: displayLanguage,
        outputLanguage: outputLanguage,
        lowModel: lowModel || "gpt-5-nano",
        midModel: midModel || "gpt-5-mini",
        highModel: highModel || "gpt-5.1",
        lowModelTemperature: isNaN(lowModelTemp) ? 1.0 : lowModelTemp,
        midModelTemperature: isNaN(midModelTemp) ? 1.0 : midModelTemp,
        highModelTemperature: isNaN(highModelTemp) ? 1.0 : highModelTemp,
        temperature: isNaN(highModelTemp) ? 1.0 : highModelTemp, // Keep for backward compatibility/fallback

        promptProfile: promptProfile,
        customPrompts: customPrompts
    };

    // Update global state
    appSettings = settings;

    browser.storage.local.set({ app_settings: settings }).then(() => {
        updateUIText(displayLanguage);
        showStatus(getText("statusSaved", displayLanguage), "success");
        // 通知后台更新设置并执行裁剪
        browser.runtime.sendMessage({ type: "SETTINGS_UPDATED" });
    });

}



function clearCache() {
    const lang = document.getElementById('displayLanguage').value || "en";
    if (!confirm(getText("statusClearConfirm", lang))) return;

    const btn = document.getElementById('clearBtn');
    btn.disabled = true;
    showStatus(getText("statusClearing", lang), "success");

    browser.runtime.sendMessage({ type: "CLEAR_CACHE" }).then((res) => {
        if (res && !res.error) {
            const msg = getText("statusCleared", lang).replace("{n}", res.removed || 0);
            showStatus(msg, "success");
            appendLog(msg);
        } else {
            showStatus(getText("statusError", lang).replace("{error}", res ? res.error : "Unknown"), "error");
        }
    }).catch((err) => {
        console.error("Clear cache failed:", err);
        showStatus(getText("statusError", lang).replace("{error}", err.message), "error");
    }).finally(() => {
        btn.disabled = false;
    });
}

function showStatus(text, type) {
    const status = document.getElementById('status');
    status.textContent = text;
    status.className = "status " + type;
    setTimeout(() => {
        status.className = "status";
        status.textContent = "";
    }, 3000);
}

// === 日志功能 ===
const logArea = document.getElementById('logArea');

function appendLog(message) {
    if (!logArea) return;
    const now = new Date().toLocaleTimeString();
    logArea.value += `[${now}] ${message}\n`;
    logArea.scrollTop = logArea.scrollHeight; // 自动滚动到底部
}

// 更新页面文案
function updateUIText(lang = "en") {
    const textMap = [
        ["settingsTitle", "settingsTitle"],
        ["settingsTitleHeader", "settingsTitle"],
        ["apiKeyLabel", "apiKeyLabel"],
        ["apiUrlLabel", "apiUrlLabel"],
        ["displayLanguageLabel", "displayLanguageLabel"],
        ["outputLanguageLabel", "outputLanguageLabel"],

        ["temperatureLabel", "temperatureLabel"],
        ["temperatureDesc", "temperatureDesc"],
        ["maxRpsLabel", "maxRpsLabel"],
        ["maxRpsDesc", "maxRpsDesc"],
        ["maxConcurrentLabel", "maxConcurrentLabel"],
        ["maxConcurrentDesc", "maxConcurrentDesc"],
        ["maxCacheLabel", "maxCacheLabel"],
        ["maxCacheDesc", "maxCacheDesc"],
        ["popupWidthLabel", "popupWidthLabel"],
        ["popupWidthDesc", "popupWidthDesc"],
        ["autoTaggingLabel", "autoTaggingLabel"],
        ["autoTaggingDesc", "autoTaggingDesc"],
        ["maxTagsPerEmailLabel", "maxTagsPerEmailLabel"],
        ["maxTagsPerEmailDesc", "maxTagsPerEmailDesc"],
        ["briefingUrgencyLabel", "briefingUrgencyLabel"],
        ["briefingUrgencyDesc", "briefingUrgencyDesc"],
        ["saveBtn", "saveBtn"],
        ["saveBtnAI", "saveBtn"],
        ["saveBtnPrompts", "saveBtn"],
        ["clearBtn", "clearBtn"],
        ["logTitle", "logTitle"],
        ["tabGeneral", "tabGeneral"],
        ["tabAi", "tabAi"],
        ["tabPrompts", "tabPrompts"],
        ["tabLog", "tabLog"],
        ["secLanguage", "secLanguage"],
        ["secSystem", "secSystem"],
        ["secTag", "secTag"],
        ["secApi", "secApi"],
        ["secModelSelection", "secModelSelection"],
        ["lowModelLabel", "lowModelLabel"],
        ["midModelLabel", "midModelLabel"],
        ["highModelLabel", "highModelLabel"],

        ["catAgentPersona", "catAgentPersona"],
        ["catAgentStrategy", "catAgentStrategy"],
        ["catAgentExecution", "catAgentExecution"],
        ["catEmailAnalysis", "catEmailAnalysis"],
        ["lblAgentPrompt", "lblAgentPrompt"],
        ["lblAgentPlan", "lblAgentPlan"],
        ["lblAgentReview", "lblAgentReview"],
        ["lblAgentThought", "lblAgentThought"],
        ["lblAgentFinal", "lblAgentFinal"],
        ["lblAgentCompress", "lblAgentCompress"],
        ["lblSummaryPrompt", "lblSummaryPrompt"],
        ["lblBriefingPrompt", "lblBriefingPrompt"],

        ["secAgentPrompt", "secAgentPrompt"],
        ["secSummaryPrompt", "secSummaryPrompt"],
        ["agentPromptDesc", "agentPromptDesc"],
        ["summaryPromptDesc", "summaryPromptDesc"],
        ["descAgentPrompt", "descAgentPrompt"],
        ["descAgentPlan", "descAgentPlan"],
        ["descAgentReview", "descAgentReview"],
        ["descAgentThought", "descAgentThought"],
        ["descAgentFinal", "descAgentFinal"],
        ["descAgentCompress", "descAgentCompress"],
        ["descSummaryPrompt", "descSummaryPrompt"],
        ["descBriefingPrompt", "descBriefingPrompt"],
        ["lblPromptProfile", "lblPromptProfile"],
        ["optProfileDefault", "optProfileDefault"],
        ["optProfileCustom", "optProfileCustom"],
        ["descPromptProfile", "descPromptProfile"],

        ["secLogic", "secLogic"]
    ];

    textMap.forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = getText(key, lang);
    });
}

// 监听广播消息
browser.runtime.onMessage.addListener((message) => {
    const lang = document.getElementById('displayLanguage').value || "en";

    if (message.type === "BATCH_START") {
        appendLog(getText("logBatchStart", lang));
    } else if (message.type === "BATCH_PROGRESS") {
        const { current, total } = message.payload;
        const msg = getText("logBatchProgress", lang)
            .replace("{current}", current)
            .replace("{total}", total);
        appendLog(msg);
    } else if (message.type === "BATCH_COMPLETE") {
        appendLog(getText("logBatchComplete", lang));
    } else if (message.type === "BATCH_ERROR") {
        const msg = getText("logBatchError", lang).replace("{error}", message.payload.error);
        appendLog(msg);
    } else if (message.type === "SUMMARY_UPDATE") {
        const { headerMessageId, status, error, subject } = message.payload;
        const subjectText = subject ? `<${subject}>` : '';

        let msg = "";
        if (status === 'loading') {
            msg = getText("logSummaryLoading", lang).replace("{id}", headerMessageId).replace("{subject}", subjectText);
        } else if (status === 'success') {
            msg = getText("logSummarySuccess", lang).replace("{id}", headerMessageId).replace("{subject}", subjectText);
        } else if (status === 'error') {
            msg = getText("logSummaryError", lang).replace("{id}", headerMessageId).replace("{subject}", subjectText).replace("{error}", error);
        }
        if (msg) appendLog(msg);
    }
});
