// popup.js

// ================= 配置区域 =================
const API_KEY = "YOUR_OPENAI_API_KEY";
const API_URL = "https://api.openai.com/v1/chat/completions";
// ===========================================

let currentHeaderMessageId = null;
let currentMessageId = null;
let currentAuthor = "Unknown";
let currentSubject = "No Subject";

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 获取当前邮件信息
    try {
        let tabs = await browser.tabs.query({ active: true, currentWindow: true });
        let message = await browser.messageDisplay.getDisplayedMessage(tabs[0].id);

        if (!message) {
            document.getElementById('result').textContent = "没有检测到打开的邮件。";
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
                updateUI(status);
            }
        }

    } catch (e) {
        console.error("Init failed:", e);
    }

    // 监听来自 background 的消息
    browser.runtime.onMessage.addListener((message) => {
        if (message.type === "SUMMARY_UPDATE") {
            const { headerMessageId, status, data, error } = message.payload;
            // 如果当前显示的正是这封邮件，更新 UI
            if (currentHeaderMessageId === headerMessageId || currentMessageId === headerMessageId) {
                updateUI({ status, data, error });
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
    document.getElementById('summarizeBtn').addEventListener('click', () => {
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
        updateUI({ status: 'loading' });
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

function updateUI(state) {
    const resultDiv = document.getElementById('result');
    const btn = document.getElementById('summarizeBtn');

    if (state.status === 'loading') {
        resultDiv.textContent = "正在读取邮件并思考中...";
        resultDiv.className = "";
        btn.disabled = true;
        btn.textContent = "正在生成...";
    } else if (state.status === 'success') {
        renderResult(resultDiv, state.data);
        btn.disabled = false;
        btn.textContent = "重新生成 (Regenerate)";
        btn.style.backgroundColor = "#f57c00";
    } else if (state.status === 'error') {
        resultDiv.textContent = "出错啦: " + state.error;
        resultDiv.className = "error";
        btn.disabled = false;
        btn.textContent = "重试";
        btn.style.backgroundColor = "#007bff";
    }
}

// === Batch Summary Helper Functions ===

async function getRecentUnreadEmails() {
    // 1. 获取当前 Tab 和文件夹
    let tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) throw new Error("无法获取当前标签页");

    // 注意：browser.mailTabs 需要 manifest 权限
    let mailTab = await browser.mailTabs.getCurrent();
    if (!mailTab || !mailTab.displayedFolder) {
        throw new Error("无法获取当前文件夹信息");
    }

    let folder = mailTab.displayedFolder;

    // 2. 查询未读邮件
    // 注意：query API 可能不支持 limit，需手动截取
    let messages = await browser.messages.query({
        folder: folder,
        unread: true
    });

    // 按日期降序排序
    messages.sort((a, b) => b.date - a.date);

    // 3. 截取前 15 封
    const recentMessages = messages.slice(0, 15);

    // 4. 提取关键信息 (仅 Header)
    return recentMessages.map(msg => ({
        author: msg.author,
        subject: msg.subject,
        date: msg.date, // Timestamp
        preview: msg.preview || "" // 如果有 preview 字段则使用
    }));
}

async function callAIBatch(emails) {
    // 格式化邮件列表
    const emailListStr = emails.map((email, index) => {
        const dateStr = new Date(email.date).toLocaleString('zh-CN', { hour12: false });
        // 简单的垃圾邮件关键词过滤
        const isPotentialSpam = /unsubscribe|offer|promotion|广告|推广/i.test(email.subject);
        const spamMark = isPotentialSpam ? "[Potential Spam] " : "";

        return `${index + 1}. [${dateStr}] From: ${email.author}\n   Subject: ${spamMark}${email.subject}\n   Preview: ${email.preview}\n`;
    }).join("\n");

    const prompt = `
Context:
User has ${emails.length} unread emails.
Current Time: ${new Date().toLocaleString('zh-CN')}

Email List:
${emailListStr}

Instructions:
Please generate a brief "Unread Email Briefing" for me.
- Use Emojis to categorize:
  🔴 [紧急] for important work/personal emails (Boss, VIP, Urgent).
  ⚠️ [关注] for normal work/personal emails.
  🟢 [通知] for newsletters, notifications, or low priority items.
- Group spam/promotional emails into a single line if possible (e.g. "🟢 3 promotional emails from Amazon, LinkedIn...").
- Output purely in text format (NO Markdown, NO **bold**).
- Include time context (e.g. "Just now", "Yesterday").
- Language: Simplified Chinese.

Example Output:
🔴 [紧急] 老板: 项目进度汇报 (10分钟前) - 需要尽快回复
⚠️ [关注] 财务部: 报销流程更新 (昨天)
🟢 [通知] 5 封广告邮件 (来自 Amazon, GitHub, etc.)
`;

    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${API_KEY}`
        },
        body: JSON.stringify({
            model: "gpt-5-mini",
            messages: [
                { role: "system", content: "You are a helpful email assistant. Output plain text with Emojis." },
                { role: "user", content: prompt }
            ],
            temperature: 1
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`API 请求失败: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

function renderBatchResult(container, text) {
    container.innerHTML = "";
    const p = document.createElement('div');
    p.style.whiteSpace = "pre-wrap";
    p.style.textAlign = "left";
    p.style.lineHeight = "1.6";
    p.textContent = text;
    container.appendChild(p);
}

// 渲染函数 (复用之前的逻辑)
function renderResult(container, data) {
    container.innerHTML = ""; // Clear previous content

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

    urgencyDiv.innerHTML = `<span class="${colorClass}">${emoji} 紧迫度: ${data.urgency_score}/10</span>`;

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
    summaryHeader.textContent = "摘要";
    container.appendChild(summaryHeader);

    const summaryP = document.createElement('p');
    summaryP.textContent = data.summary;
    container.appendChild(summaryP);

    // 4. Action Items
    if (data.action_items && data.action_items.length > 0) {
        const actionHeader = document.createElement('h4');
        actionHeader.textContent = "待办事项";
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
