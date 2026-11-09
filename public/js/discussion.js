/* ================= 주제 구체화 토론 → Claude 브리프 ================= */
let brainstormActive = false;
const isDiscussionActive = () => brainstormActive || Boolean(state.discussion && ["running", "writing"].includes(state.discussion.status));
let discussionStopRequested = false;

// 토론 참가자: 현재 사무실의 깨어 있는 팀원(최대 4명). 2명 미만이면 기획·디자인·코딩·검증 순으로 채운다.
function pickDiscussionMembers() {
  const order = ["plan", "design", "code", "qa", "sound"];
  const byRole = list => [...list].sort((first, second) => order.indexOf(getPreset(first.id).roleKey) - order.indexOf(getPreset(second.id).roleKey));
  let members = byRole(agentsInProject(state.activeProjectId).filter(agent => !agent.sleeping));
  if (members.length < 2) members = byRole(state.agents);
  return members.slice(0, DISCUSSION_MEMBER_LIMIT).map(agent => agent.id);
}

function postSystemNote(text) {
  pushChat({ from: "system", text });
  saveState();
  if (panelAgentId) renderPanel();
}

function buildDiscussionPrompt(agentId, topic, round) {
  const preset = getPreset(agentId);
  const members = state.discussion.members.map(id => `${getPreset(id).name}(${ROLE_LABELS[getPreset(id).roleKey]})`).join(", ");
  const instruction = round === 1
    ? "첫 라운드다. 네 역할 관점에서 이 주제를 구체화할 핵심 아이디어 1~2개와, 팀장이나 팀원에게 던질 날카로운 질문 1개를 말해라."
    : "앞 팀원들의 말에 반응해라: 동의·반박·결합 중 하나를 분명히 하고, 대상 사용자·핵심 기능·차별점·리스크 중 하나를 더 구체적으로 좁혀라. 이미 나온 말 반복 금지.";
  return [
    `AI 팀원들이 '${findProject(state.activeProjectId)?.name || "기획"}' 프로젝트에서 팀장의 주제를 함께 구체화하는 토론 중이다. 참가자: ${members}.`,
    `너는 '${preset.name}'(${ROLE_LABELS[preset.roleKey]} 관점). 성격: ${preset.persona}`,
    `말투 예시: ${preset.lines.reply.join(" / ")}`,
    `토론 주제: """${topic}"""`,
    "",
    "지금까지 대화:",
    buildHistory(6000) || "(없음)",
    "",
    `라운드 ${round}. ${instruction}`,
    "규칙: 회의에서 말하듯 대화체 / 다른 팀원을 @이름으로 불러도 됨 / 한국어 350자 이내 / 이름 접두어 없이 본문만 / 제목(#) 금지.",
    NO_NARRATION_RULE
  ].join("\n");
}

function simulateDiscussionLine(agentId, round) {
  const preset = getPreset(agentId);
  const ideas = {
    plan: ["MVP는 핵심 흐름 하나만 남기죠!", "타깃을 '처음 써보는 사람'으로 좁혀요!"],
    design: ["첫 화면에서 3초 안에 뭘 하는지 보여야 해요.", "온보딩은 카드 3장이면 충분해요."],
    code: ["데이터 저장은 로컬 우선, 동기화는 나중에.", "실시간 기능은 2차로 미루자."],
    qa: ["실패하는 경우부터 정의합시다.", "측정 지표가 없습니다."],
    sound: ["피드백 소리 하나로 손맛이 달라져요…", "알림음은 꺼둘 수 있게…"]
  }[preset.roleKey];
  return `${pickRandom(preset.lines.reply)} ${pickRandom(ideas)}${round === 1 ? " 근데 이거 누가 제일 먼저 쓸까요?" : ""}`;
}

