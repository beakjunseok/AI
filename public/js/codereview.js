/* ================= 코드 저장 → AI 자동 코드 리뷰 ================= */
// 코드 칸에서 바뀐 코드를 저장하면 코딩 담당(없으면 검증 담당·아무 팀원) AI가 바뀐 줄과 전체 코드를 보고
// 기획방에 짧은 리뷰(바뀐 점 · 버그 위험 · 다음 할 일)를 남긴다. 프로젝트별로 켜고 끌 수 있다(기본 ON).
// 리뷰 중에 또 저장하면 끝난 뒤 마지막 코드로 한 번만 다시 본다(중간 저장분은 건너뜀).

const CODE_REVIEW_DIFF_LINE_LIMIT = 80;
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

function pickCodeReviewer(project) {
  const members = agentsInProject(project.id);
  const byRole = roleKey => members.find(agent => getPreset(agent.id).roleKey === roleKey);
  return (byRole("code") || byRole("qa") || members[0] || getAgent("bit") || state.agents[0]).id;
}

function buildCodeReviewPrompt(reviewerId, project, previousCode, nextCode) {
  const preset = getPreset(reviewerId);
  const { added, removed } = collectChangedLines(previousCode, nextCode);
  const diff = [...removed.slice(0, CODE_REVIEW_DIFF_LINE_LIMIT).map(line => `- ${line}`), ...added.slice(0, CODE_REVIEW_DIFF_LINE_LIMIT).map(line => `+ ${line}`)].join("\n");
  const code = nextCode.slice(0, CODE_REVIEW_CODE_LIMIT);
  return [
    `너는 '${preset.name}'(${ROLE_LABELS[preset.roleKey]} 담당, 성격: ${preset.persona}). 팀장이 '${project.name}' 프로젝트 코드를 방금 저장했다. 바로 코드 리뷰를 남겨라.`,
    projectContextLine(0),
    previousCode ? `[바뀐 줄] (- 삭제, + 추가)\n\`\`\`diff\n${diff || "(공백·순서만 바뀜)"}\n\`\`\`` : "[처음 저장된 코드라 전체를 본다]",
    `[저장된 전체 코드${nextCode.length > CODE_REVIEW_CODE_LIMIT ? ` · 앞 ${CODE_REVIEW_CODE_LIMIT}자` : ""}]\n\`\`\`\n${code}\n\`\`\``,
    "",
    "출력(한국어 마크다운, 12줄 이내, 네 성격 말투 살짝):",
    "**바뀐 점**: 무엇이 왜 바뀌었는지 1~2줄",
    "**버그·위험**: 실제 문제가 있으면 해당 줄을 짚어서(핀 충돌, 타이밍·delay 막힘, 오버플로, 널·예외, 메모리, 보안 등), 없으면 '눈에 띄는 문제 없음'",
    "**다음 할 일**: 1~2개",
    "고칠 게 확실하면 고친 코드 조각을 짧은 코드 블록 하나로. 칭찬·인사·군더더기는 생략."
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
