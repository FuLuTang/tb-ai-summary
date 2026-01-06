// background.js

// ================= 配置区域 =================
// API 设置现已移至选项页面配置
// ===========================================

// 全局变量
let appSettings = {
    maxCacheEntries: 500,
    maxRequestsPerSecond: 5,
    maxConcurrentRequests: 3,
    briefingUrgency: 5,
    displayLanguage: "en",
    outputLanguage: "English"
};
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
        const { headerMessageId, messageId } = message.payload;
        const ids = [];

        if (headerMessageId) ids.push(headerMessageId);
        if (messageId && messageId !== headerMessageId) ids.push(messageId); // 兼容旧缓存 (按 messageId 存储)

        if (ids.length === 0) {
            sendResponse(null);
            return false;
        }

        // 1. 优先检查内存 (正在处理中，或刚刚处理完)
        for (const id of ids) {
            if (activeTasks[id]) {
                sendResponse(activeTasks[id]);
                return false;
            }
        }

        // 2. 检查持久化存储 (之前处理过的)
        (async () => {
            for (const id of ids) {
                const cacheKey = `cache_${id}`;
                const cached = await browser.storage.local.get(cacheKey);
                if (cached[cacheKey]) {
                    sendResponse({ status: 'success', data: cached[cacheKey] });
                    return;
                }
            }
            sendResponse(null);
        })();

        return true; // 异步响应
    } else if (message.type === "SETTINGS_UPDATED") {
        // 设置更新，重新加载并裁剪缓存
        loadSettings().then(() => pruneCache());
        return false;
    } else if (message.type === "START_BATCH_SUMMARY") {
        handleBatchSummary(message.payload);
        return false;
    } else if (message.type === "CLEAR_CACHE") {
        clearCacheEntries().then((removed) => {
            sendResponse({ removed });
        }).catch(err => {
            console.error("Clear cache failed:", err);
            sendResponse({ error: err.message });
        });
        return true; // 异步响应
    } else if (message.type === "START_BRIEFING") {
        handleBriefing();
        return false;
    }
});

// ... (existing code) ...

// === Briefing Logic ===

