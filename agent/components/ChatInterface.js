// ChatInterface.js - Interact like LibreChat

export class ChatInterface {
    constructor(callbacks) {
        // Core elements
        this.messagesContainer = document.getElementById('messages-view');
        this.landingView = document.getElementById('landing-view');
        this.userInput = document.getElementById('user-input');
        this.sendBtn = document.getElementById('send-btn');
        this.stopBtn = document.getElementById('stop-btn');
        this.statusBar = document.getElementById('status-bar');

        // Sidebar elements
        this.sidebar = document.getElementById('sidebar');
        this.sidebarToggle = document.getElementById('sidebar-toggle');
        this.newChatBtn = document.getElementById('new-chat-btn');
        this.sidebarCollapseBtn = document.querySelector('.sidebar-collapse-btn');

        // Dropdowns
        this.modelSelectorBtn = document.getElementById('model-selector-btn');
        this.modelMenu = document.getElementById('model-menu');
        this.userMenuBtn = document.querySelector('.user-menu-btn');
        this.userMenu = document.getElementById('user-menu');
        this.tempChatToggle = document.querySelector('.temp-chat-toggle input');

        this.onSend = callbacks.onSend;
        this.onClearHistory = callbacks.onClearHistory;
        this.isChatActive = false;
        this.isGenerating = false;

        // Bind click outside to close menus
        this.bindGlobalEvents();
        this.initEvents();
    }