// 참가자가 순서대로 한 마디씩 × 라운드 수. 멈추기 요청이 오면 현재 발언 뒤에 멈춘다.
async function runDiscussionRounds(roundCount) {
  const discussion = state.discussion;
  discussion.status = "running";
  discussionStopRequested = false;
  for (let step = 0; step < roundCount && !discussionStopRequested; step++) {
    discussion.round += 1;
    for (const agentId of discussion.members) {
      if (discussionStopRequested) break;
      const message = await streamAgentMessage(agentId, {
        prompt: buildDiscussionPrompt(agentId, discussion.topic, discussion.round),
        simulate: () => simulateDiscussionLine(agentId, discussion.round),
        extra: { kind: "discuss", round: discussion.round },
        maxTokens: 600
      });
      if (message.ok) setExpression(agentId, "happy", 900);
    }
  }
  discussion.status = "paused";
  postSystemNote(discussionStopRequested ? "⏹ 토론을 멈췄어요. 이어서 하거나 브리프를 쓸 수 있어요." : `✅ ${discussion.round}라운드 토론 완료. 더 다듬거나, Claude에게 넘길 브리프를 써 보세요.`);
}

/* ---------- 브레인스토밍: 발산(각자 아이디어 던지기) → 정리(번호 목록) → 칩 눌러 바로 구체화 ---------- */
// 호출 수 = 참가자 수(최대 4) + 정리 1회. 판단·토론 없이 양을 뽑는 데 집중한다.
const BRAINSTORM_IDEAS_PER_MEMBER = 3;

function buildBrainstormPrompt(agentId, seed, previousIdeas) {
  const preset = getPreset(agentId);
  return [
    `'${findProject(state.activeProjectId)?.name || "기획"}' 프로젝트 기획방에서 브레인스토밍 중이다. 비판·평가 금지, 양과 다양성이 목표다.`,
    `너는 '${preset.name}'(${ROLE_LABELS[preset.roleKey]} 관점). 성격: ${preset.persona}`,
    seed ? `주제: """${seed}"""` : "주제: 아래 기획방 대화에서 다루던 것.",
    "",
    "기획방 최근 대화:",
    buildHistory(4000) || "(없음)",
    "",
    previousIdeas ? `이미 나온 아이디어(겹치지 말 것):\n${previousIdeas}` : "",
    `네 역할 관점에서 서로 완전히 다른 아이디어 ${BRAINSTORM_IDEAS_PER_MEMBER}개를 던져라. 뻔한 것 1개 이하, 엉뚱하거나 역발상인 것 1개 이상.`,
    "형식: '- **아이디어 이름**: 한 줄 설명' 목록만. 서론·결론 없이, 캐릭터 말투는 설명에 살짝만. 한국어 300자 이내.",
    NO_NARRATION_RULE
  ].filter(line => line !== "").join("\n");
}

function buildIdeaListPrompt(seed, ideaMessages) {
  const ideas = ideaMessages.map(message => `[${getPreset(message.from).name}]\n${message.text}`).join("\n\n");
  return [
    "너는 브레인스토밍 진행자다. 팀원들이 던진 아이디어를 정리해라.",
    seed ? `주제: """${seed}"""` : "",
    "",
    "나온 아이디어:",
    ideas,
    "",
    "할 일: 비슷한 건 합치고, 가장 흥미로운 5~7개를 고른다. 평가는 짧게.",
    "형식(그대로 지킬 것):",
    "1. **아이디어 이름** — 한 줄 설명 (제안: 팀원이름)",
    "2. ...",
    "마지막 줄: '어떤 걸 구체화해 볼까요? 아래 버튼을 누르면 바로 토론해요.'",
    "한국어, 제목(#) 금지."
  ].filter(line => line !== "").join("\n");
}

function simulateIdeas(agentId) {
  const preset = getPreset(agentId);
  const pool = { plan: ["구독 대신 1회권", "친구 초대 퀘스트", "주간 챌린지"], design: ["다크 네온 테마", "한 손 조작 UI", "캐릭터 커스텀"],
    code: ["오프라인 우선 저장", "플러그인 구조", "실시간 랭킹"], qa: ["실패 로그 공유", "베타 테스터 모드", "자동 리포트"], sound: ["상황별 BGM", "효과음 커스텀", "무음 모드 진동"] }[preset.roleKey];
  return pool.map(name => `- **${name}**: (시뮬레이션) ${preset.name}의 아이디어`).join("\n");
}

