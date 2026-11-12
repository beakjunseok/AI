/* ================= 코드 저장 → AI 자동 코드 리뷰 ================= */
// 코드 칸에서 바뀐 코드를 저장하면 코딩 담당(없으면 검증 담당·아무 팀원) AI가 '바뀐 부분만'(앞뒤 2줄 맥락 포함) 보고
// 크레딧 절약: 전체 코드는 처음 저장할 때만 보낸다.
// 기획방에 짧은 리뷰(바뀐 점 · 버그 위험 · 다음 할 일)를 남긴다. 프로젝트별로 켜고 끌 수 있다(기본 ON).
// 리뷰 중에 또 저장하면 끝난 뒤 마지막 코드로 한 번만 다시 본다(중간 저장분은 건너뜀).

const CODE_REVIEW_DIFF_LINE_LIMIT = 120;   // 리뷰에 보내는 diff 최대 줄 수
const CODE_REVIEW_CONTEXT_LINES = 2;       // 바뀐 줄 앞뒤로 함께 보낼 맥락 줄
const LCS_MAX_CELLS = 400000;              // 정확한 diff(LCS) 계산 한도. 넘으면 근사 diff
const CODE_REVIEW_CODE_LIMIT = 8000;
const codeReviewState = {}; // projectId → { running, pendingCode, lastReviewedCode }

// 줄 단위로 지워진 줄·추가된 줄 목록(같은 내용 줄의 개수로 대조). O(줄 수)
function collectChangedLines(previousCode, nextCode) {
  const toLines = code => (code ? String(code).split("\n") : []);
  const previousCounts = new Map();
  toLines(previousCode).forEach(line => previousCounts.set(line, (previousCounts.get(line) || 0) + 1));
  const added = [];
  toLines(nextCode).forEach(line => {
    const left = previousCounts.get(line) || 0;
    if (left > 0) previousCounts.set(line, left - 1); else if (line.trim()) added.push(line);
  });
  const removed = [...previousCounts.entries()].flatMap(([line, count]) => (line.trim() ? Array(count).fill(line) : []));
  return { added, removed };
}

// 줄 번호가 붙은 hunk 형식 diff. 작으면 LCS로 정확히(O(n·m)), 크면 바뀐 줄 목록으로 근사.
function buildLineDiff(previousCode, nextCode) {
  const before = previousCode ? String(previousCode).split("\n") : [];
  const after = nextCode ? String(nextCode).split("\n") : [];
  if (before.length * after.length > LCS_MAX_CELLS) {
    const { added, removed } = collectChangedLines(previousCode, nextCode);
    return [...removed.map(line => `- ${line}`), ...added.map(line => `+ ${line}`)].slice(0, CODE_REVIEW_DIFF_LINE_LIMIT).join("\n");
  }
  const rows = before.length + 1, cols = after.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] = before[i] === after[j] ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const operations = []; // [기호, 줄, 새 코드 기준 줄 번호]
  let i = 0, j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) { operations.push([" ", after[j], j + 1]); i += 1; j += 1; }
    else if (i < before.length && (j >= after.length || table[(i + 1) * cols + j] >= table[i * cols + j + 1])) { operations.push(["-", before[i], j + 1]); i += 1; }
    else { operations.push(["+", after[j], j + 1]); j += 1; }
  }
  const keep = operations.map((operation, index) => operations.slice(Math.max(0, index - CODE_REVIEW_CONTEXT_LINES), index + CODE_REVIEW_CONTEXT_LINES + 1).some(near => near[0] !== " "));
  const output = [];
  operations.forEach((operation, index) => {
    if (!keep[index]) return;
    if (index > 0 && !keep[index - 1]) output.push("…");
    if (output.length === 0 || output[output.length - 1] === "…") output.push(`@@ ${operation[2]}행 근처`);
    output.push(`${operation[0]} ${operation[1]}`);
  });
  return output.slice(0, CODE_REVIEW_DIFF_LINE_LIMIT).join("\n") + (output.length > CODE_REVIEW_DIFF_LINE_LIMIT ? "\n…(변경이 많아 일부만)" : "");
}

