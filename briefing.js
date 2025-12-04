document.addEventListener('DOMContentLoaded', async () => {
    const contentDiv = document.getElementById('content');
    const timestampDiv = document.getElementById('timestamp');

    try {
        const data = await browser.storage.local.get('latest_briefing');
        const briefing = data.latest_briefing;

        if (!briefing) {
            contentDiv.innerHTML = '<div class="error">暂无简报记录。请先在插件弹窗中点击“新简报”生成。</div>';
            return;
        }

        // Format timestamp
        if (briefing.timestamp) {
            const date = new Date(briefing.timestamp);
            timestampDiv.textContent = `生成时间: ${date.toLocaleString('zh-CN')}`;
        }

        // Display content
        if (briefing.content) {
            contentDiv.textContent = briefing.content;
        } else {
            contentDiv.innerHTML = '<div class="error">简报内容为空。</div>';
        }

    } catch (error) {
        console.error('Failed to load briefing:', error);
        contentDiv.innerHTML = `<div class="error">加载失败: ${error.message}</div>`;
    }
});
