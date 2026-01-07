// ChatInterface.js - Interact like LibreChat

export class ChatInterface {
    constructor(callbacks) {
        // Core elements
        this.messagesContainer = document.getElementById('messages-view');
        this.landingView = document.getElementById('landing-view');
        this.userInput = document.getElementById('user-input');
        this.sendBtn = document.getElementById('send-btn');
        this.statusBar = document.getElementById('status-bar');

        // Sidebar elements
        this.sidebar = document.getElementById('sidebar');
        this.sidebarToggle = document.getElementById('sidebar-toggle');
        this.newChatBtn = document.getElementById('new-chat-btn');

        // Dropdowns
        this.modelSelectorBtn = document.getElementById('model-selector-btn');
        this.modelMenu = document.getElementById('model-menu');
        this.userMenuBtn = document.querySelector('.user-menu-btn');
        this.userMenu = document.getElementById('user-menu');

        this.onSend = callbacks.onSend; // Callback for when user sends message
        this.isChatActive = false;

        // Bind click outside to close menus
        this.bindClickOutside();
        this.initEvents();
    }

    initEvents() {
        // Input handling
        this.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        this.sendBtn.addEventListener('click', () => this.handleSend());

        this.userInput.addEventListener('input', () => {
            this.userInput.style.height = 'auto'; // Reset to recalculate
            this.userInput.style.height = Math.min(this.userInput.scrollHeight, 200) + 'px';

            // Toggle send button active state
            if (this.userInput.value.trim().length > 0) {
                this.sendBtn.classList.add('active');
            } else {
                this.sendBtn.classList.remove('active');
            }
        });

        // Toggle Model Menu
        if (this.modelSelectorBtn) {
            this.modelSelectorBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown(this.modelMenu);
                this.closeDropdown(this.userMenu); // Close other
            });
        }

        // Toggle User Menu
        if (this.userMenuBtn) {
            this.userMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown(this.userMenu);
                this.closeDropdown(this.modelMenu); // Close other
            });
        }

        // Sidebar toggle (Mobile)
        if (this.sidebarToggle) {
            this.sidebarToggle.addEventListener('click', () => {
                this.sidebar.classList.toggle('open');
            });
        }

        // New Chat
        if (this.newChatBtn) {
            this.newChatBtn.addEventListener('click', () => {
                this.resetChat();
            });
        }

        // Delegate click for suggestion cards
        if (this.landingView) {
            this.landingView.addEventListener('click', (e) => {
                const card = e.target.closest('.suggestion-card');
                if (card) {
                    // Extract text from suggestion
                    // (The onclick internal logic sets the input value, we just trigger send if needed manually or let user edit)
                    // Actually, the HTML onclick handles setting value and focus.
                    // We can add logic to auto-send if you prefer, for now let's just highlight input
                    this.userInput.focus();
                }
            });
        }
    }

    toggleDropdown(menu) {
        if (menu.classList.contains('hidden')) {
            menu.classList.remove('hidden');
        } else {
            menu.classList.add('hidden');
        }
    }

    closeDropdown(menu) {
        if (menu && !menu.classList.contains('hidden')) {
            menu.classList.add('hidden');
        }
    }

    bindClickOutside() {
        document.addEventListener('click', (e) => {
            if (this.modelMenu && !this.modelMenu.contains(e.target) && !this.modelSelectorBtn.contains(e.target)) {
                this.closeDropdown(this.modelMenu);
            }
            if (this.userMenu && !this.userMenu.contains(e.target) && !this.userMenuBtn.contains(e.target)) {
                this.closeDropdown(this.userMenu);
            }
        });
    }

    handleSend() {
        const text = this.userInput.value.trim();
        if (!text) return;

        this.switchToChatView();

        this.appendMessage('user', text);
        this.userInput.value = '';
        this.userInput.style.height = 'auto';
        this.sendBtn.classList.remove('active');

        if (this.onSend) {
            this.onSend(text);
        }
    }

    switchToChatView() {
        if (!this.isChatActive) {
            this.landingView.classList.add('hidden');
            this.messagesContainer.classList.remove('hidden');
            this.isChatActive = true;
        }
    }

    resetChat() {
        this.isChatActive = false;
        this.landingView.classList.remove('hidden');
        this.messagesContainer.classList.add('hidden');
        this.messagesContainer.innerHTML = ''; // Clear messages
        this.userInput.value = '';
        this.userInput.style.height = 'auto';

        // Reset sidebar active states (mock)
        const items = document.querySelectorAll('.history-item');
        items.forEach(i => i.classList.remove('active'));
    }

    appendMessage(role, text) {
        const row = document.createElement('div');
        row.className = `message-row ${role}`;

        const content = document.createElement('div');
        content.className = 'message-content';

        // Avatar
        const avatar = document.createElement('div');
        avatar.className = `avatar ${role}`;
        avatar.textContent = role === 'user' ? 'U' : 'AI';

        // Body
        const body = document.createElement('div');
        body.className = 'message-body';

        if (role === 'ai' || role === 'user') {
            body.innerHTML = this.renderMarkdown(text);
        } else {
            body.textContent = text;
        }

        // Mock Action Buttons (Copy, Regenerate - visible on hover)
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        actions.innerHTML = `
            <button class="msg-action-btn" title="Copy">📋</button>
            <button class="msg-action-btn" title="Regenerate">🔄</button>
        `;

        content.appendChild(avatar);
        content.appendChild(body);
        if (role === 'ai') content.appendChild(actions); // Only for AI messages usually

        row.appendChild(content);

        this.messagesContainer.appendChild(row);
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    renderMarkdown(text) {
        if (!text) return '';
        // Simple Markdown Parser
        let html = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            // Code Blocks
            .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
            // Inline Code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Bold
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            // New lines to <br> (only if not pre)
            .replace(/\n/g, '<br>')
            // Lists
            .replace(/^\s*-\s+(.*)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

        return html;
    }

    // Agent Thought Process UI
    createAgentSession() {
        const row = document.createElement('div');
        row.className = 'message-row ai thought-row';

        const content = document.createElement('div');
        content.className = 'message-content';

        const avatar = document.createElement('div');
        avatar.className = 'avatar ai';
        avatar.textContent = '🧠';

        const body = document.createElement('div');
        body.className = 'message-body';

        const container = document.createElement('div');
        container.className = 'thought-container';

        const header = document.createElement('div');
        header.className = 'thought-header';

        const titleLine = document.createElement('span');
        titleLine.textContent = '思考过程中...';

        const timer = document.createElement('span');
        timer.className = 'thought-timer';
        timer.textContent = '0s';

        header.appendChild(titleLine);
        header.appendChild(timer);

        const thoughtContent = document.createElement('div');
        thoughtContent.className = 'thought-content';

        container.appendChild(header);
        container.appendChild(thoughtContent);

        header.addEventListener('click', () => {
            container.classList.toggle('open');
        });

        body.appendChild(container);
        content.appendChild(avatar);
        content.appendChild(body);
        row.appendChild(content);

        this.switchToChatView();
        this.messagesContainer.appendChild(row);
        this.scrollToBottom();

        let startTime = Date.now();
        let stepCount = 0;

        return {
            addStep: (thought, action) => {
                stepCount++;
                const stepDiv = document.createElement('div');
                stepDiv.className = 'thought-step';
                let html = `<div class="step-num">步骤 ${stepCount}</div>`;
                if (thought) html += `<div class="step-thought">${thought}</div>`;
                if (action) html += `<div class="step-action">执行工具: <code>${action}</code></div>`;
                stepDiv.innerHTML = html;
                thoughtContent.appendChild(stepDiv);

                container.classList.add('open');
                this.scrollToBottom();
            },
            updateTimer: () => {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                timer.textContent = `${elapsed}s`;
            },
            finish: () => {
                titleLine.textContent = '思考完成';
            },
            removeIfEmpty: () => {
                if (stepCount === 0) row.remove();
            }
        };
    }

    updateStatus(text) {
        if (this.statusBar) this.statusBar.innerText = text;
    }
}
