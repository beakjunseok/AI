/* ---------- 캐릭터 움직임 (AI 호출 없음, 순수 코드) ---------- */
// 휴게실에선 좌우로 걸어 다니고, 사무실에선 자리에서 기지개·점프·흔들기 같은 짧은 동작을 한다.
// 연출 OFF·드래그 중·AI 답변 중·잠든 팀원은 움직이지 않는다. 틱당 O(팀원 수)
const MOTION_TICK_MS = 1200;
const WALK_RANGE_PX = 22;
const WALK_DURATION_MS = 1800;
const CORRIDOR_WALK_RANGE_PX = 56;
// 복도에 내려놓은 팀원은 20~40초 서성이다가 원래 책상(비었으면) 또는 빈 책상으로 걸어 돌아간다.
const corridorStayMs = () => 20000 + Math.random() * 20000;
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

function walkInLounge(node, agentId, range = WALK_RANGE_PX) {
  const current = loungeOffsets[agentId] || 0;
  let target = Math.round((Math.random() * 2 - 1) * range);
  if (Math.abs(target - current) < 10) target = current > 0 ? -range / 2 : range / 2;
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
  maybeReturnFromCorridor();
  state.agents.forEach(agent => {
    const canStroll = agent.location === "lounge" || isInCorridor(agent);
    if (!canStroll) delete loungeOffsets[agent.id];
    if (agent.sleeping || aiBusyAgents.has(agent.id)) return;
    const node = document.querySelector(`#app .agent[data-agent="${agent.id}"]`);
    if (!node || [...node.classList].some(name => name === "walking" || name.startsWith("act-"))) return;
    const roll = Math.random();
    if (canStroll && roll < (isInCorridor(agent) ? 0.3 : 0.18)) walkInLounge(node, agent.id, isInCorridor(agent) ? CORRIDOR_WALK_RANGE_PX : WALK_RANGE_PX);
    else if (roll < 0.26) playAction(node, pickRandom(IDLE_ACTIONS), 1100);
    else if (roll < 0.30) { facingLeft[agent.id] = !facingLeft[agent.id]; applyMotionPose(node, agent.id); }
  });
}

/* ---------- 복도 심부름: 다른 책상 방문 · 빈 책상으로 이사 · 커피 타러 가기 ---------- */
// 한 번에 한 명만 복도를 걷는다. 걷는 동안 자리의 캐릭터는 숨기고, 복도 레이어에 걷는 스프라이트를 띄운다.
const ERRAND_CHANCE_PER_TICK = 0.05;
const WALK_SPEED_PX_PER_SECOND = 110;
const FOOTSTEP_INTERVAL_MS = 400; // 걷기 포즈 한 주기(0.8초)에 두 걸음
const errandAgents = new Set();
const SEAT_BOTTOM_PX = 60;           // .seat의 bottom 값과 같아야 함
const CORRIDOR_FEET_OFFSET_PX = 12;  // 복도 가운데선보다 발이 이만큼 아래

// deskWrap 기준 좌표. 자리에 앉은 캐릭터 또는 빈 슬롯의 좌석 위치를 돌려준다.
function seatPoint(slotIndex) {
  const wrap = document.getElementById("deskWrap").getBoundingClientRect();
  const slot = document.querySelector(`#deskGrid .slot[data-slot="${slotIndex}"]`);
  if (!slot) return null;
  const rect = slot.getBoundingClientRect();
  const sprite = spriteMetrics();
  return { x: rect.left - wrap.left + rect.width / 2 - sprite.width / 2, y: rect.bottom - wrap.top - SEAT_BOTTOM_PX - sprite.height };
}

function corridorY() {
  const wrap = document.getElementById("deskWrap").getBoundingClientRect();
  const corridor = document.getElementById("corridor").getBoundingClientRect();
  return corridor.top - wrap.top + corridor.height / 2 + CORRIDOR_FEET_OFFSET_PX - spriteMetrics().height;
}

