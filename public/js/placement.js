/* ================= 배치 ================= */
function releaseTask(agent) {
  if (!agent.currentTaskId) return;
  state.projects.forEach(project => {
    const task = project.tasks.find(item => item.id === agent.currentTaskId);
    if (task && !task.done) task.assigneeId = null;
  });
  agent.currentTaskId = null;
}

function firstEmptySlot(projectId) {
  const taken = new Set(agentsInProject(projectId).map(agent => agent.slot));
  for (let index = 0; index < SLOT_COUNT; index++) if (!taken.has(index)) return index;
  return null;
}

// 대기실/프로젝트 책상으로 이동. 자리가 차 있으면 원래 앉은 팀원과 자리를 맞바꾼다.
function moveAgent(agentId, destination, requestedSlot) {
  const agent = getAgent(agentId);
  const preset = getPreset(agentId);
  const fromLocation = agent.location, fromSlot = agent.slot;
  if (destination === "lounge") {
    if (fromLocation === "lounge") return;
    releaseTask(agent);
    agent.location = "lounge"; agent.slot = null;
    addLog(agent, { kind: "move", text: "대기 공간으로 이동 (휴식 중)" });
  } else {
    const project = findProject(destination);
    if (!project) return;
    const slot = requestedSlot ?? firstEmptySlot(destination);
    if (slot == null) { showToast(`'${project.name}' 자리가 꽉 찼어요`); return; }
    if (fromLocation === destination && fromSlot === slot) return;
    const occupant = state.agents.find(other => other.location === destination && other.slot === slot && other.id !== agentId);
    if (occupant) {
      releaseTask(occupant);
      occupant.location = fromLocation;
      occupant.slot = fromLocation === "lounge" ? null : fromSlot;
      occupant.corridorX = agent.corridorX;
      occupant.spot = agent.spot;
      occupant.corridorUntil = Date.now() + corridorStayMs();
      say(occupant.id, pickRandom(getPreset(occupant.id).lines.grab));
    }
    if (fromLocation !== destination) {
      releaseTask(agent);
      addLog(agent, { kind: "move", text: `'${project.name}' 사무실에 배치됨`, project: project.name });
    }
    agent.location = destination; agent.slot = slot;
  }
  saveState();
  renderAll();
  say(agentId, destination === "lounge" ? lineFor(agentId, "idle") : lineFor(agentId, Math.random() < 0.5 ? "landed" : "drop", "drop"));
  const allWorking = state.agents.every(item => item.location !== "lounge");
  if (allWorking) unlockAchievement("all_working");
}

// 복도에 내려놓기: 그 사무실 소속은 유지하되 책상 없이 서서 쉰다(업무는 내려놓음). fraction = 복도 왼쪽 0 ~ 오른쪽 1.
function moveToCorridor(agentId, fraction) {
  const agent = getAgent(agentId);
  const project = findProject(state.activeProjectId);
  if (agent.location !== project.id) addLog(agent, { kind: "move", text: `'${project.name}' 사무실 복도로 이동`, project: project.name });
  agent.returnSlot = agent.location === project.id && agent.slot != null ? agent.slot : null;
  agent.corridorUntil = Date.now() + corridorStayMs();
  releaseTask(agent);
  agent.location = project.id;
  agent.slot = null;
  agent.spot = "corridor";
  agent.corridorX = clamp(fraction, 0, 1);
  delete loungeOffsets[agentId];
  saveState();
  renderAll();
  say(agentId, lineFor(agentId, "corridor"));
}

// 책상 사이 바닥에 내려놓기: 발이 손끝 위치에 오도록 세우고, 잠시 뒤 스스로 커피·동료 방문·복귀 중 하나를 한다.
function moveToFloor(agentId, clientX, clientY) {
  const agent = getAgent(agentId);
  const project = findProject(state.activeProjectId);
  const wrap = document.getElementById("deskWrap").getBoundingClientRect();
  const sprite = spriteMetrics();
  agent.returnSlot = agent.location === project.id && agent.slot != null ? agent.slot : agent.returnSlot ?? null;
  if (agent.location !== project.id) { addLog(agent, { kind: "move", text: `'${project.name}' 사무실로 이동`, project: project.name }); agent.returnSlot = null; }
  releaseTask(agent);
  Object.assign(agent, {
    location: project.id, slot: null, spot: "floor",
    floorX: clamp((clientX - wrap.left - sprite.width / 2) / wrap.width, 0, 1 - sprite.width / wrap.width),
    floorY: clamp((clientY - wrap.top - sprite.height * 0.85) / wrap.height, 0, 1 - sprite.height / wrap.height),
    corridorUntil: Date.now() + FLOOR_STAY_MS()
  });
  delete loungeOffsets[agentId];
  saveState();
  renderAll();
  say(agentId, lineFor(agentId, Math.random() < 0.5 ? "landed" : "idle", "drop"));
}

// 회의 공간(뮤트 옆 빈 칸)에 앉히기. 최대 POD_CAPACITY명.
const POD_CAPACITY = 3;
function moveToPod(agentId) {
  const agent = getAgent(agentId);
  const project = findProject(state.activeProjectId);
  if (isInPod(agent) && agent.location === project.id) return;
  if (agentsInProject(project.id).filter(isInPod).length >= POD_CAPACITY) { showToast(`회의 공간은 ${POD_CAPACITY}명까지예요`); return; }
  if (agent.location !== project.id) addLog(agent, { kind: "move", text: `'${project.name}' 회의 공간으로 이동`, project: project.name });
  releaseTask(agent);
  agent.location = project.id;
  agent.slot = null;
  agent.spot = "pod";
  delete loungeOffsets[agentId];
  saveState();
  renderAll();
  say(agentId, lineFor(agentId, "pod"));
}

function closeProject(projectId) {
  const project = findProject(projectId);
  if (aiBusyAgents.size > 0 || isDiscussionActive()) { showToast("AI가 답하는 중에는 사무실을 닫을 수 없어요"); return; }
  if (!window.confirm(`'${project.name}' 사무실과 대화 내용을 모두 지울까요?`)) return;
  agentsInProject(projectId).forEach(agent => { releaseTask(agent); agent.location = "lounge"; agent.slot = null; });
  const nextProject = state.projects.find(item => item.id !== projectId);
  if (projectId === state.activeProjectId) { state.chat = []; state.discussion = null; switchProject(nextProject.id); }
  delete state.chatByProject[projectId];
  delete state.discussionByProject[projectId];
  state.projects = state.projects.filter(item => item.id !== projectId);
  saveState(); renderAll();
  showToast(`'${project.name}' 사무실을 닫았어요. 팀원은 소파로!`);
}
