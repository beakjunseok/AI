/* ================= 정적 데이터 ================= */
// 16x18 치비 템플릿. H머리 S피부 R볼터치 C옷 P바지 B신발 (눈·입은 표정별로 따로 그린다)

// 모델별 강점과 위계. Claude = 총괄 + 대타 1순위, Gemini = 2순위, GPT = 크리에이티브 전담.
const MODEL_PROVIDERS = {
  claude: { label: "Claude", color: "#d97757", callableFromPage: true, rank: "총괄",
    strengths: "코딩 · 코드 리뷰/검증 · 긴 추론 · 기획 정리", duty: "대부분의 역할 + 대타 총괄(1순위)" },
  gemini: { label: "Gemini", color: "#4285f4", callableFromPage: false, rank: "서브",
    strengths: "비주얼/디자인 감각 · 이미지 이해(멀티모달) · 긴 문맥 · 빠른 Flash", duty: "디자인 담당 + 대타 2순위" },
  gpt: { label: "GPT-OSS", color: "#10a37f", callableFromPage: false, rank: "크리에이티브",
    strengths: "아이디어 발산 · 카피/네이밍 · 빠른 응답 (OpenAI 공개 모델 gpt-oss-120b, Groq 무료)", duty: "크리에이티브 전담 (뮤트 담당)" }
};
const FALLBACK_ORDER = ["claude", "gemini"];