function coffeePoint() {
  const wrap = document.getElementById("deskWrap").getBoundingClientRect();
  const spot = document.querySelector("#corridor .coffeeSpot").getBoundingClientRect();
  return { x: spot.left - wrap.left - spriteMetrics().width + 8, y: corridorY() };
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
  // 구간마다 방향을 바꾸고 깊이를 정한다: 자리에 들어가고 나오는 구간(좌석에 닿는 첫·마지막 구간)만 책상 뒤,
  // 통로·복도처럼 책상 옆을 지나가는 구간은 책상 앞으로 그린다.
  const floorY = corridorY();
  const lastIndex = points.length - 2;
  const seatRows = [...document.querySelectorAll("#deskGrid .slot[data-slot]")].map(slot => seatPoint(Number(slot.dataset.slot))?.y).filter(Number.isFinite);
  const isSeatRow = y => seatRows.some(rowY => Math.abs(rowY - y) < 2);
  const touchesSeat = index => (index === 0 && isSeatRow(points[0].y)) || (index === lastIndex && isSeatRow(points[lastIndex + 1].y));
  walker.classList.toggle("behindDesk", points.length > 1 && touchesSeat(0));
  const turnTimers = points.slice(1).map((point, index) => {
    const startAt = (distances.slice(0, index).reduce((sum, value) => sum + value, 0) / total) * duration;
    return setTimeout(() => {
      if (point.x !== points[index].x) walker.classList.toggle("facingLeft", point.x < points[index].x);
      walker.classList.toggle("behindDesk", touchesSeat(index));
    }, startAt);
  });
  const animation = walker.animate(frames, { duration, easing: "linear", fill: "forwards" });
  const stepTimer = setInterval(() => playSound("step"), FOOTSTEP_INTERVAL_MS);
  return animation.finished.catch(() => {}).finally(() => { turnTimers.forEach(clearTimeout); clearInterval(stepTimer); });
}

// 책상 위로 가로지르지 않게: 자리 → 중앙 통로 → 복도 → 중앙 통로 → 목적지 순서로 걷는다.
function aisleX() {
  const wrap = document.getElementById("deskWrap").getBoundingClientRect();
  const grid = document.getElementById("deskGrid").getBoundingClientRect();
  return grid.left - wrap.left + grid.width / 2 - spriteMetrics().width / 2;
}

function corridorRoute(from, to) {
  const aisle = aisleX(), floorY = corridorY();
  const toIsCorridor = Math.abs(to.y - floorY) < 2;
  const fromIsCorridor = Math.abs(from.y - floorY) < 2;
  const points = [from];
  if (!fromIsCorridor && !toIsCorridor) points.push({ x: aisle, y: from.y }, { x: aisle, y: to.y }, to);
  else {
    if (!fromIsCorridor) points.push({ x: aisle, y: from.y }, { x: aisle, y: floorY });
    if (toIsCorridor) points.push({ x: to.x, y: floorY });
    else points.push({ x: aisle, y: floorY }, { x: aisle, y: to.y }, to);
  }
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
    await plan.onArrive?.(walker);
    await pause(plan.stayMs);
    plan.onLeave?.(walker);
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
  const coworkers = deskWorkers().filter(other => other.id !== agent.id && !errandAgents.has(other.id));
  const emptySlot = firstEmptySlot(agent.location);
  const options = [];
  if (coworkers.length) {
    const friend = pickRandom(coworkers);
    const target = seatPoint(friend.slot);
    if (target) options.push({ target: { x: target.x + 34, y: target.y }, startLine: `@${getPreset(friend.id).name} ${lineFor(agent.id, "visit")}`, arriveLine: pickRandom(preset.lines.chat), stayMs: 2600,
      onArrive: () => { setTimeout(() => say(friend.id, pickRandom(getPreset(friend.id).lines.reply), 2400), 900); } });
  }
  if (emptySlot != null && Math.random() < 0.35) {
    const target = seatPoint(emptySlot);
    if (target) options.push({ target, newSlot: emptySlot, startLine: "자리 좀 바꿔볼까…", arriveLine: pickRandom(preset.lines.drop), stayMs: 600 });
  }
  options.push({ target: coffeePoint(), startLine: `☕ ${lineFor(agent.id, "coffee")}`, arriveLine: pickRandom(preset.lines.snack), stayMs: 1800,
    onArrive: () => { agent.energy = clamp(agent.energy + 8, 0, 100); } });
  return pickRandom(options);
}

/* ---------- 책상 밖(복도·바닥)에 놓인 팀원의 자율 행동 ---------- */
// 복도: 20~40초 서성이다가, 바닥(책상 사이): 4~9초 두리번거리다가 움직인다.
// 행동: 커피 마시기 / 동료 자리 들르기 / 바로 복귀 중 하나를 고른 뒤 원래 책상(비었으면) 또는 빈 책상으로 걸어간다.
// 빈 책상이 없으면 복도로 가서 계속 쉰다. 한 번에 한 명만 움직인다.
const FLOOR_STAY_MS = () => 4000 + Math.random() * 5000;

