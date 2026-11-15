/* ================= 기획 노트: 전체 대화 → 시스템 기획 내용만 ================= */
// 브리프가 '방금 대화'만 보지 않도록, 프로젝트마다 기획 노트를 하나 유지한다.
// 브리프를 쓸 때 지난번 이후의 새 대화(기획방 + 1:1, 보관 한도로 잘려 나간 것 포함)만 AI에게 보여 주고
// 시스템 기획 내용만 골라 노트를 갱신한다. 이미 정리한 대화는 다시 보내지 않아 크레딧을 아낀다.
// state.planNotesByProject[projectId] = { text, coveredUntil(마지막으로 반영한 메시지 시각), archive(잘려 나간 대화 줄) }
const PLAN_NOTES_CHUNK_CHARS = 14000;
const PLAN_NOTES_MAX_CHUNKS = 6;
const PLAN_NOTES_ARCHIVE_CHARS = 60000;
const PLAN_NOTES_LINE_LIMIT = 1500;
const PLAN_NOTES_TOKENS = 1800;
const PREVIOUS_BRIEF_KINDS = new Set(["brief", "briefPart", "briefCode"]);

function planNotesOf(projectId = state.activeProjectId) {
  state.planNotesByProject ||= {};
  return (state.planNotesByProject[projectId] ||= { text: "", coveredUntil: 0, archive: "" });
}

// 노트에 넣을 만한 대화인지: 시스템 메시지·교차 검증·작성 중인 메시지는 늘 빼고,
// 기획방의 '이전 브리프 빼기'가 켜져 있으면 예전 브리프·메모·초기 코드도 뺀다(기본은 포함).
const isPlanSourceMessage = message => !message.pending && message.from !== "system" && message.kind !== "review"
  && !(state.briefExcludePrevious && PREVIOUS_BRIEF_KINDS.has(message.kind)) && typeof message.text === "string" && message.text.trim();

function planSourceLine(message) {
  const channelName = channelOf(message) === ROOM_CHANNEL ? "기획방" : `1:1 ${getPreset(channelOf(message))?.name || ""}`;
  return `[${channelName}] ${formatHistoryLine(message, PLAN_NOTES_LINE_LIMIT)}`;
}

// 노트가 없을 때 쓰는 대체 자료: 남아 있는 대화 원문(이전 브리프 포함). 예산을 넘으면 최근 쪽을 남긴다.
function buildPlanSourceText(characterBudget) {
  const notes = planNotesOf();
  const lines = [...(notes.archive ? notes.archive.split("\n") : []), ...state.chat.filter(isPlanSourceMessage).map(planSourceLine)];
  const kept = [];
  let used = 0;
  for (let index = lines.length - 1; index >= 0; index--) {
    if (used + lines[index].length > characterBudget && kept.length) break;
    kept.unshift(lines[index]);
    used += lines[index].length + 1;
  }
  return kept.join("\n");
}

// 보관 한도(CHAT_LIMIT)로 잘려 나가는 대화 중 아직 노트에 반영 안 된 것을 따로 모아 둔다.
function archiveForPlanNotes(removedMessages) {
  const notes = planNotesOf();
  const lines = removedMessages.filter(message => isPlanSourceMessage(message) && (message.time || 0) > notes.coveredUntil).map(planSourceLine);
  if (!lines.length) return;
  notes.archive = `${notes.archive ? notes.archive + "\n" : ""}${lines.join("\n")}`.slice(-PLAN_NOTES_ARCHIVE_CHARS);
}

// 새 대화 줄들을 AI 한 번에 보낼 수 있는 크기로 나눈다.
function chunkLines(lines, chunkChars) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const line of lines) {
    if (size + line.length > chunkChars && current.length) { chunks.push(current.join("\n")); current = []; size = 0; }
    current.push(line);
    size += line.length + 1;
  }
  if (current.length) chunks.push(current.join("\n"));
  return chunks;
}

function buildPlanNotesPrompt(previousNotes, conversationChunk) {
  const project = findProject(state.activeProjectId);
  return [
    "너는 기획 문서 정리 담당이다. 캐릭터 말투 없이 담백하게 쓴다.",
    `프로젝트: ${project?.name || "기획"} (${projectKindOf(project).label})`,
    "아래 [기존 기획 노트]에 [새 대화]에서 나온 '시스템 기획' 내용만 반영해, 갱신된 노트 전체를 다시 써라.",
    "포함: 목표·해결할 문제, 타깃 사용자, 기능·요구사항(우선순위가 나오면 표시), 화면·사용 흐름, 데이터·구조·기술 선택, 제약(예산·일정·하드웨어 등), 결정된 사항, 미해결 쟁점·질문.",
    "제외: 인사·잡담·농담·감정 표현·캐릭터 대사, 기획과 무관한 이야기, 같은 말 반복.",
    "팀장(사람)의 결정·요구가 AI 팀원의 제안보다 우선이다. AI 제안 중 팀장이 받아들이지 않은 건 '제안'으로만 표시한다.",
    "나중 대화가 앞의 결정을 바꾸면 최신 결정만 남기고 끝에 '(변경됨: 이전 …)'으로 짧게 적는다. 기존 노트 내용은 바뀌지 않았으면 그대로 유지한다.",
    "형식: 위 항목을 '## 소제목'으로, 내용은 '-' 불릿. 해당 내용이 없는 항목은 생략. 한국어, 3500자 이내. 노트 본문만 출력.",
    "",
    "[기존 기획 노트]",
    previousNotes || "(아직 없음)",
    "",
    "[새 대화]",
    conversationChunk
  ].join("\n");
}

// 지난 정리 이후의 새 대화로 노트를 갱신하고 노트 본문을 돌려준다. AI가 없거나 실패하면 지금까지의 노트(없으면 빈 문자열).
async function refreshPlanNotes() {
  const notes = planNotesOf();
  const freshMessages = state.chat.filter(message => isPlanSourceMessage(message) && (message.time || 0) > notes.coveredUntil);
  const lines = [...(notes.archive ? notes.archive.split("\n") : []), ...freshMessages.map(planSourceLine)];
  if (!lines.length || !promptHelperEngine()) return notes.text;
  const chunks = chunkLines(lines, PLAN_NOTES_CHUNK_CHARS);
  const usedChunks = chunks.slice(-PLAN_NOTES_MAX_CHUNKS);   // 너무 길면 가장 오래된 부분부터 생략(크레딧 상한)
  let text = notes.text;
  try {
    for (const chunk of usedChunks) {
      const updated = (await askPromptAi(buildPlanNotesPrompt(text, chunk), PLAN_NOTES_TOKENS)).trim();
      if (updated) text = updated;
    }
  } catch (error) {
    postSystemNote(`⚠️ 기획 노트 정리 실패(${error.message || "알 수 없는 오류"}) → 노트 없이 남아 있는 전체 대화로 브리프를 써요`);
    return notes.text;
  }
  notes.text = text;
  notes.archive = "";
  notes.coveredUntil = Math.max(notes.coveredUntil, ...freshMessages.map(message => message.time || 0));
  saveState();
  return text;
}