// 무료 한도(참고치). 정확한 값은 각 콘솔 기준. resetZone: 하루 한도가 리셋되는 기준 시간대.
const PROVIDER_QUOTAS = {
  claude: { daily: null, perMinute: null, resetZone: null, source: "claude.ai 플랜 사용량과 공유 · 한도 비공개" },
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

// 담당 모델 → Claude → Gemini 순으로 대타 체인을 만든다.
const fallbackChain = modelKey => [...new Set([modelKey, ...FALLBACK_ORDER, ...Object.keys(MODEL_PROVIDERS)])];

// 지금 이 페이지에서 실제로 부를 수 있는지. (외부 API는 서버 프록시가 생기면 여기서 true로)
let serverProviders = new Set(); // 로컬 서버(server.py)에 키가 설정된 공급자

function isProviderAvailable(modelKey) {
  const viaPage = modelKey === "claude" && Boolean(sampleApi);
  const viaServer = serverProviders.has(modelKey);
  return (viaPage || viaServer) && quotaLeft(modelKey) > 0;
}

// 한 엔진 호출. Claude는 페이지 내장(sample) 우선, 나머지는 같은 출처의 /api/chat(로컬 서버)로 보낸다.
async function callEngine(engine, prompt, onText, maxTokens = DEFAULT_MAX_TOKENS) {
  if (engine === "claude" && sampleApi) return sampleApi(prompt, { modelTier: "quick", cache: false, onText });
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

// 같은 출처에 server.py가 떠 있으면 키가 설정된 공급자를 받아온다. 아티팩트에선 404라 조용히 무시.
const ACCESS_STORAGE_KEY = "ai-office-access-code";
let serverLocked = false;

function storedAccessCode() {
  try { return localStorage.getItem(ACCESS_STORAGE_KEY) || ""; } catch (error) { return ""; }
}

function saveAccessCode(code) {
  try { localStorage.setItem(ACCESS_STORAGE_KEY, code); } catch (error) { /* 저장 불가 */ }
}

// 서버(Vercel 함수 또는 server.py)가 있으면 공급자 목록을 받는다. 접속 코드가 틀리면 잠금 상태로 표시.
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
    if (unlocked) { zoom.classList.remove("show"); showToast("🔓 잠금 해제! 진짜 AI가 연결됐어요"); }
    else showToast("코드가 맞지 않아요");
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

const ROLE_LABELS = { plan: "기획", design: "디자인", code: "코딩", qa: "검증", sound: "사운드" };
const ROLE_TASK_TEMPLATES = {
  plan: ["기획서 v{n} 작성", "유저 시나리오 정리", "일정표 업데이트", "레퍼런스 조사"],
  design: ["메인 화면 시안", "아이콘 세트 제작", "캐릭터 스프라이트", "컬러 팔레트 정리"],
  code: ["입력 판정 로직", "저장/불러오기 기능", "버그 #{n} 수정", "성능 최적화"],
  qa: ["회귀 테스트", "엣지 케이스 점검", "{target} 검수"],
  sound: ["메인 BGM 루프", "효과음 세트", "오디오 싱크 보정"]
};
const ROLE_OUTPUTS = {
  plan: ["핵심 재미 3줄 요약 + 마일스톤 4단계 정리!", "타깃 유저 2명 페르소나와 첫 5분 플로우 완성!", "일정 2일 당겼어요. 다들 할 수 있죠?"],
  design: ["시안 A/B/C 세 가지, 다크 테마 기준으로 뽑았어요.", "아이콘 24종, 2px 라운드로 통일했어요.", "메인 #4DE8FF, 경고 #FF5A36으로 토큰 정리."],
  code: ["판정 윈도우 ±45ms, 프레임 독립적으로 변경.", "저장 + 손상 데이터 복구 로직 추가.", "O(n²) 루프 하나 봉인 완료. 이제 O(n log n)."],
  qa: ["재현 경로 3개, 이슈 2건 등록. 끝.", "엣지 케이스 14개 중 1개 실패.", "통과. 특이사항 없음."],
  sound: ["128BPM 메인 루프, 이음새 없이…", "효과음 12종… 타격감 위주로…", "입력 지연 보정값 -18ms 찾았어요…"]
};

const rowFill = (y, fromX, toX, color) => Array.from({ length: toX - fromX + 1 }, (_, index) => [fromX + index, y, color]);
const roundGlasses = color => [[3,6],[3,7],[6,6],[6,7],[4,5],[5,5],[4,8],[5,8],[9,6],[9,7],[12,6],[12,7],[10,5],[11,5],[10,8],[11,8],[7,6],[8,6]].map(([x, y]) => [x, y, color]);

const AGENT_PRESETS = [
  {
    id: "lumi", name: "칸반", roleKey: "plan", speed: 1.0, defaultModel: "gemini",
    persona: "열정 과다 PM. 뭐든 '할 수 있다!'로 시작하고 일정표와 회의를 사랑한다. 사원증을 늘 목에 걸고 있다.",
    palette: { hair: "#5b3a29", shirt: "#33475c", chair: "#1d2733" },
    accessory: [[6,11,"#e6edf3"],[9,11,"#e6edf3"],[7,12,"#e6edf3"],[8,12,"#e6edf3"],[7,13,"#ffffff"],[8,13,"#4de8ff"],[7,14,"#ffffff"],[8,14,"#ffffff"]],
    items: [{ icon: "📋", name: "화이트보드", line: "오늘 할 일 17개! 다 할 수 있어요!" }, { icon: "☕", name: "세 번째 커피", line: "이건 연료예요. 아직 세 잔밖에 안 마셨어요." }],
    lines: {
      greet: ["네! 부르셨어요?!", "회의예요? 회의죠?!"], grab: ["어어? 저 어디 가요? 회의실이면 좋겠다!"], drop: ["좋아, 여기서 바로 킥오프!", "자리 좋네요! 시작해 볼까요?"],
      working: ["일정 당겨도 되죠?", "이거 끝나면 회의 한 번 해요!", "할 수 있다!!"], done: ["완료! 다음 거 주세요!", "체크 표시 하는 순간이 제일 좋아요"],
      idle: ["일 없어요? 진짜요?", "대기실 너무 조용해요…"], complain: ["다들 진행 상황 공유 좀…!"],
      pet: ["오 감사합니다! 바로 다음 스프린트 갑니다!", "칭찬 받았으니 일정 하나 추가!"], petSpam: ["칭찬은 회고 때 몰아서 해주세요!"], snack: ["연료 보급 완료! 오늘 일정 하나 더 추가!"],
      sleepTalk: ["으음… 일정표… 다 지웠어…", "Zzz… 킥오프…"], wake: ["다시 달려볼까요!"], dizzy: ["세상이 빙글빙글… 일정도 빙글빙글…"],
      cat: ["고양이다!! 회의 참석자 +1!"], chat: ["우리 회의 한 번 할까요?!", "오늘 목표는 100% 달성!"], reply: ["좋아요! 할 수 있다!", "그거 제가 일정에 넣을게요!"]
    }
  },
  {
    id: "moka", name: "픽셀", roleKey: "design", speed: 0.9, defaultModel: "gemini",
    persona: "디테일 집착형 UI 디자이너. 픽셀 단위 정렬과 색상 코드에 진심이고, 비니를 쓴다.",
    palette: { hair: "#8d5a3b", shirt: "#3d4b45", chair: "#2d3b36" },
    accessory: [...rowFill(-1, 5, 10, "#5c6370"), ...rowFill(0, 3, 12, "#5c6370"), ...rowFill(1, 2, 13, "#4b5160"), ...rowFill(2, 2, 13, "#4de8ff")],
    items: [{ icon: "🖊️", name: "타블렛 펜", line: "Figma 단축키는 전부 외웠어요." }, { icon: "🎨", name: "컬러 칩", line: "#3FB950. 이 초록이 이번 프로젝트 메인이에요." }],
    lines: {
      greet: ["디자인 리뷰예요?", "시안 보러 오셨어요?"], grab: ["앗, 펜 떨어뜨렸어요!", "잠깐만요, 레이어 저장 중이었는데"], drop: ["여기 모니터 색 정확도 괜찮네요", "자리 세팅 완료"],
      working: ["여백을 조금만 더…", "이 색 너무 쨍한가?", "폰트 바꿔볼게요"], done: ["시안 나왔어요! 세 가지 버전이에요", "픽셀 퍼펙트. 확인 부탁해요"],
      idle: ["레퍼런스 수집 중이에요", "Dribbble 구경 중…"], complain: ["피드백이 '예쁘게'면 곤란한데요…"],
      pet: ["오, 이 피드백은 저장해 둘게요."], petSpam: ["비니 벗겨져요… 그만…!"], snack: ["피자 색감 #E8A33D… 좋네요."],
      sleepTalk: ["Zzz… 그라데이션…"], wake: ["꿈에서 좋은 레이아웃 봤어요."], dizzy: ["색이 다 섞여 보여요… 회색이야…"],
      cat: ["이 고양이 색, 팔레트에 추가."], chat: ["이 버튼 radius 8px로 갈까요?", "여백 8px 단위로 맞출게요"], reply: ["오 그 조합 좋다!", "그럼 제가 예쁘게 다듬을게요"]
    }
  },
  {
    id: "bit", name: "커널", roleKey: "code", speed: 1.1, defaultModel: "gpt",
    persona: "뼛속까지 개발자. 다크모드 신봉자에 살짝 중2병이라 버그를 '봉인된 존재'라고 부른다. 검은 후드티가 유니폼.",
    palette: { hair: "#2b2b3a", shirt: "#1c2026", chair: "#2a1714" },
    accessory: [...roundGlasses("#8b949e"), [4,6,"#4de8ff"], [10,6,"#4de8ff"], [6,13,"#4de8ff"],[7,13,"#4de8ff"],[8,13,"#4de8ff"],[9,13,"#4de8ff"]],
    items: [{ icon: "🐠", name: "어항", line: "얘 이름은 null이야. 분명 있는데 없는 존재지." }, { icon: "⌨️", name: "기계식 키보드", line: "적축이다. 갈축 쓰는 자와는 대화하지 않는다." }],
    lines: {
      greet: ["…불렀나. 커밋 중이었다.", "용건을 말해라. 짧게."], grab: ["잠깐, 아직 커밋 안 했다고!!", "건드리지 마라… 내 안의 레거시가 깨어난다"], drop: ["…좋아. 이 자리, 와이파이가 강하군", "봉인 해제. 작업을 재개한다"],
      working: ["로컬에선 되는데…", "이 버그, 보통 놈이 아니다", "console.log 47개째"], done: ["머지 완료. 오늘 밤은 평화롭군", "테스트 통과… 이게 왜 되지?"],
      idle: ["금요일엔 배포 안 한다", "다크모드 아니면 눈이 녹아"], complain: ["요구사항이 또 바뀌었다고…?"],
      pet: ["…크흠. 나쁘지 않군.", "쓰다듬기 API 호출 확인."], petSpam: ["과도한 요청. 429 Too Many Pets."], snack: ["카페인 수혈 완료. 버그를 사냥하러 간다"],
      sleepTalk: ["Zzz… 세미콜론…", "…빌드 실패… 으음…"], wake: ["…재부팅 완료."], dizzy: ["스택 오버플로우… 세상이 무한 재귀한다…"],
      cat: ["키보드 위로 올라오지 마라… 커밋된다…"], chat: ["이거 버그 아니고 기능이야", "다크모드로 바꿔도 되지?"], reply: ["그건 로컬에선 됐다", "…TODO에 적어 두지"]
    }
  },
  {
    id: "dubu", name: "어서트", roleKey: "qa", speed: 0.8, defaultModel: "gpt",
    persona: "노잼 FM 검증 담당. 감정 표현이 거의 없고 짧고 건조하게 말하며 재현 경로에 집착한다. 넥타이를 맨다.",
    palette: { hair: "#c9c2b2", shirt: "#4a525c", chair: "#22282f" },
    accessory: [...roundGlasses("#7d7d7d"), [7,11,"#e07a5f"],[8,11,"#e07a5f"],[7,12,"#e07a5f"],[8,12,"#e07a5f"],[7,13,"#c9604a"],[8,13,"#c9604a"]],
    items: [{ icon: "🧪", name: "테스트 케이스함", line: "케이스 214개. 재미는 없습니다." }, { icon: "📏", name: "자", line: "여백 2px 틀렸습니다." }],
    lines: {
      greet: ["네.", "용건 말씀하세요."], grab: ["…네.", "이동 사유를 알려주세요."], drop: ["착석했습니다.", "자리 확인. 이상 없음."],
      working: ["재현 중입니다.", "재현 경로 주세요.", "이건 버그입니다."], done: ["검증 완료. 이슈 3건.", "통과. 별 감흥 없습니다."],
      idle: ["대기 중.", "…"], complain: ["아직도요?", "솔직히 별로입니다."],
      pet: ["…감사합니다.", "호감도 1 상승. 기록했습니다."], petSpam: ["그만 하세요."], snack: ["열량 확인. 섭취합니다."],
      sleepTalk: ["…재현… 경로…", "Zzz. (정확히 8시간 수면 예정)"], wake: ["기상. 업무 재개."], dizzy: ["…어지럽습니다. 버그 리포트 올리겠습니다."],
      cat: ["고양이 1마리 감지. 이상 없음."], chat: ["이거 테스트 해보셨어요?", "아직도요?"], reply: ["그건 버그입니다.", "확인했습니다."]
    }
  },
  {
    id: "sol", name: "뮤트", roleKey: "sound", speed: 0.95, defaultModel: "gpt",
    persona: "수줍음 많은 사운드 담당. 말끝을 흐리지만 음악 얘기만 나오면 눈이 반짝인다. 헤드폰을 늘 낀다.",
    palette: { hair: "#3c3c3c", shirt: "#b8401f", chair: "#2a1a14" },
    accessory: [...rowFill(-1, 4, 11, "#30363d"), [3,0,"#30363d"],[2,1,"#30363d"],[1,2,"#30363d"],[12,0,"#30363d"],[13,1,"#30363d"],[14,2,"#30363d"],
                [0,5,"#30363d"],[0,6,"#30363d"],[0,7,"#30363d"],[1,5,"#4de8ff"],[1,6,"#4de8ff"],[1,7,"#30363d"],
                [15,5,"#30363d"],[15,6,"#30363d"],[15,7,"#30363d"],[14,5,"#4de8ff"],[14,6,"#4de8ff"],[14,7,"#30363d"]],
    items: [{ icon: "🎧", name: "헤드폰", line: "이거 끼면… 세상이 조용해져요…" }, { icon: "🎹", name: "미니 건반", line: "이 코드 진행, 들어볼래요…? 아, 아니에요…" }],
    lines: {
      greet: ["저, 저요…? 네…!", "아… 안녕하세요…"], grab: ["히익…! 저, 저요…?", "헤드폰 줄 엉켰어요…"], drop: ["여기… 괜찮은 것 같아요…", "조용해서 좋아요…"],
      working: ["BPM… 128로 갈게요…", "킥이 좀 약한가…", "(흥얼흥얼)"], done: ["다 됐어요… 들어봐 주실래요…?", "루프 이음새 안 들리죠…?"],
      idle: ["…(헤드폰 착용 중)", "소리 수집하는 중이에요…"], complain: ["저… 피드백 언제 주세요…?"],
      pet: ["아… 감, 감사합니다…"], petSpam: ["히익… 너, 너무 많이요…!"], snack: ["가, 감사합니다… 맛있어요…"],
      sleepTalk: ["(자장가 흥얼…)", "Zzz… 4분의 4박자…"], wake: ["아, 잠깐 졸았어요… 죄송해요…"], dizzy: ["음정이… 다 나갔어요…"],
      cat: ["고양이 울음소리… 샘플링하고 싶다…"], chat: ["이 효과음 들어볼래요…?", "BGM… 조금 빠르게 할까요…"], reply: ["조, 좋아요…!", "그럼 거기 맞춰서 소리 만들게요…"]
    }
  }
];

const PAIR_DIALOGUES = [
  [["bit", "이거 버그 아니고 기능이야"], ["dubu", "버그입니다."]],
  [["moka", "라이트 모드도 지원해야 해요."], ["bit", "…그건 테러다"]],
  [["lumi", "일정 당겨도 되죠?!"], ["dubu", "안 됩니다."]],
  [["sol", "이 화면에 어울리는 곡… 만들어 봤어요…"], ["moka", "오 이 톤, 화면이랑 잘 맞네요"]],
  [["lumi", "이 기능 오늘까지 되죠?!"], ["bit", "…내 안의 야근이 깨어난다"]],
  [["dubu", "효과음 0.02초 늦습니다."], ["sol", "히익… 바로 고칠게요…"]]
];

const SNACKS = [
  { key: "coffee", icon: "☕", name: "아아", price: 3, energy: 25, love: 2 },
  { key: "energy", icon: "🥫", name: "에너지 드링크", price: 5, energy: 45, love: 2 },
  { key: "pizza", icon: "🍕", name: "야식 피자", price: 10, energy: 70, love: 8 }
];

const ACHIEVEMENTS = [
  { id: "first_pet", title: "👍 첫 칭찬", desc: "팀원을 처음 칭찬했어요" },
  { id: "pet_spam", title: "🔁 429 Too Many Requests", desc: "칭찬 연타로 혼났어요" },
  { id: "first_throw", title: "🌀 throw new Error()", desc: "팀원을 세게 던졌어요" },
  { id: "cat_pet", title: "🐈 사무실 고양이 발견", desc: "고양이를 클릭했어요" },
  { id: "snack_first", title: "☕ 카페인 수혈", desc: "자판기를 처음 썼어요" },
  { id: "overwork", title: "😴 과로 주의", desc: "팀원이 일하다 잠들었어요" },
  { id: "tasks_10", title: "📦 10 commits", desc: "업무 10개 완료" },
  { id: "all_working", title: "🔥 Full Stack", desc: "5명 모두 근무 중" },
  { id: "first_chat", title: "💬 Hello, World", desc: "AI 팀원과 처음 대화했어요" },
  { id: "cross_check", title: "🔍 Code Review", desc: "AI끼리 처음 교차 검증했어요" },
  { id: "team_round", title: "👥 스탠드업 미팅", desc: "팀 전체에게 질문했어요" }
];

const SLOT_COUNT = AGENT_PRESETS.length;
const DEFAULT_APP_TITLE = "AI//OFFICE";
const TITLE_MAX_LENGTH = 24;
const STORAGE_KEY = "ai-office-v2";
const LOG_LIMIT = 40;
const CHAT_LIMIT = 200;
const DEFAULT_MAX_TOKENS = 900;
const HISTORY_CHAR_BUDGET = 7000;
const HISTORY_LINE_LIMIT = 900;
const DISCUSSION_MEMBER_LIMIT = 4;
const DISCUSSION_DEFAULT_ROUNDS = 2;
const BRIEF_KEEP = 10;
const TICK_MS = 1300;
