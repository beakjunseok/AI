/* ================= 채팅: 하나의 방, 역할별 AI ================= */
// 사용자가 위로 스크롤해 읽는 중이면 새 메시지·재렌더가 와도 위치를 유지한다. 바닥 근처(80px)일 때만 따라 내려간다.
let threadPinnedToBottom = true;
let threadSavedScrollTop = 0;
let unseenMessageCount = 0;
const SCROLL_PIN_THRESHOLD = 80;
const isNearBottom = node => node.scrollHeight - node.scrollTop - node.clientHeight < SCROLL_PIN_THRESHOLD;

function scrollThreadToBottom() {
  const thread = document.getElementById("thread");
  if (!thread) return;
  thread.scrollTop = thread.scrollHeight;
  threadPinnedToBottom = true;
  unseenMessageCount = 0;
  document.querySelector(".jumpLatest")?.remove();
}

// 아래로 고정이 아닐 때 새 메시지가 오면 '↓ 새 메시지' 버튼만 띄운다.
function showJumpButton() {
  const view = document.getElementById("chatView");
  if (!view || threadPinnedToBottom) return;
  let button = view.querySelector(".jumpLatest");
  if (!button) {
    button = el("button", { class: "jumpLatest", type: "button", onclick: scrollThreadToBottom });
    view.append(button);
  }
  const thread = document.getElementById("thread");
  button.style.top = `${(thread ? thread.offsetTop + thread.clientHeight : 120) - 36}px`;
  button.textContent = unseenMessageCount > 0 ? `↓ 새 메시지 ${unseenMessageCount}` : "↓ 맨 아래로";
}

function pushChat(message) {
  if (!threadPinnedToBottom) unseenMessageCount += 1;
  const full = Object.assign({ id: nextId("m"), time: Date.now() }, message);
  state.chat.push(full);
  if (state.chat.length > CHAT_LIMIT) state.chat.splice(0, state.chat.length - CHAT_LIMIT);
  return full;
}

function updateMessageNode(message) {
  const node = document.querySelector(`#msg-${message.id} .text`);
  if (node) {
    node.replaceChildren(renderMarkdown(message.text));
    const thread = document.getElementById("thread");
    if (thread && threadPinnedToBottom) thread.scrollTop = thread.scrollHeight;
  }
}

// 최근 대화 전체를 함께 넣어 '한 채팅방' 맥락을 공유하되, 답변은 해당 팀원 역할로만 하게 한다.
// 소설식 지문(행동·외모·표정 묘사)을 막는 공통 규칙. 성격은 말투로만 드러낸다.
const NO_NARRATION_RULE = "지문 금지: 행동·외모·표정·소품 묘사(예: '커피잔을 들고', '다크서클이', '*한숨*', '(웃으며)')를 쓰지 말고, 실제로 하는 말과 내용만 써라. 성격은 말투로만 드러낸다.";

