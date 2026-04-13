export class SessionService {
    constructor() {
        this.STORAGE_KEY = 'agent_sessions';
        this.currentSessionId = null;
    }

    // Generate a UUID (simple version)
    _generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }



    async _getSessions() {
        const result = await browser.storage.local.get(this.STORAGE_KEY);
        return result[this.STORAGE_KEY] || {};
    }

    async _saveSessions(sessions) {
        await browser.storage.local.set({ [this.STORAGE_KEY]: sessions });
    }

    async createSession(title = "New Chat") {
        const id = this._generateId();
        const session = {
            id,
            title,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: []
        };
        const sessions = await this._getSessions();
        sessions[id] = session;
        await this._saveSessions(sessions);
        this.currentSessionId = id;
        return session;
    }

    async getSession(id) {
        const sessions = await this._getSessions();
        return sessions[id] || null;
    }

    async getCurrentSession() {
        if (!this.currentSessionId) return null;
        return this.getSession(this.currentSessionId);
    }

    async getAllSessions() {
        const sessions = await this._getSessions();
        return Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async addMessage(sessionId, message) {
        const sessions = await this._getSessions();
        if (!sessions[sessionId]) return;

        sessions[sessionId].messages.push({
            ...message,
            timestamp: Date.now()
        });
        sessions[sessionId].updatedAt = Date.now();

        // Auto-update title if it's the first user message
        if (sessions[sessionId].messages.filter(m => m.role === 'user').length === 1 && message.role === 'user') {
            sessions[sessionId].title = message.content.substring(0, 30) + (message.content.length > 30 ? '...' : '');
        }

        await this._saveSessions(sessions);
    }

    async deleteSession(id) {
        const sessions = await this._getSessions();
        delete sessions[id];
        await this._saveSessions(sessions);
        if (this.currentSessionId === id) {
            this.currentSessionId = null;
        }
    }

    async clearAll() {
        await browser.storage.local.remove(this.STORAGE_KEY);
        this.currentSessionId = null;
    }
}
