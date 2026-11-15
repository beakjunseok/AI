/* ================= 프롬프트 도우미 (사무실 오른쪽 위 ✨ 버튼) ================= */
// 흐름: ① 초안 붙여넣기 → ② AI가 빠진 점·고칠 점을 짚고, 결과를 크게 바꿀 빈칸만 선택지와 함께 질문
//       → ③ 답을 반영해 완성 프롬프트 작성 → ④ 복사하거나 한 줄 피드백으로 다시 다듬기.
// 캐릭터 연기 없이 일반 AI 어시스턴트 말투로 동작한다. 마지막 작업은 state.promptHelper에 남아 다시 열어도 이어진다.
const PROMPT_TARGETS = [
  { id: "chat", label: "일반 대화형 AI", hint: "ChatGPT·Claude·Gemini 같은 대화형 AI" },
  { id: "claude", label: "Claude", hint: "Claude. 맥락을 충분히 주고, 필요하면 XML 태그로 자료를 구분하는 방식이 잘 맞음" },
  { id: "code", label: "코딩 에이전트", hint: "Claude Code·Cursor 같은 코딩 에이전트. 파일·기술스택·완료 조건·테스트 방법이 중요" },
  { id: "image", label: "이미지 생성", hint: "이미지 생성 AI. 피사체·스타일·구도·조명·색감·비율을 묘사형으로" },
  { id: "other", label: "기타", hint: "용도 미정" }
];
const PROMPT_DRAFT_LIMIT = 8000;
const PROMPT_MAX_QUESTIONS = 5;
const PROMPT_ANALYZE_TOKENS = 1200;
const PROMPT_WRITE_TOKENS = 2000;
const LEAVE_IT_TO_AI = "알아서 정해줘";

let promptHelperBusy = false;
let promptSaveTimer = null;

// 타이핑 중엔 0.8초 쉬면 저장. 혹시 화면이 새로고침돼도 쓰던 글이 남는다.
function savePromptHelperSoon() {
  clearTimeout(promptSaveTimer);
  promptSaveTimer = setTimeout(saveState, 800);
}

function promptHelperState() {
  state.promptHelper ||= { draft: "", target: "chat", analysis: null, answers: {}, result: null };
  return state.promptHelper;
}

const promptTargetOf = id => PROMPT_TARGETS.find(target => target.id === id) || PROMPT_TARGETS[0];

// 사용할 수 있는 실제 AI 엔진(대타 순서대로). 없으면 null → 접속 코드 안내.
function promptHelperEngine() {
  return FALLBACK_ORDER.map(pickEngine).find(Boolean) || (cooldownWaitMs(FALLBACK_ORDER[0]) ? FALLBACK_ORDER[0] : null);
}

// 한 엔진이 실패하거나(한도·서버 오류·시간 초과) 빈 답을 주면 다음 엔진으로 넘겨 다시 시도한다.
async function askPromptAi(prompt, maxTokens) {
  const tried = new Set();
  let lastError = null;
  for (let attempt = 0; attempt < FALLBACK_ORDER.length + 2; attempt += 1) {
    let engine = FALLBACK_ORDER.map(pickEngine).find(name => name && !tried.has(name));
    if (!engine) {
      const waitMs = cooldownWaitMs(FALLBACK_ORDER[0]);
      if (!waitMs || attempt >= FALLBACK_ORDER.length + 1) break;
      await new Promise(resolve => setTimeout(resolve, waitMs + 300));   // 분당 한도면 잠깐 기다렸다 다시
      tried.clear();
      engine = FALLBACK_ORDER.map(pickEngine).find(Boolean);
      if (!engine) break;
    }
    tried.add(engine);
    try {
      recordUsage(engine);
      const result = await callEngine(engine, prompt, () => {}, maxTokens);
      if (result.text && result.text.trim()) return result.text;
      lastError = Object.assign(new Error(`${engineLabel(engine)}가 빈 답을 줬어요`), { code: "empty" });
    } catch (error) {
      lastError = error;
      if (error.code === "rate_limited") handleRateLimit(engine, error);
      if (error.code === "locked") throw error;
    }
  }
  throw lastError || Object.assign(new Error(aiUnavailableReason()), { code: "no_engine" });
}

const ASSISTANT_RULES = "너는 프롬프트 작성을 돕는 일반 AI 어시스턴트다. 캐릭터나 말투 연기 없이, 정중하고 담백한 한국어로 답한다.";

