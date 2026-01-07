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
1. search_emails(query): Search for emails. 'query' is the keyword to search for.
2. list_recent_emails(count): Get a list of recently received emails. 'count' defaults to 5.
3. get_email_details(messageId): Get the detailed content of a specific email.
4. list_cached_summaries(limit): Get a list of emails with existing AI summaries. 'limit' defaults to 10.
5. search_by_tag(tagName): Search for emails by tag name (e.g., "Important", "Work").
6. get_thread_context(messageId): Get the full conversation thread associated with an email.
7. get_existing_briefing(): Retrieve the latest generated briefing information.
8. get_time(): Get the current system date, time, and day of the week.
9. get_user_identities(): List all configured email accounts and their identities.
10. list_all_tags(): List all tags configured in Thunderbird.
11. count_unread_messages(): Count all unread messages in the inbox.
12. trigger_briefing(): Manually trigger a new AI briefing generation.
13. trigger_batch_summary(count): Execute batch AI summarization on the last 'count' emails.
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
