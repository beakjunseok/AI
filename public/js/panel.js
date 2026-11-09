/* ================= 왼쪽 AI 패널 ================= */
const ROOM_CHANNEL = "room";
const channelOf = message => message.channel || ROOM_CHANNEL;
let panelRoomMode = false;

function openRoom() {
  if (!panelRoomMode) threadPinnedToBottom = true;
  panelRoomMode = true;
  panelAgentId = panelAgentId || AGENT_PRESETS[0].id;
  if (!document.body.classList.contains("panelOpen")) playSound("panelOpen");
  document.body.classList.add("panelOpen");
  document.querySelectorAll("#app .agent.selected").forEach(node => node.classList.remove("selected"));
  renderPanel();
}

function openPanel(agentId) {
  if (panelAgentId !== agentId || panelRoomMode) threadPinnedToBottom = true;
  panelRoomMode = false;
  panelAgentId = agentId;
  if (!document.body.classList.contains("panelOpen")) playSound("panelOpen");
  document.body.classList.add("panelOpen");
  document.querySelectorAll("#app .agent").forEach(node => node.classList.toggle("selected", node.dataset.agent === agentId));
  renderPanel();
}

function closePanel() {
  if (document.body.classList.contains("panelOpen")) playSound("panelClose");
  panelAgentId = null;
  panelRoomMode = false;
  document.body.classList.remove("panelOpen");
  document.querySelectorAll("#app .agent.selected").forEach(node => node.classList.remove("selected"));
}

// 패널은 두 모드: 기획방(팀 전체 대화만, 캐릭터 선택 없음) / 1:1(캐릭터를 눌렀을 때, 그 팀원과의 개인 대화만).
function renderPanel() {
  const panel = document.getElementById("panel");
  const previousThread = document.getElementById("thread");
  if (previousThread) threadSavedScrollTop = previousThread.scrollTop;
  const previousInput = document.getElementById("chatInput");
  const draft = previousInput ? previousInput.value : "";
  const hadFocus = previousInput && document.activeElement === previousInput;

  if (panelRoomMode) panel.replaceChildren(renderRoomHead(), el("div", { class: "panelBody" }, renderChatView(null)));
  else panel.replaceChildren(...renderAgentHead(panelAgentId), el("div", { class: "panelBody" }, renderChatView(panelAgentId), renderInfoView(panelAgentId)));

  updatePanelLive();
  const thread = document.getElementById("thread");
  if (thread) {
    if (threadPinnedToBottom) thread.scrollTop = thread.scrollHeight;
    else { thread.scrollTop = threadSavedScrollTop; showJumpButton(); }
  }
  const input = document.getElementById("chatInput");
  if (input && draft) input.value = draft;
  if (input && hadFocus) input.focus();
}

function renderRoomHead() {
  const project = findProject(state.activeProjectId);
  const online = [...serverProviders];
  return el("div", { class: "panelHead" },
    el("div", {},
      el("h2", { class: "roomTitle" }, `💬 ${project ? project.name : "기획"} 기획방`),
      el("div", { class: "modelRow", text: `팀 전체와 대화 · 연결된 AI: ${online.length ? online.map(name => providerInfo(name).label).join(", ") : "없음(시뮬레이션)"}` })),
    el("button", { class: "closeBtn", text: "✕", "aria-label": "닫기", onclick: closePanel }));
}

function renderAgentHead(agentId) {
  const agent = getAgent(agentId);
  const preset = getPreset(agentId);
  const modelSelect = el("select", { "aria-label": "AI 모델" }, Object.entries(MODEL_PROVIDERS).map(([key, provider]) =>
    el("option", { value: key, text: `${provider.label} (${provider.rank})`, selected: agent.model === key })));
  modelSelect.addEventListener("change", () => {
    agent.model = modelSelect.value;
    saveState(); renderAll();
    say(agentId, `두뇌를 ${providerInfo(agent.model).label}(으)로 바꿨어요!`);
  });
  const switcher = el("div", { class: "agentSwitch" }, AGENT_PRESETS.map(item => {
    const provider = providerInfo(getAgent(item.id).model);
    const dot = el("span", { class: "modelDot", text: provider.label });
    dot.style.background = provider.color;
    return el("button", { class: "switchBtn" + (item.id === agentId ? " on" : ""), title: item.name, onclick: () => openPanel(item.id) }, dot, spriteImage(item.id));
  }));
  return [
    el("div", { class: "panelHead" },
      spriteImage(agentId, "bigSprite"),
      el("div", {},
        el("h2", {}, preset.name, el("span", { class: "roleChip", text: `${ROLE_LABELS[preset.roleKey]} 담당` })),
        el("div", { class: "modelRow" }, "🧠 두뇌", modelSelect),
        el("div", { class: "modelRow", id: "panelQuota", text: `⚡ ${quotaLine(agent.model)}` }),
        el("div", { class: "modelRow", id: "panelMood" })),
      el("button", { class: "closeBtn", text: "✕", "aria-label": "닫기", onclick: closePanel })),
    switcher,
    el("div", { class: "panelTabs" },
      el("button", { class: panelTab === "chat" ? "on" : "", text: `💬 1:1 대화`, onclick: () => { panelTab = "chat"; renderPanel(); } }),
      el("button", { class: panelTab === "info" ? "on" : "", text: "📋 정보", onclick: () => { panelTab = "info"; renderPanel(); } }))
  ];
}