async function handleBriefing() {
    console.log("Starting briefing generation...");
    const canQueryMessages = !!(browser.messages && typeof browser.messages.query === 'function');
    try {
        // 1. Get cache index
        const indexKey = "cache_index";
        const indexData = await browser.storage.local.get(indexKey);
        const index = indexData[indexKey] || [];

        if (index.length === 0) {
            throw new Error("No cached emails found.");
        }

        // 2. Filter by time (last 30 days)
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
        const recentItems = index.filter(item => item.timestamp > thirtyDaysAgo);

        console.log(`Found ${recentItems.length} cached emails in the last 30 days.`);

        // 3. Fetch details and filter by urgency > 6
        const highImportanceEmails = [];

        for (const item of recentItems) {
            const cacheKey = `cache_${item.id}`;
            const cached = await browser.storage.local.get(cacheKey);
            let data = cached[cacheKey];

            // Use configured threshold (default 5)
            // Note: User asked for adjustable threshold, default 5.
            // We interpret this as "include if score >= threshold".
            const threshold = appSettings.briefingUrgency || 5;

            if (data && data.urgency_score >= threshold) {
                // Backfill subject if missing (for old cache)
                if (!data.subject && canQueryMessages) {
                    try {
                        // Try to find the message to get the subject
                        // item.id is the headerMessageId
                        const queryPage = await browser.messages.query({ headerMessageId: item.id });
                        if (queryPage.messages && queryPage.messages.length > 0) {
                            data.subject = queryPage.messages[0].subject;
                            data.author = queryPage.messages[0].author;
                            // Optional: update cache with new metadata
                            await saveToCache(item.id, data);
                        } else {
                            data.subject = "Unknown Subject";
                        }
                    } catch (e) {
                        console.warn(`Failed to fetch subject for ${item.id}:`, e);
                        data.subject = "Unknown Subject";
                    }
                } else if (!data.subject) {
                    data.subject = "Unknown Subject";
                }

                if (!data.author) {
                    data.author = "Unknown Author";
                }

                highImportanceEmails.push({
                    id: item.id,
                    ...data
                });
            }
        }

        console.log(`Found ${highImportanceEmails.length} high importance emails.`);

        if (highImportanceEmails.length === 0) {
            await saveBriefing(`最近一个月没有发现重要度大于等于 ${appSettings.briefingUrgency || 5} 的邮件。`);
            return;
        }

        // 4. Construct Prompt
        // Sort by Date Ascending (Oldest -> Newest) so the AI sees the timeline correctly
        highImportanceEmails.sort((a, b) => {
            const dateA = new Date(a.date || 0);
            const dateB = new Date(b.date || 0);
            return dateA - dateB;
        });

        const summaries = highImportanceEmails.map((email, idx) => {
            // Include date in the summary line for AI context
            const dateStr = email.date ? new Date(email.date).toLocaleString() : "Unknown Date";
            return `${idx + 1}. [${dateStr}] [Urgency: ${email.urgency_score}] ${email.summary} (Tags: ${email.tags ? email.tags.join(", ") : ""})`;
        }).join("\n");

        // 5. Call AI
        const briefingContent = await callAIBriefing(summaries);

        // 6. Append Sources
        const sourceList = highImportanceEmails.map((email, idx) => {
            return `${idx + 1}. ${email.subject || "No Subject"}`;
        }).join("\n");

        const sourceHeaders = {
            "English": "[Sources]",
            "Simplified Chinese": "[参考来源]",
            "French": "[Sources]",
            "Japanese": "[ソース]"
        };
        const header = sourceHeaders[appSettings.outputLanguage] || "[Sources]";
        const finalContent = briefingContent + `\n\n----------------\n${header}\n` + sourceList;

        // 7. Save Result
        await saveBriefing(finalContent);
        console.log("Briefing generated and saved.");

    } catch (error) {
        console.error("Briefing failed:", error);
        await saveBriefing(`生成简报失败: ${error.message}`);
    }
}

