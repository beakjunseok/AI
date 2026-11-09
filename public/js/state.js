/* ================= 상태 ================= */
let state = loadState() || createInitialState();
const bubbles = {};          // agentId -> { text, until }
const expressions = {};      // agentId -> { name, until } 일시 표정
const petHistory = {};       // agentId -> 최근 쓰다듬은 시각들
const aiBusyAgents = new Set();
const spriteCache = new Map();
let panelAgentId = null;
let panelTab = "chat";
let threadFilter = "all";

function createAgentState(preset) {
  return { id: preset.id, location: "lounge", slot: null, currentTaskId: null, log: [], energy: 90, affection: 20, sleeping: false, model: preset.defaultModel };
}

// 첫 실행 기본값: 프로젝트 2개, 비트는 리듬 게임에 배치.
function createInitialState() {
  const initial = {
    projects: [{ id: "p1", name: "리듬 게임", tasks: [] }, { id: "p2", name: "포트폴리오 사이트", tasks: [] }],
    agents: AGENT_PRESETS.map(createAgentState),
    activeProjectId: "p1", sequence: 1, modelPlan: MODEL_PLAN_VERSION, crossReview: true, ambient: true, sound: true, appTitle: DEFAULT_APP_TITLE, briefs: [], chatByProject: {}, discussionByProject: {}, discussion: null, coins: 20, achievements: [], stats: { tasksDone: 0, pets: 0 }, chat: []
  };
  Object.assign(initial.agents.find(agent => agent.id === "bit"), { location: "p1", slot: 0 });
  return initial;
}

// 저장본을 읽고, 빠진 필드는 기본값으로 채운다. 손상되면 null → 새로 시작.
function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || !Array.isArray(parsed.projects) || !parsed.projects.length || !Array.isArray(parsed.agents)) return null;
    parsed.agents = AGENT_PRESETS.map(preset => Object.assign(createAgentState(preset), parsed.agents.find(agent => agent.id === preset.id) || {}));
    parsed.coins = Number.isFinite(parsed.coins) ? parsed.coins : 20;
    parsed.achievements = Array.isArray(parsed.achievements) ? parsed.achievements : [];
    parsed.stats = Object.assign({ tasksDone: 0, pets: 0 }, parsed.stats);
    parsed.chat = Array.isArray(parsed.chat) ? parsed.chat.filter(message => !message.pending) : [];
    parsed.sequence = parsed.sequence || 1000;
    parsed.crossReview = parsed.crossReview !== false;
    parsed.ambient = parsed.ambient !== false;
    parsed.sound = parsed.sound !== false;
    parsed.appTitle = typeof parsed.appTitle === "string" && parsed.appTitle.trim() ? parsed.appTitle : DEFAULT_APP_TITLE;
    parsed.agents.forEach(agent => { if (agent.slot != null && agent.slot >= SLOT_COUNT) { agent.location = "lounge"; agent.slot = null; agent.currentTaskId = null; } });
    parsed.agents.forEach(agent => { if (!Number.isFinite(agent.corridorX)) agent.corridorX = 0.5; if (!["pod", "floor"].includes(agent.spot)) agent.spot = "corridor"; });
    parsed.briefs = Array.isArray(parsed.briefs) ? parsed.briefs : [];
    parsed.chatByProject = parsed.chatByProject && typeof parsed.chatByProject === "object" ? parsed.chatByProject : {};
    parsed.discussionByProject = parsed.discussionByProject && typeof parsed.discussionByProject === "object" ? parsed.discussionByProject : {};
    Object.values(parsed.chatByProject).forEach(list => { if (Array.isArray(list)) list.forEach(message => { message.pending = false; }); });
    if (parsed.discussion && parsed.discussion.status !== "done") parsed.discussion.status = "paused";
    // 더 이상 없는 모델(예: 예전 저장본의 claude)을 쓰던 팀원은 기본 모델로 되돌린다.
    // (loadState는 파일 맨 위에서 실행돼 아래 getPreset보다 먼저 돈다 → 프리셋 목록에서 직접 찾음)
    const defaultModelOf = agentId => AGENT_PRESETS.find(preset => preset.id === agentId).defaultModel;
    parsed.agents.forEach(agent => { if (!MODEL_PROVIDERS[agent.model]) agent.model = defaultModelOf(agent.id); });
    if (parsed.modelPlan !== MODEL_PLAN_VERSION) {
      parsed.agents.forEach(agent => { agent.model = defaultModelOf(agent.id); });
      parsed.modelPlan = MODEL_PLAN_VERSION;
    }
    return parsed;
  } catch (error) { return null; }
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { /* 저장 불가 환경 */ }
}

const getPreset = agentId => AGENT_PRESETS.find(preset => preset.id === agentId);
const getAgent = agentId => state.agents.find(agent => agent.id === agentId);
const findProject = projectId => state.projects.find(project => project.id === projectId) || null;
const agentsInProject = projectId => state.agents.filter(agent => agent.location === projectId);
const nextId = prefix => `${prefix}${state.sequence++}`;
const pickRandom = list => list[Math.floor(Math.random() * list.length)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
// 사무실에 있지만 책상(slot)이 없는 팀원은 복도나 회의 공간(pod)에서 쉰다.
const isOffDesk = agent => agent.location !== "lounge" && agent.slot == null;
const isInPod = agent => isOffDesk(agent) && agent.spot === "pod";
const isOnFloor = agent => isOffDesk(agent) && agent.spot === "floor";
const isInCorridor = agent => isOffDesk(agent) && agent.spot !== "pod" && agent.spot !== "floor";
// 현재 사무실에서 책상에 앉아 있는 팀원.
const deskWorkers = () => agentsInProject(state.activeProjectId).filter(agent => agent.slot != null);
