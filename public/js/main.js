/* ================= 초기화 ================= */
function bindStaticEvents() {
  document.querySelector("header h1").addEventListener("click", () => openRenamePrompt("app"));
  document.getElementById("scrim").addEventListener("click", closePanel);
  document.getElementById("zoom").addEventListener("click", () => document.getElementById("zoom").classList.remove("show"));
  document.getElementById("trophyPill").addEventListener("click", openAchievements);
  document.getElementById("gachaPill").addEventListener("click", () => openGacha());
  renderGachaPill();
  setInterval(renderGachaPill, 60000);
  document.getElementById("roleMapPill").addEventListener("click", openRoleMap);
  document.getElementById("roomPill").addEventListener("click", openRoom);
  document.getElementById("briefPill").addEventListener("click", openBriefList);
  document.getElementById("ambientPill").addEventListener("click", toggleAmbient);
  renderAmbientPill();
  document.getElementById("soundPill").addEventListener("click", toggleSound);
  renderSoundPill();
  document.getElementById("bgmPill").addEventListener("click", toggleBgm);
  renderBgmPill();
  bindAudioUnlock();
  document.getElementById("quotaPill").addEventListener("click", openQuotaBoard);
  document.getElementById("lockPill").addEventListener("click", openAccessPrompt);
  setInterval(() => { const node = document.getElementById("panelQuota"); if (node && panelAgentId) node.textContent = `⚡ ${quotaLine(getAgent(panelAgentId).model)}`; }, 30000);
  document.getElementById("coinPill").addEventListener("click", () => showToast("🪙 업무 완료 +5 (신뢰도 60↑ +7) · 코드리뷰 +1 · 자판기에서 사용"));
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    closePanel();
    document.getElementById("zoom").classList.remove("show");
  });
  document.getElementById("addTaskForm").addEventListener("submit", event => {
    event.preventDefault();
    const input = document.getElementById("taskTitleInput");
    const title = input.value.trim();
    if (!title) return;
    findProject(state.activeProjectId).tasks.push({ id: nextId("t"), title, roleKey: document.getElementById("taskRoleSelect").value, assigneeId: null, progress: 0, done: false, createdBy: "user" });
    input.value = "";
    saveState(); renderTaskList();
    playSound("taskAdd");
    showToast("업무를 올렸어요. 맞는 팀원이 가져갈 거예요");
  });
}

// 모든 스크립트가 로드된 뒤(마지막 defer) 한 번만 실행: 이벤트 연결 → 첫 렌더 → 연출·주기 작업 → 서버 연결.
function startApp() {
  bindStaticEvents();
  renderAll();
  playBootSequence();
  startCodeRain();
  scheduleGlitch();
  renderWindowAndClock();
  setInterval(tickOffice, TICK_MS);
  setInterval(typingSoundTick, TYPING_TICK_MS);
  setInterval(blinkLoop, 700);
  setInterval(motionTick, MOTION_TICK_MS);
  setInterval(errandTick, MOTION_TICK_MS);
  setInterval(renderWindowAndClock, 20000);
  setTimeout(spawnCat, 12000);
  scheduleCat();
  connectServer().then(() => { if (serverLocked) setTimeout(openAccessPrompt, 2600); });
}

startApp();