async function startBrainstorm(seed) {
  if (aiBusyAgents.size > 0 || isDiscussionActive()) { showToast("AI가 답하는 중이에요. 끝나면 다시 눌러 주세요"); return; }
  const hasContext = state.chat.some(message => channelOf(message) === ROOM_CHANNEL && message.from !== "system");
  if (!seed && !hasContext) { showToast("브레인스토밍할 주제를 입력칸에 적고 눌러 주세요"); return; }
  brainstormActive = true;
  try {
    const members = pickDiscussionMembers();
    pushChat({ from: "user", to: "brainstorm", text: seed || "(지금까지 대화로 아이디어 내기)" });
    postSystemNote(`💡 브레인스토밍 시작 · 참가: ${members.map(id => "@" + getPreset(id).name).join(" ")} · 각자 ${BRAINSTORM_IDEAS_PER_MEMBER}개씩`);
    const ideaMessages = [];
    for (const agentId of members) {
      const previousIdeas = ideaMessages.map(message => message.text).join("\n").slice(0, 1500);
      const message = await streamAgentMessage(agentId, {
        prompt: buildBrainstormPrompt(agentId, seed, previousIdeas),
        simulate: () => simulateIdeas(agentId),
        extra: { kind: "brainstorm" },
        maxTokens: 500
      });
      if (message.ok) { ideaMessages.push(message); setExpression(agentId, "happy", 900); }
    }
    if (!ideaMessages.length) { postSystemNote("아이디어를 받지 못했어요. 잠시 뒤 다시 시도해 주세요."); return; }
    const editorId = members.find(id => getPreset(id).roleKey === "plan") || members[0];
    await streamAgentMessage(editorId, {
      prompt: buildIdeaListPrompt(seed, ideaMessages),
      simulate: () => ideaMessages.flatMap(message => message.text.split("\n")).slice(0, 5)
        .map((line, index) => `${index + 1}. ${line.replace(/^-\s*/, "")}`).join("\n") + "\n어떤 걸 구체화해 볼까요? 아래 버튼을 누르면 바로 토론해요.",
      extra: { kind: "ideaList" },
      maxTokens: 700
    });
  } finally {
    brainstormActive = false;
    saveState();
    if (panelAgentId) renderPanel();
  }
}

// 정리 메시지의 번호 목록을 칩으로 만든다. 칩을 누르면 그 아이디어로 '주제 구체화' 토론을 시작한다.
function renderIdeaChips(text) {
  const ideas = text.split("\n").map(line => line.match(/^\s*\d+[.)]\s+(.+)$/)).filter(Boolean)
    .map(match => match[1].replace(/\*\*/g, "").replace(/\s*\((제안|by)[^)]*\)\s*$/, "").trim()).slice(0, 8);
  if (!ideas.length) return null;
  const disabled = aiBusyAgents.size > 0 || isDiscussionActive();
  return el("div", { class: "ideaChips" }, ideas.map(idea => {
    const title = idea.split(/\s+[—-]\s+/)[0].slice(0, 30);
    return el("button", { class: "chip", type: "button", title: idea, disabled, text: title, onclick: () => { threadPinnedToBottom = true; startDiscussion(idea); } });
  }));
}

async function startDiscussion(topic) {
  if (isDiscussionActive()) { showToast("이미 토론 중이에요"); return; }
  const members = pickDiscussionMembers();
  state.discussion = { id: nextId("d"), topic, round: 0, status: "running", members };
  pushChat({ from: "user", to: "topic", text: topic });
  postSystemNote(`🧠 주제 구체화 시작 · 참가: ${members.map(id => "@" + getPreset(id).name).join(" ")} · ${DISCUSSION_DEFAULT_ROUNDS}라운드`);
  await runDiscussionRounds(DISCUSSION_DEFAULT_ROUNDS);
}

function stopDiscussion() {
  discussionStopRequested = true;
  showToast("지금 말하는 팀원까지만 하고 멈출게요");
}

function buildBriefPartPrompt(agentId, topic) {
  const preset = getPreset(agentId);
  return [
    `너는 '${preset.name}'(${ROLE_LABELS[preset.roleKey]} 관점). 성격: ${preset.persona}`,
    `팀이 토론한 주제: """${topic}"""`,
    "",
    "지금까지 대화:",
    buildHistory(6000),
    "",
    "이제 다른 AI(Claude)에게 넘길 기획 브리프를 팀이 함께 쓴다. 네 역할 관점의 파트 메모를 써라.",
    "형식: 불릿(-) 3~5개, 토론에서 합의된 내용 위주, 미해결 쟁점은 '(미정)'으로 표시. 캐릭터 말투 없이 담백하게. 한국어 400자 이내."
  ].join("\n");
}

