// hcaptcha.js

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');

const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// --- 最终配置 ---
const TARGET_URL = 'http://127.0.0.1:5500/hcaptcha.html';
const BASE_SCREENSHOT_DIR = 'hcaptcha_screenshots';
const TARGET_PER_CATEGORY = 100; // 每个分类的目标数量
let ACTION_DELAY = 3000;

// --- 目录与计数器 ---
const DIRS = {
    grid: path.join(BASE_SCREENSHOT_DIR, 'grid'),
    canvas_shape: path.join(BASE_SCREENSHOT_DIR, 'canvas_shape'),
    canvas_drag: path.join(BASE_SCREENSHOT_DIR, 'canvas_drag'),
    canvas_number: path.join(BASE_SCREENSHOT_DIR, 'canvas_number'),
};

const captureCounts = {};
Object.keys(DIRS).forEach(key => {
    const dirPath = DIRS[key];
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    captureCounts[key] = fs.readdirSync(dirPath).length; // 从现有文件初始化计数
});
console.log('--- 采集任务初始化 ---');
console.log(`目标: 每个分类 ${TARGET_PER_CATEGORY} 张`);
console.log('当前进度:');
Object.entries(captureCounts).forEach(([type, count]) => {
    console.log(`  - ${type.toUpperCase()}: ${count} / ${TARGET_PER_CATEGORY}`);
});
console.log('----------------------\n');


// 辅助函数：模拟人类点击
async function humanClick(context, selector, pageForMouse) {
    const elementHandle = await context.waitForSelector(selector, { timeout: 10000 });
    const box = await elementHandle.boundingBox();
    if (!box) throw new Error(`无法找到元素 "${selector}" 的边界框。`);
    await pageForMouse.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
    await new Promise(r => setTimeout(r, 150 + Math.random() * 100));
    await pageForMouse.mouse.down();
    await new Promise(r => setTimeout(r, 100 + Math.random() * 50));
    await pageForMouse.mouse.up();
}

/**
 * 辅助函数：识别类型并应用更长的动态稳定期
 * @param {import('puppeteer').Frame} frame
 * @returns {Promise<string>}
 */
async function identifyAndPrepareChallenge(frame) {
    console.log('执行智能等待，识别并应用加长稳定期...');
    let challengeType;
    try {
        const promptHandle = await frame.waitForSelector('.prompt-text', { visible: true, timeout: 20000 });
        console.log('  - 1/4: 问题文本已加载');

        const initialType = await Promise.race([
            frame.waitForSelector('.task-grid', { visible: true }).then(() => 'grid'),
            frame.waitForSelector('canvas', { visible: true }).then(() => 'canvas')
        ]);
        console.log(`  - 2/4: 初步识别类型为 -> ${initialType.toUpperCase()}`);

        if (initialType === 'canvas') {
            const promptText = (await frame.evaluate(el => el.textContent, promptHandle)).toLowerCase();
            if (promptText.includes('drag')) challengeType = 'canvas_drag';
            else if (promptText.includes('number') || promptText.includes('equal')) challengeType = 'canvas_number';
            else if (promptText.includes('unpaired') || promptText.includes('shape')) challengeType = 'canvas_shape';
            console.log(`  - 3/4: 画布类型细分为 -> ${challengeType.toUpperCase()}`);
        } else {
            challengeType = initialType;
            console.log('  - 3/4: 网格类型，无需细分');
        }

        // ========================= 核心升级：延长稳定期 =========================
        let stabilizationDelay;
        if (challengeType.startsWith('canvas')) {
            stabilizationDelay = 5000; // 为所有 Canvas 类型提供 5 秒的充足绘制时间
            console.log(`  - 4/4: Canvas类型，应用 ${stabilizationDelay}ms 超长稳定期`);
        } else { // 'grid'
            stabilizationDelay = 3000; // Grid 类型也延长到 3 秒，确保万无一失
            console.log(`  - 4/4: Grid类型，应用 ${stabilizationDelay}ms 加长稳定期`);
        }
        await new Promise(r => setTimeout(r, stabilizationDelay));
        // =======================================================================
        
        console.log('智能等待完成，验证码已完全稳定！');
        return challengeType;
    } catch (error) {
        throw new Error(`智能等待失败: ${error.message}`);
    }
}


async function run() {
    console.log('启动浏览器 (使用Stealth模式)...');
    
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    let totalAttempts = 0;
    // ========================= 核心升级：目标驱动的循环 =========================
    const isTaskComplete = () => Object.values(captureCounts).every(count => count >= TARGET_PER_CATEGORY);

    while (!isTaskComplete()) {
        totalAttempts++;
        console.log(`\n--- 第 ${totalAttempts} 次尝试 ---`);
        try {
            await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

            const checkboxFrame = await page.waitForFrame(frame => frame.url().includes('checkbox'));
            await humanClick(checkboxFrame, '#checkbox', page); 

            await new Promise(r => setTimeout(r, ACTION_DELAY));
            
            const imageChallengeFrame = await page.waitForFrame(frame => frame.url().includes('frame=challenge'), { timeout: 15000 });
            if (!imageChallengeFrame) throw new Error("未能找到图片挑战 iframe。");
            
            const challengeContainer = await imageChallengeFrame.waitForSelector('.challenge-container', { timeout: 10000 });
            if (!challengeContainer) throw new Error('在 iframe 内部未找到 hCaptcha 验证容器。');

            const challengeType = await identifyAndPrepareChallenge(imageChallengeFrame);
            
            // 如果该分类已满，则跳过本次截图，进行下一次尝试
            if (captureCounts[challengeType] >= TARGET_PER_CATEGORY) {
                console.log(`[跳过] 分类 ${challengeType.toUpperCase()} 已完成 (${captureCounts[challengeType]}/${TARGET_PER_CATEGORY})。`);
                continue;
            }

            const saveDir = DIRS[challengeType];
            const screenshotPath = path.join(saveDir, `challenge_${String(captureCounts[challengeType] + 1).padStart(3, '0')}.png`);
            
            console.log(`[${challengeType.toUpperCase()}] 截取完整验证框并保存到: ${screenshotPath}`);
            await challengeContainer.screenshot({ path: screenshotPath });
            
            // 截图成功后，更新计数器
            captureCounts[challengeType]++;

            await challengeContainer.dispose();
            
            // 实时汇报进度
            console.log('--- 任务进度 ---');
            Object.entries(captureCounts).forEach(([type, count]) => {
                console.log(`  - ${type.toUpperCase()}: ${count} / ${TARGET_PER_CATEGORY}`);
            });
            console.log('-----------------');


        } catch (error) {
            console.error(`第 ${totalAttempts} 次尝试失败:`, error.message);
            const errorPath = path.join(BASE_SCREENSHOT_DIR, `error_${totalAttempts}.png`);
            try {
                await page.screenshot({ path: errorPath, fullPage: true });
                console.log(`错误截图已保存到: ${errorPath}`);
            } catch (e) {
                console.error('保存错误截图失败:', e.message);
            }
        }
        
        await new Promise(r => setTimeout(r, ACTION_DELAY / 2 + Math.random() * 1500));
        
        if (totalAttempts > 0 && totalAttempts % 15 === 0) { // 增加清理频率
            console.log("!!! 定期清除Cookies，模拟新会话 !!!");
            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');
        }
    }
    // ========================================================================

    console.log('\n\n============================================');
    console.log('🎉🎉🎉 所有分类采集任务均已完成！🎉🎉🎉');
    console.log('============================================');
    await browser.close();
}

run().catch(console.error);