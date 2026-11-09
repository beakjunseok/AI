/* ================= 확대 / 업적 / AI 상태 배지 ================= */
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
  const online = [...serverProviders];
  badge.textContent = online.length ? `● ${online.map(name => providerInfo(name).label).join(" · ")}` : "○ simulation";
  badge.classList.toggle("on", online.length > 0);
  if (panelAgentId) renderPanel();
}
