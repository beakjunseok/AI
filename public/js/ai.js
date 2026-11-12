/* ================= AI 공급자 · 무료 한도 · 서버 연결 ================= */
// 모델별 강점과 역할. 실제 표시 정보는 서버 카탈로그(/api/providers)가 오면 그걸로 덮어쓴다.
const MODEL_PROVIDERS = {
  gemini: { label: "Gemini", color: "#4285f4", rank: "서브",
    strengths: "비주얼/디자인 감각 · 이미지 이해(멀티모달) · 긴 문맥 · 빠른 Flash", duty: "디자인 담당 + 대타 1순위" },
  gpt: { label: "GPT-OSS", color: "#10a37f", rank: "크리에이티브",
    strengths: "아이디어 발산 · 카피/네이밍 · 빠른 응답 (OpenAI 공개 모델 gpt-oss-120b, Groq 무료)", duty: "크리에이티브 전담 (뮤트 담당)" }
};
const FALLBACK_ORDER = ["gemini", "gpt"];

// 무료 한도(참고치). 정확한 값은 각 콘솔 기준. resetZone: 하루 한도가 리셋되는 기준 시간대.
const PROVIDER_QUOTAS = {
  gemini: { daily: 250, perMinute: 10, resetZone: "America/Los_Angeles", source: "AI Studio 무료(Flash) · RPD는 태평양 자정 리셋" },
  gpt: { daily: 1000, perMinute: 30, resetZone: "UTC", source: "Groq 무료 gpt-oss-120b · 하루 20만 토큰 · 리셋 시각은 추정(콘솔 확인)" }
};

// 특정 시간대의 다음 자정까지 남은 ms. DST는 Intl이 처리. O(1)
function msUntilMidnight(timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date()).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  const elapsed = ((parts.hour % 24) * 3600 + parts.minute * 60 + parts.second) * 1000;
  return 86400000 - elapsed;
}

function dayKeyIn(timeZone) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: timeZone || "Asia/Seoul" }).format(new Date());
}

// 공급자별 오늘 사용량. 리셋 기준 날짜가 바뀌면 0으로 초기화.
function usageOf(modelKey) {
  state.usage = state.usage || {};
  const zone = quotaInfo(modelKey).resetZone;
  const day = dayKeyIn(zone);
  if (!state.usage[modelKey] || state.usage[modelKey].day !== day) state.usage[modelKey] = { day, count: 0 };
  return state.usage[modelKey];
}

function quotaLeft(modelKey) {
  const daily = quotaInfo(modelKey).daily;
  return daily == null ? Infinity : Math.max(0, daily - usageOf(modelKey).count);
}

function recordUsage(modelKey) { usageOf(modelKey).count += 1; }

function formatReset(modelKey) {
  const zone = quotaInfo(modelKey).resetZone;
  if (!zone) return "리셋: 플랜 기준";
  const remaining = msUntilMidnight(zone);
  const resetAt = new Date(Date.now() + remaining).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const hours = Math.floor(remaining / 3600000), minutes = Math.floor((remaining % 3600000) / 60000);
  return `리셋 ${resetAt} (${hours}시간 ${minutes}분 후)`;
}

function quotaLine(modelKey) {
  const quota = quotaInfo(modelKey);
  const used = usageOf(modelKey).count;
  return quota.daily == null ? `오늘 ${used}회 사용 · 한도 비공개` : `남은 업무량 ${quotaLeft(modelKey)}/${quota.daily} · ${formatReset(modelKey)}`;
}

// 서버 카탈로그로 늘어날 수 있는 공급자 정보 조회. 모르는 키도 안전한 기본값을 돌려준다.
const providerInfo = modelKey => MODEL_PROVIDERS[modelKey] || { label: String(modelKey || "?"), color: "#555", rank: "?", strengths: "", duty: "" };
const quotaInfo = modelKey => PROVIDER_QUOTAS[modelKey] || { daily: null, perMinute: null, resetZone: null, source: "" };

// /api/providers 의 catalog를 페이지의 공급자/한도 표에 합친다. 새 AI가 페이지 수정 없이 붙는 지점.
function mergeServerCatalog(catalog) {
  if (!catalog || typeof catalog !== "object") return;
  Object.entries(catalog).forEach(([key, info]) => {
    if (!info || typeof info.label !== "string") return;
    MODEL_PROVIDERS[key] = Object.assign({}, MODEL_PROVIDERS[key], { label: info.label, color: info.color || "#555", rank: info.rank || "", strengths: info.strengths || "", duty: info.duty || "" });
    PROVIDER_QUOTAS[key] = { daily: info.daily ?? null, perMinute: info.perMinute ?? null, resetZone: info.resetZone || null, source: info.source || "" };
  });
}

const MODEL_PLAN_VERSION = 3;

// 담당 모델 → Gemini → GPT-OSS 순으로 대타 체인을 만든다.
const fallbackChain = modelKey => [...new Set([modelKey, ...FALLBACK_ORDER, ...Object.keys(MODEL_PROVIDERS)])];