    initEvents() {
        // Input handling with Auto-Resize
        this.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        this.userInput.addEventListener('input', () => {
            this.adjustTextareaHeight();
            this.updateSendButtonState();
        });

        // Click on Send
        this.sendBtn.addEventListener('click', () => this.handleSend());

        // Stop Generation Interaction
        if (this.stopBtn) {
            this.stopBtn.addEventListener('click', () => {
                this.stopGeneration();
            });
        }

        // Toggle Model Menu
        if (this.modelSelectorBtn) {
            this.modelSelectorBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown(this.modelMenu);
                this.closeDropdown(this.userMenu);
            });
        }

        // Toggle User Menu
        if (this.userMenuBtn) {
            this.userMenuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown(this.userMenu);
                this.closeDropdown(this.modelMenu);
            });
        }

        const clearHistoryBtn = document.getElementById('clear-history-btn');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => {
                if (confirm('确定要清除所有对话历史吗？此操作不可恢复。')) {
                    if (this.onClearHistory) this.onClearHistory();
                    this.closeDropdown(this.userMenu);
                }
            });
        }

        // Mobile Sidebar Toggle
        if (this.sidebarToggle) {
            this.sidebarToggle.addEventListener('click', () => {
                this.sidebar.classList.toggle('open');
            });
        }

        // Desktop Sidebar Collapse
        if (this.sidebarCollapseBtn) {
            this.sidebarCollapseBtn.addEventListener('click', () => {
                // Mock behavior: just hide sidebar for now or add a class
                // In a real app we'd animate width to 0
                this.sidebar.classList.toggle('collapsed'); // Need CSS for this if we want it to work fully
                // For now visually toggle the icon maybe?
                const isOpen = !this.sidebar.classList.contains('collapsed');
                this.sidebar.style.display = isOpen ? 'flex' : 'none';
                // Re-enable toggle button elsewhere if hidden? 
                // ChatGPT puts a small floating toggle when collapsed.
                // For simplicity, let's just toggle visibility.
            });
        }

        // New Chat
        if (this.newChatBtn) {
            this.newChatBtn.addEventListener('click', () => {
                this.resetChat();
            });
        }

        // Attachment Button (Mock)
        const attachBtn = document.querySelector('.attach-btn');
        if (attachBtn) {
            attachBtn.addEventListener('click', () => {
                // Trigger file input click if it existed
                console.log("Attachment clicked");
            });
        }

        // Temporary Chat Toggle
        if (this.tempChatToggle) {
            this.tempChatToggle.addEventListener('change', (e) => {
                console.log("Temp mode:", e.target.checked);
                // Logic to disable history saving would go here
            });
        }

        // Delegate click for suggestion cards
        if (this.landingView) {
            this.landingView.addEventListener('click', (e) => {
                const card = e.target.closest('.suggestion-card');
                if (card) {
                    this.userInput.focus();
                    // Just focus for now, text is set via onclick in HTML
                    // If we wanted JS control:
                    // this.userInput.value = card.dataset.prompt;
                    this.adjustTextareaHeight();
                    this.updateSendButtonState();
                }
            });
        }

        // Delegate Message Actions (Copy, Edit, Branching)
        if (this.messagesContainer) {
            this.messagesContainer.addEventListener('click', (e) => {
                this.handleMessageInteractions(e);
            });
        }
    }

    handleMessageInteractions(e) {
        const target = e.target;

        // Plugin Toggle
        const pluginHeader = target.closest('.plugin-header');
        if (pluginHeader) {
            const details = pluginHeader.nextElementSibling;
            if (details) details.classList.toggle('hidden');
            return;
        }

        // Copy Button
        const copyBtn = target.closest('button[title="Copy"]');
        if (copyBtn) {
            const messageBody = copyBtn.closest('.message-row').querySelector('.message-body').innerText;
            navigator.clipboard.writeText(messageBody).then(() => {
                // Visual feedback?
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = '✅';
                setTimeout(() => copyBtn.innerHTML = originalHTML, 2000);
            });
            return;
        }

        // Branch Navigation (Mock)
        if (target.classList.contains('branch-btn')) {
            if (target.classList.contains('disabled')) return;
            // Logic to switch message version
            console.log("Switch branch");
        }
    }

    adjustTextareaHeight() {
        this.userInput.style.height = 'auto';
        this.userInput.style.height = Math.min(this.userInput.scrollHeight, 200) + 'px';

        // Ensure input-wrapper matches height if flexbox doesn't handle it
        if (this.userInput.value.trim() === '') {
            this.userInput.style.height = '24px'; // Min height
        }
    }

    updateSendButtonState() {
        if (this.userInput.value.trim().length > 0) {
            this.sendBtn.classList.add('active');
            this.sendBtn.removeAttribute('disabled');
        } else {
            this.sendBtn.classList.remove('active');
            // Optionally disable if empty
            // this.sendBtn.setAttribute('disabled', 'true');
        }
    }

    toggleDropdown(menu) {
        if (!menu) return;
        menu.classList.toggle('hidden');
    }

    closeDropdown(menu) {
        if (menu && !menu.classList.contains('hidden')) {
            menu.classList.add('hidden');
        }
    }

    bindGlobalEvents() {
        document.addEventListener('click', (e) => {
            if (this.modelMenu && !this.modelMenu.contains(e.target) && !this.modelSelectorBtn.contains(e.target)) {
                this.closeDropdown(this.modelMenu);
            }
            if (this.userMenu && !this.userMenu.contains(e.target) && !this.userMenuBtn.contains(e.target)) {
                this.closeDropdown(this.userMenu);
            }
        });
    }

    toggleSendStop(isGenerating) {
        this.isGenerating = isGenerating;
        if (isGenerating) {
            this.sendBtn.classList.add('hidden');
            if (this.stopBtn) this.stopBtn.classList.remove('hidden');
        } else {
            this.sendBtn.classList.remove('hidden');
            if (this.stopBtn) this.stopBtn.classList.add('hidden');
        }
    }

    stopGeneration() {
        // Logic to abort LLM request
        console.log("Stopping generation...");
        this.toggleSendStop(false);
        // Call backend stop if available
    }

    handleSend() {
        const text = this.userInput.value.trim();
        if (!text) return;

        this.switchToChatView();

        // Toggle visual state
        this.toggleSendStop(true);

        this.appendMessage('user', text);

        // Reset input
        this.userInput.value = '';
        this.adjustTextareaHeight();
        this.updateSendButtonState();

        // Simulate AI thinking -> finish
        // In real integration, onSend is async and controls this state
        if (this.onSend) {
            this.onSend(text)
                .catch(err => {
                    console.error(err);
                    this.toggleSendStop(false);
                })
                .finally(() => {
                    // Usually AgentCore handles finishing, but UI safety check:
                    // this.toggleSendStop(false); 
                });
        }

        // Fallback demo if no backend logic hooked up yet to stop it
        // setTimeout(() => this.toggleSendStop(false), 3000);
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
        this.adjustTextareaHeight();

        // Reset sidebar active states (mock)
        const items = document.querySelectorAll('.history-item');
        items.forEach(i => i.classList.remove('active'));
    }

    // Load full message history
    loadMessages(messages) {
        this.resetChat(); // Clear first
        if (!messages || messages.length === 0) return;

        this.switchToChatView();

        messages.forEach(msg => {
            this.appendMessage(msg.role, msg.content, msg.meta);
        });

        this.scrollToBottom();
    }

    appendMessage(role, text, meta) {
        // Normalize role for UI: 'assistant' (from storage) -> 'ai' (for CSS/Logic)
        if (role === 'assistant') role = 'ai';

        console.warn('appendMessage', role, meta, text); // DEBUG LOG
        const row = document.createElement('div');
        row.className = `message-row ${role}`;

        const content = document.createElement('div');
        content.className = 'message-content';

        // Avatar
        const avatar = document.createElement('div');
        avatar.className = `avatar ${role}`;
        avatar.textContent = role === 'user' ? 'U' : '🧠';

        // Body
        const body = document.createElement('div');
        body.className = 'message-body';

        // 1. Render Thought Badge if exists (for AI)
        if (role === 'ai' && meta && meta.thoughts && meta.thoughts.length > 0) {
            // Reconstruct session data for sidebar
            const sessionData = {
                startTime: Date.now(), // Fake time for history
                isFinished: true,
                steps: meta.thoughts.map(t => ({
                    thought: t.thought,
                    action: t.action,
                    time: Date.now()
                }))
            };

            const badge = document.createElement('div');
            badge.className = 'thought-badge'; // Finished state by default
            const duration = meta.thoughts.length * 2; // Estimate duration or save it? Mock for now
            badge.innerHTML = `<span class="icon" style="color:var(--text-muted)">✓</span> 已思考 <span class="t-time">${duration}s</span> <span class="icon">▼</span>`;

            badge.addEventListener('click', () => {
                this.openThoughtSidebar(sessionData);
            });

            body.appendChild(badge);
        }

        // 2. Render Content
        const textDiv = document.createElement('div');
        textDiv.className = 'answer-content';

        if (role === 'ai' || role === 'user') {
            textDiv.innerHTML = this.renderMarkdown(text);
        } else {
            textDiv.textContent = text;
        }
        body.appendChild(textDiv);

        // 3. Render Actions (AI Only)
        // Message Actions (Only for AI or User? ChatGPT has copy/edit for User too)
        const actions = document.createElement('div');
        actions.className = 'message-actions';

        if (role === 'user') {
            // actions.innerHTML = `<button class="msg-action-btn" title="Edit">✎</button>`;
        } else {
            actions.innerHTML = `
                <button class="msg-action-btn" title="Copy">📋</button>
                <button class="msg-action-btn" title="Regenerate">🔄</button>
            `;
        }

        content.appendChild(avatar);
        content.appendChild(body);
        // Only append actions for AI in the new layout (bottom of body)
        // But in CSS for .ai .message-body we set flex-col, so appending to body works best for alignment
        if (role === 'ai') body.appendChild(actions);

        row.appendChild(content);

        this.messagesContainer.appendChild(row);
        this.scrollToBottom();
    }
    // Render Sidebar History List
    renderSidebarList(sessions, onSelect) {
        const historyList = document.getElementById('chat-history');
        if (!historyList) return;

        historyList.innerHTML = ''; // Clear current mock data

        // Sort by date groups (Simplified: Just list them for now)
        // Group logic: Today, Yesterday, Previous
        const groups = {
            '今天': [],
            '昨天': [],
            '更早': []
        };

        sessions.forEach(session => {
            const date = new Date(session.updatedAt);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            if (date.toDateString() === today.toDateString()) {
                groups['今天'].push(session);
            } else if (date.toDateString() === yesterday.toDateString()) {
                groups['昨天'].push(session);
            } else {
                groups['更早'].push(session);
            }
        });

        // Render Groups
        Object.keys(groups).forEach(groupName => {
            const items = groups[groupName];
            if (items.length === 0) return;

            const groupDiv = document.createElement('div');
            groupDiv.className = 'history-group';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'group-title';
            titleDiv.textContent = groupName;
            groupDiv.appendChild(titleDiv);

            items.forEach(session => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'history-item';
                itemDiv.dataset.id = session.id;

                // Active state
                // We'll manage this class manually on click

                itemDiv.innerHTML = `
                    <span class="icon">💬</span>
                    <span class="item-title">${session.title}</span>
                    <div class="item-actions">
                         <button class="delete-chat" title="Delete">🗑️</button>
                    </div>
                `;

                itemDiv.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-chat')) {
                        e.stopPropagation();
                        // Handle delete... (callback needed)
                        return;
                    }

                    // Set active visual
                    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));
                    itemDiv.classList.add('active');

                    if (onSelect) onSelect(session.id);
                });

                groupDiv.appendChild(itemDiv);
            });

            historyList.appendChild(groupDiv);
        });
    }

    // Load full message history
    loadMessages(messages) {
        this.resetChat(); // Clear first
        if (!messages || messages.length === 0) return;

        this.switchToChatView();

        messages.forEach(msg => {
            // Render basic message
            this.appendMessage(msg.role, msg.content);

            // If it's an AI message with thoughts in metadata, we could render them too
            // But currently the helper `createAgentSession` creates a specific live UI.
            // For history, maybe we just render a simple "View Thoughts" expander if we wanted.
            // For now, let's keep it simple: just text.
        });

        this.scrollToBottom();
    }


    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    renderMarkdown(text) {
        if (!text) return '';
        // Simple Markdown Parser (Replace with marked.js or similar for production)
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

    // Agent Thought Process UI (New Sidebar Approach)
    createAgentSession() {
        // 1. Create the Message Row (for final answer, initially empty or with placeholder)
        // Wait... typically thought process happens BEFORE the message content is streamed.
        // O1 style: "Thinking..." badge appears first.

        const row = document.createElement('div');
        row.className = 'message-row ai';

        const content = document.createElement('div');
        content.className = 'message-content';

        const avatar = document.createElement('div');
        avatar.className = 'avatar ai';
        avatar.textContent = '🧠';

        const body = document.createElement('div');
        body.className = 'message-body';

        // The Badge
        const badge = document.createElement('div');
        badge.className = 'thought-badge thinking';
        badge.innerHTML = `<span class="icon">○</span> 已思考 <span class="t-time">0s</span> <span class="icon">▼</span>`;

        // Check if user wants to see details
        badge.addEventListener('click', () => {
            this.openThoughtSidebar(sessionData);
        });

        // Placeholder for answer stream
        const answerDiv = document.createElement('div');
        answerDiv.className = 'answer-content';
        // answerDiv.textContent = '...'; // Show loading cursor?

        body.appendChild(badge);
        body.appendChild(answerDiv);
        content.appendChild(avatar);
        content.appendChild(body);
        row.appendChild(content);

        this.switchToChatView();
        this.messagesContainer.appendChild(row);
        this.scrollToBottom();

        // Data Structure for this session
        const sessionData = {
            startTime: Date.now(),
            steps: [],
            isFinished: false
        };

        const timerSpan = badge.querySelector('.t-time');
        const badgeIcon = badge.querySelector('.icon'); // The circle

        // Timer Interval
        const intervalId = setInterval(() => {
            const elapsed = Math.floor((Date.now() - sessionData.startTime) / 1000);
            timerSpan.textContent = `${elapsed}s`;

            // If sidebar is open and showing THIS session, update header timer too
            if (this.currentSidebarSession === sessionData) {
                const sidebarTime = document.getElementById('ts-total-time');
                if (sidebarTime) sidebarTime.textContent = `· ${elapsed}s`;
            }
        }, 1000);

        // Sidebar Elements
        const sidebar = document.getElementById('thought-sidebar');
        const tsContent = document.getElementById('ts-content');
        const tsClose = document.getElementById('ts-close-btn');

        if (tsClose) {
            tsClose.onclick = () => this.closeThoughtSidebar();
        }

        return {
            addStep: (thought, action) => {
                const step = { thought, action, time: Date.now() };
                sessionData.steps.push(step);

                // If this session is currently displayed in sidebar, append to DOM
                if (this.currentSidebarSession === sessionData) {
                    this.appendStepToSidebar(step);
                }
            },
            updateTimer: () => {
                // Handled by interval
            },
            finish: () => {
                clearInterval(intervalId);
                sessionData.isFinished = true;
                badge.classList.remove('thinking');
                badgeIcon.textContent = '✓'; // Completed icon
                badgeIcon.style.color = 'var(--text-muted)';

                // If sidebar open, update final state
                if (this.currentSidebarSession === sessionData) {
                    const step = { thought: "完成", action: null, time: Date.now(), isFinal: true };
                    this.appendStepToSidebar(step);
                }
            },
            removeIfEmpty: () => {
                if (sessionData.steps.length === 0) {
                    badge.remove();
                }
            },
            // Helper to stream answer content
            appendContent: (text) => {
                this.renderMarkdownTo(answerDiv, text);
            }
        };
    }

    openThoughtSidebar(sessionData) {
        this.currentSidebarSession = sessionData;
        const sidebar = document.getElementById('thought-sidebar');
        const content = document.getElementById('ts-content');
        const headerTime = document.getElementById('ts-total-time');

        if (!sidebar || !content) return;

        // Render all existing steps
        content.innerHTML = '';
        sessionData.steps.forEach(step => {
            content.appendChild(this.createStepElement(step));
        });

        // Show Total Time
        const elapsed = Math.floor((Date.now() - sessionData.startTime) / 1000);
        headerTime.textContent = `· ${sessionData.isFinished ? 'Finished' : elapsed + 's'}`;

        sidebar.classList.add('open');
    }

    closeThoughtSidebar() {
        const sidebar = document.getElementById('thought-sidebar');
        if (sidebar) sidebar.classList.remove('open');
        this.currentSidebarSession = null;
    }

    appendStepToSidebar(step) {
        const content = document.getElementById('ts-content');
        if (!content) return;
        content.appendChild(this.createStepElement(step));
        content.scrollTop = content.scrollHeight;
    }

    createStepElement(step) {
        const div = document.createElement('div');
        div.className = 'ts-step active'; // All current are active/visited

        const textDiv = document.createElement('div');
        textDiv.className = 'ts-step-content';
        textDiv.textContent = step.thought;
        div.appendChild(textDiv);

        if (step.action) {
            const actionDiv = document.createElement('div');
            actionDiv.className = 'ts-tool-call';
            actionDiv.innerHTML = `<span class="icon">🔌</span> ${step.action}`;
            div.appendChild(actionDiv);
        }

        return div;
    }

    renderMarkdownTo(element, text) {
        element.innerHTML = this.renderMarkdown(text);
    }

    updateStatus(text) {
        if (this.statusBar) this.statusBar.innerText = text;
    }
}