function buildBriefComposePrompt(topic, parts) {
  const partText = parts.map(part => `[${getPreset(part.from).name} · ${ROLE_LABELS[getPreset(part.from).roleKey]}]\n${part.text}`).join("\n\n");
  const authors = parts.map(part => getPreset(part.from).name).join("·");
  return [
    "너는 기획 문서 편집자다. AI 팀이 토론하고 각자 쓴 파트 메모를 하나의 '기획 브리프'로 합쳐라.",
    "이 문서는 다른 AI(Claude)가 이 문서만 읽고 바로 이어서 작업할 수 있어야 한다. 대화 맥락을 모른다고 가정하고 자족적으로 써라.",
    `주제: """${topic}"""`,
    "",
    "파트 메모:",
    partText,
    "",
    "토론 요약용 대화:",
    buildHistory(5000),
    "",
    "출력은 아래 마크다운 형식 그대로(제목 문구 유지), 한국어, 군더더기 없이:",
    `# 기획 브리프: (주제를 짧게)`,
    `_작성: AI//OFFICE 팀 (${authors})_`,
    "## 한 줄 요약",
    "## 배경 · 해결할 문제",
    "## 타깃 사용자",
    "## 핵심 아이디어",
    "## 주요 기능 (우선순위: P0 / P1 / P2)",
    "## 차별점",
    "## 리스크 · 미해결 질문",
    "## Claude에게 요청",
    "(마지막 섹션은 Claude가 할 일을 번호 목록으로 구체적으로. 예: 기획 검토 후 허점 지적, MVP 범위 확정, 화면 흐름 설계, 기술 스택 제안 등. 팀장이 확인해야 할 결정 사항도 표시.)"
  ].join("\n");
}

function simulateBrief(topic, authors) {
  return [`# 기획 브리프: ${topic.slice(0, 40)}`, `_작성: AI//OFFICE 팀 (${authors})_`, "## 한 줄 요약", `- ${topic}`, "## 배경 · 해결할 문제", "- (시뮬레이션) 실제 AI가 연결되면 토론 내용으로 채워져요.",
    "## 타깃 사용자", "- (미정)", "## 핵심 아이디어", "- (미정)", "## 주요 기능 (우선순위: P0 / P1 / P2)", "- P0: (미정)", "## 차별점", "- (미정)", "## 리스크 · 미해결 질문", "- (미정)",
    "## Claude에게 요청", "1. 이 기획을 검토하고 빠진 부분을 질문해 줘", "2. MVP 범위와 화면 흐름을 제안해 줘"].join("\n");
}

// 1) 참가자별 파트 메모 → 2) 기획 담당(없으면 첫 참가자)이 하나로 합친다. 호출 수 = 참가자 수 + 1.
async function writeBrief() {
  const discussion = state.discussion;
  if (!discussion || isDiscussionActive()) return;
  discussion.status = "writing";
  postSystemNote("📝 Claude에게 넘길 브리프를 함께 쓰는 중…");
  const parts = [];
  for (const agentId of discussion.members) {
    const part = await streamAgentMessage(agentId, {
      prompt: buildBriefPartPrompt(agentId, discussion.topic),
      simulate: () => `- ${simulateDiscussionLine(agentId, 2)}\n- (미정) 세부 사항`,
      extra: { kind: "briefPart" },
      maxTokens: 500
    });
    if (part.ok) parts.push(part);
  }
  const editorId = discussion.members.find(id => getPreset(id).roleKey === "plan") || discussion.members[0];
  const authors = discussion.members.map(id => getPreset(id).name).join("·");
  const briefId = nextId("b");
  const brief = await streamAgentMessage(editorId, {
    prompt: buildBriefComposePrompt(discussion.topic, parts),
    simulate: () => simulateBrief(discussion.topic, authors),
    extra: { kind: "brief", briefId },
    maxTokens: 2000
  });
  discussion.status = "done";
  if (brief.ok) {
    state.briefs.unshift({ id: briefId, topic: discussion.topic, text: brief.text, time: Date.now(), project: findProject(state.activeProjectId)?.name || "" });
    state.briefs = state.briefs.slice(0, BRIEF_KEEP);
    discussion.members.forEach(id => { setExpression(id, "happy", 1500); say(id, "브리프 완성!", 2500); });
    renderHeaderStats();
    openBrief(briefId);
  }
  postSystemNote(brief.ok ? "📄 브리프 완성! 복사해서 Claude에게 붙여넣으세요." : "브리프 작성에 실패했어요. 다시 시도해 주세요.");
}