function maybeReturnFromCorridor() {
  if (errandAgents.size) return;
  const now = Date.now();
  const waiting = agentsInProject(state.activeProjectId).filter(agent => (isInCorridor(agent) || isOnFloor(agent)) && !agent.sleeping && !aiBusyAgents.has(agent.id));
  waiting.forEach(agent => { if (!agent.corridorUntil) agent.corridorUntil = now + (isOnFloor(agent) ? FLOOR_STAY_MS() : corridorStayMs()); });
  const agent = waiting.find(item => item.corridorUntil <= now);
  if (agent) wanderBack(agent);
}

function chooseReturnSlot(agent) {
  const isFree = slot => slot != null && !agentsInProject(agent.location).some(other => other.slot === slot);
  return isFree(agent.returnSlot) ? agent.returnSlot : firstEmptySlot(agent.location);
}

async function wanderBack(agent) {
  const fromCorridor = isInCorridor(agent);
  const node = document.querySelector(`${fromCorridor ? "#corridorCrew" : "#floorCrew"} .agent[data-agent="${agent.id}"]`);
  if (!node) return;
  const wrap = document.getElementById("deskWrap").getBoundingClientRect();
  const rect = node.getBoundingClientRect();
  let position = { x: rect.left - wrap.left, y: fromCorridor ? corridorY() : rect.top - wrap.top };
  const preset = getPreset(agent.id);
  const bubble = el("div", { class: "bubble", text: "" });
  const walker = el("div", { class: "walker" }, bubble, spriteImage(agent.id, "", "walk"));
  const walkTo = async (target, line) => { bubble.textContent = line; await walkAlong(walker, corridorRoute(position, target)); position = target; };
  errandAgents.add(agent.id);
  node.classList.add("away");
  document.getElementById("walkLayer").append(walker);
  let seatedAt = null;
  try {
    const roll = Math.random();
    const coworkers = deskWorkers().filter(other => other.id !== agent.id && !errandAgents.has(other.id));
    if (roll < 0.35) {
      await walkTo(coffeePoint(), `☕ ${lineFor(agent.id, "coffee")}`);
      bubble.textContent = pickRandom(preset.lines.snack);
      agent.energy = clamp(agent.energy + 8, 0, 100);
      await pause(1600);
    } else if (roll < 0.5 && coworkers.length) {
      const friend = pickRandom(coworkers);
      const seat = seatPoint(friend.slot);
      if (seat) {
        await walkTo({ x: seat.x + Math.round(spriteMetrics().width * 0.6), y: seat.y }, `@${getPreset(friend.id).name} ${lineFor(agent.id, "visit")}`);
        bubble.textContent = lineFor(agent.id, "chat");
        setTimeout(() => say(friend.id, lineFor(friend.id, "reply"), 2400), 800);
        await pause(2400);
      }
    }
    const slot = chooseReturnSlot(agent);
    if (slot != null && seatPoint(slot)) {
      await walkTo(seatPoint(slot), pickRandom(["자리로 복귀!", ...preset.lines.working]));
      seatedAt = slot;
    } else if (!fromCorridor) {
      await walkTo({ x: position.x, y: corridorY() }, lineFor(agent.id, "corridor"));
    }
  } finally {
    walker.remove();
    errandAgents.delete(agent.id);
    const stillOffDesk = isOffDesk(agent) && agent.location === state.activeProjectId;
    if (stillOffDesk && seatedAt != null && chooseReturnSlot(agent) === seatedAt) {
      Object.assign(agent, { slot: seatedAt, returnSlot: null, corridorUntil: null });
      addLog(agent, { kind: "move", text: `한 바퀴 돌고 ${seatedAt + 1}번 책상으로 복귀`, project: findProject(agent.location)?.name });
    } else if (stillOffDesk) {
      // 자리가 없으면 복도에서 계속 쉰다.
      const crew = document.getElementById("corridorCrew").getBoundingClientRect();
      Object.assign(agent, { spot: "corridor", corridorX: clamp((position.x + wrap.left - crew.left) / Math.max(1, crew.width - spriteMetrics().width), 0, 1), corridorUntil: Date.now() + corridorStayMs() });
    }
    saveState();
    renderAll();
    if (agent.slot === seatedAt && seatedAt != null) { playLanding(agent.id); say(agent.id, lineFor(agent.id, "landed", "drop")); }
  }
}

/* ---------- 고양이 쓰다듬기: 고양이 멈춤 → 팀원이 걸어가 쓰다듬기 포즈 → 하트 → 복귀 → 고양이 다시 출발 ---------- */
const CAT_PET_CHANCE = 0.5;
const CAT_PET_STAY_MS = 2800;

