// background.js - 核心逻辑：消息监听、AI调用、批量任务

console.log("Loading background.js...");

// 初始化 Promise
let settingsLoadedPromise = loadSettings();

// 监听消息
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // GET_STATUS 不需要等待设置加载，直接处理
    if (message.type === "GET_STATUS") {
        (async () => {
            const { headerMessageId, messageId } = message.payload;
            const ids = [];

            if (headerMessageId) ids.push(headerMessageId);
            if (messageId && messageId !== headerMessageId) ids.push(messageId);

            if (ids.length === 0) {
                sendResponse(null);
                return;
            }

            console.log(`[DEBUG] GET_STATUS checking IDs:`, ids);

            // 1. 优先检查内存
            for (const id of ids) {
                if (activeTasks[id]) {
                    console.log(`[DEBUG] Hit memory task for ${id}`);
                    sendResponse(activeTasks[id]);
                    return;
                }
            }

            // 2. 检查持久化存储
            for (const id of ids) {
                const cacheKey = `cache_${id}`;
                const cached = await browser.storage.local.get(cacheKey);
                if (cached[cacheKey]) {
                    console.log(`[DEBUG] Hit storage for ${cacheKey}`);
                    sendResponse({ status: 'success', data: cached[cacheKey] });
                    return;
                }
            }
            console.log(`[DEBUG] Cache MISS for IDs:`, ids);
            sendResponse(null);
        })();
        return true; // async response for GET_STATUS
    }

    // 其他消息需要等待设置加载
    (async () => {
        // 确保配置已加载
        await settingsLoadedPromise;

        if (message.type === "START_SUMMARY") {
            handleStartSummary(message.payload);
        } else if (message.type === "SETTINGS_UPDATED") {
            settingsLoadedPromise = loadSettings();
            await settingsLoadedPromise;
            pruneCache();
        } else if (message.type === "START_BATCH_SUMMARY") {
            handleBatchSummary(message.payload);
        } else if (message.type === "CLEAR_CACHE") {
            try {
                const removed = await clearCacheEntries();
                sendResponse({ removed });
            } catch (err) {
                console.error("Clear cache failed:", err);
                sendResponse({ error: err.message });
            }
        } else if (message.type === "START_BRIEFING") {
            handleBriefing();
        }
    })();

    // 对于需要 sendResponse 的其他类型 (CLEAR_CACHE)，我们也返回 true。
    if (["CLEAR_CACHE"].includes(message.type)) return true;

    return false;
});

// 监听顶部工具栏按钮点击
browser.browserAction.onClicked.addListener(() => {
    browser.tabs.create({
        url: "/agent/agent.html"
    });
});


// 处理单条摘要请求
async function handleStartSummary({ messageId, forceUpdate }) {
    if (!messageId) return;

    const cacheKey = `cache_${messageId}`;

    // 如果不是强制更新，先查缓存 (双重检查，虽然popup也查过)
    if (!forceUpdate) {
        const cached = await browser.storage.local.get(cacheKey);
        if (cached[cacheKey]) {
            console.log(`[Background] Cache hit for ${messageId}`);
            // 通知前端 (可选，一般前端会轮询 GET_STATUS)
            return;
        }
    }

    // 标记为正在加载
    activeTasks[messageId] = { status: 'loading' };

    try {
        // 1. 获取邮件详情
        const msgPart = await messenger.messages.getFull(messageId);
        const { author, subject, date } = msgPart.headers || {};
        const emailBody = parseEmailBody(msgPart);

        // 2. 调用 AI
        const summary = await callAI(emailBody, author, subject, date, messageId);

        // 3. 存入缓存
        const resultData = {
            summary: summary.summary,
            keywords: summary.keywords,
            urgency_score: summary.urgency_score,
            urgency_reason: summary.urgency_reason,
            generated_at: Date.now()
        };

        await browser.storage.local.set({ [cacheKey]: resultData });

        // 更新索引
        const indexKey = "cache_index";
        const indexData = await browser.storage.local.get(indexKey);
        let index = indexData[indexKey] || [];

        // 移除旧条目
        index = index.filter(item => item.id !== messageId);
        // 添加新条目
        index.unshift({
            id: messageId,
            subject: subject,
            author: author,
            date: date, // 邮件时间
            generated_at: Date.now(),
            keywords: summary.keywords
        });

        await browser.storage.local.set({ [indexKey]: index });

        // 完成
        delete activeTasks[messageId];

        // 通知前端更新
        browser.runtime.sendMessage({
            type: "SUMMARY_UPDATE",
            payload: {
                headerMessageId: messageId, // Use messageId as the identifier here logic-wise
                status: 'success',
                data: resultData
            }
        });

        // 触发缓存修剪
        pruneCache();

    } catch (err) {
        console.error(`[Background] Error processing ${messageId}:`, err);
        activeTasks[messageId] = { status: 'error', error: err.message };
        browser.runtime.sendMessage({
            type: "SUMMARY_UPDATE",
            payload: { headerMessageId: messageId, status: 'error', error: err.message }
        });
    }
}

