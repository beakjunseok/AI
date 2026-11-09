// 배포 전 검사(Vercel buildCommand): 페이지가 참조하는 파일이 모두 있는지, 모든 JS가 문법 오류 없이 읽히는지 확인한다.
// 하나라도 실패하면 exit 1 → Vercel이 배포를 중단해 깨진 버전이 올라가지 않는다. O(파일 수 + 총 코드 길이)
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");

function findReferencedAssets(html) {
  const pattern = /(?:src|href)="((?:js|css)\/[^"]+)"/g;
  return [...html.matchAll(pattern)].map(match => match[1]);
}

function checkSyntax(filePath) {
  try {
    new vm.Script(fs.readFileSync(filePath, "utf8"), { filename: filePath });
    return null;
  } catch (error) {
    return `${path.relative(ROOT, filePath)}: ${error.message}`;
  }
}

function listJsFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : listJsFiles(fullPath);
    return entry.name.endsWith(".js") ? [fullPath] : [];
  });
}

function main() {
  const problems = [];
  const html = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
  for (const asset of findReferencedAssets(html)) {
    if (!fs.existsSync(path.join(PUBLIC_DIR, asset))) problems.push(`index.html이 참조하는 ${asset} 파일이 없음`);
  }
  const jsFiles = [...listJsFiles(PUBLIC_DIR), ...listJsFiles(path.join(ROOT, "api")), ...listJsFiles(path.join(ROOT, "lib"))];
  for (const file of jsFiles) {
    const problem = checkSyntax(file);
    if (problem) problems.push(problem);
  }
  if (problems.length) {
    console.error(`검사 실패 ${problems.length}건:\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`검사 통과: JS ${jsFiles.length}개, 참조 파일 ${findReferencedAssets(html).length}개`);
}

main();