function setCatPaused(cat, paused) {
  const playState = paused ? "paused" : "running";
  cat.style.animationPlayState = playState;
  const body = cat.querySelector("span");
  if (body) body.style.animationPlayState = playState;
}

function maybePetCat(cat) {
  if (!cat.isConnected || Math.random() > CAT_PET_CHANCE) return;
  if (!state.ambient || reducedMotion.matches || document.hidden || errandAgents.size || document.querySelector(".ghost")) return;
  const isFreeToMove = agent => !agent.sleeping && !aiBusyAgents.has(agent.id);
  const wrap = document.getElementById("deskWrap").getBoundingClientRect();
  const catX = cat.getBoundingClientRect().left - wrap.left;
  const sprite = spriteMetrics();
  if (catX < sprite.width || catX > wrap.width - 60) return;
  // 복도·바닥에서 쉬던 팀원이 있으면 그 팀원이 먼저 간다(가까우니까).
  const nearby = agentsInProject(state.activeProjectId).filter(agent => (isInCorridor(agent) || isOnFloor(agent)) && isFreeToMove(agent));
  if (nearby.length && Math.random() < 0.7) { petCatFromSpot(pickRandom(nearby), cat, catX); return; }
  const candidates = deskWorkers().filter(isFreeToMove);
  if (!candidates.length) return;
  const agent = pickRandom(candidates);
  const preset = getPreset(agent.id);
  setCatPaused(cat, true);
  runErrand(agent, {
    target: { x: catX - sprite.width + 16, y: corridorY() },
    startLine: "앗, 고양이다!",
    arriveLine: lineFor(agent.id, "catPet", "cat"),
    stayMs: CAT_PET_STAY_MS,
    onArrive: walker => {
      walker.classList.remove("facingLeft");
      setSpritePose(walker.querySelector("img[data-sprite]"), "pet");
      setExpression(agent.id, "happy", CAT_PET_STAY_MS);
      const catRect = cat.getBoundingClientRect();
      burst(catRect.left + catRect.width / 2, catRect.top, ["💕", "🐾", "✨"], 6);
      playSound("meow");
      agent.affection = clamp(agent.affection + 1, 0, 100);
    },
    onLeave: walker => {
      setSpritePose(walker.querySelector("img[data-sprite]"), "walk");
      if (cat.isConnected) setCatPaused(cat, false);
    }
  }).finally(() => { if (cat.isConnected) setCatPaused(cat, false); });
}

// 복도·바닥에 있던 팀원이 고양이에게 걸어가 쓰다듬고, 끝나면 그 자리(복도)에서 계속 쉰다.
async function petCatFromSpot(agent, cat, catX) {
  const node = document.querySelector(`#app .agent[data-agent="${agent.id}"]`);
  if (!node) return;
  const wrap = document.getElementById("deskWrap").getBoundingClientRect();
  const rect = node.getBoundingClientRect();
  const sprite = spriteMetrics();
  const start = { x: rect.left - wrap.left, y: isInCorridor(agent) ? corridorY() : rect.top - wrap.top };
  const target = { x: catX - sprite.width + 16, y: corridorY() };
  const bubble = el("div", { class: "bubble", text: "앗, 고양이다!" });
  const walker = el("div", { class: "walker" }, bubble, spriteImage(agent.id, "", "walk"));
  errandAgents.add(agent.id);
  node.classList.add("away");
  setCatPaused(cat, true);
  document.getElementById("walkLayer").append(walker);
  try {
    await walkAlong(walker, corridorRoute(start, target));
    walker.classList.remove("facingLeft");
    bubble.textContent = lineFor(agent.id, "catPet", "cat");
    setSpritePose(walker.querySelector("img[data-sprite]"), "pet");
    setExpression(agent.id, "happy", CAT_PET_STAY_MS);
    const catRect = cat.getBoundingClientRect();
    burst(catRect.left + catRect.width / 2, catRect.top, ["💕", "🐾", "✨"], 6);
    playSound("meow");
    agent.affection = clamp(agent.affection + 1, 0, 100);
    await pause(CAT_PET_STAY_MS);
  } finally {
    walker.remove();
    errandAgents.delete(agent.id);
    if (cat.isConnected) setCatPaused(cat, false);
    if (isOffDesk(agent) && !isInPod(agent)) {
      const crew = document.getElementById("corridorCrew").getBoundingClientRect();
      Object.assign(agent, { spot: "corridor", corridorX: clamp((target.x + wrap.left - crew.left) / Math.max(1, crew.width - sprite.width), 0, 1), corridorUntil: Date.now() + corridorStayMs() });
      saveState();
    }
    renderAll();
  }
}