function renderDiscussionBar() {
  const discussion = state.discussion;
  if (!discussion) return null;
  const label = el("b", { text: `🧠 ${discussion.topic.slice(0, 40)}${discussion.topic.length > 40 ? "…" : ""} · R${discussion.round}` });
  if (discussion.status === "running") return el("div", { class: "discussBar" }, label, el("button", { class: "btn soft", type: "button", text: "⏹ 멈추기", onclick: stopDiscussion }));
  if (discussion.status === "writing") return el("div", { class: "discussBar" }, label, el("span", { text: "📝 브리프 작성 중…" }));
  const busy = aiBusyAgents.size > 0 || brainstormActive;
  return el("div", { class: "discussBar" }, label,
    el("button", { class: "btn", type: "button", disabled: busy, text: "🔁 한 라운드 더", onclick: () => runDiscussionRounds(1) }),
    el("button", { class: "btn pink", type: "button", disabled: busy, text: discussion.status === "done" ? "📝 브리프 다시 쓰기" : "📝 Claude용 브리프 쓰기", onclick: writeBrief }));
}

function downloadText(fileName, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = el("a", { href: url, download: fileName });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openBrief(briefId) {
  const brief = state.briefs.find(item => item.id === briefId);
  if (!brief) { showToast("브리프를 찾을 수 없어요"); return; }
  const zoom = document.getElementById("zoom");
  const safeName = brief.topic.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 30) || "brief";
  zoom.replaceChildren(el("div", { class: "zoomCard chunky wide", onclick: event => event.stopPropagation() },
    el("h3", { text: `📄 Claude용 브리프 · ${new Date(brief.time).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}` }),
    el("div", { class: "md" }, renderMarkdown(brief.text)),
    el("div", { class: "briefActions" },
      el("button", { class: "btn pink", type: "button", text: "📋 복사 (Claude에 붙여넣기)", onclick: () => copyText(brief.text) }),
      el("button", { class: "btn", type: "button", text: "⬇️ .md 저장", onclick: () => downloadText(`${safeName}.md`, brief.text) }),
      el("button", { class: "btn soft", type: "button", text: "닫기", onclick: () => zoom.classList.remove("show") }))));
  zoom.classList.add("show");
}

function openBriefList() {
  const zoom = document.getElementById("zoom");
  const rows = state.briefs.length ? state.briefs.map(brief => el("button", { class: "ach", style: "text-align:left;cursor:pointer;color:var(--ink);border-top:0;border-right:0;border-bottom:0",
    onclick: () => openBrief(brief.id) }, `${new Date(brief.time).toLocaleDateString("ko-KR")}${brief.project ? ` · [${brief.project}]` : ""} · ${brief.topic.slice(0, 50)}`))
    : [el("div", { class: "ach locked", text: "아직 브리프가 없어요. 기획방에서 주제를 구체화해 보세요." })];
  zoom.replaceChildren(el("div", { class: "zoomCard chunky", onclick: event => event.stopPropagation() },
    el("h3", { text: `📄 브리프 보관함 (${state.briefs.length}/${BRIEF_KEEP})` }), el("div", { class: "achList" }, rows)));
  zoom.classList.add("show");
}

function renderAmbientPill() {
  document.getElementById("ambientPill").textContent = state.ambient ? "🎬 연출 ON" : "🎬 연출 OFF";
}

function toggleAmbient() {
  state.ambient = !state.ambient;
  if (!state.ambient) state.agents.forEach(agent => { agent.sleeping = false; });
  saveState();
  renderAmbientPill();
  renderAll();
  showToast(state.ambient ? "사무실 연출을 켰어요 (자동 업무·잡담·고양이)" : "연출을 껐어요. 팀원들이 조용히 대화에만 집중해요");
}
