/* ================= 업무 시뮬레이션 ================= */
function addLog(agent, { kind, text, project }) {
  const entry = { id: nextId("log"), time: Date.now(), kind, text, project: project || "" };
  agent.log.push(entry);
  if (agent.log.length > LOG_LIMIT) agent.log.splice(0, agent.log.length - LOG_LIMIT);
  return entry;
}

// 역할 맞는 미배정 업무를 먼저 가져가고, 없으면 역할 템플릿으로 새 업무를 만든다.
function claimTask(agent, project) {
  const preset = getPreset(agent.id);
  const available = project.tasks.find(task => !task.done && !task.assigneeId && (task.roleKey === preset.roleKey || task.roleKey === "any"));
  if (available) { available.assigneeId = agent.id; agent.currentTaskId = available.id; return available; }
  const recentOtherWork = project.tasks.filter(task => task.done && task.assigneeId !== agent.id).slice(-1)[0];
  const template = pickRandom(ROLE_TASK_TEMPLATES[preset.roleKey].filter(item => !item.includes("{target}") || recentOtherWork));
  const title = template.replace("{n}", String(Math.floor(Math.random() * 90) + 10)).replace("{target}", recentOtherWork ? recentOtherWork.title : "");
  const task = { id: nextId("t"), title, roleKey: preset.roleKey, assigneeId: agent.id, progress: 0, done: false, createdBy: "auto" };
  project.tasks.push(task);
  agent.currentTaskId = task.id;
  return task;
}

function completeTask(agent, project, task) {
  const preset = getPreset(agent.id);
  task.done = true; task.progress = 100;
  agent.currentTaskId = null;
  addLog(agent, { kind: "done", text: `[${task.title}] ${pickRandom(ROLE_OUTPUTS[preset.roleKey])}`, project: project.name });
  const reward = agent.affection >= 60 ? 7 : 5;
  state.coins += reward;
  state.stats.tasksDone += 1;
  setExpression(agent.id, "happy", 1500);
  say(agent.id, pickRandom(preset.lines.done));
  burstAtAgent(agent.id, ["✅", "+5", "🪙"], 5);
  if (project.id === state.activeProjectId) playSound("coin");
  if (state.stats.tasksDone >= 10) unlockAchievement("tasks_10");
  if (state.stats.tasksDone % 10 === 0) { burst(window.innerWidth / 2, window.innerHeight / 2, ["🎉", "🚀", "✨", "200 OK"], 18); showToast(`🎉 업무 ${state.stats.tasksDone}개 달성!`); }
  scheduleReview(agent, project, task);
  const doneTasks = project.tasks.filter(item => item.done);
  if (doneTasks.length > 20) {
    const removeIds = new Set(doneTasks.slice(0, doneTasks.length - 20).map(item => item.id));
    project.tasks = project.tasks.filter(item => !removeIds.has(item.id));
  }
  renderHeaderStats();
}

// 같은 사무실 검증 담당이 다른 팀원 결과물을 보고 코멘트를 남긴다.
function scheduleReview(author, project, task) {
  const reviewer = agentsInProject(project.id).find(agent => agent.id !== author.id && !agent.sleeping && getPreset(agent.id).roleKey === "qa");
  if (!reviewer || Math.random() > 0.6) return;
  const authorName = getPreset(author.id).name;
  setTimeout(() => {
    if (reviewer.location !== project.id) return;
    const verdict = pickRandom(["통과.", "이슈 1건. 재현 경로 첨부.", "솔직히 별로입니다. 다시.", "여백 2px 틀렸습니다."]);
    addLog(reviewer, { kind: "review", text: `${authorName}의 [${task.title}] 검토 → ${verdict}`, project: project.name });
    say(reviewer.id, `${authorName}님, ${verdict}`, 3500);
    state.coins += 1;
    renderHeaderStats(); saveState();
  }, 1800);
}

// 같은 공간의 두 팀원이 가끔 짧게 수다를 떤다.
function maybePairChat() {
  if (Math.random() > 0.05) return;
  const groups = [...state.projects.map(project => agentsInProject(project.id)), state.agents.filter(agent => agent.location === "lounge")]
    .map(group => group.filter(agent => !agent.sleeping && !aiBusyAgents.has(agent.id))).filter(group => group.length >= 2);
  if (!groups.length) return;
  const group = pickRandom(groups);
  const ids = new Set(group.map(agent => agent.id));
  const scripted = PAIR_DIALOGUES.filter(dialogue => dialogue.every(([speakerId]) => ids.has(speakerId)));
  let dialogue;
  if (scripted.length && Math.random() < 0.6) dialogue = pickRandom(scripted);
  else {
    const first = pickRandom(group);
    const second = pickRandom(group.filter(agent => agent.id !== first.id));
    dialogue = [[first.id, pickRandom(getPreset(first.id).lines.chat)], [second.id, pickRandom(getPreset(second.id).lines.reply)]];
  }
  say(dialogue[0][0], dialogue[0][1], 2600);
  setTimeout(() => say(dialogue[1][0], dialogue[1][1], 2600), 1700);
}