async function callAIBriefing(summaries) {
    const outputLang = appSettings.outputLanguage || "Simplified Chinese";
    const now = new Date().toLocaleString(); // Current Time

    const systemPrompt = `
You are an executive assistant. Your job is to summarize a list of high-importance emails into a concise briefing.
The user will provide a list of email summaries with their timestamps.
Please generate a "New Briefing" (新简报) in ${outputLang}.

**IMPORTANT INSTRUCTION**:
- **Analyze based on the Current Time**: ${now}.
- If an item has a deadline or date, interpret it relative to Current Time (e.g. "Tomorrow", "Next Week").

Requirements:
1.  **Overview**: Start with a 1-sentence overview of the key themes.
2.  **Key Items / Reminders**: Group related emails or list critical ones.
    *   **SORTING RULE**: You MUST list these items in **Chronological Order** (Earliest deadline/event FIRST, Later ones LAST).
    *   If an item has no specific future date, put it after the timed items.
3.  **Actionable**: Highlight immediate actions.
4.  **Tone**: Professional, concise, and clear.
5.  **Format**: Plain text (clean formatting, bullet points).
`;

    const userPrompt = `
Current Time: ${now}

Here are the summaries of high-importance emails from the last month (Sorted Oldest -> Newest):

${summaries}

Please write the briefing. Use ${outputLang} for output.
在最开始的部分出“时间线”板块，把事件按照时间顺序排列（包括过去和未来）（指的是执行时间）。
`;

    /// 简报代码——————————————————
    if (!appSettings.apiKey) {
        throw new Error("未配置 API Key");
    }

    const apiUrl = appSettings.apiUrl || "https://api.openai.com/v1/chat/completions";
    const model = appSettings.model || "gpt-5-mini";
    const temperature = 1;

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${appSettings.apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: temperature
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`API Request Failed: ${response.status} - ${err}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

async function saveBriefing(content) {
    await browser.storage.local.set({
        latest_briefing: {
            content: content,
            timestamp: Date.now()
        }
    });
}


// 加载设置
async function loadSettings() {
    const data = await browser.storage.local.get("app_settings");
    const stored = data.app_settings || {};
    appSettings = { ...appSettings, ...stored };

    // 兜底与校验
    appSettings.maxCacheEntries = Math.max(1, parseInt(appSettings.maxCacheEntries) || 500);
    appSettings.maxRequestsPerSecond = Math.max(1, parseInt(appSettings.maxRequestsPerSecond) || 5);
    appSettings.maxConcurrentRequests = Math.max(1, parseInt(appSettings.maxConcurrentRequests) || 3);
    appSettings.briefingUrgency = Math.max(1, parseInt(appSettings.briefingUrgency) || 5);
    appSettings.displayLanguage = stored.displayLanguage || appSettings.displayLanguage || "en";
    appSettings.outputLanguage = stored.outputLanguage || appSettings.outputLanguage || "English";
}

// 处理总结请求
async function handleStartSummary(payload) {
    const { headerMessageId, messageId, author, subject, date, forceRegen } = payload;
    const cacheId = headerMessageId || messageId;
    const legacyCacheId = headerMessageId && messageId && headerMessageId !== messageId ? messageId : null;
    const cacheIdsToCheck = legacyCacheId ? [cacheId, legacyCacheId] : [cacheId];

    if (!cacheId) {
        console.warn("Missing message identifier for summary.");
        return;
    }

    // 如果正在处理且不是强制重新生成，则忽略
    for (const id of cacheIdsToCheck) {
        if (activeTasks[id] && activeTasks[id].status === 'loading' && !forceRegen) {
            return;
        }
    }

    // 更新状态为 Loading
    activeTasks[cacheId] = { status: 'loading' };
    broadcastUpdate(cacheId, 'loading', {}, subject); // Pass subject

    try {
        // 1. 检查缓存 (除非强制重新生成)
        if (!forceRegen) {
            for (const id of cacheIdsToCheck) {
                const cacheKey = `cache_${id}`;
                const cached = await browser.storage.local.get(cacheKey);
                if (cached[cacheKey]) {
                    const result = cached[cacheKey];

                    // 命中缓存：更新索引，并在需要时迁移到规范的 cacheId
                    if (id === cacheId) {
                        await touchCacheIndex(cacheId);
                    } else {
                        await saveToCache(cacheId, result);
                    }

                    activeTasks[cacheId] = { status: 'success', data: result };
                    broadcastUpdate(cacheId, 'success', { data: result }, subject); // Pass subject
                    return;
                }
            }
        }

        // 2. 获取邮件内容
        let fullMessage = await browser.messages.getFull(messageId);
        let emailContent = parseEmailBody(fullMessage);

        // Fallback: 如果常规解析失败，尝试使用 getRaw 获取原始内容并手动解析
        // 这种情况常见于某些 Outlook 嵌套回复，getFull 返回的 parts 中 body 为空
        if ((!emailContent || emailContent.trim() === "") && browser.messages.getRaw) {
            console.log("Standard parsing failed, attempting raw content fallback...");
            try {
                const raw = await browser.messages.getRaw(messageId);
                if (raw) {
                    const rawContent = parseRawEmailContent(raw);
                    if (rawContent && rawContent.trim() !== "") {
                        emailContent = rawContent;
                        console.log("Raw content fallback successful.");
                    }
                }
            } catch (rawErr) {
                console.warn("Raw content fallback failed:", rawErr);
            }
        }

        if (!emailContent || emailContent.trim() === "") {
            throw new Error("无法提取到邮件正文，可能是纯图片或特殊格式。");
        }

        if (emailContent.length > 5000) {
            emailContent = emailContent.substring(0, 5000) + "...(内容过长已截断)";
        }

        // 3. 调用 AI
        const jsonResult = await callAI(emailContent, author, subject, date); // Pass date

        // 4. 保存结果
        const resultWithMetadata = { ...jsonResult, subject, author, date };
        activeTasks[cacheId] = { status: 'success', data: resultWithMetadata };
        broadcastUpdate(cacheId, 'success', { data: resultWithMetadata }, subject); // Pass subject
        saveToCache(cacheId, resultWithMetadata);

    } catch (error) {
        console.error("Summary failed:", error);
        activeTasks[cacheId] = { status: 'error', error: error.message };
        broadcastUpdate(cacheId, 'error', { error: error.message }, subject); // Pass subject
    }
}

// 广播状态更新给 Popup
function broadcastUpdate(headerMessageId, status, payload = {}, subject = null) {
    const msg = {
        type: "SUMMARY_UPDATE",
        payload: {
            headerMessageId,
            status,
            subject, // Include subject
            ...payload
        }
    };
    browser.runtime.sendMessage(msg).catch(() => {
        // Popup 可能已关闭，忽略错误
    });
}

// 简单的令牌桶/并发调度器：控制每秒请求数与同时并发数
function createRateLimitedRunner(maxConcurrent, maxPerSecond) {
    let active = 0;
    let queue = [];
    let timestamps = [];

    const runNext = () => {
        if (queue.length === 0) return;
        if (active >= maxConcurrent) return;

        const now = Date.now();
        timestamps = timestamps.filter(t => now - t < 1000);

        if (timestamps.length >= maxPerSecond) {
            const wait = 1000 - (now - timestamps[0]) + 5;
            setTimeout(runNext, wait);
            return;
        }

        const next = queue.shift();
        timestamps.push(Date.now());
        next();
    };

    return function schedule(task) {
        return new Promise((resolve) => {
            const wrapped = async () => {
                active++;
                try {
                    const result = await task();
                    resolve(result);
                } catch (err) {
                    console.error("Task failed:", err);
                    resolve(null); // 保证队列不中断
                } finally {
                    active--;
                    runNext();
                }
            };
            queue.push(wrapped);
            runNext();
        });
    };
}

async function handleBatchSummary(payload) {
    console.log("handleBatchSummary called");
    try {
        // 通知开始
        console.log("Broadcasting BATCH_START");
        browser.runtime.sendMessage({ type: "BATCH_START" }).catch(() => { });

        console.log("Listing accounts...");

        const accounts = await browser.accounts.list();
        const canQueryMessages = !!(browser.messages && typeof browser.messages.query === 'function');
        if (!accounts || accounts.length === 0) {
            throw new Error("没有找到邮件账户");
        }

        // 1. Find ALL inboxes from ALL accounts
        let inboxes = [];
        for (const account of accounts) {
            for (const folder of account.folders) {
                if (folder.type === "inbox") {
                    inboxes.push(folder);
                }
            }
        }

        if (inboxes.length === 0) {
            throw new Error("没有找到收件箱");
        }
        console.log(`Found ${inboxes.length} inboxes.`);

        // 2. Query messages from ALL inboxes
        let allMessages = [];
        const targetCount = (payload && payload.targetCount) ? payload.targetCount : 40;
        console.log(`Targeting ${targetCount} emails...`);

        const ranges = [7, 30, 90]; // Try 7 days, then 30, then 90

        // Helper to query a single inbox
        const queryInbox = async (inbox, days) => {
            if (!canQueryMessages) {
                return [];
            }
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - days);
            try {
                const page = await browser.messages.query({
                    folder: inbox,
                    fromDate: fromDate
                });
                return page.messages || [];
            } catch (err) {
                console.error(`Query failed for inbox ${inbox.name} (${days} days):`, err);
                return [];
            }
        };

        // Strategy: Query all inboxes for the smallest range first. 
        // If total < targetCount, try larger range for all.
        // This avoids fetching too much if recent emails are sufficient.

        for (const days of ranges) {
            console.log(`Querying all inboxes for last ${days} days...`);

            const results = await Promise.all(inboxes.map(inbox => queryInbox(inbox, days)));
            allMessages = results.flat();

            // Deduplicate by headerMessageId (just in case)
            const seen = new Set();
            allMessages = allMessages.filter(msg => {
                const id = msg.headerMessageId || msg.id;
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            });

            console.log(`Total unique messages found: ${allMessages.length}`);

            if (allMessages.length >= targetCount) break;
        }

        // Fallback: If query returns 0 (e.g. API limitations), try list() on each inbox
        if (!canQueryMessages || allMessages.length === 0) {
            console.log("Query returned 0, falling back to standard list() on all inboxes...");
            const results = await Promise.all(inboxes.map(async inbox => {
                try {
                    const page = await browser.messages.list(inbox);
                    return page.messages || [];
                } catch (e) {
                    console.error("List failed for inbox:", e);
                    return [];
                }
            }));
            allMessages = results.flat();
        }

        // 3. Sort and Slice
        // Sort by date descending (newest first)
        allMessages.sort((a, b) => b.date - a.date);

        const recent40 = allMessages.slice(0, targetCount);
        const total = recent40.length;

        if (total === 0) {
            throw new Error("所有收件箱均没有邮件");
        }

        console.log(`Processing top ${total} messages...`);

        const maxPerSecond = appSettings.maxRequestsPerSecond || 5;
        // User requested high concurrency (requests sent at rate limit, but processing in parallel)
        // We set a high concurrent limit (e.g. 50) so the rate limiter (maxPerSecond) becomes the bottleneck for *starting*,
        // but slow API responses don't block new requests from starting.
        const maxConcurrent = 50;
        const schedule = createRateLimitedRunner(maxConcurrent, maxPerSecond);

        let finished = 0;
        const tasks = recent40.map((msg) => {
            const headerId = msg.headerMessageId || msg.id;
            const payload = {
                headerMessageId: headerId,
                messageId: msg.id,
                author: msg.author,
                subject: msg.subject,
                date: msg.date,
                forceRegen: false
            };

            return schedule(async () => {
                try {
                    await handleStartSummary(payload);
                } finally {
                    finished++;
                    browser.runtime.sendMessage({
                        type: "BATCH_PROGRESS",
                        payload: { current: finished, total: total }
                    }).catch(() => { });
                }
            });
        });

        await Promise.all(tasks);

        // 完成
        browser.runtime.sendMessage({ type: "BATCH_COMPLETE" }).catch(() => { });

    } catch (e) {
        console.error("Batch summary failed", e);
        browser.runtime.sendMessage({
            type: "BATCH_ERROR",
            payload: { error: e.message }
        }).catch(() => { });
    }
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

// 清空缓存 (仅删除缓存相关的键，不动设置)
async function clearCacheEntries() {
    const all = await browser.storage.local.get(null);
    const cacheKeys = Object.keys(all).filter(k => k === "cache_index" || k.startsWith("cache_"));

    if (cacheKeys.length > 0) {
        await browser.storage.local.remove(cacheKeys);
    }

    // 清理内存中的任务状态
    activeTasks = {};
    return cacheKeys.length;
}

// === AI 核心逻辑 ===

function parseEmailBody(part) {
    if (!part) return "";

    const type = (part.contentType || "").toLowerCase();

    // 1. 处理 multipart/alternative
    // 采用“候选 fallback”策略：优先取富文本，如果结果为空，则回退到纯文本
    if (type.includes("multipart/alternative") && part.parts) {
        let candidates = [];

        // A. 优先候选: HTML 或 Related (富文本)
        const richPart = part.parts.find(p => {
            const t = (p.contentType || "").toLowerCase();
            return t.includes("text/html") || t.includes("multipart/related");
        });
        if (richPart) candidates.push(richPart);

        // B. 次优候选: 纯文本
        const plainPart = part.parts.find(p => {
            const t = (p.contentType || "").toLowerCase();
            return t.includes("text/plain");
        });
        if (plainPart) candidates.push(plainPart);

        // C. 其他候选 (兜底)
        part.parts.forEach(p => {
            if (p !== richPart && p !== plainPart) candidates.push(p);
        });

        // 按优先级尝试提取，直到获得非空内容
        for (const candidate of candidates) {
            const content = parseEmailBody(candidate);
            if (content && content.trim().length > 0) {
                return content;
            }
        }
        return ""; // 所有部分都无法提取有效文本
    }

    // 2. 如果是叶子节点 (包含 body)
    if (part.body && typeof part.body === "string") {
        // 策略: 只要是 text/* 类型，或者是空类型(默认text)，都尝试提取
        // 特殊处理 HTML
        if (type.includes("html")) { // 匹配 text/html, application/xhtml+xml 等
            let text = part.body;

            // 预处理：移除干扰标签
            text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<!--[\s\S]*?-->/g, '');

            // 格式化：将块级标签转换为换行符
            text = text.replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n')
                .replace(/<\/div>/gi, '\n')
                .replace(/<\/tr>/gi, '\n')
                .replace(/<\/h[1-6]>/gi, '\n');

            // 移除所有剩余 HTML 标签
            text = text.replace(/<[^>]*>?/gm, ' ');

            // 解码实体
            text = text.replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");

            return text.replace(/[ \t\r\f]+/g, ' ') // 压缩水平空白
                .replace(/(\n\s*)+/g, '\n')  // 压缩垂直空白
                .trim();
        }
        // 宽松匹配: 空类型 OR 任何 text/ 类型
        else if (type === "" || type.includes("text/")) {
            return part.body.trim();
        }
        else {
            // 其他类型 (如 image/...) 忽略
            return "";
        }
    }

    // 3. 处理其他容器类型 (如 multipart/mixed, multipart/related, message/rfc822)
    if (part.parts) {
        let str = "";
        for (let subPart of part.parts) {
            let content = parseEmailBody(subPart);
            if (content && content.trim().length > 0) {
                str += content + "\n";
            }
        }
        return str.trim();
    }

    return "";
}

async function callAI(text, author, subject, emailDate) {
    const now = new Date().toLocaleString();
    const sentTime = emailDate ? new Date(emailDate).toLocaleString() : "Unknown";
    const outputLang = appSettings.outputLanguage || "Simplified Chinese";

    // 1. System Prompt: 指令、角色、格式
    const systemPrompt = `
You are a smart email assistant. Please analyze the email provided by the user and output a JSON object with the following schema:
{
    "summary": "string (Summarize the content in ${outputLang}, < 100 words)",
    "tags": ["string (Short tags, 2-4 words in ${outputLang}, e.g. [Invoice], [Meeting])"],
    "action_items": ["string (List of action items in ${outputLang})"],
    "urgency_score": number (1-10),
    "urgency_reason": "string (Explain why this score was given in ${outputLang})"
}

Urgency Score Rules (1-10):
- 10（危急）：需要立即采取行动。存在财务损失风险，或直接由CEO/老师下达的命令，或者对我的私人对话。
- 8-9（高）：需要在48小时内采取行动。重要的漏洞，老师要求，或临近截止日期的作业&提醒。(不包括无用推广)
- 5-7（中）：正常工作任务。在本周内处理。标准请求、代码审查或会议邀请。
- 3-4（低）：可能有用的信息，但无需立即采取措施。每周报告、课程提醒，常见新登录提醒
- 1-2（无）：仅供参考，新闻简报、广告或垃圾邮件,推广消息，不重要的服务升级,验证码推送

Context Boosters:
- If the subject contains "Urgent", "Emergency", "ASAP", or "Important", boost the score by +2.
- If the author is a known VIP or manager (infer from context), boost the score by +2.
- 若发件人是noreply, 分数 -1.
- 若为验证码，无重要性

Constraint:
- Output ONLY valid JSON.
- Do not include markdown ' \`\`\`json ' fences.
- Summary, tags, action_items, and urgency_reason MUST be in ${outputLang}.
`;

    // 2. User Prompt: 纯上下文信息
    const userPrompt = `
Context:
Current Time: ${now}
Email Sent Time: ${sentTime}
Author: ${author}
Subject: ${subject}

Email Body:
${text}

Use ${outputLang} for output.
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
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
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

