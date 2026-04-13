export class SessionService {
    constructor() {
        this.STORAGE_KEY = 'agent_sessions';
        this.currentSessionId = null;
    }

    // Generate a UUID (simple version)
    _generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }



    _createRootNode(timestamp = Date.now()) {
        return {
            id: 'root',
            role: 'root',
            content: '',
            meta: null,
            parentId: null,
            children: [],
            timestamp
        };
    }

    _ensureSessionTree(session) {
        if (session && session.tree && session.tree.nodes && session.tree.rootId) {
            return false;
        }

        const createdAt = session.createdAt || Date.now();
        const root = this._createRootNode(createdAt);
        const nodes = { [root.id]: root };
        let cursor = root.id;
        const legacyMessages = Array.isArray(session.messages) ? session.messages : [];

        legacyMessages.forEach((msg) => {
            const id = this._generateId();
            nodes[id] = {
                id,
                role: msg.role,
                content: msg.content,
                meta: msg.meta || null,
                parentId: cursor,
                children: [],
                timestamp: msg.timestamp || Date.now()
            };
            nodes[cursor].children.push(id);
            cursor = id;
        });

        session.tree = {
            version: 1,
            rootId: root.id,
            currentLeafId: cursor,
            nodes
        };
        session.messages = legacyMessages;
        return true;
    }

    _getPathNodeIds(session, leafId = null) {
        const tree = session.tree;
        const rootId = tree.rootId;
        const nodes = tree.nodes || {};
        let cursor = leafId || tree.currentLeafId || rootId;
        const path = [];

        while (cursor && nodes[cursor]) {
            if (cursor !== rootId) path.push(cursor);
            cursor = nodes[cursor].parentId;
        }
        return path.reverse();
    }

    _getLatestLeafId(session, startNodeId) {
        const nodes = session.tree.nodes || {};
        let cursor = startNodeId;
        while (nodes[cursor] && nodes[cursor].children && nodes[cursor].children.length > 0) {
            cursor = nodes[cursor].children[nodes[cursor].children.length - 1];
        }
        return cursor;
    }

    async _getSessions() {
        const result = await browser.storage.local.get(this.STORAGE_KEY);
        const sessions = result[this.STORAGE_KEY] || {};
        let migrated = false;
        Object.values(sessions).forEach((session) => {
            if (this._ensureSessionTree(session)) migrated = true;
        });
        if (migrated) {
            await this._saveSessions(sessions);
        }
        return sessions;
    }

    async _saveSessions(sessions) {
        await browser.storage.local.set({ [this.STORAGE_KEY]: sessions });
    }

    async createSession(title = "New Chat") {
        const id = this._generateId();
        const createdAt = Date.now();
        const session = {
            id,
            title,
            createdAt,
            updatedAt: createdAt,
            messages: [],
            tree: {
                version: 1,
                rootId: 'root',
                currentLeafId: 'root',
                nodes: {
                    root: this._createRootNode(createdAt)
                }
            }
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

    async setCurrentLeaf(sessionId, leafId) {
        const sessions = await this._getSessions();
        const session = sessions[sessionId];
        if (!session) return null;
        if (!session.tree.nodes[leafId]) return null;

        session.tree.currentLeafId = leafId;
        session.updatedAt = Date.now();
        await this._saveSessions(sessions);
        return leafId;
    }

    async getNode(sessionId, nodeId) {
        const session = await this.getSession(sessionId);
        if (!session || !session.tree || !session.tree.nodes) return null;
        return session.tree.nodes[nodeId] || null;
    }

    async getDisplayMessages(sessionId, leafId = null) {
        const session = await this.getSession(sessionId);
        if (!session) return [];

        const nodes = session.tree.nodes || {};
        const pathIds = this._getPathNodeIds(session, leafId);

        return pathIds
            .map((id) => {
                const node = nodes[id];
                if (!node) return null;
                const parent = nodes[node.parentId];
                const siblings = (parent && parent.children ? parent.children : [])
                    .map((siblingId) => nodes[siblingId])
                    .filter((siblingNode) => siblingNode && siblingNode.role === node.role);
                const index = siblings.findIndex((siblingNode) => siblingNode.id === node.id);
                const total = siblings.length || 1;

                return {
                    nodeId: node.id,
                    parentId: node.parentId,
                    role: node.role,
                    content: node.content,
                    meta: node.meta || null,
                    timestamp: node.timestamp,
                    branch: {
                        index: index >= 0 ? index + 1 : 1,
                        total,
                        hasPrev: index > 0,
                        hasNext: index >= 0 && index < total - 1
                    }
                };
            })
            .filter(Boolean);
    }

    async getContextMessages(sessionId, upToNodeId = null) {
        const session = await this.getSession(sessionId);
        if (!session) return [];
        const nodes = session.tree.nodes || {};
        const pathIds = this._getPathNodeIds(session, upToNodeId);

        return pathIds
            .map((id) => nodes[id])
            .filter((node) => node && (node.role === 'user' || node.role === 'assistant' || node.role === 'ai'))
            .map((node) => ({
                role: node.role === 'ai' ? 'assistant' : node.role,
                content: node.content
            }));
    }

    async addMessage(sessionId, message, options = {}) {
        const sessions = await this._getSessions();
        const session = sessions[sessionId];
        if (!session) return null;

        const tree = session.tree;
        const nodes = tree.nodes || {};
        let parentId = options.parentId || tree.currentLeafId || tree.rootId;
        if (!nodes[parentId]) parentId = tree.rootId;

        const id = this._generateId();
        const node = {
            id,
            role: message.role,
            content: message.content,
            meta: message.meta || null,
            parentId,
            children: [],
            timestamp: Date.now()
        };
        nodes[id] = node;
        nodes[parentId].children.push(id);
        tree.currentLeafId = id;
        session.updatedAt = Date.now();

        // Keep legacy flat messages for compatibility/debug readability
        if (!Array.isArray(session.messages)) session.messages = [];
        session.messages.push({
            ...message,
            timestamp: node.timestamp
        });

        // Auto-update title if it's the first user message
        const userCount = Object.values(nodes).filter((n) => n.role === 'user').length;
        if (message.role === 'user' && userCount === 1) {
            session.title = message.content.substring(0, 30) + (message.content.length > 30 ? '...' : '');
        }

        await this._saveSessions(sessions);
        return node;
    }

    async switchToSibling(sessionId, nodeId, direction) {
        const sessions = await this._getSessions();
        const session = sessions[sessionId];
        if (!session) return null;
        const nodes = session.tree.nodes || {};
        const node = nodes[nodeId];
        if (!node || !node.parentId) return null;
        const parent = nodes[node.parentId];
        if (!parent) return null;

        const siblings = (parent.children || []).filter((childId) => nodes[childId] && nodes[childId].role === node.role);
        const currentIndex = siblings.indexOf(nodeId);
        if (currentIndex < 0) return null;
        const targetIndex = currentIndex + direction;
        if (targetIndex < 0 || targetIndex >= siblings.length) return null;

        const targetNodeId = siblings[targetIndex];
        const targetLeaf = this._getLatestLeafId(session, targetNodeId);
        session.tree.currentLeafId = targetLeaf;
        session.updatedAt = Date.now();
        await this._saveSessions(sessions);
        return targetNodeId;
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
