/* ================= 제스처 (탭 / 드래그 / 던지기) ================= */
// 포인터 이벤트 하나로 마우스·터치 처리. 8px 이상 움직이면 드래그, 마지막 100ms 이동 속도로 '던지기' 판정.
function bindGesture(node, { onTap, onDragStart, onDragMove, onDrop, onDragEnd }) {
  node.addEventListener("pointerdown", startEvent => {
    if (startEvent.button !== 0) return;
    startEvent.preventDefault();
    const origin = { x: startEvent.clientX, y: startEvent.clientY };
    const trail = [{ x: origin.x, y: origin.y, time: performance.now() }];
    let ghost = null;
    let lastMoveEvent = null;
    // 화면 위/아래 가장자리로 끌면 자동 스크롤 (휴대폰에서 대기실↔책상 거리 해결)
    const autoScrollTimer = setInterval(() => {
      if (!ghost || !lastMoveEvent) return;
      const edge = 70, y = lastMoveEvent.clientY;
      const delta = y < edge ? -14 : y > window.innerHeight - edge ? 14 : 0;
      if (!delta) return;
      window.scrollBy(0, delta);
      onDragMove?.(lastMoveEvent, ghost);
    }, 30);
    try { node.setPointerCapture(startEvent.pointerId); } catch (error) { /* 미지원 브라우저 */ }

    const onMove = moveEvent => {
      trail.push({ x: moveEvent.clientX, y: moveEvent.clientY, time: performance.now() });
      if (trail.length > 8) trail.shift();
      lastMoveEvent = moveEvent;
      if (!ghost && Math.hypot(moveEvent.clientX - origin.x, moveEvent.clientY - origin.y) < 8) return;
      if (!ghost) ghost = onDragStart ? onDragStart(moveEvent) : null;
      if (ghost) onDragMove?.(moveEvent, ghost);
    };
    const onEnd = endEvent => {
      clearInterval(autoScrollTimer);
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerup", onEnd);
      node.removeEventListener("pointercancel", onEnd);
      if (!ghost) { if (endEvent.type === "pointerup") onTap?.(endEvent); return; }
      ghost.remove();
      onDragEnd?.();
      if (endEvent.type !== "pointerup") return;
      const recent = trail.filter(point => performance.now() - point.time < 100);
      const first = recent[0] || trail[0];
      const elapsed = Math.max(16, performance.now() - first.time);
      const speed = Math.hypot(endEvent.clientX - first.x, endEvent.clientY - first.y) / elapsed;
      onDrop?.(endEvent, speed);
    };
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerup", onEnd);
    node.addEventListener("pointercancel", onEnd);
  });
}

function createGhost(node) { document.body.append(node); return node; }
function moveGhost(ghost, event) { ghost.style.left = `${event.clientX}px`; ghost.style.top = `${event.clientY}px`; }

let highlightedNode = null;
function highlightTarget(node) {
  if (node === highlightedNode) return;
  highlightedNode?.classList.remove("dropHover");
  node?.classList.add("dropHover");
  highlightedNode = node;
}

function findDropTarget(x, y) {
  const under = document.elementFromPoint(x, y);
  return under ? (under.closest("[data-slot]") || under.closest("[data-tab]") || under.closest("#lounge")) : null;
}

function findAgentUnder(x, y) {
  const under = document.elementFromPoint(x, y);
  const slot = under?.closest(".slot[data-agent-id]");
  if (slot) return slot.querySelector(".agent");
  return under?.closest("#app .agent[data-agent]") || null;
}

