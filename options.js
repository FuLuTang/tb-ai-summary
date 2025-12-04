document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);
document.getElementById('clearBtn').addEventListener('click', clearCache);

function restoreOptions() {
    browser.storage.local.get("app_settings").then((res) => {
        const settings = res.app_settings || {
            maxCacheEntries: 500,
            apiKey: "",
            apiUrl: "https://api.openai.com/v1/chat/completions",
            model: "gpt-4o-mini",
            temperature: 0.2,
            maxRequestsPerSecond: 5,
            maxConcurrentRequests: 3
        };
        document.getElementById('maxCache').value = settings.maxCacheEntries;
        document.getElementById('apiKey').value = settings.apiKey || "";
        document.getElementById('apiUrl').value = settings.apiUrl || "https://api.openai.com/v1/chat/completions";
        document.getElementById('model').value = settings.model || "gpt-4o-mini";
        document.getElementById('temperature').value = settings.temperature !== undefined ? settings.temperature : 0.2;
        document.getElementById('maxRps').value = settings.maxRequestsPerSecond !== undefined ? settings.maxRequestsPerSecond : 5;
        document.getElementById('maxConcurrent').value = settings.maxConcurrentRequests !== undefined ? settings.maxConcurrentRequests : 3;
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
        temperature: isNaN(temperature) ? 0.2 : temperature,
        maxRequestsPerSecond: maxRps,
        maxConcurrentRequests: maxConcurrent
    };

    browser.storage.local.set({ app_settings: settings }).then(() => {
        showStatus("设置已保存", "success");
        // 通知后台更新设置并执行裁剪
        browser.runtime.sendMessage({ type: "SETTINGS_UPDATED" });
    });
}



function clearCache() {
    if (!confirm("确定要清空所有缓存吗？这将删除所有已保存的摘要，但保留设置。")) return;

    const btn = document.getElementById('clearBtn');
    btn.disabled = true;
    showStatus("正在清空缓存...", "success");

    browser.runtime.sendMessage({ type: "CLEAR_CACHE" }).then((res) => {
        if (res && !res.error) {
            showStatus(`缓存已清空（删除 ${res.removed || 0} 条）`, "success");
            appendLog(`缓存清空完成，删除 ${res.removed || 0} 条。`);
        } else {
            showStatus("清空缓存失败: " + (res ? res.error : "未知错误"), "error");
        }
    }).catch((err) => {
        console.error("Clear cache failed:", err);
        showStatus("清空缓存失败: " + err.message, "error");
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

// 监听广播消息
browser.runtime.onMessage.addListener((message) => {
    if (message.type === "BATCH_START") {
        appendLog(">>> 收到批量总结请求：开始处理最近 40 封邮件...");
    } else if (message.type === "BATCH_PROGRESS") {
        const { current, total } = message.payload;
        appendLog(`进度更新: 正在处理第 ${current} / ${total} 封...`);
    } else if (message.type === "BATCH_COMPLETE") {
        appendLog("<<< 批量总结全部完成！");
    } else if (message.type === "BATCH_ERROR") {
        appendLog(`!!! 批量处理出错: ${message.payload.error}`);
    } else if (message.type === "SUMMARY_UPDATE") {
        const { headerMessageId, status, error, subject } = message.payload;
        const subjectText = subject ? `<${subject}>` : '';
        if (status === 'loading') {
            appendLog(`[${headerMessageId}] ${subjectText} 正在请求 AI 分析...`);
        } else if (status === 'success') {
            appendLog(`[${headerMessageId}] ${subjectText} 总结成功`);
        } else if (status === 'error') {
            appendLog(`[${headerMessageId}] ${subjectText} 总结失败: ${error}`);
        }
    }
});