// AI 核心调用函数
async function callAI(text, author, subject, emailDate, messageId) {
    const now = new Date().toLocaleString();
    const sentTime = emailDate ? new Date(emailDate).toLocaleString() : "Unknown";
    const outputLang = appSettings.outputLanguage || "Simplified Chinese";

    // 0. Fetch Tags if enabled
    let nameToKeyMap = {};
    let tagsListFormatted = "";

    if (appSettings.autoTagging) {
        nameToKeyMap = await getTagsMap();
        const tagNames = Object.keys(nameToKeyMap);
        if (tagNames.length > 0) {
            tagsListFormatted = tagNames.map(name => `- "${name}"`).join("\n");
        }
        console.log("[AutoTag] Tag Names for AI:", tagsListFormatted);
    }

    // 1. System Prompt
    // 1. System Prompt
    const customSummary = appSettings.customPrompts ? appSettings.customPrompts.summary : "";
    // Use custom instruction if available, otherwise default.
    const baseInstr = customSummary || DEFAULT_PROMPTS.summary;

    let systemPrompt = `
${baseInstr}
{
    "summary": "string (Summarize the content in ${outputLang}, < 100 words)",
    "keywords": ["string (Short keywords, 2-4 words in ${outputLang}, e.g. [Invoice], [Meeting])"],
    "urgency_score": number (1-10),
    "urgency_reason": "string (解释打分原因（非复述内容），一句话，最多1次逗号1次句号,简述即可。Given in ${outputLang}"`;

    if (tagsListFormatted) {
        systemPrompt = `
${baseInstr}
{
    "summary": "string (Summarize the content in ${outputLang}, < 100 words)",
    "keywords": ["string (Short keywords, 2-4 words in ${outputLang}, e.g. [Invoice], [Meeting])"],
    "tags": ["string (The Tag Name from the list below. Return [] if no match.)"],
    "urgency_score": number (1-10),
    "urgency_reason": "string (解释打分原因（非复述内容），一句话，最多1次逗号1次句号,简述即可。Given in ${outputLang}"
}

Select tags from this list (Use the 'Name'):
${tagsListFormatted}`;
    } else {
        systemPrompt += `
}`;
    }

    systemPrompt += `

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
- Summary, keywords, action_items, and urgency_reason MUST be in ${outputLang}.
`;

    // 2. User Prompt
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
    const model = appSettings.midModel || "gpt-5-mini";
    const temperature = appSettings.midModelTemperature !== undefined ? appSettings.midModelTemperature : (appSettings.temperature !== undefined ? appSettings.temperature : 0.2);

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
    // Debug: Log full response structure
    console.log("[DEBUG] AI Full Response:", JSON.stringify(data).substring(0, 500));

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("AI Response Invalid: No choices/message found.");
    }

    const content = data.choices[0].message.content;
    console.log("[DEBUG] AI Raw Content:", content);

    // 3. Try to parse JSON
    try {
        let cleanJson = content.replace(/```json/g, "").replace(/```/g, "").trim();
        cleanJson = cleanJson.replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g, "");

        const parsedData = JSON.parse(cleanJson);
        console.log("[DEBUG] Parsed JSON:", parsedData);

        // 4. Auto Tagging Implementation
        if (appSettings.autoTagging && parsedData.tags && parsedData.tags.length > 0 && messageId) {
            console.log("[DEBUG] Entering AutoTag...", parsedData.tags);
            try {
                const maxTags = appSettings.maxTagsPerEmail || 3;
                let aiTagNames = parsedData.tags;

                // Map Names back to Keys
                let finalKeys = [];
                let invalidNames = [];

                aiTagNames.forEach(name => {
                    const key = nameToKeyMap[name];
                    if (key) {
                        finalKeys.push(key);
                    } else {
                        invalidNames.push(name);
                    }
                });

                if (invalidNames.length > 0) {
                    console.warn(`[AutoTag] Invalid tag names: ${invalidNames.join(", ")}`);
                }

                // Slice to max count
                finalKeys = finalKeys.slice(0, maxTags);

                if (finalKeys.length > 0) {
                    console.log("[DEBUG] Applying tags:", finalKeys);
                    // IMPORTANT: Do NOT await this call. In some Thunderbird environments, 
                    // attempting to await messages.update() inside this context can cause a hang 
                    // if the background script context is in a specific state. 
                    // Fire-and-forget ensures the UI updates immediately.
                    browser.messages.update(messageId, {
                        tags: finalKeys
                    }).then(() => {
                        console.log(`[AutoTag] Tags applied successfully using keys:`, finalKeys);
                    }).catch(err => {
                        console.error(`[AutoTag] Async update failed for keys:`, finalKeys, err);
                    });
                } else {
                    console.log("[DEBUG] No valid tags to apply.");
                }
            } catch (tagErr) {
                console.error(`[AutoTag] Failed to apply tags:`, tagErr);
            }
        } else {
            console.log("[DEBUG] AutoTag skip (disabled or empty).");
        }

        return parsedData;
    } catch (e) {
        console.error("JSON Parse Error:", e);
        console.log("Raw Output:", content);
        throw new Error("AI 返回: " + content.substring(0, 100));
    }
}