function errandTick() {
  if (!state.ambient || reducedMotion.matches || document.hidden || errandAgents.size || document.querySelector(".ghost")) return;
  if (Math.random() > ERRAND_CHANCE_PER_TICK) return;
  const candidates = deskWorkers().filter(agent => !agent.sleeping && !aiBusyAgents.has(agent.id));
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
    ...(state.projects.length > 1 ? [el("button", { class: "btn soft", text: "archive", onclick: () => closeProject(project.id) })] : [])
  );
  const grid = document.getElementById("deskGrid");
  grid.replaceChildren();
  for (let slotIndex = 0; slotIndex < SLOT_COUNT; slotIndex++) {
    grid.append(createDeskSlot(slotIndex, members.find(agent => agent.slot === slotIndex)));
  }
  grid.append(createMeetingPod(members.filter(isInPod)));
  renderCorridorCrew(members.filter(isInCorridor));
  renderFloorCrew(members.filter(isOnFloor));
  renderOfficeStats();
}

// 복도에 내려놓은 팀원을 복도 위 지정 위치(0~1 비율)에 세운다. 비율이라 화면 폭이 바뀌어도 자리 유지.
function renderCorridorCrew(crew) {
  const layer = document.getElementById("corridorCrew");
  layer.replaceChildren(...crew.map(agent => {
    const node = createAgentNode(agent.id);
    node.style.setProperty("--spot", String(agent.corridorX ?? 0.5));
    applyMotionPose(node, agent.id);
    return node;
  }));
}

// 회의 공간: 5번 책상 옆 남는 칸. 화이트보드엔 진행 중인 토론 주제(없으면 최근 브리프)를 띄우고,
// 팀원을 끌어다 놓으면 테이블에 둘러앉는다. 빈 곳을 누르면 기획방이 열린다.
function createMeetingPod(crew) {
  const pod = el("div", { class: "pod", dataset: { pod: "1" }, title: "회의 공간 · 누르면 기획방 · 팀원을 끌어다 놓기",
    onclick: event => { if (!event.target.closest(".agent")) openRoom(); } });
  const seats = crew.map((agent, index) => {
    const node = createAgentNode(agent.id);
    node.classList.add(`podSeat${index}`);
    return node;
  });
  pod.append(
    el("div", { class: "podSign", text: "MEETING POD" }),
    el("div", { class: "podBoard" }, el("b", { id: "podBoardLabel" }), el("span", { id: "podBoardText" })),
    el("div", { class: "beanbag" }), el("div", { class: "arcade" }, el("i")),
    ...seats,
    el("div", { class: "podTable" }, el("span", { class: "podLaptop" }), el("span", { class: "podMug", text: "☕" }))
  );
  requestAnimationFrame(updatePodBoard);
  return pod;
}

function updatePodBoard() {
  const label = document.getElementById("podBoardLabel");
  const text = document.getElementById("podBoardText");
  if (!label || !text) return;
  const discussion = state.discussion && state.discussion.status !== "done" ? state.discussion : null;
  const live = Boolean(discussion) || brainstormActive;
  label.textContent = discussion ? "🧠 토론 중" : brainstormActive ? "💡 브레인스토밍" : "IDEA BOARD";
  text.textContent = discussion?.topic || state.briefs?.[0]?.topic || "아이디어 환영 ✍️";
  label.parentElement.classList.toggle("live", live);
}

// 책상 사이 바닥에 내려놓은 팀원: 사무실 영역 안 비율 좌표(floorX/floorY)에 세운다.
function renderFloorCrew(crew) {
  document.getElementById("floorCrew").replaceChildren(...crew.map(agent => {
    const node = createAgentNode(agent.id);
    node.style.setProperty("--fx", String(agent.floorX ?? 0.4));
    node.style.setProperty("--fy", String(agent.floorY ?? 0.4));
    applyMotionPose(node, agent.id);
    return node;
  }));
}

function renderOfficeStats() {
  const stats = document.getElementById("officeStats");
  const project = findProject(state.activeProjectId);
  if (stats && project) stats.textContent = `팀원 ${agentsInProject(project.id).length}/${SLOT_COUNT} · 진행 중 ${project.tasks.filter(task => !task.done).length}건`;
}
