/* ---------- 캐릭터 움직임 (AI 호출 없음, 순수 코드) ---------- */
// 휴게실에선 좌우로 걸어 다니고, 사무실에선 자리에서 기지개·점프·흔들기 같은 짧은 동작을 한다.
// 연출 OFF·드래그 중·AI 답변 중·잠든 팀원은 움직이지 않는다. 틱당 O(팀원 수)
const MOTION_TICK_MS = 1200;
const WALK_RANGE_PX = 22;
const WALK_DURATION_MS = 1800;
const IDLE_ACTIONS = ["act-hop", "act-stretch", "act-wiggle", "act-nod"];
const loungeOffsets = {};
const facingLeft = {};
const reducedMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

function applyMotionPose(node, agentId) {
  node.style.transform = loungeOffsets[agentId] ? `translateX(${loungeOffsets[agentId]}px)` : "";
  node.classList.toggle("facingLeft", Boolean(facingLeft[agentId]));
}

function playAction(node, actionClass, durationMs) {
  node.classList.add(actionClass);
  setTimeout(() => node.classList.remove(actionClass), durationMs);
}

function walkInLounge(node, agentId) {
  const current = loungeOffsets[agentId] || 0;
  let target = Math.round((Math.random() * 2 - 1) * WALK_RANGE_PX);
  if (Math.abs(target - current) < 10) target = current > 0 ? -WALK_RANGE_PX / 2 : WALK_RANGE_PX / 2;
  facingLeft[agentId] = target < current;
  loungeOffsets[agentId] = target;
  applyMotionPose(node, agentId);
  playAction(node, "walking", WALK_DURATION_MS);
  const sprite = node.querySelector("img[data-sprite]");
  setSpritePose(sprite, "walk");
  setTimeout(() => setSpritePose(sprite, "idle"), WALK_DURATION_MS);
}

function motionTick() {
  if (!state.ambient || reducedMotion.matches || document.hidden) return;
  if (document.querySelector(".ghost")) return;
  state.agents.forEach(agent => {
    if (agent.location !== "lounge") delete loungeOffsets[agent.id];
    if (agent.sleeping || aiBusyAgents.has(agent.id)) return;
    const node = document.querySelector(`#app .agent[data-agent="${agent.id}"]`);
    if (!node || [...node.classList].some(name => name === "walking" || name.startsWith("act-"))) return;
    const roll = Math.random();
    if (agent.location === "lounge" && roll < 0.18) walkInLounge(node, agent.id);
    else if (roll < 0.26) playAction(node, pickRandom(IDLE_ACTIONS), 1100);
    else if (roll < 0.30) { facingLeft[agent.id] = !facingLeft[agent.id]; applyMotionPose(node, agent.id); }
  });
}

/* ---------- 복도 심부름: 다른 책상 방문 · 빈 책상으로 이사 · 커피 타러 가기 ---------- */
// 한 번에 한 명만 복도를 걷는다. 걷는 동안 자리의 캐릭터는 숨기고, 복도 레이어에 걷는 스프라이트를 띄운다.
const ERRAND_CHANCE_PER_TICK = 0.05;
const WALK_SPEED_PX_PER_SECOND = 110;
const errandAgents = new Set();

// deskWrap 기준 좌표. 자리에 앉은 캐릭터 또는 빈 슬롯의 좌석 위치를 돌려준다.
function seatPoint(slotIndex) {
  const wrap = document.getElementById("deskWrap").getBoundingClientRect();
  const slot = document.querySelector(`#deskGrid .slot[data-slot="${slotIndex}"]`);
  if (!slot) return null;
  const rect = slot.getBoundingClientRect();
  return { x: rect.left - wrap.left + rect.width / 2 - 27, y: rect.bottom - wrap.top - 120 };
}

function corridorY() {
  const wrap = document.getElementById("deskWrap").getBoundingClientRect();
  const corridor = document.getElementById("corridor").getBoundingClientRect();
  return corridor.top - wrap.top + corridor.height / 2 - 48;
}

function coffeePoint() {
  const wrap = document.getElementById("deskWrap").getBoundingClientRect();
  const spot = document.querySelector("#corridor .coffeeSpot").getBoundingClientRect();
  return { x: spot.left - wrap.left - 46, y: corridorY() };
}

