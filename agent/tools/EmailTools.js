export const emailTools = {
    search_emails: async (param) => {
        try {
            // 尝试全文本搜索 (如果 TB 版本支持), 否则搜主题
            let page = await browser.messages.query({ subject: param });
            // 如果没结果，尝试搜作者
            if (!page.messages || page.messages.length === 0) {
                page = await browser.messages.query({ author: param });
            }

            return (page.messages || []).slice(0, 5).map(m => ({
                id: m.id,
                subject: m.subject,
                author: m.author,
                date: new Date(m.date).toLocaleString()
            }));
        } catch (e) {
            return `搜索失败: ${e.message}`;
        }
    },

    list_recent_emails: async (param) => {
        try {
            const count = parseInt(param) || 5;
            // 获取最近的邮件：先查询最近 7 天
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - 7);

            const page = await browser.messages.query({
                fromDate: fromDate
            });

            // 按时间倒序
            const sorted = (page.messages || []).sort((a, b) => b.date - a.date);
            return sorted.slice(0, count).map(m => ({
                id: m.id,
                subject: m.subject,
                author: m.author,
                date: new Date(m.date).toLocaleString()
            }));
        } catch (e) {
            return `获取邮件失败: ${e.message}`;
        }
    },

    get_email_details: async (param) => {
        try {
            // messageId 必须是整数
            const messageId = parseInt(param);
            if (isNaN(messageId)) {
                return "错误: 无效的邮件 ID";
            }
            const full = await browser.messages.getFull(messageId);
            return {
                subject: full.headers.subject?.[0],
                from: full.headers.author?.[0],
                date: full.headers.date?.[0],
                preview: (full.parts?.[0]?.body || "").substring(0, 500) // 截取前500字符
            };
        } catch (e) {
            return `获取详情失败: ${e.message}`;
        }
    },

    list_cached_summaries: async (param) => {
        try {
            // param can be an optional number limit
            const limit = parseInt(param) || 10;
            const indexKey = "cache_index"; // Keep consistent with background.js
            const indexData = await browser.storage.local.get(indexKey);
            const index = indexData[indexKey] || [];

            // Return top N
            return index.slice(0, limit).map(item => ({
                id: item.id,
                subject: item.subject,
                author: item.author,
                generated_at: new Date(item.generated_at).toLocaleString(),
                keywords: item.keywords
            }));
        } catch (e) {
            return `获取缓存摘要失败: ${e.message}`;
        }
    },

    search_by_tag: async (param) => {
        try {
            // param should be the tag name (e.g. "Important", "To Do")
            // TB API uses 'tags' filter in messages.query
            // Note: The tag must match the internal key or display name?
            // Usually query({tags: [...]}) works with keys or keys usually map to names.
            // Let's try searching by Name first, assuming keys match common names or user provided names.
            // If it's a standard tag like "Important" (Non-junk), the key might be "$label1".
            // But let's assume user passes a string found in UI.

            // We might need to map names to keys if we want to be robust (like in background.js getTagsMap)
            // But for now let's try direct query.

            const page = await browser.messages.query({
                tags: [param]
            });

            return (page.messages || []).slice(0, 10).map(m => ({
                id: m.id,
                subject: m.subject,
                author: m.author,
                date: new Date(m.date).toLocaleString(),
                tags: m.tags
            }));

        } catch (e) {
            return `标签搜索失败: ${e.message}`;
        }
    },

    get_thread_context: async (param) => {
        try {
            const messageId = parseInt(param);
            if (isNaN(messageId)) return "错误: 无效的邮件 ID";

            // 1. 获取目标邮件信息
            const targetMsg = await browser.messages.get(messageId);
            if (!targetMsg) return "找不到邮件";

            // 2. 清理主题 (Re: Fwd: 等前缀)
            const cleanSubject = targetMsg.subject.replace(/^(Re|Fwd|Au|Antw|回复|转发):\s*/i, "").trim();

            // 3. 搜索同主题邮件
            // 注意: 这里简单按主题搜，可能搜到不相关的同名邮件，但通常有效
            const page = await browser.messages.query({
                subject: cleanSubject
            });

            // 4. 按时间排序
            const thread = (page.messages || []).sort((a, b) => a.date - b.date);

            return thread.map(m => ({
                id: m.id,
                subject: m.subject,
                author: m.author,
                date: new Date(m.date).toLocaleString(),
                is_current: m.id === messageId ? true : false
            }));

        } catch (e) {
            return `获取上下文失败: ${e.message}`;
        }
    },
    get_existing_briefing: async () => {
        try {
            const data = await browser.storage.local.get("daily_briefing");
            const briefing = data["daily_briefing"];

            if (!briefing || !briefing.content) {
                return "今天还没有生成简报，或者简报已过期。";
            }

            return {
                content: briefing.content,
                generated_at: new Date(briefing.generated_at).toLocaleString()
            };
        } catch (e) {
            return `读取简报失败: ${e.message}`;
        }
    },

    get_time: async () => {
        const now = new Date();
        return {
            current_time: now.toLocaleString(),
            weekday: now.toLocaleDateString(undefined, { weekday: 'long' }),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    },

    get_user_identities: async () => {
        try {
            const accounts = await browser.accounts.list();
            const identities = [];
            for (const acc of accounts) {
                if (acc.identities) {
                    acc.identities.forEach(id => {
                        identities.push({
                            name: id.name,
                            email: id.email,
                            accountName: acc.name
                        });
                    });
                }
            }
            return identities;
        } catch (e) {
            return `获取身份失败: ${e.message}`;
        }
    },

    list_all_tags: async () => {
        try {
            const tags = await browser.messages.listTags();
            return tags.map(t => ({
                key: t.key,
                tag: t.tag,
                color: t.color
            }));
        } catch (e) {
            return `获取标签列表失败: ${e.message}`;
        }
    },

    count_unread_messages: async () => {
        try {
            const page = await browser.messages.query({ unread: true });
            return {
                unread_count: page.messages ? page.messages.length : 0
            };
        } catch (e) {
            return `统计未读邮件失败: ${e.message}`;
        }
    },

    trigger_briefing: async () => {
        try {
            // 发送消息给 background.js 触发简报生成
            await browser.runtime.sendMessage({ type: "START_BRIEFING" });
            return "简报生成任务已启动，请稍等片刻后查看。";
        } catch (e) {
            return `启动简报失败: ${e.message}`;
        }
    },

    trigger_batch_summary: async (param) => {
        try {
            const count = parseInt(param) || 10;
            // 发送消息给 background.js 触发批量总结
            // background.js 的 handleBatchSummary 支持传入 { targetCount }
            await browser.runtime.sendMessage({
                type: "START_BATCH_SUMMARY",
                payload: { targetCount: count }
            });
            return `已启动对最近 ${count} 封邮件的批量总结任务。你可以稍后通过 list_cached_summaries 查看进度。`;
        } catch (e) {
            return `启动批量总结失败: ${e.message}`;
        }
    }
};