// agentId가 null이면 기획방(팀 채널), 아니면 그 팀원과의 1:1 채널을 보여준다.
function renderChatView(agentId) {
  const isRoom = !agentId;
  const channel = isRoom ? ROOM_CHANNEL : agentId;
  const preset = isRoom ? null : getPreset(agentId);
  const busy = aiBusyAgents.size > 0;
  const textarea = el("textarea", { id: "chatInput", maxlength: "2000",
    placeholder: isRoom ? "팀 전체에게 말하기… (Enter 전송 · Shift+Enter 줄바꿈)" : `${preset.name}에게 1:1로 말하기… (Enter 전송)` });
  const sendButton = el("button", { class: "btn pink", type: "submit", text: busy ? "답변 중…" : isRoom ? "👥 팀 전체에게 보내기" : `${preset.name}에게 보내기` });
  if (busy) sendButton.disabled = true;
  const promptLine = el("div", { class: "prompt" }, "root@ai-office:~$ ", el("b", { text: isRoom ? "talk --to @team" : `talk --to @${preset.name}` }));
  const buttonRows = [el("div", { class: "chatButtons" }, sendButton)];
  let topicButton = null;
  if (isRoom) {
    topicButton = el("button", { class: "btn", type: "button", text: "🧠 이 주제로 구체화", title: "입력한 큰 주제로 AI끼리 토론해 아이디어를 구체화해요" });
    if (busy || isDiscussionActive()) topicButton.disabled = true;
    const brainstormButton = el("button", { class: "btn", type: "button", text: "💡 브레인스토밍", title: "AI들이 각자 아이디어를 마구 던지고, 칸반이 추려 줘요. 입력칸이 비어 있으면 지금까지 대화로 해요",
      onclick: () => { const seed = textarea.value.trim(); textarea.value = ""; threadPinnedToBottom = true; startBrainstorm(seed); } });
    if (busy || isDiscussionActive()) brainstormButton.disabled = true;
    buttonRows.push(el("div", { class: "chatButtons secondary" }, brainstormButton, topicButton));
  }
  const form = el("form", { class: "chatForm" }, promptLine, textarea, buttonRows,
    isRoom ? null : el("p", { class: "modelNote", text: modelNoteText(getAgent(agentId).model) }));
  const submit = mode => {
    const text = textarea.value.trim();
    if (!text) { showToast("메시지를 적어 주세요"); return; }
    textarea.value = "";
    threadPinnedToBottom = true;
    unseenMessageCount = 0;
    if (mode === "topic") startDiscussion(text); else if (isRoom) sendToTeam(text); else sendToAgent(agentId, text);
  };
  form.addEventListener("submit", event => { event.preventDefault(); submit("send"); });
  topicButton?.addEventListener("click", () => {
    if (!textarea.value.trim()) { showToast("구체화할 큰 주제를 입력칸에 적고 눌러 주세요"); textarea.focus(); return; }
    submit("topic");
  });
  textarea.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!sendButton.disabled) submit("send"); }
  });

  const filter = el("div", { class: "threadFilter" },
    el("span", { class: "emptyNote", text: isRoom ? "# 팀 채널" : `# ${preset.name}와(과) 1:1` }),
    el("button", { class: state.crossReview ? "on" : "", style: "margin-left:auto", title: "답변을 다른 AI가 검사", text: state.crossReview ? `🔍 검증 적당히 ${reviewsLeftToday()}/${REVIEW_DAILY_LIMIT}` : "🔍 검증 OFF",
      onclick: () => { state.crossReview = !state.crossReview; saveState(); renderPanel();
        showToast(state.crossReview ? `코드·긴 답·팀 회의만 다른 AI가 검사해요 (하루 ${REVIEW_DAILY_LIMIT}회)` : "교차 검증을 껐어요"); } }));

  const messages = state.chat.filter(message => channelOf(message) === channel);
  const emptyText = isRoom
    ? "여기는 팀 전체가 함께 쓰는 기획방이에요. 편하게 아이디어를 던지고, 큰 주제가 잡히면 입력칸에 적고 '🧠 이 주제로 구체화'를 누르세요. AI끼리 토론한 뒤 Claude에게 넘길 브리프를 함께 써요."
    : `${preset.name}와(과)의 1:1 대화예요. 기획방 대화는 여기 안 보이지만, ${preset.name}은(는) 기획방 흐름을 참고해서 답해요.`;
  const thread = el("div", { id: "thread" }, messages.length ? messages.map(renderMessage) : el("p", { class: "emptyNote", text: emptyText }));
  thread.addEventListener("scroll", () => {
    if (!thread.isConnected || !thread.clientHeight) return;
    threadPinnedToBottom = isNearBottom(thread);
    if (threadPinnedToBottom) { unseenMessageCount = 0; document.querySelector(".jumpLatest")?.remove(); }
    else showJumpButton();
  }, { passive: true });
  const view = el("div", { id: "chatView" }, filter, thread, isRoom ? renderDiscussionBar() : null, form);
  view.style.display = isRoom || panelTab === "chat" ? "flex" : "none";
  return view;
}

