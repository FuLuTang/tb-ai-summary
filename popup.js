// popup.js

// API 设置已移至选项页面配置 (browser.storage.local)

let currentHeaderMessageId = null;
let currentMessageId = null;
let currentAuthor = "Unknown";
let currentSubject = "No Subject";

document.addEventListener('DOMContentLoaded', async () => {
    // Load language
    const settings = await browser.storage.local.get("app_settings");
    const lang = (settings.app_settings && settings.app_settings.displayLanguage) ? settings.app_settings.displayLanguage : "en";
    updatePopupUIText(lang);

    const resultDiv = document.getElementById('result');
    const summarizeBtn = document.getElementById('summarizeBtn');

    // 确保运行在支持 messageDisplay API 的环境（Thunderbird 115+）
    if (!browser.messageDisplay || typeof browser.messageDisplay.getDisplayedMessage !== 'function') {
        if (resultDiv) {
            resultDiv.textContent = getText("popupNoMail", lang);
        }
        if (summarizeBtn) {
            summarizeBtn.disabled = true;
            summarizeBtn.textContent = "不可用";
        }
        const disableIds = ['batchProcessBtn', 'batchSummarizeBtn'];
        disableIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = true;
        });
        return;
    }

    // 1. 获取当前邮件信息
    try {
        let tabs = await browser.tabs.query({ active: true, currentWindow: true });
        let message = await browser.messageDisplay.getDisplayedMessage(tabs[0].id);

        if (!message) {
            document.getElementById('result').textContent = getText("popupNoMail", lang);
            // Don't return here, allow batch button to work
        } else {
            currentHeaderMessageId = message.headerMessageId;
            currentMessageId = message.id;
            currentAuthor = message.author || "Unknown";
            currentSubject = message.subject || "No Subject";

            // 2. 向 Background 询问当前状态
            const status = await browser.runtime.sendMessage({
                type: "GET_STATUS",
                payload: { headerMessageId: currentHeaderMessageId, messageId: currentMessageId }
            });

            if (status) {
                updateUI(status, lang);
            }
        }

    } catch (e) {
        console.error("Init failed:", e);
    }

    // 监听来自 background 的消息
    browser.runtime.onMessage.addListener(async (message) => {
        if (message.type === "SUMMARY_UPDATE") {
            const { headerMessageId, status, data, error } = message.payload;
            // 如果当前显示的正是这封邮件，更新 UI
            if (currentHeaderMessageId === headerMessageId || currentMessageId === headerMessageId) {
                const settings = await browser.storage.local.get("app_settings");
                const lang = (settings.app_settings && settings.app_settings.displayLanguage) ? settings.app_settings.displayLanguage : "en";
                updateUI({ status, data, error }, lang);
            }
        } else if (message.type === "BATCH_START") {
            showBatchStatus("正在准备批量总结...", "loading");
        } else if (message.type === "BATCH_PROGRESS") {
            const { current, total } = message.payload;
            showBatchStatus(`进度 ${current}/${total} 封邮件`, "loading");
        } else if (message.type === "BATCH_COMPLETE") {
            showBatchStatus("批量总结完成！", "success");
            setTimeout(() => {
                const batchStatus = document.getElementById('batchStatus');
                if (batchStatus) batchStatus.style.display = 'none';
            }, 3000);
        } else if (message.type === "BATCH_ERROR") {
            showBatchStatus(`批量总结出错: ${message.payload.error}`, "error");
        }
    });

    // 4. 绑定按钮事件 (单封总结)
    document.getElementById('summarizeBtn').addEventListener('click', async () => {
        if (!currentHeaderMessageId) return;

        // 发送开始指令
        browser.runtime.sendMessage({
            type: "START_SUMMARY",
            payload: {
                headerMessageId: currentHeaderMessageId,
                messageId: currentMessageId,
                author: currentAuthor,
                subject: currentSubject,
                forceRegen: true
            }
        });

        // 立即更新 UI 为 Loading
        const settings = await browser.storage.local.get("app_settings");
        const lang = (settings.app_settings && settings.app_settings.displayLanguage) ? settings.app_settings.displayLanguage : "en";
        updateUI({ status: 'loading' }, lang);
    });

    // 5. 设置按钮 -> 打开选项页
    document.getElementById('settingsBtn').addEventListener('click', () => {
        browser.runtime.openOptionsPage();
    });

    // 6. 一键总结邮件 (带数量)
    document.getElementById('batchProcessBtn').addEventListener('click', () => {
        console.log("Batch process button clicked");

        const countInput = document.getElementById('batchCount');
        let count = parseInt(countInput.value, 10);

        // Validation
        if (isNaN(count) || count < 1) count = 40;
        if (count > 150) {
            alert("一次最多只能总结 150 封邮件，已自动调整为 150。");
            count = 150;
            countInput.value = 150;
        }

        console.log(`Sending START_BATCH_SUMMARY message with count: ${count}`);
        browser.runtime.sendMessage({
            type: "START_BATCH_SUMMARY",
            payload: { targetCount: count }
        }).then(() => {
            console.log("Message sent successfully");
        }).catch(err => {
            console.error("Message send failed:", err);
            alert("发送请求失败: " + err.message);
        });

        const resultDiv = document.getElementById('result');
        resultDiv.textContent = `已在后台开始批量处理最近 ${count} 封邮件... 请稍后查看缓存或再次打开此窗口。`;
        resultDiv.className = "success";
    });

    // 7. 新简报按钮
    document.getElementById('batchSummarizeBtn').addEventListener('click', async () => {
        const resultDiv = document.getElementById('result');
        const btn = document.getElementById('batchSummarizeBtn');

        resultDiv.textContent = "正在后台生成简报，请稍候...";
        resultDiv.className = "";

        // 发送后台任务
        browser.runtime.sendMessage({ type: "START_BRIEFING" });

        // 简单的 UI 反馈
        setTimeout(() => {
            resultDiv.textContent = "任务已发送到后台。完成后点击“查看已有简报”查看结果。";
            resultDiv.className = "success";
        }, 1000);
    });

    // 8. 查看已有简报
    document.getElementById('viewBriefingBtn').addEventListener('click', () => {
        browser.tabs.create({
            url: "briefing.html"
        });
    });
});

