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
  playSound("switchProject");
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
  // 프로젝트면 종류도 여기서 바꾼다(AI 토론·브리프의 전제가 바뀜).
  let chosenKind = project?.kind || "general";
  const kindChips = project ? el("div", { class: "kindChips" }, Object.entries(PROJECT_KINDS).map(([key, kind]) =>
    el("button", { type: "button", class: "kindChip" + (key === chosenKind ? " on" : ""), dataset: { kind: key }, text: `${kind.icon} ${kind.label}`,
      onclick: event => { chosenKind = key; kindChips.querySelectorAll(".kindChip").forEach(chip => chip.classList.toggle("on", chip.dataset.kind === key)); event.preventDefault(); } }))) : null;
  // 종류에 따라 GitHub·웹 주소 칸을 보여준다(종류를 바꾸면 즉시 갱신).
  const repoInput = el("input", { type: "text", inputmode: "url", autocapitalize: "off", placeholder: "https://github.com/사용자/저장소", "aria-label": "GitHub 주소", style: "width:100%" });
  const siteInput = el("input", { type: "text", inputmode: "url", autocapitalize: "off", placeholder: "https://내사이트.vercel.app", "aria-label": "웹 주소", style: "width:100%" });
  repoInput.value = project?.repoUrl || "";
  siteInput.value = project?.siteUrl || "";
  const repoRow = el("label", { class: "fieldRow" }, el("span", { text: "🐙 GitHub" }), repoInput);
  const siteRow = el("label", { class: "fieldRow" }, el("span", { text: "🔗 웹 주소" }), siteInput);
  const syncFieldRows = () => { const fields = PROJECT_KINDS[chosenKind].fields; repoRow.hidden = !fields.repo; siteRow.hidden = !fields.site; };
  if (kindChips) { kindChips.addEventListener("click", () => setTimeout(syncFieldRows)); syncFieldRows(); }
  const form = el("form", { onclick: event => event.stopPropagation() }, input, kindChips, project ? repoRow : null, project ? siteRow : null,
    el("button", { class: "btn pink", type: "submit", style: "width:100%;margin-top:8px", text: "바꾸기" }),
    kind === "app" ? el("button", { class: "btn soft", type: "button", style: "width:100%;margin-top:6px", text: "기본값으로", onclick: () => { input.value = DEFAULT_APP_TITLE; } }) : null);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const name = input.value.replace(/\s+/g, " ").trim().slice(0, TITLE_MAX_LENGTH);
    if (!name) { showToast("이름을 입력해 주세요"); return; }
    if (project) {
      const repoUrl = normalizeUrl(repoInput.value);
      const siteUrl = normalizeUrl(siteInput.value);
      if (repoUrl === null || siteUrl === null) { showToast("주소는 http(s)://로 시작해야 해요"); return; }
      Object.assign(project, { name, kind: chosenKind, repoUrl, siteUrl });
    } else state.appTitle = name;
    saveState();
    zoom.classList.remove("show");
    renderAll();
    showToast(project ? `${projectKindOf(project).icon} '${name}' · ${projectKindOf(project).label}` : `'${name}'(으)로 바꿨어요`);
  });
  zoom.replaceChildren(el("div", { class: "zoomCard chunky", onclick: event => event.stopPropagation() },
    el("h3", { text: project ? "✏️ 사무실 이름 · 종류" : "✏️ 제목 바꾸기" }), form));
  zoom.classList.add("show");
  setTimeout(() => { input.focus(); input.select(); }, 50);
}

// 빈 값은 ""; http(s) 주소만 허용(주소창용 javascript: 등 차단). 형식이 틀리면 null. 'github.com/..'처럼 생략하면 https:// 보충.
function normalizeUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch (error) {
    return null;
  }
}

// 두 코드의 줄 단위 차이(추가·삭제 줄 수). 줄 내용을 개수로 세어 비교하는 근사치. O(줄 수)
function countLineChanges(previousCode, nextCode) {
  const counts = new Map();
  const toLines = code => (code ? String(code).split("\n") : []);
  toLines(previousCode).forEach(line => counts.set(line, (counts.get(line) || 0) + 1));
  let added = 0;
  toLines(nextCode).forEach(line => {
    const left = counts.get(line) || 0;
    if (left > 0) counts.set(line, left - 1); else added += 1;
  });
  const removed = [...counts.values()].reduce((sum, value) => sum + value, 0);
  return { added, removed };
}

const formatHistoryTime = time => new Date(time).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