// 서버(Vercel 함수)에 키가 설정돼 있고 오늘 한도가 남았으면 부를 수 있다.
let serverProviders = new Set();

function isProviderAvailable(modelKey) {
  return serverProviders.has(modelKey) && quotaLeft(modelKey) > 0;
}

// 한 엔진 호출: 같은 출처의 /api/chat(Vercel 함수)로 보낸다. API 키는 서버에만 있다.
async function callEngine(engine, prompt, onText, maxTokens = DEFAULT_MAX_TOKENS) {
  const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json", "x-access-code": storedAccessCode() }, body: JSON.stringify({ provider: engine, prompt, maxTokens }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `HTTP ${response.status}`);
    error.code = data.code || (response.status === 429 ? "rate_limited" : response.status === 401 ? "locked" : "upstream_error");
    throw error;
  }
  onText({ text: data.text || "" });
  return { text: data.text || "", truncated: false };
}

// 한도 초과 응답을 받으면 오늘 남은 양을 0으로 만들어 다음 대타로 넘어가게 한다.
function markExhausted(engine) {
  const daily = quotaInfo(engine).daily;
  if (daily != null) usageOf(engine).count = daily;
}

// 접속 코드는 이 브라우저에만 저장한다(서버는 매 요청 헤더로 확인).
const ACCESS_STORAGE_KEY = "ai-office-access-code";
let serverLocked = false;

function storedAccessCode() {
  try { return localStorage.getItem(ACCESS_STORAGE_KEY) || ""; } catch (error) { return ""; }
}

function saveAccessCode(code) {
  try { localStorage.setItem(ACCESS_STORAGE_KEY, code); } catch (error) { /* 저장 불가 */ }
}

// 서버에서 키가 설정된 공급자 목록을 받는다. 접속 코드가 틀리면 잠금 상태로 표시. 서버가 없으면(file://) 시뮬레이션.
async function connectServer() {
  if (!/^https?:$/.test(location.protocol)) return false;
  try {
    const response = await fetch("/api/providers", { cache: "no-store", headers: { "x-access-code": storedAccessCode() } });
    if (!response.ok) return false;
    const data = await response.json();
    if (!Array.isArray(data.providers)) return false;
    serverLocked = Boolean(data.locked);
    mergeServerCatalog(data.catalog);
    serverProviders = new Set(data.providers.filter(name => MODEL_PROVIDERS[name]));
    document.getElementById("lockPill").hidden = !serverLocked;
    updateAiBadge();
    return !serverLocked;
  } catch (error) { return false; }
}

// 접속 코드 입력 창. 맞으면 그 브라우저에 기억해 둔다.
function openAccessPrompt() {
  const zoom = document.getElementById("zoom");
  const input = el("input", { type: "password", placeholder: "접속 코드", autocomplete: "off", style: "width:100%;margin-top:10px" });
  const form = el("form", { onclick: event => event.stopPropagation() }, input,
    el("button", { class: "btn pink", type: "submit", style: "width:100%;margin-top:8px", text: "잠금 해제" }));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    saveAccessCode(input.value.trim());
    const unlocked = await connectServer();
    if (unlocked) { zoom.classList.remove("show"); playSound("granted"); showToast("🔓 잠금 해제! 진짜 AI가 연결됐어요"); }
    else { playSound("error"); showToast("코드가 맞지 않아요"); }
  });
  zoom.replaceChildren(el("div", { class: "zoomCard chunky", onclick: event => event.stopPropagation() },
    el("h3", { text: "🔒 접속 코드" }),
    el("p", { text: "AI 호출은 접속 코드가 있어야 돼요. 한 번 입력하면 이 브라우저는 기억해요." }), form));
  zoom.classList.add("show");
  setTimeout(() => input.focus(), 50);
}

function pickEngine(modelKey) {
  return fallbackChain(modelKey).find(isProviderAvailable) || null;
}

// 지금 사무실(프로젝트)의 종류를 AI 프롬프트에 넣을 한 줄로. 일반 기획이면 빈 문자열.
// 링크(GitHub·웹 주소)와 저장해 둔 코드도 함께 넣는다. 코드는 길면 앞부분만(codeLimit 글자).
function projectContextLine(codeLimit = 3000) {
  const project = findProject(state.activeProjectId);
  const kind = projectKindOf(project);
  const lines = [];
  if (kind.context) lines.push(`[프로젝트 종류: ${kind.icon} ${kind.label}] ${kind.context}`);
  if (project?.repoUrl) lines.push(`GitHub 저장소: ${project.repoUrl}`);
  if (project?.siteUrl) lines.push(`배포된 웹 주소: ${project.siteUrl}`);
  if (codeLimit > 0 && project?.code?.trim()) {
    const code = project.code.trim();
    lines.push(`현재 작성된 코드(${code.length > codeLimit ? `앞 ${codeLimit}자만` : "전체"}):\n\`\`\`\n${code.slice(0, codeLimit)}\n\`\`\``);
  }
  return lines.join("\n");
}