function createAgentNode(agentId) {
  const agent = getAgent(agentId);
  const provider = providerInfo(agent.model);
  const dot = el("span", { class: "modelDot", text: provider.label });
  dot.style.background = provider.color;
  const node = el("div", { class: "agent" + (agent.sleeping ? " sleeping" : "") + (panelAgentId === agentId ? " selected" : "") + (errandAgents.has(agentId) ? " away" : ""), dataset: { agent: agentId } },
    el("div", { class: "bubble" }), el("span", { class: "zzz", text: "💤" }), dot, spriteImage(agentId));
  bindGesture(node, {
    onTap: () => tapAgent(agentId),
    onDragEnd: () => node.classList.remove("dragging"),
    onDragStart: () => {
      node.classList.add("dragging");
      setExpression(agentId, "surprised", 60000);
      const ghost = createGhost(el("div", { class: "agent ghost" }, el("div", { class: "bubble", text: pickRandom(getPreset(agentId).lines.grab) }), spriteImage(agentId, "", "flail")));
      return ghost;
    },
    onDragMove: (event, ghost) => { moveGhost(ghost, event); highlightTarget(findDropTarget(event.clientX, event.clientY)); },
    onDrop: (event, speed) => {
      highlightTarget(null);
      expressions[agentId] = null;
      handleDrop(agentId, findDropTarget(event.clientX, event.clientY));
      if (speed > 1.5) throwDizzy(agentId); else refreshSprites(agentId);
    }
  });
  return node;
}

function handleDrop(agentId, target) {
  if (!target) return;
  if (target.id === "lounge") moveAgent(agentId, "lounge", null);
  else if (target.dataset.tab) moveAgent(agentId, target.dataset.tab, null);
  else if (target.dataset.slot != null) moveAgent(agentId, state.activeProjectId, Number(target.dataset.slot));
}

/* ================= 상호작용: 탭 / 쓰다듬기 / 던지기 / 간식 ================= */
function tapAgent(agentId) {
  const agent = getAgent(agentId);
  openPanel(agentId);
  if (agent.sleeping) { say(agentId, pickRandom(getPreset(agentId).lines.sleepTalk)); return; }
  setExpression(agentId, "happy", 900);
  say(agentId, pickRandom(getPreset(agentId).lines.greet));
}

// 3초 안에 6번 넘게 쓰다듬으면 싫어한다.
function petAgent(agentId) {
  const agent = getAgent(agentId);
  const preset = getPreset(agentId);
  const now = Date.now();
  petHistory[agentId] = (petHistory[agentId] || []).filter(time => now - time < 3000).concat(now);
  if (agent.sleeping) { say(agentId, pickRandom(preset.lines.sleepTalk)); burstAtAgent(agentId, ["💤"], 3); return; }
  if (petHistory[agentId].length > 6) {
    setExpression(agentId, "surprised", 1500);
    say(agentId, pickRandom(preset.lines.petSpam));
    burstAtAgent(agentId, ["💢", "💦"], 4);
    unlockAchievement("pet_spam");
    return;
  }
  agent.affection = clamp(agent.affection + 2, 0, 100);
  state.stats.pets += 1;
  setExpression(agentId, "happy", 1200);
  say(agentId, pickRandom(preset.lines.pet));
  burstAtAgent(agentId, ["+1", "👍", "✨", "LGTM"], 5);
  unlockAchievement("first_pet");
  saveState();
  if (panelAgentId === agentId) updatePanelLive();
}

function throwDizzy(agentId) {
  const agent = getAgent(agentId);
  agent.affection = clamp(agent.affection - 2, 0, 100);
  setTimeout(() => {
    setExpression(agentId, "dizzy", 3000);
    say(agentId, pickRandom(getPreset(agentId).lines.dizzy), 3000);
    burstAtAgent(agentId, ["💫", "⭐", "🌀"], 6);
  }, 60);
  unlockAchievement("first_throw");
  saveState();
}

function feedSnack(agentId, snackKey) {
  const snack = SNACKS.find(item => item.key === snackKey);
  const agent = getAgent(agentId);
  if (state.coins < snack.price) { showToast(`코인이 부족해요 (${snack.price}🪙 필요). 업무를 끝내면 모여요!`); return; }
  state.coins -= snack.price;
  agent.energy = clamp(agent.energy + snack.energy, 0, 100);
  agent.affection = clamp(agent.affection + snack.love, 0, 100);
  const wasSleeping = agent.sleeping;
  agent.sleeping = false;
  setExpression(agentId, "happy", 1500);
  say(agentId, wasSleeping ? `${pickRandom(getPreset(agentId).lines.wake)} ${snack.icon}` : pickRandom(getPreset(agentId).lines.snack));
  burstAtAgent(agentId, [snack.icon, "+HP", "⚡"], 6);
  unlockAchievement("snack_first");
  saveState();
  renderAll();
}
