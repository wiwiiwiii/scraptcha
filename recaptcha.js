// recaptcha.js

require('dotenv').config();

const puppeteer = require('puppeteer-extra');
const fs = require('fs');
const path = require('path');

const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const TARGET_URL = 'http://127.0.0.1:5500/index.html'; 
const SCREENSHOT_DIR = 'recaptcha_screenshots';
const CAPTURE_COUNT = 100;
let ACTION_DELAY = 2000;

if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR);
}

// 辅助函数：接收一个上下文（page或frame）和一个能控制鼠标的顶层page对象
async function humanClick(context, selector, pageForMouse) {
    const elementHandle = await context.waitForSelector(selector);
    const box = await elementHandle.boundingBox();

    if (!box) {
        throw new Error(`无法找到元素 "${selector}" 的边界框，它可能不可见。`);
    }
    
    await pageForMouse.mouse.move(
        box.x + box.width / 2 + (Math.random() - 0.5) * 10,
        box.y + box.height / 2 + (Math.random() - 0.5) * 10,
        { steps: 20 }
    );
    await new Promise(r => setTimeout(r, 100 + Math.random() * 150));
    await pageForMouse.mouse.down();
    await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
    await pageForMouse.mouse.up();
}


async function run() {
    console.log('启动浏览器 (使用Stealth模式)...');
    
    const browser = await puppeteer.launch({
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ]
    });

    const page = await browser.newPage();
    
    await page.setViewport({
        width: 1200 + Math.floor(Math.random() * 200),
        height: 700 + Math.floor(Math.random() * 100)
    });

    console.log(`准备开始循环截图，共 ${CAPTURE_COUNT} 次...`);

    for (let i = 1; i <= CAPTURE_COUNT; i++) {
        console.log(`\n--- 第 ${i}/${CAPTURE_COUNT} 次 ---`);
        try {
            console.log(`正在访问: ${TARGET_URL}`);
            await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

            await page.evaluate(() => {
                window.scrollBy(0, Math.random() * 100);
            });
            await new Promise(r => setTimeout(r, 500 + Math.random() * 500));

            console.log('等待并点击 reCAPTCHA 复选框...');
            const recaptchaFrame = await page.waitForFrame(frame => frame.url().includes('api2/anchor'));
            
            // 修正后的调用方式
            await humanClick(recaptchaFrame, '#recaptcha-anchor', page); 

            console.log('等待图片验证弹窗...');
            await new Promise(r => setTimeout(r, ACTION_DELAY));
            
            const imageChallengeFrame = await page.waitForFrame(frame => frame.url().includes('api2/bframe'));
            const challengeContainer = await imageChallengeFrame.waitForSelector('div#rc-imageselect');
            
            if (!challengeContainer) {
                throw new Error('未找到完整的图片验证容器。');
            }

            const screenshotPath = path.join(SCREENSHOT_DIR, `challenge_full_${String(i).padStart(3, '0')}.png`);
            console.log(`截取完整验证框并保存到: ${screenshotPath}`);
            await challengeContainer.screenshot({ path: screenshotPath });

        } catch (error) {
            console.error(`第 ${i} 次操作失败:`, error.message);
            await page.screenshot({ path: path.join(SCREENSHOT_DIR, `error_${String(i).padStart(3, '0')}.png`), fullPage: true });
            
            ACTION_DELAY += 1000; 
            console.log(`操作失败，下次延迟增加到 ${ACTION_DELAY / 1000} 秒`);
        }
        
        const randomDelay = ACTION_DELAY + Math.random() * 2000;
        console.log(`等待 ${Math.round(randomDelay / 1000)} 秒后继续...`);
        await new Promise(r => setTimeout(r, randomDelay));
        
        if (i > 0 && i % (10 + Math.floor(Math.random() * 5)) === 0) {
            console.log("!!! 清除Cookies，模拟新会话 !!!");
            try {
                const client = await page.target().createCDPSession();
                await client.send('Network.clearBrowserCookies');
                console.log("Cookies 已清除。");
            } catch (e) {
                console.error("清除Cookies失败:", e.message);
            }
        }
    }

    console.log('\n所有任务完成，关闭浏览器。');
    await browser.close();
}

run().catch(console.error);