// 프로젝트 코드 칸: 아두이노·IoT 프로젝트의 현재 코드를 붙여 두면 AI가 참고하고, 브리프 '초기 코드'도 이어서 쓴다.
// 저장할 때 내용이 바뀌었으면 시간·줄 수·변경량과 함께 버전 기록을 남긴다(불러오기·복사 가능).
function openCodeEditor(projectId) {
  const project = findProject(projectId);
  if (!project) return;
  const zoom = document.getElementById("zoom");
  const textarea = el("textarea", { class: "codeEditor", spellcheck: "false", maxlength: String(PROJECT_CODE_MAX_LENGTH), placeholder: "// 여기에 아두이노 코드(.ino)를 붙여넣거나 작성하세요\nvoid setup() {\n}\n\nvoid loop() {\n}", "aria-label": "프로젝트 코드" });
  textarea.value = project.code || "";
  const counter = el("small", { class: "codeCounter" });
  const updateCounter = () => { counter.textContent = `${textarea.value.length.toLocaleString()} / ${PROJECT_CODE_MAX_LENGTH.toLocaleString()}자 · 크레딧 절약: AI 대화엔 줄 수만 · 저장 리뷰엔 바뀐 부분만 · 초기 코드 작성 때만 앞 8,000자`; };
  textarea.addEventListener("input", updateCounter);
  // 탭 키로 들여쓰기(포커스 이동 대신)
  textarea.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    const { selectionStart, selectionEnd } = textarea;
    textarea.setRangeText("  ", selectionStart, selectionEnd, "end");
    updateCounter();
  });
  updateCounter();
  const reviewToggle = el("input", { type: "checkbox" });
  reviewToggle.checked = project.autoReview !== false;
  const save = () => {
    const nextCode = textarea.value.slice(0, PROJECT_CODE_MAX_LENGTH);
    const previousCode = project.code || "";
    const changed = nextCode !== previousCode;
    project.autoReview = reviewToggle.checked;
    if (changed) {
      const { added, removed } = countLineChanges(project.code, nextCode);
      project.codeHistory = [{ time: Date.now(), code: nextCode, lines: nextCode.split("\n").length, added, removed }, ...(project.codeHistory || [])].slice(0, PROJECT_CODE_HISTORY_KEEP);
    }
    project.code = nextCode;
    saveState();
    zoom.classList.remove("show");
    renderOffice();
    showToast(project.code.trim() ? "💾 코드를 저장했어요. AI 팀원들이 참고해요" : "코드를 비웠어요");
    if (changed) requestCodeReview(project.id, previousCode, nextCode);
  };
  const copy = () => navigator.clipboard?.writeText(textarea.value).then(() => showToast("코드를 복사했어요"), () => showToast("복사하지 못했어요"));
  const history = project.codeHistory || [];
  const historyRows = history.map((version, index) => el("div", { class: "historyRow" + (index === 0 ? " current" : "") },
    el("span", { class: "historyTime", text: formatHistoryTime(version.time) }),
    el("span", { class: "historyMeta", text: `${version.lines}줄` }),
    el("span", { class: "historyDiff" }, el("b", { class: "plus", text: `+${version.added}` }), " ", el("b", { class: "minus", text: `−${version.removed}` })),
    index === 0 ? el("span", { class: "historyTag", text: "현재" }) : el("button", { class: "btn soft", type: "button", text: "불러오기",
      onclick: () => { textarea.value = version.code; updateCounter(); showToast(`${formatHistoryTime(version.time)} 버전을 불러왔어요. 저장하면 이 코드가 현재 코드가 돼요`); } })));
  const historyBox = el("details", { class: "codeHistory" }, el("summary", { text: `🕘 변경 기록 ${history.length}개 (최근 ${PROJECT_CODE_HISTORY_KEEP}개 보관)` }),
    history.length ? el("div", { class: "historyList" }, historyRows) : el("p", { class: "emptyNote", text: "아직 기록이 없어요. 코드를 저장하면 시간별로 남아요." }));
  zoom.replaceChildren(el("div", { class: "zoomCard chunky codeCard", onclick: event => event.stopPropagation() },
    el("h3", { text: `💾 ${project.name} · 코드` }), textarea, counter,
    el("label", { class: "reviewToggle" }, reviewToggle, " 저장할 때마다 AI가 바뀐 코드를 리뷰(기획방에 남김)"), historyBox,
    el("div", { class: "codeActions" },
      el("button", { class: "btn soft", type: "button", text: "복사", onclick: copy }),
      el("button", { class: "btn pink", type: "button", text: "저장", onclick: save }))));
  zoom.classList.add("show");
  setTimeout(() => textarea.focus(), 50);
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
  // 빈 자리도 같은 높이의 명패를 둬서 주인이 있든 없든 책상 위치가 같게 한다.
  if (!occupant) { slot.append(desk, el("div", { class: "plate vacant", text: `0x0${slotIndex + 1} ----` })); return slot; }
  const preset = getPreset(occupant.id);
  slot.dataset.agentId = occupant.id;
  const chair = el("div", { class: "chair" });
  chair.style.background = preset.palette.chair;
  slot.append(chair, el("div", { class: "seat" }, createAgentNode(occupant.id)));
  // 앉은 팀원 바로 앞 작은 키보드(팀원마다 다른 모델). 일하는 중(.slot.working)이면 키가 깜빡이며 눌린다.
  desk.append(el("div", { class: `keyboard kb-${occupant.id}`, "aria-hidden": "true" }));
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
      onDragStart: () => { playSound("grab"); return createGhost(el("div", { class: "ghost snackGhost", text: snack.icon })); },
      onDragMove: (event, ghost) => { moveGhost(ghost, event); highlightTarget(findAgentUnder(event.clientX, event.clientY)); },
      onDrop: event => {
        highlightTarget(null);
        const target = findAgentUnder(event.clientX, event.clientY);
        if (target) feedSnack(target.dataset.agent, snack.key);
      }
    });
    snackBar.append(node);
  });
  snackBar.append(el("button", { class: "autoSnackBtn" + (state.autoSnack ? " on" : ""), type: "button", title: "잠든 팀원에게 코인으로 간식을 자동으로 줘요",
    text: state.autoSnack ? "🤖 자동 간식 ON" : "🤖 자동 간식 OFF", onclick: toggleAutoSnack }));
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
