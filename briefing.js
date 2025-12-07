document.addEventListener('DOMContentLoaded', async () => {
    const contentDiv = document.getElementById('content');
    const timestampDiv = document.getElementById('timestamp');

    const showMessage = (text) => {
        contentDiv.textContent = text;
        contentDiv.classList.add('error');
    };

    try {
        const data = await browser.storage.local.get('latest_briefing');
        const briefing = data.latest_briefing;

        if (!briefing) {
            showMessage('暂无简报记录。请先在插件弹窗中点击“新简报”生成。');
            return;
        }

        // Format timestamp
        if (briefing.timestamp) {
            const date = new Date(briefing.timestamp);
            timestampDiv.textContent = `生成时间: ${date.toLocaleString('zh-CN')}`;
        }

        // Display content
        if (briefing.content) {
            contentDiv.classList.remove('error');
            contentDiv.textContent = briefing.content;
        } else {
            showMessage('简报内容为空。');
        }

    } catch (error) {
        console.error('Failed to load briefing:', error);
        showMessage(`加载失败: ${error.message}`);
    }
});
