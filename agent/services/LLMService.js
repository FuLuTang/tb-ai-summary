// LLMService.js - Handles communication with the AI provider

export class LLMService {
    constructor() {
        this.settings = window.appSettings;
    }

    async call(messages) {
        if (!this.settings || !this.settings.apiKey) {
            throw new Error("请先在设置中配置 API Key");
        }

        const apiUrl = this.settings.apiUrl || "https://api.openai.com/v1/chat/completions";

        const body = {
            model: this.settings.model || "gpt-4o-mini",
            messages: messages,
            temperature: this.settings.temperature // Use user setting or undefined (default)
        };

        console.log(`[LLMService] Calling model: ${body.model}`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.settings.apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API 错误: ${response.status} - ${errorText}`);
        }

        return await response.json();
    }
}