// 프롬프트를 어겨도 남는 지문을 한 번 더 걸러낸다: *행동*, 줄 맨 앞의 (행동) 표기. **굵게**·코드 블록은 건드리지 않는다. O(길이)
function stripNarration(text) {
  let inCode = false;
  return text.split("\n").map(line => {
    if (/^\s*```/.test(line)) { inCode = !inCode; return line; }
    if (inCode) return line;
    return line.replace(/(^|[^*])\*(?!\*)[^*\n]{1,60}\*(?!\*)/g, "$1").replace(/^\s*\([^)\n]{1,40}\)\s*/, "").replace(/\s{2,}/g, " ");
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildChatPrompt(agentId, isTeamRound) {
  const preset = getPreset(agentId);
  const roster = AGENT_PRESETS.map(item => `${item.name}(${ROLE_LABELS[item.roleKey]})`).join(", ");
  const history = isTeamRound ? buildHistory() : buildHistory(5000, agentId);
  const roomContext = isTeamRound ? "" : buildHistory(2000);
  return [
    `여기는 '${findProject(state.activeProjectId)?.name || "기획"}' 프로젝트의 기획·브레인스토밍 채팅방이고, AI 팀원들과 '팀장'(사람)이 함께 쓴다. 팀원: ${roster}. 목표는 팀장의 아이디어를 넓히고 다듬어, 나중에 Claude에게 넘길 기획으로 만드는 것이다.`,
    `너는 그중 '${preset.name}'이다. 역할: ${ROLE_LABELS[preset.roleKey]} 담당. 성격: ${preset.persona}`,
    `말투 예시: ${[...preset.lines.working, ...preset.lines.reply].join(" / ")}`,
    "",
    isTeamRound ? "기획방 최근 대화:" : "팀장과 너의 1:1 대화:",
    history || "(없음)",
    ...(roomContext ? ["", "참고 — 기획방(팀 전체) 최근 대화:", roomContext] : []),
    "",
    isTeamRound
      ? "팀장이 팀 전체에게 말했다. 앞선 팀원들의 답을 참고해 겹치지 않게, 네 역할 관점에서만 의견이나 결과물을 덧붙여라."
      : "팀장이 너에게 말했다. 네 역할 관점에서 답해라.",
    "규칙: 카톡하듯 편한 대화체, 캐릭터 말투 유지 / 아이디어를 넓히거나 구체화하고, 필요하면 되묻기 1개 / 보통 2~6문장, 길어도 한국어 600자 이내 / 목록·**굵게** 정도의 간단한 마크다운 가능, 제목(#) 금지 / 이름 접두어 없이 본문만 / 다른 팀원의 대사를 대신 쓰지 말 것.",
    NO_NARRATION_RULE
  ].join("\n");
}

// 한 팀원의 메시지를 스트리밍으로 받아 채팅방에 올리는 공통 함수. 실패해도 예외를 밖으로 던지지 않는다.
async function streamAgentMessage(agentId, { prompt, simulate, extra = {}, maxTokens = DEFAULT_MAX_TOKENS }) {
  const agent = getAgent(agentId);
  const preset = getPreset(agentId);
  const message = pushChat(Object.assign({ from: agentId, text: "…", model: agent.model, pending: true, engine: engineLabel(agent.model) }, extra));
  aiBusyAgents.add(agentId);
  say(agentId, { review: "🔍 검토 중…", discuss: "💬 토론 중…", briefPart: "📝 메모 중…", brief: "📄 브리프 작성 중…" }[extra.kind] || "✍️ 입력 중…", 60000);
  if (panelAgentId) renderPanel();
  try {
    // 담당 → Claude → Gemini 순서로 시도. 한도 초과·키 오류·네트워크 오류면 다음 엔진으로 넘어간다.
    const chain = fallbackChain(agent.model).filter(isProviderAvailable);
    let usedEngine = null, lastError = null;
    for (const engine of chain) {
      try {
        recordUsage(engine);
        message.engine = engine === agent.model ? engine : `fallback:${engine}`;
        const result = await callEngine(engine, prompt, ({ text }) => { message.text = text; updateMessageNode(message); }, maxTokens);
        message.text = stripNarration((result.text || "").trim()) || "(빈 답장이 왔어요)";
        if (result.truncated) message.text += "\n…(길어서 잘렸어요)";
        usedEngine = engine;
        break;
      } catch (error) {
        lastError = error;
        if (error?.code === "not_granted" && engine === "claude") { sampleApi = null; updateAiBadge(); }
        else if (error?.code === "rate_limited") markExhausted(engine);
        else if (error?.code === "not_configured") serverProviders.delete(engine);
        else if (error?.code === "locked") { serverProviders.clear(); serverLocked = true; document.getElementById("lockPill").hidden = false; }
      }
    }
    if (!usedEngine) {
      await new Promise(resolve => setTimeout(resolve, 600 + Math.random() * 600));
      message.engine = "simulation";
      message.text = simulate() + (lastError ? `\n(연결 실패 → 시뮬레이션: ${lastError.message})` : "");
    }
    message.ok = true;
    addLog(agent, { kind: extra.kind === "review" ? "review" : "ai", text: message.text.slice(0, 160), project: findProject(agent.location)?.name });
  } catch (error) {
    if (error?.code === "not_granted") { sampleApi = null; updateAiBadge(); message.text = "(AI 사용 권한이 없어 시뮬레이션으로 바꿨어요)"; }
    else if (error?.code === "rate_limited") message.text = "(요청이 많아요. 잠시 뒤 다시 말 걸어 주세요)";
    else message.text = `(답변 실패: ${error?.message || "알 수 없는 오류"})`;
    say(agentId, pickRandom(preset.lines.complain));
  } finally {
    message.pending = false;
    aiBusyAgents.delete(agentId);
    saveState();
    if (panelAgentId) renderPanel();
  }
  return message;
}

async function answerAs(agentId, isTeamRound) {
  const preset = getPreset(agentId);
  const message = await streamAgentMessage(agentId, {
    prompt: buildChatPrompt(agentId, isTeamRound),
    simulate: () => `${pickRandom(preset.lines.reply)} ${pickRandom(ROLE_OUTPUTS[preset.roleKey])}`,
    extra: { channel: isTeamRound ? ROOM_CHANNEL : agentId }
  });
  if (message.ok) {
    setExpression(agentId, "happy", 1200);
    say(agentId, pickRandom(preset.lines.done), 2000);
    unlockAchievement("first_chat");
  }
  return message;
}

/* ---------- AI 교차 검증 ---------- */
const reviewPriority = () => [...new Set(["claude", "gemini", ...Object.keys(MODEL_PROVIDERS)])];
// '적당히' 규칙: 하루 최대 12회, 1:1 검사 사이 45초 쿨다운, 짧은 잡담은 건너뜀, 검사에 넘기는 답은 600자까지.
const REVIEW_DAILY_LIMIT = 12;
const REVIEW_COOLDOWN_MS = 45000;
const REVIEW_INPUT_CHARS = 600;
let lastSoloReviewAt = 0;

const todayKey = () => new Date().toLocaleDateString("sv-SE");

function reviewsLeftToday() {
  if (!state.reviewUsage || state.reviewUsage.date !== todayKey()) state.reviewUsage = { date: todayKey(), count: 0 };
  return Math.max(0, REVIEW_DAILY_LIMIT - state.reviewUsage.count);
}

// 코드가 있거나 충분히 긴 '결과물'만 검사 가치가 있다고 본다.
function isWorthReviewing(message) {
  const looksLikeCode = /```|=>|function\s|def\s|class\s|\{\s*$|;\s*$/m.test(message.text);
  return looksLikeCode || message.text.length >= 250;
}

// 검사 여부 결정: 끔 / 한도 소진 / 쿨다운 / 잡담이면 건너뛴다(팀 라운드는 쿨다운·잡담 예외).
function shouldReview(messages, isTeamRound) {
  if (!state.crossReview || reviewsLeftToday() === 0) return false;
  if (isTeamRound) return true;
  if (Date.now() - lastSoloReviewAt < REVIEW_COOLDOWN_MS) return false;
  return messages.some(isWorthReviewing);
}

// 작성자와 '다른 모델'을 쓰는 팀원을 우선으로, 그중 검증 담당 → Claude → Gemini → GPT 순으로 검토자를 고른다.
function chooseReviewer(authorIds) {
  const authorModels = new Set(authorIds.map(id => getAgent(id).model));
  const others = state.agents.filter(agent => !authorIds.includes(agent.id));
  const byPriority = list => [...list].sort((first, second) => reviewPriority().indexOf(first.model) - reviewPriority().indexOf(second.model));
  const differentModel = others.filter(agent => !authorModels.has(agent.model));
  const isQa = agent => getPreset(agent.id).roleKey === "qa";
  return differentModel.find(isQa) || byPriority(differentModel)[0] || others.find(isQa) || byPriority(others)[0] || null;
}

function buildReviewPrompt(reviewerId, question, targets) {
  const reviewer = getAgent(reviewerId);
  const preset = getPreset(reviewerId);
  const targetText = targets.map(message => {
    const author = getPreset(message.from);
    const clipped = message.text.length > REVIEW_INPUT_CHARS ? `${message.text.slice(0, REVIEW_INPUT_CHARS)}…(생략)` : message.text;
    return `[@${author.name} · ${ROLE_LABELS[author.roleKey]} · 두뇌 ${providerInfo(message.model).label}]\n${clipped}`;
  }).join("\n\n");
  return [
    `너는 팀 채팅방의 '${preset.name}'(${ROLE_LABELS[preset.roleKey]} 담당, 두뇌 ${providerInfo(reviewer.model).label}). 성격: ${preset.persona}`,
    "지금 할 일은 다른 AI 팀원이 쓴 답변의 교차 검증이다. 칭찬보다 문제 발견이 목적이다.",
    `팀장 질문: """${question}"""`,
    "",
    "검토 대상:",
    targetText,
    "",
    "검사 항목: 사실 오류 / 코드 버그 / 질문 의도와 어긋남 / 팀원끼리 모순. 사소한 표현·취향 문제는 지적하지 말 것.",
    "큰 문제가 없으면 '✅ 통과' 한 줄만 써도 된다.",
    "출력 형식: 첫 줄은 정확히 '✅ 통과' 또는 '⚠️ 수정 필요'. 지적은 '-'로 최대 2개. 한국어 150자 이내."
  ].join("\n");
}

async function crossReview(authorMessages, question, isTeamRound = false) {
  const valid = authorMessages.filter(message => message?.ok);
  if (!valid.length || !shouldReview(valid, isTeamRound)) return;
  state.reviewUsage.count += 1;
  if (!isTeamRound) lastSoloReviewAt = Date.now();
  const reviewer = chooseReviewer([...new Set(valid.map(message => message.from))]);
  if (!reviewer) return;
  if (reviewer.sleeping) { reviewer.sleeping = false; say(reviewer.id, pickRandom(getPreset(reviewer.id).lines.wake)); }
  const targetNames = valid.map(message => `@${getPreset(message.from).name}`).join(", ");
  const review = await streamAgentMessage(reviewer.id, {
    prompt: buildReviewPrompt(reviewer.id, question, valid),
    simulate: () => pickRandom([
      "✅ 통과\n- 질문 의도와 맞음\n- 역할 관점 구체성 OK",
      "⚠️ 수정 필요\n- 근거 없이 단정한 부분 있음 → 출처나 예시 추가\n- 엣지 케이스(빈 입력) 언급 없음",
      "⚠️ 수정 필요\n- 팀원 답끼리 일정이 충돌함 → 우선순위 정리 필요"
    ]),
    extra: { kind: "review", reviewOf: valid.map(message => message.id), targetLabel: targetNames, channel: channelOf(valid[0]) }
  });
  if (!review.ok) return;
  const passed = review.text.trim().startsWith("✅");
  review.verdict = passed ? "pass" : "fix";
  valid.forEach(message => {
    message.reviewVerdict = review.verdict;
    setExpression(message.from, passed ? "happy" : "surprised", 1500);
    say(message.from, passed ? "검증 통과!" : pickRandom(getPreset(message.from).lines.complain), 2500);
  });
  unlockAchievement("cross_check");
  saveState();
  if (panelAgentId) renderPanel();
}

async function sendToAgent(agentId, text) {
  if (getAgent(agentId).sleeping) { getAgent(agentId).sleeping = false; say(agentId, pickRandom(getPreset(agentId).lines.wake)); }
  pushChat({ from: "user", to: agentId, text, channel: agentId });
  saveState();
  await answerAs(agentId, false);
}

// 1:1 대화는 교차 검증 없이 그 팀원만 답한다. 기획방은 현재 사무실 팀원(최대 4명)이 순서대로 답하고, 마지막에 다른 모델 팀원이 라운드 전체를 교차 검증한다.
async function sendToTeam(text) {
  let members = agentsInProject(state.activeProjectId).filter(agent => !agent.sleeping);
  if (!members.length) members = pickDiscussionMembers().map(getAgent);
  members = members.sort((first, second) => first.slot - second.slot).slice(0, 4);
  pushChat({ from: "user", to: "team", text });
  saveState();
  unlockAchievement("team_round");
  const answers = [];
  for (const member of members) answers.push(await answerAs(member.id, true));
  await crossReview(answers, text, true);
}
