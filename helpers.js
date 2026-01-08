// helpers.js - 辅助函数（解析邮件、清理缓存、获取标签）

console.log("Loading helpers.js...");

// 解析邮件正文
function parseEmailBody(part) {
    if (!part) return "";

    // 1. 如果有 body (直接文本内容)
    if (part.body) {
        const type = (part.contentType || "").toLowerCase();

        // 优先处理 HTML
        if (type.includes("text/html")) {
            let text = part.body;

            // 移除脚本和样式
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
            return "";
        }
    }

    // 2. 递归处理 parts (multipart/mixed, multipart/related)
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

// 清理缓存
async function pruneCache() {
    try {
        const allData = await browser.storage.local.get(null);
        let cacheKeys = Object.keys(allData).filter(k => k.startsWith("cache_"));

        // 排除 cache_index
        cacheKeys = cacheKeys.filter(k => k !== "cache_index");

        if (cacheKeys.length > appSettings.maxCacheEntries) {
            // 简单策略：随机删除多余的 (优化方案：应该存储时间戳按LRU删除，这里暂简略)
            const toRemoveCount = cacheKeys.length - appSettings.maxCacheEntries;
            const toRemove = cacheKeys.slice(0, toRemoveCount);

            await browser.storage.local.remove(toRemove);
            console.log(`Pruned ${toRemoveCount} cache entries.`);

            // 同时更新 cache_index
            const indexKey = "cache_index";
            let index = allData[indexKey] || [];
            const idsToRemove = toRemove.map(k => k.replace("cache_", ""));
            index = index.filter(item => !idsToRemove.includes(item.id));
            await browser.storage.local.set({ [indexKey]: index });
        }
    } catch (e) {
        console.warn("Prune cache failed:", e);
    }
}

// 清空所有缓存
async function clearCacheEntries() {
    const all = await browser.storage.local.get(null);
    const keys = Object.keys(all).filter(k => k.startsWith("cache_"));
    await browser.storage.local.remove(keys);
    return keys.length;
}

// 获取标签映射表 (Name -> Key)
async function getTagsMap() {
    let nameToKey = {};
    try {
        // API available in TB 121+
        if (messenger && messenger.messages && messenger.messages.tags && typeof messenger.messages.tags.list === 'function') {
            const tags = await messenger.messages.tags.list();
            console.log("[AutoTag] tags.list raw:", JSON.stringify(tags));
            tags.forEach(t => {
                // macOS Workaround: Check for control characters in the key (e.g. \u001f) which indicate corruption
                // If the key is corrupted, 'messages.update' will fail or do nothing.
                // In this case, we fallback to using the Tag Name itself. This may only apply it as a keyword (no color),
                // but it ensures the metadata is at least present.
                if (t.key && /[\x00-\x1f]/.test(t.key)) {
                    console.warn(`[AutoTag] Key for '${t.tag}' appears corrupted (contains control chars). Skipping this tag.`);
                    // Do NOT map this tag. Skipping it ensures we don't send garbage to the API.
                } else {
                    nameToKey[t.tag] = t.key;
                }
            });
        } else {
            // Fallback
            nameToKey = {
                "Important": "$label1",
                "Work": "$label2",
                "Personal": "$label3",
                "To Do": "$label4",
                "Later": "$label5"
            };
        }
    } catch (e) {
        console.warn("[AutoTag] tags.list API failed/missing, using fallback:", e);
        nameToKey = { "Important": "$label1", "Work": "$label2", "Personal": "$label3", "To Do": "$label4", "Later": "$label5" };
    }
    return nameToKey;
}
