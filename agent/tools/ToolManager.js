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
1. search_emails(query): 搜索邮件。“query”是用于搜索的关键词。
2. list_recent_emails(count): 获取最近收到的邮件列表。“count”默认为 5。
3. get_email_details(messageId): 获取特定邮件的详细内容。
4. list_cached_summaries(limit): 获取已有 AI 摘要的邮件列表。“limit”默认为 10。
5. search_by_tag(tagName): 按标签名称搜索邮件（如“重要”、“工作”）。
6. get_thread_context(messageId): 获取与某封邮件相关的完整对话串。
7. get_existing_briefing(): 检索最新生成的每日简报信息。
8. get_time(): 获取当前系统日期、时间和星期。
9. get_user_identities(): 列出所有配置的邮件账户及其身份信息。
10. list_all_tags(): 列出雷鸟中配置的所有标签。
11. count_unread_messages(): 统计收件箱中的所有未读消息。
12. trigger_briefing(): 手动触发生成一份新的 AI 每日简报。
13. trigger_batch_summary(count): 对最后 “count” 封邮件执行批量 AI 总结。
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
