
export class SessionService {
    constructor() {
        this.STORAGE_KEY = 'agent_sessions';
        this.currentSessionId = null;
    }

    // Generate a UUID (simple version)
    _generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    _getSessions() {
        const json = localStorage.getItem(this.STORAGE_KEY);
        return json ? JSON.parse(json) : {};
    }

    _saveSessions(sessions) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions));
    }

    createSession(title = "New Chat") {
        const id = this._generateId();
        const session = {
            id,
            title,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: []
        };
        const sessions = this._getSessions();
        sessions[id] = session;
        this._saveSessions(sessions);
        this.currentSessionId = id;
        return session;
    }

    getSession(id) {
        const sessions = this._getSessions();
        return sessions[id] || null;
    }

    getCurrentSession() {
        if (!this.currentSessionId) return null;
        return this.getSession(this.currentSessionId);
    }

    getAllSessions() {
        const sessions = this._getSessions();
        return Object.values(sessions).sort((a, b) => b.updatedAt - a.updatedAt);
    }

    addMessage(sessionId, message) {
        const sessions = this._getSessions();
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

        this._saveSessions(sessions);
    }

    deleteSession(id) {
        const sessions = this._getSessions();
        delete sessions[id];
        this._saveSessions(sessions);
        if (this.currentSessionId === id) {
            this.currentSessionId = null;
        }
    }

    clearAll() {
        localStorage.removeItem(this.STORAGE_KEY);
        this.currentSessionId = null;
    }
}