// 꼭짓점 목록을 따라 일정한 속도로 걷는 애니메이션. 진행 방향에 맞춰 좌우를 뒤집는다.
function walkAlong(walker, points) {
  const distances = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  const total = distances.reduce((sum, value) => sum + value, 0) || 1;
  let travelled = 0;
  const frames = points.map((point, index) => {
    if (index > 0) travelled += distances[index - 1];
    return { transform: `translate(${point.x}px, ${point.y}px)`, offset: travelled / total };
  });
  const duration = (total / WALK_SPEED_PX_PER_SECOND) * 1000;
  const turnTimers = points.slice(1).map((point, index) => {
    const startAt = (distances.slice(0, index).reduce((sum, value) => sum + value, 0) / total) * duration;
    return setTimeout(() => { if (point.x !== points[index].x) walker.classList.toggle("facingLeft", point.x < points[index].x); }, startAt);
  });
  const animation = walker.animate(frames, { duration, easing: "linear", fill: "forwards" });
  return animation.finished.catch(() => {}).finally(() => turnTimers.forEach(clearTimeout));
}

// 책상 위로 가로지르지 않게: 자리 → 중앙 통로 → 복도 → 중앙 통로 → 목적지 순서로 걷는다.
function aisleX() {
  const wrap = document.getElementById("deskWrap").getBoundingClientRect();
  const grid = document.getElementById("deskGrid").getBoundingClientRect();
  return grid.left - wrap.left + grid.width / 2 - 27;
}

function corridorRoute(from, to) {
  const aisle = aisleX(), floorY = corridorY();
  const toIsCorridor = Math.abs(to.y - floorY) < 2;
  const fromIsCorridor = Math.abs(from.y - floorY) < 2;
  const points = [from];
  if (!fromIsCorridor) points.push({ x: aisle, y: from.y }, { x: aisle, y: floorY });
  if (toIsCorridor) points.push({ x: to.x, y: floorY });
  else points.push({ x: aisle, y: floorY }, { x: aisle, y: to.y }, to);
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
}
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function runErrand(agent, plan) {
  const start = seatPoint(agent.slot);
  if (!start) return;
  errandAgents.add(agent.id);
  document.querySelector(`#app .agent[data-agent="${agent.id}"]`)?.classList.add("away");
  const bubble = el("div", { class: "bubble", text: plan.startLine });
  const walker = el("div", { class: "walker" }, bubble, spriteImage(agent.id, "", "walk"));
  document.getElementById("walkLayer").append(walker);
  try {
    await walkAlong(walker, corridorRoute(start, plan.target));
    bubble.textContent = plan.arriveLine;
    await plan.onArrive?.();
    await pause(plan.stayMs);
    const home = plan.newSlot != null ? seatPoint(plan.newSlot) : start;
    if (plan.newSlot == null) { bubble.textContent = "복귀!"; await walkAlong(walker, corridorRoute(plan.target, home)); }
  } finally {
    walker.remove();
    errandAgents.delete(agent.id);
    if (plan.newSlot != null && agent.location === state.activeProjectId && !state.agents.some(other => other.id !== agent.id && other.location === agent.location && other.slot === plan.newSlot)) {
      agent.slot = plan.newSlot;
      addLog(agent, { kind: "move", text: `자리를 ${plan.newSlot + 1}번 책상으로 옮김`, project: findProject(agent.location)?.name });
      saveState();
    }
    renderAll();
  }
}

// 심부름 종류를 고른다: 동료 방문(같은 사무실 2명 이상) / 빈 책상으로 이사 / 커피.
function planErrand(agent) {
  const preset = getPreset(agent.id);
  const coworkers = agentsInProject(agent.location).filter(other => other.id !== agent.id && !errandAgents.has(other.id));
  const emptySlot = firstEmptySlot(agent.location);
  const options = [];
  if (coworkers.length) {
    const friend = pickRandom(coworkers);
    const target = seatPoint(friend.slot);
    if (target) options.push({ target: { x: target.x + 34, y: target.y }, startLine: `@${getPreset(friend.id).name}한테 잠깐…`, arriveLine: pickRandom(preset.lines.chat), stayMs: 2600,
      onArrive: () => { setTimeout(() => say(friend.id, pickRandom(getPreset(friend.id).lines.reply), 2400), 900); } });
  }
  if (emptySlot != null && Math.random() < 0.35) {
    const target = seatPoint(emptySlot);
    if (target) options.push({ target, newSlot: emptySlot, startLine: "자리 좀 바꿔볼까…", arriveLine: pickRandom(preset.lines.drop), stayMs: 600 });
  }
  options.push({ target: coffeePoint(), startLine: "☕ 커피 타러…", arriveLine: pickRandom(preset.lines.snack), stayMs: 1800,
    onArrive: () => { agent.energy = clamp(agent.energy + 8, 0, 100); } });
  return pickRandom(options);
}