// 批量处理
async function handleBatchSummary(payload) {
    let messageIds = [];
    // 1. 获取消息列表 (Robust Fetching)
    if (Array.isArray(payload)) {
        messageIds = payload;
    } else if (payload && payload.targetCount) {
        try {
            let mailTab = await browser.mailTabs.getCurrent();
            if (mailTab && mailTab.displayedFolder) {
                console.log(`[Batch] Fetching messages from: ${mailTab.displayedFolder.name}`);

                // 策略：使用 query API 获取最近的邮件 (类似老版本逻辑)
                // 逐步扩大范围: 7天 -> 30天 -> 90天 -> 1年
                const ranges = [7, 30, 90, 365];
                let foundMessages = [];

                for (const days of ranges) {
                    const fromDate = new Date();
                    fromDate.setDate(fromDate.getDate() - days);

                    const page = await browser.messages.query({
                        folder: mailTab.displayedFolder,
                        fromDate: fromDate
                    });

                    if (page.messages && page.messages.length > 0) {
                        foundMessages = page.messages;
                        // 如果数量够了，就不扩大范围了
                        if (foundMessages.length >= payload.targetCount) break;
                    }
                }

                // 按时间倒序排列 (最新的在前)
                foundMessages.sort((a, b) => (b.date || 0) - (a.date || 0));

                // 截取目标数量
                const targetMessages = foundMessages.slice(0, payload.targetCount);
                messageIds = targetMessages.map(m => m.id);

                console.log(`[Batch] Found ${messageIds.length} messages (Target: ${payload.targetCount})`);
            } else {
                console.warn("[Batch] No displayed folder found.");
            }
        } catch (e) {
            console.error("[Batch] Failed to auto-fetch messages:", e);
        }
    }

    if (!messageIds || messageIds.length === 0) {
        console.warn("[Batch] No messages to process.");
        return;
    }

    // 更新总数为实际找到的数量
    browser.runtime.sendMessage({ type: "BATCH_START", payload: { total: messageIds.length } });

    // 真正的并发处理

    // 进度追踪
    let processedCount = 0;
    const updateProgress = () => {
        processedCount++;
        browser.runtime.sendMessage({
            type: "BATCH_PROGRESS",
            payload: { current: processedCount, total: messageIds.length }
        });
    };

    // 辅助: 并发执行器
    async function runPool(items, concurrency, fn) {
        const results = [];
        const executing = new Set();

        for (const item of items) {
            // 封装任务：执行核心逻辑 + 进度更新
            const p = Promise.resolve().then(() => fn(item)).finally(() => {
                executing.delete(p);
                updateProgress();
            });

            results.push(p);
            executing.add(p);

            // 如果达到并发上限，等待其中一个完成
            if (executing.size >= concurrency) {
                await Promise.race(executing);
            }

            // 速率限制 (Rate Limit): 控制启动频率
            if (appSettings.maxRequestsPerSecond > 0) {
                await new Promise(r => setTimeout(r, 1000 / appSettings.maxRequestsPerSecond));
            }
        }

        return Promise.all(results);
    }

    // 任务逻辑
    const processItem = async (msgId) => {
        const cacheKey = `cache_${msgId}`;
        const cached = await browser.storage.local.get(cacheKey);

        if (!cached[cacheKey]) {
            console.log(`[Batch] Processing ${msgId}...`);
            // 这里的 catch 非常重要，防止单个任务失败炸掉整个 Pool
            try {
                await handleStartSummary({ messageId: msgId, forceUpdate: false });
            } catch (e) {
                console.error(`[Batch] Error in worker for ${msgId}`, e);
            }
        } else {
            console.log(`[Batch] Skipped ${msgId}, already cached.`);
        }
    };

    // 启动并发池
    const concurrency = appSettings.maxConcurrentRequests || 5;
    await runPool(messageIds, concurrency, processItem);

    console.log("[Batch] All done.");
    browser.runtime.sendMessage({ type: "BATCH_COMPLETE" });
}

