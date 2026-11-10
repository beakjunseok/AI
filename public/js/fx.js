/* ================= 해커 연출: 부팅 / 코드 레인 / 글리치 ================= */
// 세션당 한 번 터미널 부팅 로그를 보여준다. 탭하면 바로 건너뜀.
function playBootSequence() {
  const boot = document.getElementById("boot");
  let alreadyBooted = false;
  try { alreadyBooted = sessionStorage.getItem("ai-office-booted") === "1"; sessionStorage.setItem("ai-office-booted", "1"); } catch (error) { /* 무시 */ }
  if (alreadyBooted) { boot.remove(); return; }
  const lines = [
    ["", "AI//OFFICE kernel 6.0.1-xeno booting…"],
    ["ok", "[ OK ] mounting /dev/team"],
    ...AGENT_PRESETS.map(preset => ["ok", `[ OK ] agent @${preset.name.padEnd(4, " ")} ← ${providerInfo(getAgent(preset.id).model).label}`]),
    ["ok", "[ OK ] uplink: vercel edge"],
    ["", "access granted. welcome, operator."]
  ];
  const finish = () => { boot.classList.add("hide"); setTimeout(() => boot.remove(), 450); };
  boot.addEventListener("click", finish);
  lines.forEach(([kind, text], index) => setTimeout(() => {
    boot.querySelector(".cursor")?.remove();
    boot.append(el("div", { class: kind, text }), el("span", { class: "cursor" }));
  }, index * 170));
  setTimeout(finish, lines.length * 170 + 700);
}

// 벽면에 헥스 문자 레인. 화면 밖이거나 탭이 숨으면 브라우저가 rAF를 멈춰 비용이 거의 없음. 프레임당 O(열 수)
function startCodeRain() {
  const canvas = document.getElementById("rain");
  const context = canvas.getContext("2d");
  const glyphs = "0123456789ABCDEF<>/{}#$";
  const fontSize = 10;
  let columns = [];
  const resize = () => {
    canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
    columns = Array.from({ length: Math.ceil(canvas.width / fontSize) }, () => Math.random() * -20);
  };
  resize();
  window.addEventListener("resize", resize);
  let lastFrame = 0;
  const draw = time => {
    requestAnimationFrame(draw);
    if (time - lastFrame < 70) return;
    lastFrame = time;
    context.fillStyle = "rgba(20,24,29,.28)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = `${fontSize}px JetBrains Mono, monospace`;
    columns.forEach((row, index) => {
      context.fillStyle = Math.random() < 0.06 ? "#eafcff" : (index % 5 === 0 ? "#3dffa8" : "#4de8ff");
      context.fillText(glyphs[Math.floor(Math.random() * glyphs.length)], index * fontSize, row * fontSize);
      columns[index] = row * fontSize > canvas.height && Math.random() > 0.95 ? 0 : row + 1;
    });
  };
  requestAnimationFrame(draw);
}

function scheduleGlitch() {
  setTimeout(() => {
    const title = document.querySelector("header h1");
    title.classList.remove("glitch"); void title.offsetWidth; title.classList.add("glitch");
    if (Math.random() < 0.25) playSound("glitch");
    scheduleGlitch();
  }, 5000 + Math.random() * 7000);
}