// 주기 실행: 업무 진행·에너지 소모/회복·잠들기/깨기·혼잣말.
function tickOffice() {
  const now = Date.now();
  if (!state.ambient) { updateDynamicViews(); return; }
  state.agents.forEach(agent => {
    const preset = getPreset(agent.id);
    if (agent.location === "lounge" || isOffDesk(agent)) {
      agent.energy = clamp(agent.energy + (agent.location === "lounge" ? 3 : 2), 0, 100);
      if (agent.sleeping && agent.energy >= 60) wakeUp(agent);
      else if (agent.sleeping && Math.random() < 0.04) say(agent.id, lineFor(agent.id, "sleepTalk"));
      else if (agent.location === "lounge" && Math.random() < 0.01 && maybeCommute(agent)) return;
      else if (!agent.sleeping && Math.random() < 0.025) say(agent.id, lineFor(agent.id, isInPod(agent) ? "pod" : ambientLineKey()));
      return;
    }
    const project = findProject(agent.location);
    if (!project) { agent.location = "lounge"; agent.slot = null; return; }
    if (agent.sleeping) {
      agent.energy = clamp(agent.energy + 1, 0, 100);
      if (agent.energy >= 45) wakeUp(agent);
      else if (Math.random() < 0.04) say(agent.id, pickRandom(preset.lines.sleepTalk));
      return;
    }
    if (aiBusyAgents.has(agent.id) || errandAgents.has(agent.id)) return;
    let task = project.tasks.find(item => item.id === agent.currentTaskId && !item.done);
    if (!task) task = claimTask(agent, project);
    const loveBonus = 1 + agent.affection / 200;
    task.progress = Math.min(100, task.progress + (4 + Math.random() * 8) * preset.speed * loveBonus);
    agent.energy = clamp(agent.energy - 0.9, 0, 100);
    if (agent.energy < 12) { fallAsleep(agent); return; }
    if (task.progress >= 100) { completeTask(agent, project, task); return; }
    const isQuiet = !bubbles[agent.id] || bubbles[agent.id].until < now - 2500;
    if (isQuiet && Math.random() < 0.06) say(agent.id, pickRandom(agent.energy < 35 ? ["하암…", "졸려…", ...preset.lines.complain] : Math.random() < 0.25 ? preset.lines.complain : preset.lines.working));
  });
  maybePairChat();
  autoFeedSleepers();
  updateDynamicViews();
  saveState();
}

function fallAsleep(agent) {
  agent.sleeping = true;
  say(agent.id, "하암… 5분만…", 3000);
  playSound("yawn");
  unlockAchievement("overwork");
  renderAll();
}

function wakeUp(agent) {
  agent.sleeping = false;
  setExpression(agent.id, "happy", 1200);
  say(agent.id, pickRandom(getPreset(agent.id).lines.wake));
  playSound("wake");
  renderAll();
}

// 상태(잠·업무·대기)에 맞는 포즈로 바꾼다. 걷는 중인 스프라이트는 걷기가 끝나면 스스로 돌아오므로 건드리지 않는다. O(1)
function syncAgentPose(agent, isWorking) {
  const image = document.querySelector(`#app .agent[data-agent="${agent.id}"] img[data-sprite]`);
  if (!image || image.dataset.pose === "walk") return;
  setSpritePose(image, agent.sleeping ? "sleep" : isWorking ? "type" : "idle");
}

// 구조는 그대로 두고 바·모니터·표정·포즈·말풍선만 갱신 → 드래그 중 깜빡임 없음. O(팀원 수)
function updateDynamicViews() {
  state.agents.forEach(agent => {
    const project = findProject(agent.location);
    const task = project?.tasks.find(item => item.id === agent.currentTaskId);
    const workBar = document.getElementById(`work-${agent.id}`);
    if (workBar) workBar.style.width = `${task ? Math.round(task.progress) : 0}%`;
    const energyBar = document.getElementById(`energy-${agent.id}`);
    if (energyBar) energyBar.style.width = `${Math.round(agent.energy)}%`;
    const slot = document.querySelector(`.slot[data-agent-id="${agent.id}"]`);
    if (slot) {
      const isWorking = !agent.sleeping && (Boolean(task && !task.done) || aiBusyAgents.has(agent.id));
      slot.classList.toggle("working", isWorking);
      slot.classList.toggle("sleeping", agent.sleeping);
    }
    syncAgentPose(agent, Boolean(slot?.classList.contains("working")));
    refreshSprites(agent.id);
    applyBubble(agent.id);
  });
  renderTaskList();
  renderOfficeStats();
  updatePodBoard();
  document.querySelectorAll(".tab[data-tab] .count").forEach(node => { node.textContent = `${agentsInProject(node.parentElement.dataset.tab).length}명`; });
  if (panelAgentId) updatePanelLive();
}

/* ================= 사무실 고양이 ================= */
// 연출 ON일 때 가끔 고양이가 지나간다. 누르면 울고 팀원들이 반응한다.
function spawnCat() {
  if (!state.ambient) return;
  const layer = document.getElementById("catLayer");
  if (layer.querySelector(".cat")) return;
  const bubble = el("div", { class: "bubble" });
  const cat = el("div", { class: "cat", dataset: { project: state.activeProjectId } }, bubble, el("span", { text: "🐈" }));
  cat.addEventListener("click", () => {
    bubble.textContent = pickRandom(["냐옹~", "미야아", "골골골…", "냥!"]);
    bubble.classList.add("show");
    playSound("meow");
    const rect = cat.getBoundingClientRect();
    burst(rect.left + rect.width / 2, rect.top, ["🐾", "meow", "✨"], 7);
    agentsInProject(state.activeProjectId).filter(agent => !agent.sleeping).forEach((agent, index) =>
      setTimeout(() => { say(agent.id, pickRandom(getPreset(agent.id).lines.cat)); setExpression(agent.id, "happy", 1200); }, 300 + index * 450));
    unlockAchievement("cat_pet");
  });
  cat.addEventListener("animationend", () => cat.remove());
  layer.append(cat);
  if (Math.random() < 0.5) setTimeout(() => playSound("meow"), 900);
  setTimeout(() => maybePetCat(cat), 2500 + Math.random() * 3500);
}

function scheduleCat() {
  setTimeout(() => { spawnCat(); scheduleCat(); }, 35000 + Math.random() * 45000);
}