function buildAnalyzePrompt(helper) {
  return [ASSISTANT_RULES,
    `사용자가 다른 AI(${promptTargetOf(helper.target).hint})에게 보낼 프롬프트 초안을 점검한다.`,
    "점검 기준: 목표와 최종 결과물, 배경·맥락, 대상 독자/사용자, 출력 형식·분량, 제약·금지사항, 성공 기준, 톤, 필요한 입력 자료, 모호하거나 서로 충돌하는 표현.",
    `규칙: 초안에 이미 있는 건 묻지 않는다. 결과 품질에 큰 영향을 주는데 실제로 빠진 것만, 중요한 순서로 최대 ${PROMPT_MAX_QUESTIONS}개 질문한다(충분하면 0개).`,
    "각 질문에는 사용자가 바로 고를 수 있는 구체적인 선택지 2~4개를 단다. 질문과 선택지는 짧게.",
    "issues에는 빠진 점·고치면 좋은 점을 한 줄씩(최대 5개). 초안이 이미 좋으면 좋은 점을 짧게 말해도 된다.",
    "반드시 아래 JSON만 출력한다. 코드블록·설명 금지.",
    '{"summary":"이 프롬프트가 하려는 일 한 줄","issues":["..."],"questions":[{"id":"q1","question":"...","options":["...","..."]}]}',
    "", "[초안]", helper.draft.slice(0, PROMPT_DRAFT_LIMIT)].join("\n");
}

function answersAsText(helper) {
  const questions = helper.analysis?.questions || [];
  return questions.map(question => {
    const answer = helper.answers[question.id] || {};
    const value = [answer.choice, answer.text].filter(Boolean).join(" / ") || LEAVE_IT_TO_AI;
    return `- ${question.question} → ${value}`;
  }).join("\n");
}

function buildWritePrompt(helper, feedback = "") {
  const lines = [ASSISTANT_RULES,
    `아래 초안을 다른 AI(${promptTargetOf(helper.target).hint})에게 그대로 붙여넣어 쓸 완성 프롬프트로 다시 쓴다.`,
    "원칙: 초안의 의도와 내용은 지킨다. 사용자의 답을 반영한다. '알아서 정해줘'인 항목은 합리적인 기본값을 정해 자연스럽게 넣는다.",
    "필요하면 역할·맥락·할 일·요구사항·출력 형식 순으로 구조화하되, 목적에 비해 과하게 길게 만들지 않는다. 초안과 같은 언어로 쓴다.",
    "출력 형식(이 구분선을 정확히 지킬 것):", "===PROMPT===", "(완성 프롬프트 본문만)", "===CHANGES===", "- 무엇을 왜 바꿨는지 한 줄씩, 최대 5줄",
    "", "[초안]", helper.draft.slice(0, PROMPT_DRAFT_LIMIT)];
  const answers = answersAsText(helper);
  if (answers) lines.push("", "[빠진 부분에 대한 사용자의 답]", answers);
  if (feedback && helper.result?.prompt) lines.push("", "[직전에 만든 프롬프트]", helper.result.prompt.slice(0, PROMPT_DRAFT_LIMIT), "", "[사용자의 추가 요청 — 이걸 반영해 다시 써라]", feedback);
  return lines.join("\n");
}

// AI 답에서 JSON 객체만 꺼낸다. 코드블록·앞뒤 설명이 붙어도 첫 { ~ 마지막 } 구간을 시도.
function parseAnalysis(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  try {
    const data = JSON.parse(text.slice(start, end + 1));
    const questions = (Array.isArray(data.questions) ? data.questions : []).slice(0, PROMPT_MAX_QUESTIONS)
      .filter(question => question && typeof question.question === "string")
      .map((question, index) => ({ id: `q${index + 1}`, question: question.question.trim(), options: (Array.isArray(question.options) ? question.options : []).map(String).filter(Boolean).slice(0, 4) }));
    return { summary: String(data.summary || "").trim(), issues: (Array.isArray(data.issues) ? data.issues : []).map(String).slice(0, 5), questions };
  } catch (error) {
    return { summary: "", issues: [text.trim().slice(0, 600)], questions: [] };
  }
}

function parseWritten(text) {
  const promptMatch = text.split("===PROMPT===")[1];
  if (!promptMatch) return { prompt: text.trim(), changes: [] };
  const [promptPart, changesPart = ""] = promptMatch.split("===CHANGES===");
  const changes = changesPart.split("\n").map(line => line.replace(/^\s*[-*•]\s*/, "").trim()).filter(Boolean).slice(0, 5);
  return { prompt: promptPart.trim().replace(/^```[a-z]*\n?|```$/g, "").trim(), changes };
}