// 실제 응답 엔진 표기: 담당 모델 그대로 / fallback:대타 / simulation
function engineLabel(modelKey) {
  const engine = pickEngine(modelKey);
  if (!engine) return "simulation";
  return engine === modelKey ? engine : `fallback:${engine}`;
}

function modelNoteText(modelKey) {
  const provider = providerInfo(modelKey);
  const chain = fallbackChain(modelKey).map(key => providerInfo(key).label).join(" → ");
  const base = `💪 강점: ${provider.strengths}\n🔁 대타 순서: ${chain} → 시뮬레이션`;
  if (isProviderAvailable(modelKey)) return `${base}\n✅ ${provider.label} 연결됨${serverProviders.has(modelKey) ? " (서버)" : ""}.`;
  const engine = pickEngine(modelKey);
  if (!engine) return `${base}\n지금은 연결된 AI가 없어 시뮬레이션으로 답해요.`;
  return `${base}\n⚠️ ${provider.label}은(는) 지금 연결돼 있지 않아요. ${providerInfo(engine).label}가 대타로 답해요.`;
}

// 공급자별 최대 업무량(무료 한도)·남은 양·리셋까지 시간을 막대로 보여준다.
function openQuotaBoard() {
  const zoom = document.getElementById("zoom");
  const rows = Object.entries(MODEL_PROVIDERS).map(([key, provider]) => {
    const quota = quotaInfo(key);
    const used = usageOf(key).count;
    const ratio = quota.daily == null ? 0 : Math.min(100, (used / quota.daily) * 100);
    const chip = el("span", { class: "tagChip", text: provider.label });
    chip.style.background = provider.color;
    return el("div", { class: "ach" }, chip,
      el("div", { text: quota.daily == null ? `오늘 ${used}회 사용` : `${used} / ${quota.daily}회 사용 · 분당 최대 ${quota.perMinute}회` }),
      el("div", { class: "bar", style: "margin:4px 0" }, el("i", { style: `width:${ratio}%` })),
      el("div", { text: formatReset(key) }),
      el("div", { text: quota.source, style: "color:var(--sub);font-size:10px" }));
  });
  zoom.replaceChildren(el("div", { class: "zoomCard chunky", onclick: event => event.stopPropagation() },
    el("h3", { text: "⚡ 업무량(크레딧) 현황" }),
    el("div", { class: "achList" }, rows,
      el("div", { class: "ach", text: `🔍 교차 검증: 오늘 ${reviewsLeftToday()}/${REVIEW_DAILY_LIMIT}회 남음 · 리셋 자정(한국 시간)` }),
      el("div", { class: "ach", text: "※ 이 페이지에서 센 횟수예요. 실제 한도는 각 콘솔(AI Studio, Groq) 기준이고, 한도가 떨어지면 자동으로 대타가 들어가요." }))));
  zoom.classList.add("show");
}

