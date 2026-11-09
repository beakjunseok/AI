/* ================= 마크다운 렌더 (안전: innerHTML 미사용) ================= */
// 인라인: `코드`, **굵게**. 텍스트 노드로만 만들어 XSS 위험이 없다. O(길이)
function renderInline(text) {
  const fragment = document.createDocumentFragment();
  const wholeItalic = text.match(/^_([^_]+)_$/);
  if (wholeItalic) { fragment.append(el("em", { text: wholeItalic[1] })); return fragment; }
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
  let lastIndex = 0, match;
  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) fragment.append(text.slice(lastIndex, match.index));
    const token = match[0];
    fragment.append(token.startsWith("`") ? el("code", { text: token.slice(1, -1) }) : el("strong", { text: token.slice(2, -2) }));
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) fragment.append(text.slice(lastIndex));
  return fragment;
}

// 블록: ``` 코드(복사 버튼) / # 제목 / - · 1. 목록 / 문단. 스트리밍 중 닫히지 않은 코드 블록도 그대로 보여준다.
function renderMarkdown(source) {
  const fragment = document.createDocumentFragment();
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
  let index = 0, paragraph = [], list = null;
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const node = el("p");
    paragraph.forEach((line, lineIndex) => { if (lineIndex) node.append(el("br")); node.append(renderInline(line)); });
    fragment.append(node);
    paragraph = [];
  };
  const flushList = () => { if (list) { fragment.append(list); list = null; } };
  while (index < lines.length) {
    const line = lines[index];
    const fence = line.match(/^\s*```(\S*)/);
    if (fence) {
      flushParagraph(); flushList();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^\s*```/.test(lines[index])) { codeLines.push(lines[index]); index += 1; }
      index += 1;
      const code = codeLines.join("\n");
      fragment.append(el("div", { class: "codeBlock" },
        el("button", { class: "copyBtn", type: "button", text: fence[1] ? `${fence[1]} · 복사` : "복사", onclick: () => copyText(code) }),
        el("pre", {}, el("code", { text: code }))));
      continue;
    }
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (heading) { flushParagraph(); flushList(); fragment.append(el("div", { class: "mdHead" }, renderInline(heading[1]))); }
    else if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? "ul" : "ol";
      if (!list || list.tagName.toLowerCase() !== tag) { flushList(); list = el(tag); }
      list.append(el("li", {}, renderInline((bullet || numbered)[1])));
    } else if (!line.trim()) { flushParagraph(); flushList(); }
    else { flushList(); paragraph.push(line); }
    index += 1;
  }
  flushParagraph(); flushList();
  return fragment;
}

// 클립보드 복사. 권한이 막힌 환경(iframe 등)에서는 숨김 textarea로 대체.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("📋 복사했어요");
  } catch (error) {
    const helper = el("textarea", { style: "position:fixed;left:-9999px;top:0" });
    helper.value = text;
    document.body.append(helper);
    helper.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch (fallbackError) { copied = false; }
    helper.remove();
    showToast(copied ? "📋 복사했어요" : "복사가 막혀 있어요. 길게 눌러 직접 복사해 주세요");
  }
}

// 최근 대화를 뒤에서부터 글자 예산(약 7천 자) 안에서 모은다. 긴 줄은 900자로 자른다. O(메시지 수)
function buildHistory(characterBudget = HISTORY_CHAR_BUDGET, channel = ROOM_CHANNEL) {
  const lines = [];
  let used = 0;
  const finished = state.chat.filter(message => !message.pending && message.from !== "system" && channelOf(message) === channel);
  for (let index = finished.length - 1; index >= 0; index--) {
    const message = finished[index];
    const body = message.text.length > HISTORY_LINE_LIMIT ? `${message.text.slice(0, HISTORY_LINE_LIMIT)}…` : message.text;
    let line;
    if (message.from === "user") {
      const target = message.to === "team" ? "팀 전체" : message.to === "topic" ? "토론 주제" : message.to === "brainstorm" ? "브레인스토밍 주제" : getPreset(message.to)?.name || "";
      line = `팀장 → ${target}: ${body}`;
    } else {
      const author = getPreset(message.from);
      const tag = { review: " [교차 검증]", discuss: ` [토론 R${message.round || 1}]`, briefPart: " [브리프 메모]", brief: " [최종 브리프]", brainstorm: " [브레인스토밍]", ideaList: " [아이디어 정리]" }[message.kind] || "";
      line = `${author.name}(${ROLE_LABELS[author.roleKey]})${tag}: ${body}`;
    }
    if (used + line.length > characterBudget && lines.length) break;
    lines.unshift(line);
    used += line.length;
  }
  return lines.join("\n");
}