function promptErrorMessage(error) {
  if (error.code === "locked" || error.code === "no_engine") return "실제 AI 연결이 필요해요. 위의 🔒 코드 입력으로 접속 코드를 넣어 주세요.";
  if (error.code === "rate_limited") return "오늘 AI 사용 한도에 걸렸어요. 잠시 뒤 다시 해 주세요.";
  return `AI 응답을 받지 못했어요 (${error.message || "알 수 없는 오류"})`;
}

// 버튼 하나를 잠시 '작업 중'으로 바꾸고 작업이 끝나면 화면을 다시 그린다.
async function runPromptStep(button, label, task) {
  if (promptHelperBusy) return;
  if (!promptHelperEngine()) { showToast(promptErrorMessage({ code: "no_engine" })); return; }
  promptHelperBusy = true;
  button.disabled = true;
  button.textContent = label;
  playSound("send");
  try {
    await task();
    saveState();
    playSound("receive");
  } catch (error) {
    showToast(promptErrorMessage(error));
  }
  promptHelperBusy = false;
  if (document.getElementById("zoom").classList.contains("show") && document.querySelector(".promptCard")) renderPromptHelper();
}

async function analyzeDraft(button) {
  const helper = promptHelperState();
  if (!helper.draft.trim()) { showToast("먼저 프롬프트를 적어 주세요"); return; }
  await runPromptStep(button, "점검하는 중…", async () => {
    helper.analysis = parseAnalysis(await askPromptAi(buildAnalyzePrompt(helper), PROMPT_ANALYZE_TOKENS));
    helper.answers = {};
    helper.result = null;
  });
}

async function writePrompt(button, feedback = "") {
  const helper = promptHelperState();
  await runPromptStep(button, feedback ? "다시 다듬는 중…" : "프롬프트 쓰는 중…", async () => {
    helper.result = parseWritten(await askPromptAi(buildWritePrompt(helper, feedback), PROMPT_WRITE_TOKENS));
  });
}

/* ---------- 화면 ---------- */
function renderDraftSection(helper) {
  const textarea = el("textarea", { class: "promptDraft", rows: "7", placeholder: "AI에게 보낼 프롬프트 초안을 적거나 붙여넣으세요.\n예) 우리 동아리 홍보 포스터 문구 써줘" });
  textarea.value = helper.draft;
  textarea.addEventListener("input", () => { helper.draft = textarea.value; savePromptHelperSoon(); });
  const targetChips = el("div", { class: "promptChips" }, PROMPT_TARGETS.map(target => el("button", {
    type: "button", class: "promptChip" + (helper.target === target.id ? " picked" : ""), text: target.label,
    onclick: () => { helper.target = target.id; saveState(); renderPromptHelper(); }
  })));
  const analyzeButton = el("button", { class: "btn pink", type: "button", text: helper.analysis ? "🔍 다시 점검" : "🔍 점검하기" });
  analyzeButton.addEventListener("click", () => analyzeDraft(analyzeButton));
  const quickButton = el("button", { class: "btn soft", type: "button", text: "⚡ 질문 없이 바로 다듬기" });
  quickButton.addEventListener("click", () => { helper.analysis = null; helper.answers = {}; writePrompt(quickButton); });
  return el("div", { class: "promptStep" },
    el("label", { class: "promptLabel", text: "① 내 프롬프트" }), textarea,
    el("label", { class: "promptLabel", text: "어디에 쓸 프롬프트인가요?" }), targetChips,
    el("div", { class: "promptActions" }, analyzeButton, quickButton));
}

function renderQuestion(helper, question) {
  const answer = helper.answers[question.id] ||= {};
  const options = [...question.options, LEAVE_IT_TO_AI].map(option => el("button", {
    type: "button", class: "promptChip" + (answer.choice === option ? " picked" : ""), text: option,
    onclick: () => { answer.choice = answer.choice === option ? "" : option; renderPromptHelper(); }
  }));
  const custom = el("input", { class: "promptCustom", type: "text", placeholder: "직접 입력 (선택)" });
  custom.value = answer.text || "";
  custom.addEventListener("input", () => { answer.text = custom.value; savePromptHelperSoon(); });
  return el("div", { class: "promptQuestion" }, el("b", { text: question.question }), el("div", { class: "promptChips" }, options), custom);
}

