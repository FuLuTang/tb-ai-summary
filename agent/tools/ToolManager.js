// ToolManager.js - Manages tool registry and execution

import { emailTools } from './EmailTools.js';

export class ToolManager {
    constructor() {
        this.tools = {
            ...emailTools
        };
    }

    getToolDescriptions() {
        return `
1. search_emails(query): 搜索邮件。query 是搜索关键词。
2. list_recent_emails(count): 获取最近收到的邮件列表。count 默认为 5。
3. get_email_details(messageId): 获取邮件的详细内容。
4. list_cached_summaries(limit): 获取已生成过AI摘要的邮件列表。limit 默认为 10。
5. search_by_tag(tagName): 按标签搜索邮件。例如 "Important", "Privé", "Work"。
6. get_thread_context(messageId): 获取某封邮件的完整对话上下文（同主题往来邮件）。
7. get_existing_briefing(): 读取已生成的简报(直接获取最近信息）。
8. get_time(): 获取当前系统时间、日期和星期。
9. get_user_identities(): 获取当前登录的所有邮箱账号及身份。
10. list_all_tags(): 获取雷鸟中配置的所有标签列表。
11. count_unread_messages(): 统计当前所有未读邮件的数量。
12. trigger_briefing(): 立即触发一次全量 AI 简报生成。
13. trigger_batch_summary(count): 对最近 count 封邮件执行 AI 批量总结（后台运行）。
`;
    }

    async execute(name, param) {
        console.log(`[ToolManager] Executing ${name} with param: ${param}`);
        const tool = this.tools[name];
        if (tool) {
            return await tool(param);
        }
        return "未知工具";
    }
}