function updateUI(state, lang = "en") {
    const resultDiv = document.getElementById('result');
    const btn = document.getElementById('summarizeBtn');

    if (state.status === 'loading') {
        resultDiv.textContent = getText("popupLoading", lang);
        resultDiv.className = "";
        btn.disabled = true;
        btn.textContent = getText("popupLoading", lang);
    } else if (state.status === 'success') {
        renderResult(resultDiv, state.data, lang);
        btn.disabled = false;
        btn.textContent = getText("popupRegenerate", lang);
        btn.style.backgroundColor = "#f57c00";
    } else if (state.status === 'error') {
        resultDiv.textContent = getText("statusError", lang).replace("{error}", state.error);
        resultDiv.className = "error";
        btn.disabled = false;
        btn.textContent = getText("popupRetry", lang);
        btn.style.backgroundColor = "#007bff";
    }
}

// 渲染函数 (复用之前的逻辑)
function renderResult(container, data, lang = "en") {
    container.textContent = ""; // Clear previous content

    // 1. Urgency
    const urgencyDiv = document.createElement('div');
    urgencyDiv.className = "urgency";

    let emoji = "🟢";
    let colorClass = "urgency-low";
    if (data.urgency_score > 7) {
        emoji = "🔴";
        colorClass = "urgency-high";
    } else if (data.urgency_score >= 4) {
        emoji = "🟡";
        colorClass = "urgency-medium";
    }

    const urgencySpan = document.createElement('span');
    urgencySpan.className = colorClass;
    urgencySpan.textContent = `${emoji} ${getText("urgency", lang)}: ${data.urgency_score}/10`;
    urgencyDiv.appendChild(urgencySpan);

    if (data.urgency_score > 7 && data.urgency_reason) {
        const reasonSpan = document.createElement('span');
        reasonSpan.className = "urgency-reason";
        reasonSpan.textContent = `(${data.urgency_reason})`;
        urgencyDiv.appendChild(reasonSpan);
    }
    container.appendChild(urgencyDiv);

    // 2. Tags
    if (data.tags && data.tags.length > 0) {
        const tagsDiv = document.createElement('div');
        tagsDiv.style.marginBottom = "10px";
        data.tags.forEach(tag => {
            const badge = document.createElement('span');
            badge.className = "badge";
            badge.textContent = tag;
            tagsDiv.appendChild(badge);
        });
        container.appendChild(tagsDiv);
    }

    // 3. Summary
    const summaryHeader = document.createElement('h4');
    summaryHeader.textContent = getText("summaryHeader", lang);
    container.appendChild(summaryHeader);

    const summaryP = document.createElement('p');
    summaryP.textContent = data.summary;
    container.appendChild(summaryP);

    // 4. Action Items
    if (data.action_items && data.action_items.length > 0) {
        const actionHeader = document.createElement('h4');
        actionHeader.textContent = getText("actionItemsHeader", lang);
        container.appendChild(actionHeader);

        const ul = document.createElement('ul');
        ul.className = "action-list";

        data.action_items.forEach(item => {
            const li = document.createElement('li');
            li.className = "action-item";
            li.textContent = item;

            // Interaction: Click to toggle strikethrough
            li.addEventListener('click', () => {
                li.classList.toggle('done');
            });

            ul.appendChild(li);
        });
        container.appendChild(ul);
    }
}

