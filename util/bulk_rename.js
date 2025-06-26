// util/bulk_rename.js

const fs = require('fs');
const path = require('path');

/**
 * 核心功能：重新命名指定目录下的所有 .png 文件
 * @param {string} dirPath - 要处理的子目录的绝对路径
 */
function processDirectory(dirPath) {
    console.log(`--- Processing: ${path.basename(dirPath)} ---`);

    try {
        // 1. 读取目录下的所有文件
        const files = fs.readdirSync(dirPath)
            // 2. 筛选出 .png 文件，忽略其他文件
            .filter(file => path.extname(file).toLowerCase() === '.png')
            // 3. 对文件名进行自然排序，确保 'challenge_2.png' 在 'challenge_10.png' 之前
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

        if (files.length === 0) {
            console.log('   Directory is empty or contains no .png files. Skipping.\n');
            return;
        }

        console.log(`   Found ${files.length} images to rename.`);

        let renameCount = 0;
        // 4. 遍历排序后的文件列表并重命名
        files.forEach((oldFileName, index) => {
            const newIndex = index + 1;
            const newFileName = `challenge_${String(newIndex).padStart(3, '0')}.png`;

            const oldPath = path.join(dirPath, oldFileName);
            const newPath = path.join(dirPath, newFileName);

            // 只有当新旧文件名不同时才执行重命名操作
            if (oldPath !== newPath) {
                fs.renameSync(oldPath, newPath);
                console.log(`   Renamed: ${oldFileName} -> ${newFileName}`);
                renameCount++;
            }
        });

        if (renameCount > 0) {
            console.log(`✅ Successfully renamed ${renameCount} files in "${path.basename(dirPath)}".\n`);
        } else {
            console.log('   All files are already correctly named. No changes needed.\n');
        }

    } catch (error) {
        console.error(`   ❌ Error processing directory "${dirPath}": ${error.message}\n`);
    }
}

/**
 * 主函数
 */
function main() {
    // 从命令行参数获取主截图目录的路径
    const targetDir = process.argv[2];

    if (!targetDir) {
        console.error('❌ Error: Please provide the path to the main screenshots directory.');
        console.error('   Example: node util/bulk_rename.js ../hcaptcha_screenshots');
        process.exit(1);
    }
    
    // 将相对路径转换为绝对路径，以便清晰地显示
    const absoluteTargetDir = path.resolve(targetDir);

    if (!fs.existsSync(absoluteTargetDir) || !fs.lstatSync(absoluteTargetDir).isDirectory()) {
        console.error(`❌ Error: Directory not found at "${absoluteTargetDir}"`);
        process.exit(1);
    }

    console.log(`🚀 Starting bulk rename process for directory: "${absoluteTargetDir}"`);

    try {
        // 获取所有子目录
        const subdirs = fs.readdirSync(absoluteTargetDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        if (subdirs.length === 0) {
            console.warn('⚠️ No subdirectories found to process.');
            return;
        }

        console.log(`Found ${subdirs.length} subdirectories: ${subdirs.join(', ')}\n`);

        // 遍历并处理每个子目录
        subdirs.forEach(subdirName => {
            processDirectory(path.join(absoluteTargetDir, subdirName));
        });

        console.log('✨ All directories processed. ✨');

    } catch (error) {
        console.error(`An error occurred while reading the main directory: ${error.message}`);
        process.exit(1);
    }
}

// 执行主函数
main();