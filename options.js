document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);
document.getElementById('clearBtn').addEventListener('click', clearCache);

function restoreOptions() {
    browser.storage.local.get("app_settings").then((res) => {
        const settings = res.app_settings || {
            maxCacheEntries: 20,
            apiKey: "",
            apiUrl: "https://api.openai.com/v1/chat/completions",
            model: "gpt-4o-mini",
            temperature: 0.2
        };
        document.getElementById('maxCache').value = settings.maxCacheEntries;
        document.getElementById('apiKey').value = settings.apiKey || "";
        document.getElementById('apiUrl').value = settings.apiUrl || "https://api.openai.com/v1/chat/completions";
        document.getElementById('model').value = settings.model || "gpt-4o-mini";
        document.getElementById('temperature').value = settings.temperature !== undefined ? settings.temperature : 0.2;
    });
}

function saveOptions() {
    const maxCache = parseInt(document.getElementById('maxCache').value);
    const apiKey = document.getElementById('apiKey').value.trim();
    const apiUrl = document.getElementById('apiUrl').value.trim();
    const model = document.getElementById('model').value.trim();
    const temperature = parseFloat(document.getElementById('temperature').value);

    if (!maxCache || maxCache < 1) {
        showStatus("请输入有效的最大缓存数量", "error");
        return;
    }

    if (!apiKey) {
        showStatus("请输入 API Key", "error");
        return;
    }

    const settings = {
        maxCacheEntries: maxCache,
        apiKey: apiKey,
        apiUrl: apiUrl || "https://api.openai.com/v1/chat/completions",
        model: model || "gpt-4o-mini",
        temperature: isNaN(temperature) ? 0.2 : temperature
    };

    browser.storage.local.set({ app_settings: settings }).then(() => {
        showStatus("设置已保存", "success");
        // 通知后台更新设置并执行裁剪
        browser.runtime.sendMessage({ type: "SETTINGS_UPDATED" });
    });
}

function clearCache() {
    if (confirm("确定要清空所有缓存吗？这将删除所有已保存的摘要。")) {
        // 先获取当前设置，以免被误删
        browser.storage.local.get("app_settings").then((res) => {
            const settings = res.app_settings || { maxCacheEntries: 20 };

            // 清空所有
            browser.storage.local.clear().then(() => {
                // 恢复设置
                browser.storage.local.set({ app_settings: settings }).then(() => {
                    showStatus("缓存已清空", "success");
                    // 通知后台
                    browser.runtime.sendMessage({ type: "SETTINGS_UPDATED" });
                });
            });
        });
    }
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