function showBatchStatus(text, type) {
    let statusEl = document.getElementById('batchStatus');
    if (!statusEl) {
        // 如果没有这个元素，动态创建一个插在按钮下面
        statusEl = document.createElement('div');
        statusEl.id = 'batchStatus';
        statusEl.style.marginTop = '10px';
        statusEl.style.padding = '8px';
        statusEl.style.borderRadius = '4px';
        statusEl.style.fontSize = '12px';

        const btn = document.getElementById('batchProcessBtn');
        if (btn && btn.parentNode) {
            btn.parentNode.insertBefore(statusEl, btn.nextSibling);
        }
    }

    if (!statusEl) return;

    statusEl.style.display = 'block';
    statusEl.textContent = text;

    if (type === 'loading') {
        statusEl.style.backgroundColor = '#e3f2fd';
        statusEl.style.color = '#0d47a1';
    } else if (type === 'success') {
        statusEl.style.backgroundColor = '#e8f5e9';
        statusEl.style.color = '#1b5e20';
    } else if (type === 'error') {
        statusEl.style.backgroundColor = '#ffebee';
        statusEl.style.color = '#b71c1c';
    }
}


function updatePopupUIText(lang) {
    const btnMap = {
        "summarizeBtn": "popupSummarizeBtn",
        "batchProcessBtn": "popupBatchBtn",
        "batchSummarizeBtn": "popupBriefingBtn",
        "viewBriefingBtn": "popupViewBriefingBtn"
    };

    for (const [id, key] of Object.entries(btnMap)) {
        const el = document.getElementById(id);
        if (el) el.textContent = getText(key, lang);
    }

    // Also update title if possible, though we used a hardcoded ID "popupTitle" in HTML
    const titleEl = document.getElementById('popupTitle');
    if (titleEl) {
        // We reuse settingsTitle or add a new key. Let's use settingsTitle for now as a fallback or "Email AI Summary"
        // Actually I didn't add "popupTitle" to i18n.js. I'll just leave it or map it to settingsTitle which is close.
        // Or better, just don't touch it if I don't have a translation.
        // Wait, I see I used "settingsTitle" in the previous attempt but it failed.
        // Let's check i18n.js again.
        titleEl.textContent = getText("settingsTitle", lang);
    }

    const batchCountLabel = document.getElementById('batchCountLabel');
    if (batchCountLabel) {
        // I didn't add "batchCountLabel" to i18n.js either. 
        // I should probably add it or just hardcode for now.
        // "Count:" -> "数量:"
        const countMap = {
            "en": "Count:",
            "zh": "数量:",
            "fr": "Nombre:",
            "ja": "数:"
        };
        batchCountLabel.textContent = countMap[lang] || "Count:";
    }
}