// 모델별 강점·담당 팀원·대타 규칙을 한 장으로 보여준다.
function openRoleMap() {
  const zoom = document.getElementById("zoom");
  const rows = Object.entries(MODEL_PROVIDERS).map(([key, provider]) => {
    const members = state.agents.filter(agent => agent.model === key).map(agent => `@${getPreset(agent.id).name}(${ROLE_LABELS[getPreset(agent.id).roleKey]})`);
    const chip = el("span", { class: "tagChip", text: `${provider.label} · ${provider.rank}` });
    chip.style.background = provider.color;
    return el("div", { class: "ach" }, chip,
      el("div", { text: `💪 ${provider.strengths}` }),
      el("div", { text: `📌 ${provider.duty}` }),
      el("div", { text: `👤 ${members.length ? members.join(", ") : "배정 없음"}`, style: "color:var(--sub)" }),
      el("div", { text: `⚡ ${quotaLine(key)}` }),
      el("div", { text: quotaInfo(key).source, style: "color:var(--sub);font-size:10px" }),
      el("div", { text: isProviderAvailable(key) ? "● online" : "○ offline (대타 투입)", style: `color:${isProviderAvailable(key) ? "var(--ok)" : "var(--sub)"}` }));
  });
  zoom.replaceChildren(el("div", { class: "zoomCard chunky", onclick: event => event.stopPropagation() },
    el("h3", { text: "🧠 AI 역할 배치표" }),
    el("div", { class: "achList" }, rows,
      el("div", { class: "ach", text: "🔁 대타 규칙: 담당 모델이 한도 초과·연결 불가 → Claude(총괄) → Gemini(2순위) → 시뮬레이션" }),
      el("div", { class: "ach", text: `🔍 교차 검증(적당히): 다른 모델 팀원이 검사 · 코드나 250자 이상 답, 팀 회의만 · 45초 쿨다운 · 하루 ${REVIEW_DAILY_LIMIT}회 (오늘 ${reviewsLeftToday()}회 남음)` })),
    el("button", { class: "btn soft", style: "margin-top:12px", text: "기본 배치로 되돌리기", onclick: () => {
      state.agents.forEach(agent => { agent.model = getPreset(agent.id).defaultModel; });
      saveState(); renderAll(); openRoleMap(); showToast("기본 AI 배치로 되돌렸어요");
    } })));
  zoom.classList.add("show");
}

function renderMessage(message) {
  if (message.from === "system") {
    return el("div", { class: "msg system", id: `msg-${message.id}` }, el("div", { class: "text", text: message.text }));
  }
  if (message.from === "user") {
    const toLabel = message.to === "team" ? "팀 전체" : message.to === "topic" ? "🧠 주제" : message.to === "brainstorm" ? "💡 브레인스토밍" : getPreset(message.to)?.name || "";
    return el("div", { class: "msg user", id: `msg-${message.id}` },
      el("div", { class: "boxWrap" }, el("span", { class: "who", text: `나 → ${toLabel}` }), el("div", { class: "text md" }, renderMarkdown(message.text))));
  }
  const preset = getPreset(message.from);
  const provider = providerInfo(message.model);
  const chip = el("span", { class: "tagChip", text: provider.label });
  chip.style.background = provider.color;
  const isReview = message.kind === "review";
  const verdictBadge = !isReview && message.reviewVerdict ? el("span", { class: "fallbackNote", text: message.reviewVerdict === "pass" ? "· ✅ 검증됨" : "· ⚠️ 지적받음" }) : null;
  const kindLabel = { discuss: `💬 토론 R${message.round || 1}`, briefPart: "📝 브리프 메모", brief: "📄 Claude용 브리프", brainstorm: "💡 아이디어", ideaList: "🗂 아이디어 정리" }[message.kind] || "";
  const copyButton = message.pending ? null : el("button", { class: "copyBtn", type: "button", text: "복사", onclick: () => copyText(message.text) });
  const openButton = message.kind === "brief" && !message.pending ? el("button", { class: "copyBtn", type: "button", text: "열기", onclick: () => openBrief(message.briefId) }) : null;
  const who = el("span", { class: "who" }, isReview ? `🔍 ${preset.name} → ${message.targetLabel || ""} 검토` : `${preset.name} · ${ROLE_LABELS[preset.roleKey]}`, chip, kindLabel ? el("span", { class: "fallbackNote", text: kindLabel }) : null, verdictBadge, copyButton, openButton,
    message.engine?.startsWith("fallback:") ? el("span", { class: "fallbackNote", text: `(대타: ${providerInfo(message.engine.slice(9)).label})` }) : null,
    message.engine === "simulation" ? el("span", { class: "fallbackNote", text: "(시뮬레이션)" }) : null);
  const reviewClass = isReview ? ` review ${message.verdict || ""}` : (message.kind ? ` ${message.kind}` : "");
  return el("div", { class: "msg" + (message.pending ? " pending" : "") + reviewClass, id: `msg-${message.id}` },
    spriteImage(message.from), el("div", { class: "boxWrap" }, who, el("div", { class: "text md" }, renderMarkdown(message.text)),
      message.kind === "ideaList" && !message.pending ? renderIdeaChips(message.text) : null));
}

