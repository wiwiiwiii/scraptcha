// geetest.js (最终收官版 - 无悬停点击)

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');

const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// --- 配置项 ---
const TARGET_URL = 'https://www.geetest.com/en/adaptive-captcha-demo';
const BASE_SCREENSHOT_DIR = 'geetest_screenshots';
const TARGET_PER_CATEGORY = 100;
const REFRESH_DELAY = 10000; // 可靠的10秒刷新延迟

// --- 正确的选择器常量 ---
const TYPE_SELECTORS = {
    gobang: 'div.tab-item-3 button',
    iconcrush: 'div.tab-item-4 button'
};
const DEMO_TRIGGER_SELECTOR = '.geetest_btn_click';
const CAPTCHA_CONTAINER_SELECTOR = '.geetest_box';
const REFRESH_BUTTON_SELECTOR = '.geetest_refresh';
const CLOSE_BUTTON_SELECTOR = '.geetest_close';

// --- 目录定义 ---
const DIRS = {
    gobang: path.join(BASE_SCREENSHOT_DIR, 'gobang'),
    iconcrush: path.join(BASE_SCREENSHOT_DIR, 'iconcrush')
};

// --- 初始化计数器 ---
const captureCounts = {};
Object.keys(DIRS).forEach(key => {
    const dirPath = DIRS[key];
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
    captureCounts[key] = fs.readdirSync(dirPath).length;
});
console.log('--- Geetest 采集任务初始化 (最终收官版) ---');
console.log(`目标: 每个分类 ${TARGET_PER_CATEGORY} 张`);
console.log('当前进度:');
Object.entries(captureCounts).forEach(([type, count]) => {
    console.log(`  - ${type.toUpperCase()}: ${count} / ${TARGET_PER_CATEGORY}`);
});
console.log('---------------------------------------------------\n');


/**
 * [新增] 辅助函数：使用 JavaScript 直接点击元素，以避免触发 hover 效果
 * @param {import('puppeteer').Page} page
 * @param {string} selector
 */
async function clickWithoutHover(page, selector) {
    // 等待元素确保它存在且可见
    await page.waitForSelector(selector, { visible: true, timeout: 5000 });
    // 在浏览器上下文中执行 JS 点击
    await page.evaluate((sel) => {
        // 使用 optional chaining (?.) 增加代码健壮性
        document.querySelector(sel)?.click();
    }, selector);
    console.log(`    [JS Click] 已通过编程方式点击 "${selector}" 以避免悬停提示。`);
}


async function run() {
    console.log('启动浏览器 (使用Stealth模式)...');
    
    const browser = await puppeteer.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    console.log(`正在访问: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

    for (const category of Object.keys(DIRS)) {
        if (captureCounts[category] >= TARGET_PER_CATEGORY) {
            console.log(`分类 ${category.toUpperCase()} 已完成，跳过。\n`);
            continue;
        }

        console.log(`\n============================================`);
        console.log(`开始处理分类: ${category.toUpperCase()}`);
        console.log(`============================================`);
        
        try {
            // 步骤1: 选择类型并触发首次验证
            console.log(`[步骤1] 选择 "${TYPE_SELECTORS[category]}" 并触发...`);
            await page.click(TYPE_SELECTORS[category]);
            await new Promise(r => setTimeout(r, 500));
            await clickWithoutHover(page, DEMO_TRIGGER_SELECTOR); // 对主按钮也使用无悬停点击

            // 步骤2: 等待初始验证码容器加载
            console.log(`[步骤2] 等待初始验证码容器加载...`);
            const captchaContainer = await page.waitForSelector(CAPTCHA_CONTAINER_SELECTOR, { visible: true, timeout: 15000 });
            console.log('  - 初始验证码准备就绪！');

            console.log(`[步骤3] 开始循环采集，目标 ${TARGET_PER_CATEGORY} 张...`);
            for (let i = captureCounts[category]; i < TARGET_PER_CATEGORY; i++) {
                const currentAttempt = i + 1;
                try {
                    console.log(`  --- [${category.toUpperCase()}] 第 ${currentAttempt}/${TARGET_PER_CATEGORY} 张 ---`);

                    // 步骤A: 截图
                    const screenshotPath = path.join(DIRS[category], `challenge_${String(currentAttempt).padStart(3, '0')}.png`);
                    await captchaContainer.screenshot({ path: screenshotPath });
                    console.log(`    [A] 截图成功 -> ${screenshotPath}`);
                    captureCounts[category]++;

                    // 步骤B: 如果不是最后一张，则无悬停点击刷新并应用固定延迟
                    if (currentAttempt < TARGET_PER_CATEGORY) {
                        // ========================= 核心升级：使用无悬停点击 =========================
                        await clickWithoutHover(page, REFRESH_BUTTON_SELECTOR);
                        // ========================================================================
                        
                        console.log(`    [B] 开始等待 ${REFRESH_DELAY / 1000} 秒...`);
                        await new Promise(r => setTimeout(r, REFRESH_DELAY));
                        console.log('        - 等待完成。');
                    }
                } catch (loopError) {
                    console.error(`    采集循环中发生严重错误: ${loopError.message}`);
                    throw loopError;
                }
            }
            
            await clickWithoutHover(page, CLOSE_BUTTON_SELECTOR);
            await page.waitForSelector(CLOSE_BUTTON_SELECTOR, { hidden: true, timeout: 5000 });
            console.log(`分类 ${category.toUpperCase()} 采集完成！`);

        } catch (error) {
            console.error(`处理分类 "${category}" 时发生严重错误:`, error.message);
            console.log('将刷新整个页面以进行最可靠的恢复...');
            await page.reload({ waitUntil: 'networkidle2' });
        }
    }

    console.log('\n\n============================================');
    console.log('🎉🎉🎉 所有 Geetest 采集任务均已完成！🎉🎉🎉');
    console.log('============================================');
    await browser.close();
}

run().catch(console.error);