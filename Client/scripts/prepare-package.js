const fs = require("fs");
const path = require("path");

const SOURCE_DIR = path.join(__dirname, "..", "dist", "document-intelligence-element", "browser");
const TARGET_DIR = path.join(__dirname, "..", "dist", "npm-package");
const TEMPLATE_DIR = path.join(__dirname, "..", "npm-package");
const LICENSES_SOURCE = path.join(__dirname, "..", "dist", "document-intelligence-element", "3rdpartylicenses.txt");

function copyDirRecursive(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// 1. Verify build output exists
if (!fs.existsSync(SOURCE_DIR)) {
    console.error("Build output not found at:", SOURCE_DIR);
    console.error('Run "npm run build:element" first.');
    process.exit(1);
}

// 2. Clean and create target directory
if (fs.existsSync(TARGET_DIR)) {
    fs.rmSync(TARGET_DIR, { recursive: true });
}
fs.mkdirSync(TARGET_DIR, { recursive: true });

// 3. Copy JS and CSS files from browser output
for (const file of fs.readdirSync(SOURCE_DIR)) {
    const srcPath = path.join(SOURCE_DIR, file);
    if (fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, path.join(TARGET_DIR, file));
    }
}

// 4. Copy media/ and assets/ directories
copyDirRecursive(path.join(SOURCE_DIR, "media"), path.join(TARGET_DIR, "media"));
copyDirRecursive(path.join(SOURCE_DIR, "assets"), path.join(TARGET_DIR, "assets"));

// 5. Copy 3rdpartylicenses.txt
if (fs.existsSync(LICENSES_SOURCE)) {
    fs.copyFileSync(LICENSES_SOURCE, path.join(TARGET_DIR, "3rdpartylicenses.txt"));
}

// 6. Copy template files (package.json, README.md, LICENSE)
for (const file of ["package.json", "README.md", "LICENSE"]) {
    const src = path.join(TEMPLATE_DIR, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(TARGET_DIR, file));
    } else {
        console.warn("Template file not found:", src);
    }
}

// 7. Remove prerendered-routes.json (Angular build artifact, not needed)
const prerenderFile = path.join(TARGET_DIR, "prerendered-routes.json");
if (fs.existsSync(prerenderFile)) {
    fs.unlinkSync(prerenderFile);
}

console.log("npm package prepared at:", TARGET_DIR);

// List contents
const files = fs.readdirSync(TARGET_DIR);
console.log("\nPackage contents:");
for (const file of files) {
    const stat = fs.statSync(path.join(TARGET_DIR, file));
    if (stat.isDirectory()) {
        console.log(`  ${file}/`);
    } else {
        const sizeKB = (stat.size / 1024).toFixed(1);
        console.log(`  ${file} (${sizeKB} KB)`);
    }
}
