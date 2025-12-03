// background.js

// ================= 配置区域 =================
// API 设置现已移至选项页面配置
// ===========================================

// 全局变量
let appSettings = { maxCacheEntries: 20 };
let activeTasks = {}; // { headerMessageId: { status: 'loading' | 'success' | 'error', data: ..., error: ... } }

// 初始化
(async () => {
    await loadSettings();
})();

// 监听消息
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "START_SUMMARY") {
        // 异步处理，不等待立即返回
        handleStartSummary(message.payload);
        return false;
    } else if (message.type === "GET_STATUS") {
        // 同步返回当前状态
        const { headerMessageId } = message.payload;
        const task = activeTasks[headerMessageId];
        sendResponse(task || null);
        return false;
    } else if (message.type === "SETTINGS_UPDATED") {
        // 设置更新，重新加载并裁剪缓存
        loadSettings().then(() => pruneCache());
        return false;
    }
});

// 加载设置
async function loadSettings() {
    const data = await browser.storage.local.get("app_settings");
    if (data.app_settings) {
        appSettings = data.app_settings;
    }
}

// 处理总结请求
async function handleStartSummary(payload) {
    const { headerMessageId, messageId, author, subject, forceRegen } = payload;

    // 如果正在处理且不是强制重新生成，则忽略
    if (activeTasks[headerMessageId] && activeTasks[headerMessageId].status === 'loading' && !forceRegen) {
        return;
    }

    // 更新状态为 Loading
    activeTasks[headerMessageId] = { status: 'loading' };
    broadcastUpdate(headerMessageId, 'loading');

    try {
        // 1. 检查缓存 (除非强制重新生成)
        if (!forceRegen) {
            const cacheKey = `cache_${headerMessageId}`;
            const cached = await browser.storage.local.get(cacheKey);
            if (cached[cacheKey]) {
                // 命中缓存
                await touchCacheIndex(headerMessageId); // 更新时间戳
                const result = cached[cacheKey];
                activeTasks[headerMessageId] = { status: 'success', data: result };
                broadcastUpdate(headerMessageId, 'success', result);
                return;
            }
        }

        // 2. 获取邮件内容
        let fullMessage = await browser.messages.getFull(messageId);
        let emailContent = parseEmailBody(fullMessage);

        if (!emailContent || emailContent.trim() === "") {
            throw new Error("无法提取到邮件正文，可能是纯图片或特殊格式。");
        }

        if (emailContent.length > 5000) {
            emailContent = emailContent.substring(0, 5000) + "...(内容过长已截断)";
        }

        // 3. 调用 AI
        const jsonResult = await callAI(emailContent, author, subject);

        // 4. 保存缓存
        await saveToCache(headerMessageId, jsonResult);

        // 5. 更新状态为 Success
        activeTasks[headerMessageId] = { status: 'success', data: jsonResult };
        broadcastUpdate(headerMessageId, 'success', jsonResult);

    } catch (error) {
        console.error("Summary failed:", error);
        activeTasks[headerMessageId] = { status: 'error', error: error.message };
        broadcastUpdate(headerMessageId, 'error', null, error.message);
    }
}

// 广播状态更新给 Popup
function broadcastUpdate(headerMessageId, status, data = null, error = null) {
    browser.runtime.sendMessage({
        type: "SUMMARY_UPDATE",
        payload: {
            headerMessageId,
            status,
            data,
            error
        }
    }).catch(() => {
        // Popup 可能已关闭，忽略错误
    });
}

// === 缓存逻辑 (带时间戳) ===

async function saveToCache(headerMessageId, data) {
    // 1. 保存数据
    const cacheKey = `cache_${headerMessageId}`;
    await browser.storage.local.set({ [cacheKey]: data });

    // 2. 更新索引
    await touchCacheIndex(headerMessageId);
}

async function touchCacheIndex(headerMessageId) {
    const indexKey = "cache_index";
    let indexData = await browser.storage.local.get(indexKey);
    let index = indexData[indexKey] || [];

    // 移除旧的记录 (通过 ID 查找)
    index = index.filter(item => item.id !== headerMessageId);

    // 添加新的记录到头部，带时间戳
    index.unshift({
        id: headerMessageId,
        timestamp: Date.now()
    });

    // 保存索引
    await browser.storage.local.set({ [indexKey]: index });

    // 立即裁剪
    await pruneCache();
}

