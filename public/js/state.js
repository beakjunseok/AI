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
let sampleApi = null;

function createAgentState(preset) {
  return { id: preset.id, location: "lounge", slot: null, currentTaskId: null, log: [], energy: 90, affection: 20, sleeping: false, model: preset.defaultModel };
}

// 첫 실행 기본값: 프로젝트 2개, 비트는 리듬 게임에 배치.
function createInitialState() {
  const initial = {
    projects: [{ id: "p1", name: "리듬 게임", tasks: [] }, { id: "p2", name: "포트폴리오 사이트", tasks: [] }],
    agents: AGENT_PRESETS.map(createAgentState),
    activeProjectId: "p1", sequence: 1, modelPlan: MODEL_PLAN_VERSION, crossReview: true, ambient: true, appTitle: DEFAULT_APP_TITLE, briefs: [], chatByProject: {}, discussionByProject: {}, discussion: null, coins: 20, achievements: [], stats: { tasksDone: 0, pets: 0 }, chat: []
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
    parsed.appTitle = typeof parsed.appTitle === "string" && parsed.appTitle.trim() ? parsed.appTitle : DEFAULT_APP_TITLE;
    parsed.agents.forEach(agent => { if (agent.slot != null && agent.slot >= SLOT_COUNT) { agent.location = "lounge"; agent.slot = null; agent.currentTaskId = null; } });
    parsed.briefs = Array.isArray(parsed.briefs) ? parsed.briefs : [];
    parsed.chatByProject = parsed.chatByProject && typeof parsed.chatByProject === "object" ? parsed.chatByProject : {};
    parsed.discussionByProject = parsed.discussionByProject && typeof parsed.discussionByProject === "object" ? parsed.discussionByProject : {};
    Object.values(parsed.chatByProject).forEach(list => { if (Array.isArray(list)) list.forEach(message => { message.pending = false; }); });
    if (parsed.discussion && parsed.discussion.status !== "done") parsed.discussion.status = "paused";
    if (parsed.modelPlan !== MODEL_PLAN_VERSION) {
      parsed.agents.forEach(agent => { agent.model = AGENT_PRESETS.find(preset => preset.id === agent.id).defaultModel; });
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
