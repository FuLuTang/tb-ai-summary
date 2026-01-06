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

function restoreOptions() {
    browser.storage.local.get("app_settings").then((res) => {
        const settings = res.app_settings || {
            maxCacheEntries: 500,
            apiKey: "",
            apiUrl: "https://api.openai.com/v1/chat/completions",
            model: "gpt-4o-mini",
            temperature: 1.0,
            maxRequestsPerSecond: 5,
            maxConcurrentRequests: 20,
            popupWidth: 400,
            briefingUrgency: 5,
            displayLanguage: "en",
            outputLanguage: "English"
        };
        document.getElementById('displayLanguage').value = settings.displayLanguage || "en";
        document.getElementById('outputLanguage').value = settings.outputLanguage || "English";

        updateUIText(settings.displayLanguage || "en");
        document.getElementById('maxCache').value = settings.maxCacheEntries;
        document.getElementById('apiKey').value = settings.apiKey || "";
        document.getElementById('apiUrl').value = settings.apiUrl || "https://api.openai.com/v1/chat/completions";
        document.getElementById('model').value = settings.model || "gpt-4o-mini";
        document.getElementById('temperature').value = settings.temperature !== undefined ? settings.temperature : 1.0;
        document.getElementById('maxRps').value = settings.maxRequestsPerSecond !== undefined ? settings.maxRequestsPerSecond : 5;
        document.getElementById('maxConcurrent').value = settings.maxConcurrentRequests !== undefined ? settings.maxConcurrentRequests : 20;
        document.getElementById('popupWidth').value = settings.popupWidth !== undefined ? settings.popupWidth : 400;
        document.getElementById('briefingUrgency').value = settings.briefingUrgency !== undefined ? settings.briefingUrgency : 5;
    });
}

function saveOptions() {
    const maxCache = parseInt(document.getElementById('maxCache').value);
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiUrl = document.getElementById('apiUrl').value.trim();
    const model = document.getElementById('model').value.trim();
    const temperature = parseFloat(document.getElementById('temperature').value);
    const maxRps = parseInt(document.getElementById('maxRps').value);
    const maxConcurrent = parseInt(document.getElementById('maxConcurrent').value);
    const popupWidth = parseInt(document.getElementById('popupWidth').value);

    const briefingUrgency = parseInt(document.getElementById('briefingUrgency').value);
    const displayLanguage = document.getElementById('displayLanguage').value;
    const outputLanguage = document.getElementById('outputLanguage').value;

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

    const settings = {
        maxCacheEntries: maxCache,
        apiKey: apiKey,
        apiUrl: apiUrl || "https://api.openai.com/v1/chat/completions",
        model: model || "gpt-4o-mini",
        temperature: isNaN(temperature) ? 1.0 : temperature,
        maxRequestsPerSecond: maxRps,
        maxConcurrentRequests: maxConcurrent,
        popupWidth: isNaN(popupWidth) ? 400 : popupWidth,
        briefingUrgency: isNaN(briefingUrgency) ? 5 : briefingUrgency,
        displayLanguage: displayLanguage,
        outputLanguage: outputLanguage
    };

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
        ["modelLabel", "modelLabel"],
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
        ["briefingUrgencyLabel", "briefingUrgencyLabel"],
        ["briefingUrgencyDesc", "briefingUrgencyDesc"],
        ["saveBtn", "saveBtn"],
        ["saveBtnAI", "saveBtn"],
        ["clearBtn", "clearBtn"],
        ["logTitle", "logTitle"],
        ["tabGeneral", "tabGeneral"],
        ["tabAi", "tabAi"],
        ["tabLog", "tabLog"]
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