async function pruneCache() {
    const indexKey = "cache_index";
    let indexData = await browser.storage.local.get(indexKey);
    let index = indexData[indexKey] || [];

    if (index.length > appSettings.maxCacheEntries) {
        const toRemove = index.slice(appSettings.maxCacheEntries);
        index = index.slice(0, appSettings.maxCacheEntries);

        // 删除多余的数据
        const keysToRemove = toRemove.map(item => `cache_${item.id}`);
        await browser.storage.local.remove(keysToRemove);
        console.log(`Pruned ${keysToRemove.length} cache entries.`);

        // 更新索引
        await browser.storage.local.set({ [indexKey]: index });
    }
}

// === AI 核心逻辑 ===

function parseEmailBody(part) {
    let str = "";
    if (part.body && typeof part.body === "string") {
        if (part.contentType && part.contentType.includes("html")) {
            str += part.body.replace(/<[^>]*>?/gm, ' ');
        } else {
            str += part.body;
        }
    }
    if (part.parts) {
        for (let subPart of part.parts) {
            str += parseEmailBody(subPart);
        }
    }
    return str.replace(/\s+/g, ' ').trim();
}

async function callAI(text, author, subject) {
    const now = new Date().toLocaleString();
    const prompt = `
Context:
Current Time: ${now}
Author: ${author}
Subject: ${subject}

Email Body:
${text}

Instructions:
You are a smart email assistant. Please analyze the email above and output a JSON object with the following schema:
{
    "summary": "string (Summarize the content in Simplified Chinese, < 100 words)",
    "tags": ["string (Short tags, 2-4 chars, e.g. 【发票】, 【会议】, 【Bug】, 【日报】)"],
    "action_items": ["string (List of action items in Simplified Chinese)"],
    "urgency_score": number (1-10),
    "urgency_reason": "string (Explain why this score was given in Simplified Chinese)"
}

Urgency Score Rules (1-10):
- 10（危急）：需要立即采取行动。存在财务损失风险，服务器宕机，或直接由CEO/副总裁/老师下达的命令，或者对我的私人对话。
- 8-9（高）：需要在48小时内采取行动。重要的漏洞，老师要求，或临近截止日期的作业&提醒。(不包括无用推广)
- 5-7（中）：正常工作任务。在本周内处理。标准请求、代码审查或会议邀请。
- 3-4（低）：可能有用的信息，但无需立即采取措施。每周报告、课程提醒。
- 1-2（无）：仅供参考，新闻简报、广告或垃圾邮件,推广消息，不重要的服务升级

根据当前时间决定 urgency_score 的权重。

Context Boosters:
- If the subject contains "Urgent", "Emergency", "ASAP", or "Important", boost the score by +2.
- If the author is a known VIP or manager (infer from context), boost the score by +2.

Constraint:
- Output ONLY valid JSON.
- Do not include markdown ' \`\`\`json ' fences.
- Summary, action_items, and urgency_reason MUST be in Simplified Chinese.
`;

    if (!appSettings.apiKey) {
        throw new Error("未配置 API Key，请在扩展设置中填写。");
    }

    const apiUrl = appSettings.apiUrl || "https://api.openai.com/v1/chat/completions";
    const model = appSettings.model || "gpt-4o-mini";
    const temperature = appSettings.temperature !== undefined ? appSettings.temperature : 0.2;

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${appSettings.apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: "system", content: "You are a strict JSON generator. Output ONLY valid JSON." },
                { role: "user", content: prompt }
            ],
            temperature: temperature
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`API 请求失败: ${response.status} - ${err}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
            return JSON.parse(match[0]);
        } else {
            throw new Error("No JSON found in response");
        }
    } catch (e) {
        console.error("JSON Parse Error:", e);
        return {
            summary: content,
            tags: ["解析失败"],
            action_items: [],
            urgency_score: 0,
            urgency_reason: "无法解析 AI 返回的 JSON"
        };
    }
}