function pickCodeReviewer(project) {
  const members = agentsInProject(project.id);
  const byRole = roleKey => members.find(agent => getPreset(agent.id).roleKey === roleKey);
  return (byRole("code") || byRole("qa") || members[0] || getAgent("bit") || state.agents[0]).id;
}

function buildCodeReviewPrompt(reviewerId, project, previousCode, nextCode) {
  const preset = getPreset(reviewerId);
  const isFirstSave = !previousCode.trim();
  const body = isFirstSave
    ? `[처음 저장된 코드 · 전체${nextCode.length > CODE_REVIEW_CODE_LIMIT ? ` 중 앞 ${CODE_REVIEW_CODE_LIMIT}자` : ""}]\n\`\`\`\n${nextCode.slice(0, CODE_REVIEW_CODE_LIMIT)}\n\`\`\``
    : `[바뀐 부분만] (- 삭제, + 추가, 앞에 공백 = 맥락 줄, 전체 ${nextCode.split("\n").length}줄 중)\n\`\`\`diff\n${buildLineDiff(previousCode, nextCode) || "(공백만 바뀜)"}\n\`\`\``;
  return [
    `너는 '${preset.name}'(${ROLE_LABELS[preset.roleKey]} 담당, 성격: ${preset.persona}). 팀장이 '${project.name}' 프로젝트 코드를 방금 저장했다. 바로 코드 리뷰를 남겨라.`,
    projectContextLine(),
    body,
    "",
    "출력(한국어 마크다운, 12줄 이내, 네 성격 말투 살짝):",
    "**바뀐 점**: 무엇이 왜 바뀌었는지 1~2줄",
    "**버그·위험**: 실제 문제가 있으면 해당 줄을 짚어서(핀 충돌, 타이밍·delay 막힘, 오버플로, 널·예외, 메모리, 보안 등), 없으면 '눈에 띄는 문제 없음'. 보이지 않는 부분은 추측하지 말 것",
    "**다음 할 일**: 1~2개",
    "고칠 게 확실하면 전체 코드가 아니라 '고쳐야 할 줄만' 행 번호와 함께 짧은 코드 블록 하나로. 칭찬·인사·군더더기는 생략."
  ].filter(Boolean).join("\n");
}

function simulateCodeReview(previousCode, nextCode) {
  const { added, removed } = collectChangedLines(previousCode, nextCode);
  return [`**바뀐 점**: +${added.length}줄 / −${removed.length}줄 바뀌었어요.`, "**버그·위험**: (시뮬레이션) 실제 AI가 연결되면 코드를 읽고 짚어 줘요.", "**다음 할 일**: 보드에 올려서 시리얼 출력부터 확인해 보기"].join("\n");
}

// 코드 저장 직후 호출. 리뷰가 진행 중이면 최신 코드만 대기열에 남긴다.
async function requestCodeReview(projectId, previousCode, nextCode) {
  const project = findProject(projectId);
  if (!project || project.autoReview === false || !nextCode.trim()) return;
  const review = codeReviewState[projectId] || (codeReviewState[projectId] = { running: false, pendingCode: null, lastReviewedCode: previousCode || "" });
  if (review.running) { review.pendingCode = nextCode; return; }
  review.running = true;
  try {
    const reviewerId = pickCodeReviewer(project);
    const baseCode = review.lastReviewedCode ?? previousCode ?? "";
    showToast(`🔍 @${getPreset(reviewerId).name}이(가) 바뀐 코드를 보는 중…`);
    await streamAgentMessage(reviewerId, {
      prompt: buildCodeReviewPrompt(reviewerId, project, baseCode, nextCode),
      simulate: () => simulateCodeReview(baseCode, nextCode),
      extra: { kind: "review" },
      maxTokens: 800
    });
    review.lastReviewedCode = nextCode;
  } finally {
    review.running = false;
    const pending = review.pendingCode;
    review.pendingCode = null;
    if (pending && pending !== review.lastReviewedCode) requestCodeReview(projectId, review.lastReviewedCode, pending);
  }
}
