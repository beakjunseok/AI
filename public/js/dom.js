/* ================= DOM / 효과 헬퍼 ================= */
// 텍스트는 항상 textContent로 넣어 AI 응답이 HTML로 해석되지 않게 한다.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (value == null || value === false) return;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  });
  children.flat().forEach(child => { if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child))); });
  return node;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}

// 화면 좌표에서 이모지 파티클을 흩뿌린다.
function burst(x, y, emojis, count = 6) {
  for (let index = 0; index < count; index++) {
    const particle = el("span", { class: "particle", text: pickRandom(emojis) });
    particle.style.left = `${x - 9}px`;
    particle.style.top = `${y - 9}px`;
    particle.style.setProperty("--dx", `${Math.round(Math.random() * 80 - 40)}px`);
    particle.style.setProperty("--dy", `${Math.round(-40 - Math.random() * 60)}px`);
    particle.style.setProperty("--rot", `${Math.round(Math.random() * 60 - 30)}deg`);
    document.body.append(particle);
    setTimeout(() => particle.remove(), 1050);
  }
}

function burstAtAgent(agentId, emojis, count) {
  const node = document.querySelector(`#app .agent[data-agent="${agentId}"]`) || document.querySelector(`.panelHead .bigSprite`);
  if (!node) return;
  const rect = node.getBoundingClientRect();
  burst(rect.left + rect.width / 2, rect.top + rect.height / 3, emojis, count);
}

function unlockAchievement(achievementId) {
  if (state.achievements.includes(achievementId)) return;
  const achievement = ACHIEVEMENTS.find(item => item.id === achievementId);
  if (!achievement) return;
  state.achievements.push(achievementId);
  showToast(`🏅 업적 달성! ${achievement.title}`);
  burst(window.innerWidth / 2, window.innerHeight - 70, ["🎉", "✨", "🎊"], 10);
  renderHeaderStats();
  saveState();
}
