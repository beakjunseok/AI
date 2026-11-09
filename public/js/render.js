/* ================= 렌더링: 헤더 / 탭 / 사무실 / 대기실 ================= */
// 프로젝트마다 대화방이 따로 있다. 지금 방(state.chat·state.discussion)을 보관함에 넣고 대상 방을 꺼내 온다.
// AI가 답하는 중에 바꾸면 답이 엉뚱한 방에 들어가므로 막는다. O(1)
function switchProject(projectId) {
  if (projectId === state.activeProjectId || !findProject(projectId)) return true;
  if (aiBusyAgents.size > 0 || isDiscussionActive()) { showToast("AI가 답하는 중이에요. 끝나면 프로젝트를 바꿀 수 있어요"); return false; }
  if (findProject(state.activeProjectId)) {
    state.chatByProject[state.activeProjectId] = state.chat;
    state.discussionByProject[state.activeProjectId] = state.discussion;
  }
  state.activeProjectId = projectId;
  state.chat = state.chatByProject[projectId] || [];
  state.discussion = state.discussionByProject[projectId] || null;
  delete state.chatByProject[projectId];
  delete state.discussionByProject[projectId];
  threadPinnedToBottom = true;
  unseenMessageCount = 0;
  return true;
}

// 앱 제목과 프로젝트(사무실) 이름을 바꾸는 공용 입력 카드. 빈 값·공백은 거부하고 최대 24자로 자른다.
function openRenamePrompt(kind, projectId) {
  const project = kind === "project" ? findProject(projectId) : null;
  if (kind === "project" && !project) return;
  const current = project ? project.name : state.appTitle;
  const zoom = document.getElementById("zoom");
  const input = el("input", { type: "text", maxlength: String(TITLE_MAX_LENGTH), style: "width:100%;margin-top:10px", "aria-label": "새 이름" });
  input.value = current;
  const form = el("form", { onclick: event => event.stopPropagation() }, input,
    el("button", { class: "btn pink", type: "submit", style: "width:100%;margin-top:8px", text: "바꾸기" }),
    kind === "app" ? el("button", { class: "btn soft", type: "button", style: "width:100%;margin-top:6px", text: "기본값으로", onclick: () => { input.value = DEFAULT_APP_TITLE; } }) : null);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = input.value.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX_LENGTH);
    if (!name) { showToast("이름을 입력해 주세요"); return; }
    if (project) project.name = name; else state.appTitle = name;
    saveState();
    zoom.classList.remove("show");
    renderAll();
    showToast(`'${name}'(으)로 바꿨어요`);
  });
  zoom.replaceChildren(el("div", { class: "zoomCard chunky", onclick: event => event.stopPropagation() },
    el("h3", { text: project ? "✏️ 사무실 이름 바꾸기" : "✏️ 제목 바꾸기" }), form));
  zoom.classList.add("show");
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

function renderAppTitle() {
  const title = state.appTitle || DEFAULT_APP_TITLE;
  document.getElementById("appTitle").textContent = title;
  document.title = title;
}

// 책상 한 칸: 의자, 팀원, 모니터, 소품, 명패, 업무/에너지 바.
function createDeskSlot(slotIndex, occupant) {
  const slot = el("div", { class: "slot" + (occupant ? "" : " empty"), dataset: { slot: String(slotIndex) } });
  const desk = el("div", { class: "desk" }, el("div", { class: "monitorStand" }), el("div", { class: "monitor" }));
  if (!occupant) { slot.append(desk); return slot; }
  const preset = getPreset(occupant.id);
  slot.dataset.agentId = occupant.id;
  const chair = el("div", { class: "chair" });
  chair.style.background = preset.palette.chair;
  slot.append(chair, el("div", { class: "seat" }, createAgentNode(occupant.id)));
  desk.append(el("div", { class: "deskItems" }, preset.items.map(item =>
    el("span", { class: "item", text: item.icon, title: item.name, onclick: event => { event.stopPropagation(); openZoom(preset, item); } }))));
  desk.append(el("div", { class: "deskBars" },
    el("div", { class: "miniBar work" }, el("i", { id: `work-${occupant.id}` })),
    el("div", { class: "miniBar energy" }, el("i", { id: `energy-${occupant.id}` }))));
  slot.append(desk, el("div", { class: "plate", text: `0x0${slotIndex + 1} ${preset.name}·${ROLE_LABELS[preset.roleKey]}`, onclick: () => openPanel(occupant.id) }));
  return slot;
}

