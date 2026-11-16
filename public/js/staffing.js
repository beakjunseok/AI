/* ================= 모든 프로젝트에 항상 일할 팀원 두기 ================= */
// 매 틱마다 아무도 없는 사무실을 찾아 한 명씩 보낸다. 고르는 순서:
//   ① 휴게실에서 깨어 있는 팀원(에너지 높은 순) ② 2명 이상 있는 사무실에서 한 명(덜 바쁜 사람)
//   ③ 그래도 없으면 휴게실에서 자는 팀원(책상에서 마저 자고 일어나 일함).
// 방금 직접 옮긴 팀원(1분 이내), AI 답변 중·심부름 중인 팀원은 건드리지 않는다.
// 프로젝트 수가 팀원 수(5명)보다 많으면 최근에 연 사무실부터 채운다. O(프로젝트 수 × 팀원 수)
const STAFF_MANUAL_GRACE_MS = 60000;
const recentManualMoves = {};

function noteManualMove(agentId) {
  recentManualMoves[agentId] = Date.now();
}

function canReassign(agent) {
  return !aiBusyAgents.has(agent.id) && !errandAgents.has(agent.id) && Date.now() - (recentManualMoves[agent.id] || 0) >= STAFF_MANUAL_GRACE_MS;
}

const currentTaskProgress = agent => findProject(agent.location)?.tasks.find(task => task.id === agent.currentTaskId)?.progress || 0;

function pickStaffMember() {
  const loungers = state.agents.filter(agent => agent.location === "lounge" && canReassign(agent));
  const awakeLounger = loungers.filter(agent => !agent.sleeping).sort((a, b) => b.energy - a.energy)[0];
  if (awakeLounger) return awakeLounger;
  const spareWorkers = state.projects.filter(project => agentsInProject(project.id).length >= 2)
    .flatMap(project => agentsInProject(project.id)).filter(canReassign)
    .sort((a, b) => Number(a.sleeping) - Number(b.sleeping) || currentTaskProgress(a) - currentTaskProgress(b) || b.energy - a.energy);
  if (spareWorkers[0]) return spareWorkers[0];
  return loungers.sort((a, b) => b.energy - a.energy)[0] || null;
}

// 지금 보는 사무실을 먼저, 그다음 목록 순서로 빈 사무실을 채운다.
function ensureEveryProjectStaffed() {
  if (document.querySelector(".ghost")) return;   // 드래그 중엔 손대지 않음
  const ordered = [findProject(state.activeProjectId), ...state.projects.filter(project => project.id !== state.activeProjectId)].filter(Boolean);
  let moved = false;
  for (const project of ordered) {
    if (agentsInProject(project.id).length > 0) continue;
    const agent = pickStaffMember();
    if (!agent) break;
    const slot = firstEmptySlot(project.id);
    if (slot == null) continue;
    const fromProject = findProject(agent.location);
    moveAgent(agent.id, project.id, slot);
    if (agent.location !== project.id) continue;
    moved = true;
    const name = getPreset(agent.id).name;
    say(agent.id, fromProject ? `'${project.name}' 비었길래 지원 갑니다!` : lineFor(agent.id, "commute", "drop"), 3000);
    if (project.id === state.activeProjectId) playLanding(agent.id);
    showToast(`${name} → '${project.name}' (아무도 없어서 지원)`);
  }
  if (moved) renderAll();
}