function errandTick() {
  if (!state.ambient || reducedMotion.matches || document.hidden || errandAgents.size || document.querySelector(".ghost")) return;
  if (Math.random() > ERRAND_CHANCE_PER_TICK) return;
  const candidates = agentsInProject(state.activeProjectId).filter(agent => !agent.sleeping && !aiBusyAgents.has(agent.id));
  if (!candidates.length) return;
  const agent = pickRandom(candidates);
  const plan = planErrand(agent);
  if (plan?.target) runErrand(agent, plan);
}

function renderAll() {
  if (!findProject(state.activeProjectId)) {
    const fallbackId = state.projects[0].id;
    state.activeProjectId = fallbackId;
    state.chat = state.chatByProject[fallbackId] || [];
    state.discussion = state.discussionByProject[fallbackId] || null;
    delete state.chatByProject[fallbackId];
    delete state.discussionByProject[fallbackId];
  }
  renderHeaderStats();
  renderTabs();
  renderOffice();
  renderLounge();
  renderTaskList();
  if (panelAgentId) renderPanel();
  state.agents.forEach(agent => applyBubble(agent.id));
}

function renderHeaderStats() {
  renderAppTitle();
  document.getElementById("coinCount").textContent = state.coins;
  document.getElementById("trophyCount").textContent = `${state.achievements.length}/${ACHIEVEMENTS.length}`;
  document.getElementById("briefCount").textContent = (state.briefs || []).length;
}

function renderTabs() {
  const tabs = document.getElementById("tabs");
  tabs.replaceChildren();
  state.projects.forEach(project => {
    tabs.append(el("button", {
      class: "tab" + (project.id === state.activeProjectId ? " active" : ""), dataset: { tab: project.id },
      onclick: () => { if (switchProject(project.id)) { saveState(); renderAll(); } }
    }, project.name, el("span", { class: "count", text: `${agentsInProject(project.id).length}명` })));
  });
  const form = el("form", { class: "newProject" }, el("input", { placeholder: "+ new repo", maxlength: "20" }));
  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = form.querySelector("input").value.trim();
    if (!name) return;
    if (state.projects.length >= 8) { showToast("프로젝트는 8개까지 만들 수 있어요"); return; }
    const project = { id: nextId("p"), name, tasks: [] };
    state.projects.push(project);
    if (!switchProject(project.id)) { state.projects.pop(); return; }
    saveState(); renderAll();
    showToast(`'${name}' 레포 생성 완료`);
  });
  tabs.append(form);
}

function renderOffice() {
  const project = findProject(state.activeProjectId);
  const members = agentsInProject(project.id);
  document.getElementById("officeHead").replaceChildren(
    el("div", {}, el("h2", { title: "눌러서 이름 바꾸기", onclick: () => openRenamePrompt("project", project.id) }, `${project.name}/`, el("span", { class: "editHint", text: "✏️" })), el("small", { id: "officeStats" })),
    state.projects.length > 1 ? el("button", { class: "btn soft", text: "archive", onclick: () => closeProject(project.id) }) : null
  );
  const grid = document.getElementById("deskGrid");
  grid.replaceChildren();
  for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex++) {
    grid.append(createDeskSlot(slotIndex, members.find(agent => agent.slot === slotIndex)));
  }
  renderOfficeStats();
}

function renderOfficeStats() {
  const stats = document.getElementById("officeStats");
  const project = findProject(state.activeProjectId);
  if (stats && project) stats.textContent = `팀원 ${agentsInProject(project.id).length}/${SLOT_COUNT} · 진행 중 ${project.tasks.filter(task => !task.done).length}건`;
}