function renderAnalysisSection(helper) {
  const analysis = helper.analysis;
  if (!analysis) return null;
  const writeButton = el("button", { class: "btn pink", type: "button", text: helper.result ? "✍️ 답 반영해서 다시 쓰기" : "✍️ 프롬프트 작성" });
  writeButton.addEventListener("click", () => writePrompt(writeButton));
  return el("div", { class: "promptStep" },
    el("label", { class: "promptLabel", text: "② 점검 결과" }),
    analysis.summary ? el("p", { class: "promptSummary", text: `🎯 ${analysis.summary}` }) : null,
    analysis.issues.length ? el("ul", { class: "promptIssues" }, analysis.issues.map(issue => el("li", { text: issue }))) : null,
    analysis.questions.length
      ? [el("label", { class: "promptLabel", text: "빠진 부분, 어떻게 할까요? (안 고르면 알아서 정해요)" }), ...analysis.questions.map(question => renderQuestion(helper, question))]
      : el("p", { class: "promptSummary", text: "✅ 꼭 물어볼 빈칸은 없어요. 바로 다듬어 드릴게요." }),
    el("div", { class: "promptActions" }, writeButton));
}

function renderResultSection(helper) {
  const result = helper.result;
  if (!result) return null;
  const output = el("textarea", { class: "promptResult", rows: "10" });
  output.value = result.prompt;
  output.addEventListener("input", () => { result.prompt = output.value; savePromptHelperSoon(); });
  const feedback = el("input", { class: "promptCustom", type: "text", placeholder: "더 고칠 점 (예: 더 짧게, 표로 받게, 영어로)" });
  const refineButton = el("button", { class: "btn soft", type: "button", text: "🔁 다시 다듬기" });
  refineButton.addEventListener("click", () => {
    if (!feedback.value.trim()) { showToast("어떻게 고칠지 적어 주세요"); feedback.focus(); return; }
    writePrompt(refineButton, feedback.value.trim());
  });
  feedback.addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing) refineButton.click(); });
  return el("div", { class: "promptStep" },
    el("label", { class: "promptLabel", text: "③ 완성된 프롬프트" }), output,
    result.changes.length ? el("ul", { class: "promptIssues changes" }, result.changes.map(change => el("li", { text: change }))) : null,
    el("div", { class: "promptActions" },
      el("button", { class: "btn pink", type: "button", text: "📋 복사", onclick: () => copyText(output.value) }),
      el("button", { class: "btn soft", type: "button", text: "↩︎ 이걸 초안으로", onclick: () => { helper.draft = output.value; helper.analysis = null; helper.result = null; saveState(); renderPromptHelper(); } })),
    el("div", { class: "promptRefine" }, feedback, refineButton));
}

function renderPromptHelper() {
  const helper = promptHelperState();
  const zoom = document.getElementById("zoom");
  const reset = el("button", { class: "promptReset", type: "button", text: "새로 시작", onclick: () => {
    Object.assign(helper, { draft: "", analysis: null, answers: {}, result: null }); saveState(); renderPromptHelper();
  } });
  const close = el("button", { class: "promptClose", type: "button", title: "닫기", text: "✕", onclick: () => { saveState(); zoom.classList.remove("show"); } });
  const card = el("div", { class: "zoomCard chunky wide promptCard", "data-sticky": true, onclick: event => event.stopPropagation() },
    el("div", { class: "promptHead" }, el("h3", { text: "✨ 프롬프트 도우미" }), el("div", { class: "promptHeadButtons" }, reset, close)),
    el("small", { class: "promptIntro", text: "초안을 점검해 빠진 부분을 물어보고, 답을 반영해 완성 프롬프트를 써 드려요." }),
    renderDraftSection(helper), renderAnalysisSection(helper), renderResultSection(helper));
  const scrollTop = zoom.querySelector(".promptCard")?.scrollTop || 0;
  zoom.replaceChildren(card);
  card.scrollTop = scrollTop;
  return card;
}

// draftText를 주면(기획방 입력칸 내용 등) 그걸 새 초안으로 시작하고, 없으면 쓰던 작업을 그대로 연다.
function openPromptHelper(draftText) {
  const draft = typeof draftText === "string" ? draftText.trim() : "";
  if (draft) Object.assign(promptHelperState(), { draft, analysis: null, answers: {}, result: null });
  renderPromptHelper();
  document.getElementById("zoom").classList.add("show");
  playSound("panelOpen");
}
