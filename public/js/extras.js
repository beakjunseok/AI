/* ================= 확대 / 업적 / AI 연결 ================= */
function openZoom(preset, item) {
  const zoom = document.getElementById("zoom");
  zoom.replaceChildren(el("div", { class: "zoomCard chunky" }, el("div", { class: "big", text: item.icon }), el("h3", { text: `${preset.name}의 ${item.name}` }), el("p", { text: `“${item.line}”` })));
  zoom.classList.add("show");
  say(preset.id, item.line, 2500);
}

function openAchievements() {
  const zoom = document.getElementById("zoom");
  zoom.replaceChildren(el("div", { class: "zoomCard chunky" }, el("h3", { text: `🏅 업적 ${state.achievements.length}/${ACHIEVEMENTS.length}` }),
    el("div", { class: "achList" }, ACHIEVEMENTS.map(item => {
      const unlocked = state.achievements.includes(item.id);
      return el("div", { class: "ach" + (unlocked ? "" : " locked"), text: unlocked ? `${item.title} — ${item.desc}` : "🔒 ???" });
    }))));
  zoom.classList.add("show");
}

function updateAiBadge() {
  const badge = document.getElementById("aiBadge");
  const online = [...(sampleApi ? ["claude"] : []), ...serverProviders].filter((name, index, list) => list.indexOf(name) === index);
  badge.textContent = online.length ? `● ${online.map(name => providerInfo(name).label).join(" · ")}` : "○ simulation";
  badge.classList.toggle("on", online.length > 0);
  if (panelAgentId) renderPanel();
}

// window.claude는 늦게 주입될 수 있어 몇 번 재시도한다. 없으면 시뮬레이션으로 계속 동작.
async function connectAi(attempt = 0) {
  try {
    if (window.claude && typeof window.claude.use === "function") {
      sampleApi = await window.claude.use("sample");
      updateAiBadge();
      return;
    }
  } catch (error) { sampleApi = null; }
  if (attempt < 10) setTimeout(() => connectAi(attempt + 1), 500);
}