function renderInfoView(agentId) {
  const agent = getAgent(agentId);
  const preset = getPreset(agentId);
  const locationChips = [
    el("button", { class: "chip" + (agent.location === "lounge" ? " on" : ""), text: "🛋️ 대기실", onclick: () => moveAgent(agentId, "lounge", null) }),
    ...state.projects.map(project => el("button", { class: "chip" + (agent.location === project.id ? " on" : ""), text: project.name, onclick: () => moveAgent(agentId, project.id, null) }))
  ];
  const careButtons = [
    el("button", { class: "btn pink", text: "👍 칭찬하기", onclick: () => petAgent(agentId) }),
    ...SNACKS.map(snack => el("button", { class: "btn soft", text: `${snack.icon} ${snack.price}🪙`, onclick: () => feedSnack(agentId, snack.key) }))
  ];
  const logs = [...agent.log].reverse().map(entry => el("div", { class: "logItem" },
    el("span", { class: "meta", text: `${formatTime(entry.time)}${entry.project ? " · " + entry.project : ""} · ${logKindLabel(entry.kind)}` }), entry.text));
  const view = el("div", { id: "infoView" },
    el("p", { class: "emptyNote", text: preset.persona }),
    el("div", { class: "section" }, el("h3", { text: "📊 상태" }),
      el("div", { class: "stat energy" }, "⚡ 에너지", el("div", { class: "bar" }, el("i", { id: "panelEnergy" })), el("span", { id: "panelEnergyText" })),
      el("div", { class: "stat love" }, "🤝 신뢰도", el("div", { class: "bar" }, el("i", { id: "panelLove" })), el("span", { id: "panelLoveText" }))),
    el("div", { class: "section" }, el("h3", { text: "🧃 컨디션 관리" }), el("div", { class: "chips" }, careButtons)),
    el("div", { class: "section" }, el("h3", { text: "📍 배치" }), el("div", { class: "chips" }, locationChips)),
    el("div", { class: "section" }, el("h3", { text: "⏳ 현재 업무" }), el("div", { id: "panelTask" })),
    el("div", { class: "section" }, el("h3", { text: `📜 작업 내역 (${agent.log.length})` }), logs.length ? logs : el("p", { class: "emptyNote", text: "아직 기록이 없어요." })));
  view.style.display = panelTab === "info" ? "block" : "none";
  return view;
}

function updatePanelLive() {
  if (!panelAgentId) return;
  const agent = getAgent(panelAgentId);
  const mood = document.getElementById("panelMood");
  if (mood) mood.textContent = agent.sleeping ? "status: sleeping 💤" : agent.energy > 60 ? "status: online 🟢" : agent.energy > 30 ? "status: busy 🟡" : "status: low battery 🔴";
  const setBar = (barId, textId, value, suffix) => {
    const bar = document.getElementById(barId), text = document.getElementById(textId);
    if (bar) bar.style.width = `${Math.round(value)}%`;
    if (text) text.textContent = suffix;
  };
  setBar("panelEnergy", "panelEnergyText", agent.energy, `${Math.round(agent.energy)}`);
  setBar("panelLove", "panelLoveText", agent.affection, `${Math.round(agent.affection)}`);
  const taskHolder = document.getElementById("panelTask");
  if (taskHolder) {
    const project = findProject(agent.location);
    const task = project?.tasks.find(item => item.id === agent.currentTaskId && !item.done);
    taskHolder.replaceChildren(task
      ? el("div", { class: "taskRow" }, el("span", { class: "title", text: task.title }), el("span", { class: "who", text: `${Math.round(task.progress)}%` }), el("div", { class: "bar" }, el("i", { style: `width:${Math.round(task.progress)}%` })))
      : el("p", { class: "emptyNote", text: agent.sleeping ? "자는 중. 자판기 아이템을 주거나 휴게실로 보내세요." : agent.location === "lounge" ? "휴게실에서 쉬는 중." : "다음 업무를 고르는 중…" }));
  }
}

const formatTime = timestamp => new Date(timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
const logKindLabel = kind => ({ done: "완료", move: "이동", review: "검토", ai: "AI 답변" }[kind] || "기록");