function renderLounge() {
  const area = document.getElementById("loungeArea");
  area.replaceChildren();
  const waiting = state.agents.filter(agent => agent.location === "lounge");
  if (!waiting.length) area.append(el("span", { class: "emptyNote", text: "// 전원 근무 중. 휴게실 비었음" }));
  waiting.forEach(agent => {
    const node = createAgentNode(agent.id);
    applyMotionPose(node, agent.id);
    node.append(el("div", { class: "loungeTag", text: getPreset(agent.id).name }));
    area.append(node);
  });
  const snackBar = document.getElementById("snackBar");
  snackBar.replaceChildren(el("span", { class: "emptyNote", text: "자판기:" }));
  SNACKS.forEach(snack => {
    const node = el("div", { class: "snack", title: `${snack.name} (${snack.price}코인)` }, snack.icon, el("small", { text: `${snack.price}🪙` }));
    bindGesture(node, {
      onTap: () => showToast(`${snack.icon} ${snack.name}을(를) 팀원에게 끌어다 주세요!`),
      onDragStart: () => createGhost(el("div", { class: "ghost snackGhost", text: snack.icon })),
      onDragMove: (event, ghost) => { moveGhost(ghost, event); highlightTarget(findAgentUnder(event.clientX, event.clientY)); },
      onDrop: event => {
        highlightTarget(null);
        const target = findAgentUnder(event.clientX, event.clientY);
        if (target) feedSnack(target.dataset.agent, snack.key);
      }
    });
    snackBar.append(node);
  });
}

function renderTaskList() {
  const project = findProject(state.activeProjectId);
  const list = document.getElementById("taskList");
  list.replaceChildren();
  const pending = project.tasks.filter(task => !task.done);
  const finished = project.tasks.filter(task => task.done).slice(-5).reverse();
  if (!pending.length && !finished.length) {
    list.append(el("p", { class: "emptyNote", text: "// 이슈 없음. 팀원을 앉히면 알아서 일을 찾거나, 위에서 직접 추가하세요." }));
    return;
  }
  [...pending, ...finished].forEach(task => {
    const assigneeName = task.assigneeId ? getPreset(task.assigneeId).name : (task.roleKey === "any" ? "누구든" : `${ROLE_LABELS[task.roleKey]} 대기`);
    list.append(el("div", { class: "taskRow" + (task.done ? " done" : "") },
      el("span", { class: "title", text: (task.createdBy === "user" ? "⭐ " : "") + task.title }),
      el("span", { class: "who", text: task.done ? `✅ ${assigneeName}` : assigneeName }),
      el("div", { class: "bar" }, el("i", { style: `width:${Math.round(task.progress)}%` }))));
  });
}

/* ================= 하늘 / 시계 ================= */
function renderWindowAndClock() {
  const now = new Date();
  const hour = now.getHours();
  const phase = hour >= 6 && hour < 10 ? "morning" : hour >= 10 && hour < 17 ? "day" : hour >= 17 && hour < 20 ? "evening" : "night";
  const windowNode = document.getElementById("window");
  if (windowNode.dataset.phase !== phase) {
    windowNode.dataset.phase = phase;
    windowNode.className = `window sky-${phase}`;
    const decorations = phase === "night"
      ? [el("span", { class: "sunmoon", text: "🌙" }), ...[[12,10],[30,30],[60,14],[80,36],[45,44]].map(([left, top], index) => {
          const star = el("span", { class: "star", text: "✦" }); star.style.left = `${left}%`; star.style.top = `${top}px`; star.style.animationDelay = `${index * .4}s`; return star; })]
      : [el("span", { class: "sunmoon", text: phase === "evening" ? "🌇" : "☀️" }), el("span", { class: "cloud", text: "☁️", style: "top:6px" }), el("span", { class: "cloud c2", text: "☁️" })];
    windowNode.replaceChildren(...decorations);
  }
  document.getElementById("clock").textContent = now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}