// 处理简报
async function handleBriefing() {
    console.log("Starting briefing generation...");
    const canQueryMessages = !!(browser.messages && typeof browser.messages.query === 'function');
    try {
        const indexKey = "cache_index";
        const indexData = await browser.storage.local.get(indexKey);
        const index = indexData[indexKey] || [];

        // 筛选过去24小时的邮件摘要
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const recentSummaries = [];

        // 1. 从缓存索引中寻找已生成的摘要
        for (const item of index) {
            if (item.generated_at > cutoff) {
                // 读取完整摘要内容
                const cacheKey = `cache_${item.id}`;
                const detailData = await browser.storage.local.get(cacheKey);
                if (detailData[cacheKey]) {
                    recentSummaries.push({
                        ...item,
                        summary: detailData[cacheKey].summary,
                        urgency: detailData[cacheKey].urgency_score || 0
                    });
                }
            }
        }

        if (recentSummaries.length === 0) {
            console.warn("No recent summaries found for briefing.");
            return;
        }

        console.log(`Generating briefing from ${recentSummaries.length} emails...`);

        // 3. 构造简报 Prompt
        const summariesText = recentSummaries.map((s, i) => {
            return `Email ${i + 1}:
Subject: ${s.subject}
From: ${s.author}
Urgency: ${s.urgency}
Summary: ${s.summary}
`;
        }).join("\n---\n");

        const outputLang = appSettings.outputLanguage || "Simplified Chinese";

        const defaultBriefingInstr = `You are a executive secretary. Based on the following email summaries from the last 24 hours, generate a "Daily Briefing".

Format:
1. **Overview**: 1-2 sentences overall status.
2. **Top Priorities**: List 3 most urgent items (High urgency score).
3. **Key Themes**: Group other items by topic (e.g. Work, News, Personal).
4. **Action Plan**: Suggested order of processing.

Output in ${outputLang}. Use Markdown.`;

        const customBriefing = appSettings.customPrompts ? appSettings.customPrompts.briefing : "";
        const briefingInstr = customBriefing || defaultBriefingInstr;

        const briefingPrompt = `${briefingInstr}

Email Summaries:
${summariesText}
`;

        // 4. 调用 AI 生成简报
        if (!appSettings.apiKey) return;

        const apiUrl = appSettings.apiUrl || "https://api.openai.com/v1/chat/completions";
        const model = appSettings.midModel || "gpt-5-mini";

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${appSettings.apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: "You are a helpful assistant." },
                    { role: "user", content: briefingPrompt }
                ],
                temperature: 0.5
            })
        });

        if (response.ok) {
            const data = await response.json();
            const briefingContent = data.choices[0].message.content;

            // 存储简报结果
            await browser.storage.local.set({
                "daily_briefing": {
                    content: briefingContent,
                    generated_at: Date.now()
                }
            });
            console.log("Briefing generated and saved.");
        }

    } catch (e) {
        console.error("Briefing failed:", e);
    }
}
