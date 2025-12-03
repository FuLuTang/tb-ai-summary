document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);
document.getElementById('clearBtn').addEventListener('click', clearCache);

function restoreOptions() {
    browser.storage.local.get("app_settings").then((res) => {
        const settings = res.app_settings || { maxCacheEntries: 20, batchSize: 15 };
        document.getElementById('maxCache').value = settings.maxCacheEntries;
        document.getElementById('batchSize').value = settings.batchSize || 15;
    });
}

function saveOptions() {
    const maxCache = parseInt(document.getElementById('maxCache').value);
    const batchSize = parseInt(document.getElementById('batchSize').value);

    if (!maxCache || maxCache < 1) {
        showStatus("请输入有效的最大缓存数量", "error");
        return;
    }

    if (!batchSize || batchSize < 1) {
        showStatus("请输入有效的批量总结数量", "error");
        return;
    }

    const settings = {
        maxCacheEntries: maxCache,
        batchSize: batchSize
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
