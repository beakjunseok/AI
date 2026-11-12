/* ================= 키보드 스킨 50종 + 하루 한 번 뽑기 ================= */
// 스킨은 데이터로 정의하고 CSS 변수로 그린다(스킨마다 CSS 클래스를 만들지 않음).
// 실제 키보드 문화에서 참고한 것: 배열(풀배열·텐키리스·75%·65%·60%·40% 오쏘리니어·스플릿·매크로패드),
// 색 테마(레트로 베이지/그레이, 올리브, 네이비+옐로, 파스텔, 터미널 그린, 네온), 재질(알루미늄·투명 PC·나무·황동).
// 이름은 모두 이 앱의 오리지널.
// S(id, 이름, 등급, 배열, 케이스 위색, 케이스 아래색, 윗줄 키, 아랫줄 키, 옵션)
//   옵션: accent(포인트 키 색) · keys(round/piano/ortho/none) · fx(효과 목록) · glow(발광 색) · case(케이스 그라디언트 직접 지정) · desc

const RARITIES = {
  common: { label: "일반", color: "#9aa6b2", chance: 0.5, refund: 5 },
  uncommon: { label: "고급", color: "#3dffa8", chance: 0.28, refund: 10 },
  rare: { label: "희귀", color: "#4de8ff", chance: 0.15, refund: 25 },
  epic: { label: "영웅", color: "#c77dff", chance: 0.055, refund: 60 },
  legend: { label: "전설", color: "#ffb648", chance: 0.015, refund: 200 }
};
const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legend"];
const GACHA_PITY_PULLS = 7; // 희귀 이상이 7번 연속 안 나오면 다음 뽑기는 희귀 이상 확정
const KEYBOARD_LAYOUT_WIDTH = { macro: 16, "40": 26, "60": 30, "65": 32, "75": 34, tkl: 38, split: 40, full: 44 };

const S = (id, name, rarity, layout, caseTop, caseBottom, keyTop, keyBottom, options = {}) => ({ id, name, rarity, layout, caseTop, caseBottom, keyTop, keyBottom, ...options });
const RAINBOW = "linear-gradient(90deg,#ff5ac8,#4de8ff,#3dffa8,#ffb648,#ff5ac8)";

const KEYBOARD_SKINS = [
  // ── 일반 12: 사무용·단색 ──
  S("office_beige", "사무실 기본", "common", "full", "#d9d4c7", "#a8a294", "#f2efe6", "#c9c4b6", { desc: "어느 사무실에나 있는 그 키보드" }),
  S("office_black", "까만 사무용", "common", "full", "#2b2f36", "#15181c", "#4a505a", "#3a3f48", { desc: "회사 비품 스티커가 붙어 있다" }),
  S("membrane_grey", "회색 멤브레인", "common", "tkl", "#8d949c", "#5f666e", "#b9c0c8", "#a2a9b1", { desc: "눌러도 소리가 거의 안 난다" }),
  S("mini_white", "흰색 미니", "common", "60", "#f4f7fa", "#b9c3cc", "#dfe5ea", "#cbd3da", { desc: "작고 하얗고 평범하다" }),
  S("practice_ivory", "연습용 아이보리", "common", "tkl", "#efe8d6", "#c2b99f", "#fffaf0", "#ded5bd", { desc: "타자 연습 시간의 추억" }),
  S("school_lab", "학교 컴퓨터실", "common", "full", "#e3d9a8", "#b3a876", "#f1e9c2", "#cfc594", { desc: "세월에 누렇게 익었다" }),
  S("dusty_storage", "창고에서 꺼낸 것", "common", "tkl", "#7c7468", "#544e45", "#9a9184", "#857c70", { desc: "먼지를 털면 아직 쓸 만하다" }),
  S("matte_black", "무광 블랙", "common", "65", "#1f2328", "#0e1013", "#343a42", "#2a2f36", { desc: "지문이 잘 묻는다" }),
  S("slim_silver", "실버 슬림", "common", "75", "#d5dae0", "#9aa2ab", "#f3f5f7", "#e2e6ea", { height: 7, desc: "노트북 같은 얇은 키" }),
  S("basic_navy", "네이비 베이직", "common", "tkl", "#27344d", "#16203a", "#3d4d6b", "#324059", { desc: "무난함의 정석" }),
  S("charcoal_tkl", "숯색 텐키리스", "common", "tkl", "#3a3d42", "#232529", "#565a61", "#474b52", { desc: "숫자 키패드는 과감히 포기" }),
  S("cream_65", "크림 화이트", "common", "65", "#f6efe0", "#cdc3ad", "#fffaf0", "#e9e0cc", { desc: "책상이 환해진다" }),
  // ── 고급 12: 투톤 색 테마 ──
  S("retro_twotone", "레트로 투톤", "uncommon", "tkl", "#cfc8b8", "#9c9585", "#efe9da", "#8f8a80", { accent: "#c0392b", desc: "베이지 글쇠에 회색 기능키, 빨간 ESC" }),
  S("olive_field", "올리브 야전", "uncommon", "75", "#5c6142", "#3b3f2a", "#e4dcc0", "#7a8054", { accent: "#d98b2b", desc: "모래색과 올리브의 야전 감성" }),
  S("camp_navy", "캠핑 네이비", "uncommon", "65", "#243352", "#141e36", "#f1e8d2", "#2f4470", { accent: "#f2c230", desc: "크림·네이비에 노란 포인트" }),
  S("mint_choco", "민트 초코", "uncommon", "65", "#5a3d2e", "#38251b", "#a8f0d8", "#7fd9bd", { accent: "#5a3d2e", desc: "호불호가 갈리는 그 맛" }),
  S("cherry_milk", "벚꽃 우유", "uncommon", "60", "#ffe4ec", "#e8b5c6", "#ffffff", "#ffb3d1", { desc: "분홍과 하양, 봄 한정" }),
  S("lavender_mist", "라벤더 안개", "uncommon", "65", "#d9cff2", "#a99bd1", "#f4eeff", "#c3b4ea", { desc: "보랏빛 새벽 공기" }),
  S("butter_toast", "버터 토스트", "uncommon", "75", "#b98a52", "#8a6234", "#ffe9a8", "#f2cf7a", { desc: "갓 구운 빵 색" }),
  S("panda", "흑백 판다", "uncommon", "60", "#f4f4f1", "#bfc0bc", "#1c1e22", "#1c1e22", { accent: "#f4f4f1", desc: "흰 몸통에 까만 글쇠" }),
  S("sea_glass", "바다 유리", "uncommon", "tkl", "#123a4a", "#0a2430", "#7fe0d6", "#2f8fa3", { desc: "얕은 바다에서 깊은 바다까지" }),
  S("citrus_soda", "감귤 소다", "uncommon", "65", "#fff3e0", "#e6c79a", "#ff9a3c", "#ffd08a", { accent: "#3dbd6e", desc: "톡 쏘는 주황과 초록 꼭지" }),
  S("moss_forest", "숲속 이끼", "uncommon", "75", "#2f4a34", "#1c2f20", "#eadfc4", "#6f9a5a", { desc: "이끼 낀 돌담 색" }),
  S("redbean_ice", "팥빙수", "uncommon", "60", "#eef6fb", "#bcd3e0", "#8a3b3b", "#f7fbff", { accent: "#ffd166", desc: "얼음 위 팥과 콩가루" }),
  // ── 희귀 11: 형태·재질이 특이 ──
  S("typewriter", "타자기 클래식", "rare", "tkl", "#1b1b1d", "#0a0a0b", "#d9b56a", "#c9a55a", { keys: "round", edge: "#6b5a2e", desc: "둥근 황동 글쇠가 찰칵" }),
  S("terminal_green", "터미널 그린", "rare", "75", "#0b120d", "#050906", "#3dff7a", "#22b852", { glow: "#3dff7a", desc: "검은 화면에 초록 글자" }),
  S("amber_crt", "호박색 모니터", "rare", "tkl", "#1a1206", "#0d0903", "#ffb000", "#c98600", { glow: "#ffb000", desc: "옛 단말기의 따뜻한 주황빛" }),
  S("clear_ice", "투명 얼음", "rare", "65", "rgba(220,240,255,.55)", "rgba(150,200,235,.5)", "rgba(255,255,255,.9)", "rgba(200,235,255,.85)", { glow: "#9fdcff", edge: "rgba(255,255,255,.7)", desc: "속이 비치는 반투명 케이스" }),
  S("walnut", "월넛 우드", "rare", "65", "#7a4a2a", "#4a2a16", "#efe6d2", "#d8ccb2", { case: "repeating-linear-gradient(8deg,#7a4a2a 0 3px,#6a3f22 3px 5px,#84522f 5px 8px)", desc: "나뭇결이 살아 있는 원목 케이스" }),
  S("sunset_synth", "노을 신스", "rare", "75", "#2a1650", "#170b30", "#ff8a5c", "#ff5ac8", { case: "linear-gradient(90deg,#3a1c71,#d76d77,#ffaf7b)", desc: "보라에서 주황으로 지는 해" }),
  S("ortho_grid", "바둑판 40", "rare", "40", "#2b3038", "#171a1f", "#e8ecf0", "#e8ecf0", { keys: "ortho", accent: "#ff5ac8", desc: "키가 줄 맞춰 선 격자 배열" }),
  S("split_wings", "양날개 스플릿", "rare", "split", "#30343b", "#1a1d22", "#dfe4ea", "#aeb6c0", { accent: "#4de8ff", desc: "어깨가 편한 좌우 분리형" }),
  S("macro_nine", "매크로 9키", "rare", "macro", "#22252b", "#101216", "#ff5ac8", "#4de8ff", { keys: "ortho", accent: "#ffb648", desc: "단축키만 모은 꼬마 패드" }),
  S("low_alu", "로우 알루미늄", "rare", "75", "#c9ced6", "#8a929c", "#2a2e35", "#2a2e35", { height: 7, glow: "#ffffff", desc: "얇은 금속 판에 흰 백라이트" }),
  S("dancheong", "단청", "rare", "tkl", "#7a1f1f", "#4a1010", "#2fa59a", "#f2c230", { accent: "#f4f1e6", desc: "처마 밑 붉은색과 청록" }),
  // ── 영웅 9: 빛나고 움직임 ──
  S("neon_city", "네온 시티", "epic", "65", "#12141c", "#07080c", "#4de8ff", "#ff5ac8", { glow: "#ff5ac8", fx: ["breathe"], desc: "비 오는 밤거리의 간판 불빛" }),
  S("pudding_rgb", "푸딩 RGB", "epic", "tkl", "#0e1014", "#050608", "rgba(255,255,255,.9)", "rgba(255,255,255,.75)", { case: RAINBOW, fx: ["flow"], glow: "#4de8ff", desc: "반투명 키캡 사이로 무지개가 흐른다" }),
  S("midi_pro", "미디 건반 프로", "epic", "full", "#16181d", "#0a0b0e", "#f6f6f2", "#11151a", { keys: "piano", glow: "#c77dff", fx: ["breathe"], desc: "치는 대로 음악이 된다" }),
  S("brass_heavy", "황동 헤비급", "epic", "65", "#d9b56a", "#8a6a2a", "#1c1a16", "#2a261d", { case: "linear-gradient(110deg,#8a6a2a,#f0d48a,#b8923f,#f0d48a,#8a6a2a)", fx: ["flow"], desc: "들면 팔이 아픈 통황동" }),
  S("deep_sea", "심해 발광", "epic", "75", "#061a2e", "#020a14", "#39f0ff", "#1a7fa8", { glow: "#39f0ff", fx: ["breathe"], desc: "깊은 바다 생물처럼 스스로 빛난다" }),
  S("thunder", "번개 구름", "epic", "tkl", "#3a3f4c", "#1d2029", "#cfd6e4", "#8892a6", { accent: "#ffe45c", glow: "#ffe45c", fx: ["flash"], desc: "가끔 번쩍, 하고 친다" }),
  S("rose_quartz", "장미 석영", "epic", "65", "#f7cfe0", "#c98aa8", "#ffffff", "#ffe1ee", { case: "linear-gradient(110deg,#f7cfe0,#fff4f9,#e7a6c4,#fff4f9,#f7cfe0)", fx: ["flow"], glow: "#ffb3d1", desc: "분홍 수정을 통째로 깎았다" }),
  S("aurora", "오로라", "epic", "75", "#0a1420", "#050a12", "#eafff6", "#bff5e2", { case: "linear-gradient(90deg,#0b3d3a,#3dffa8,#7b5cff,#3dffa8,#0b3d3a)", fx: ["flow"], glow: "#3dffa8", desc: "북쪽 밤하늘의 초록 커튼" }),
  S("stealth_ops", "스텔스", "epic", "60", "#0c0d0f", "#040405", "#1a1c20", "#16181b", { glow: "#ff3b3b", fx: ["breathe"], desc: "글자도 없는 새까만 키, 바닥만 붉게" }),
  // ── 전설 6: 화려함 최대 ──
  S("hologram", "홀로그램 프리즘", "legend", "65", "#ffffff", "#c9d6ff", "rgba(255,255,255,.95)", "rgba(255,255,255,.8)", { case: "linear-gradient(115deg,#ff9ad5,#a6f6ff,#c8ffb0,#fff3a6,#d3b0ff,#ff9ad5)", fx: ["flow", "float", "hue"], glow: "#d3b0ff", desc: "보는 각도마다 색이 바뀐다" }),
  S("lava_core", "용암 코어", "legend", "tkl", "#2a0a04", "#120402", "#1a0f0c", "#241310", { case: "linear-gradient(90deg,#3a0a00,#ff4d00,#ffd000,#ff4d00,#3a0a00)", fx: ["flow", "flicker"], glow: "#ff5a00", desc: "식은 돌 틈으로 용암이 흐른다" }),
  S("milky_way", "은하수", "legend", "75", "#0a0620", "#04020e", "#e9e4ff", "#b6a8ff", { case: "radial-gradient(circle,#fff 0 .5px,transparent .9px) 0 0/7px 5px,radial-gradient(circle,#ffd6f6 0 .5px,transparent .9px) 3px 2px/9px 6px,linear-gradient(120deg,#0a0620,#3a1c71,#0b2a5c,#0a0620)", fx: ["float", "twinkle"], glow: "#8f7bff", desc: "책상 위에 뜬 작은 우주" }),
  S("glitch_404", "글리치 404", "legend", "65", "#101216", "#050608", "#4de8ff", "#ff5ac8", { case: "repeating-linear-gradient(0deg,#101216 0 2px,#1b2030 2px 3px)", fx: ["glitch"], glow: "#4de8ff", desc: "존재하지 않는 키보드입니다" }),
  S("golden_throne", "황금 왕좌", "legend", "full", "#ffe08a", "#b8860b", "#fff7d6", "#ffe9a3", { case: "linear-gradient(110deg,#b8860b,#ffe08a,#fffbe6,#ffe08a,#b8860b)", fx: ["flow", "sparkle"], glow: "#ffd54a", accent: "#e0115f", desc: "순금에 루비 한 알" }),
  S("quantum_rainbow", "무지개 양자", "legend", "split", "#14161d", "#07080c", "#ffffff", "#ffffff", { case: RAINBOW, fx: ["flow", "float", "hue"], glow: "#ffffff", keys: "ortho", desc: "모든 색이 동시에 존재한다" })
];
const findSkin = skinId => KEYBOARD_SKINS.find(skin => skin.id === skinId);

/* ---------- 그리기 ---------- */
// 스킨을 키보드 노드에 입힌다. 스킨이 없으면 팀원별 기본 키보드(kb-<id>).
function applyKeyboardSkin(node, skin, agentId) {
  node.removeAttribute("style");
  if (!skin) { node.className = `keyboard kb-${agentId}`; return node; }
  node.className = ["keyboard", "skin", `lay-${skin.layout}`, skin.keys ? `keys-${skin.keys}` : "", `rar-${skin.rarity}`, ...(skin.fx || []).map(effect => `fx-${effect}`)].filter(Boolean).join(" ");
  const height = skin.height || 9;
  const variables = {
    "--kw": `${KEYBOARD_LAYOUT_WIDTH[skin.layout] || 36}px`, "--kh": `${height}px`,
    "--case": skin.case || `linear-gradient(${skin.caseTop} 0 ${height - 2}px,${skin.caseBottom} ${height - 2}px)`,
    "--k1": skin.keyTop, "--k2": skin.keyBottom, "--ac": skin.accent || skin.keyTop,
    "--edge": skin.edge || skin.caseBottom, "--glow": skin.glow || "transparent", "--glowSize": skin.glow ? "7px" : "0px"
  };
  Object.entries(variables).forEach(([name, value]) => node.style.setProperty(name, value));
  return node;
}

const equippedSkinOf = agentId => findSkin(state.gacha?.equipped?.[agentId]);
const createKeyboardNode = (skin, agentId) => applyKeyboardSkin(el("div", { "aria-hidden": "true" }), skin, agentId);

/* ---------- 뽑기 ---------- */
const gachaDayKey = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; };
const canPullToday = () => state.gacha.lastDate !== gachaDayKey();
const ownedSkinCount = () => KEYBOARD_SKINS.filter(skin => state.gacha.owned[skin.id]).length;

// 등급을 확률대로 고른다. 천장(pity)에 닿았으면 희귀 이상에서만 고른다(비율 유지).
function rollRarity(guaranteeRare) {
  const pool = guaranteeRare ? ["rare", "epic", "legend"] : RARITY_ORDER;
  const total = pool.reduce((sum, key) => sum + RARITIES[key].chance, 0);
  let roll = Math.random() * total;
  for (const key of pool) { roll -= RARITIES[key].chance; if (roll <= 0) return key; }
  return pool[0];
}

// 오늘의 뽑기 1회. 중복이면 등급별 코인으로 돌려준다. 결과 { skin, duplicate, refund } 또는 null(오늘 이미 뽑음).
function pullKeyboard() {
  if (!canPullToday()) return null;
  const gacha = state.gacha;
  const rarity = rollRarity(gacha.pity >= GACHA_PITY_PULLS - 1);
  const skin = pickRandom(KEYBOARD_SKINS.filter(item => item.rarity === rarity));
  const duplicate = Boolean(gacha.owned[skin.id]);
  const refund = duplicate ? RARITIES[rarity].refund : 0;
  gacha.owned[skin.id] = (gacha.owned[skin.id] || 0) + 1;
  gacha.pity = ["rare", "epic", "legend"].includes(rarity) ? 0 : gacha.pity + 1;
  gacha.lastDate = gachaDayKey();
  gacha.pulls = (gacha.pulls || 0) + 1;
  state.coins += refund;
  saveState();
  return { skin, duplicate, refund };
}

function renderGachaPill() {
  const pill = document.getElementById("gachaPill");
  pill.textContent = `⌨️ 뽑기 ${ownedSkinCount()}/${KEYBOARD_SKINS.length}`;
  pill.classList.toggle("ready", canPullToday());
}

function equipSkin(agentId, skinId) {
  if (skinId) state.gacha.equipped[agentId] = skinId; else delete state.gacha.equipped[agentId];
  saveState();
  renderOffice();
  playSound("sit");
}

function timeUntilMidnight() {
  const now = new Date();
  const minutes = Math.ceil((new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now) / 60000);
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

const skinPreview = (skin, agentId) => el("div", { class: "kbPreview" }, createKeyboardNode(skin, agentId));

// 뽑기 창: 오늘의 뽑기 버튼 → 결과 연출, 아래에 도감(등급순)과 장착.
function openGacha(selectedSkinId = null, lastResult = null) {
  const zoom = document.getElementById("zoom");
  const gacha = state.gacha;
  const ready = canPullToday();
  const stage = el("div", { class: "gachaStage" });
  if (lastResult) {
    const rarity = RARITIES[lastResult.skin.rarity];
    stage.classList.add("reveal", `rar-${lastResult.skin.rarity}`);
    stage.style.setProperty("--rarity", rarity.color);
    stage.append(el("div", { class: "gachaRarity", text: `★ ${rarity.label} ★` }), skinPreview(lastResult.skin), el("b", { text: lastResult.skin.name }), el("small", { text: lastResult.skin.desc }),
      el("small", { class: "gachaNote", text: lastResult.duplicate ? `이미 가진 스킨이에요 → 🪙 +${lastResult.refund}` : "✨ 새 스킨! 아래 도감에서 책상에 놓아 보세요" }));
  } else {
    stage.append(el("div", { class: "gachaBox", text: "⌨️" }), el("small", { text: ready ? "오늘의 키보드를 뽑아 보세요" : `오늘은 뽑았어요 · ${timeUntilMidnight()} 뒤 다시` }));
  }
  const pullButton = el("button", { class: "btn pink gachaPull", type: "button", disabled: !ready, text: ready ? "🎰 오늘의 뽑기 (무료 · 하루 1번)" : "내일 다시 만나요" });
  pullButton.addEventListener("click", () => {
    if (!canPullToday()) return;
    pullButton.disabled = true;
    stage.className = "gachaStage rolling";
    stage.replaceChildren(el("div", { class: "gachaBox", text: "⌨️" }), el("small", { text: "두구두구…" }));
    playSound("gachaRoll");
    setTimeout(() => {
      const result = pullKeyboard();
      if (!result) return;
      playSound(["epic", "legend"].includes(result.skin.rarity) ? "gachaLegend" : "gachaReveal");
      const rect = stage.getBoundingClientRect();
      burst(rect.left + rect.width / 2, rect.top + rect.height / 2, result.skin.rarity === "legend" ? ["👑", "✨", "⌨️", "🌟"] : ["✨", "⌨️"], RARITY_ORDER.indexOf(result.skin.rarity) * 3 + 4);
      renderGachaPill(); renderHeaderStats();
      openGacha(result.skin.id, result);
    }, 1100);
  });
  const grid = el("div", { class: "skinGrid" }, [...KEYBOARD_SKINS].sort((first, second) => RARITY_ORDER.indexOf(second.rarity) - RARITY_ORDER.indexOf(first.rarity)).map(skin => {
    const owned = Boolean(gacha.owned[skin.id]);
    const cell = el("button", { type: "button", class: `skinCell rar-${skin.rarity}` + (owned ? "" : " locked") + (skin.id === selectedSkinId ? " selected" : ""), title: owned ? skin.name : "???",
      onclick: () => { if (owned) openGacha(skin.id, lastResult); else showToast(`🔒 ${RARITIES[skin.rarity].label} 등급 · 아직 못 뽑았어요`); } },
      owned ? skinPreview(skin) : el("div", { class: "kbPreview", text: "?" }), el("small", { text: owned ? skin.name : "???" }));
    cell.style.setProperty("--rarity", RARITIES[skin.rarity].color);
    return cell;
  }));
  const selected = findSkin(selectedSkinId);
  const detail = selected && gacha.owned[selected.id] ? el("div", { class: "skinDetail" },
    el("b", { text: `${selected.name} · ${RARITIES[selected.rarity].label}` }), el("small", { text: selected.desc }),
    el("div", { class: "equipRow" }, state.agents.map(agent => {
      const isOn = gacha.equipped[agent.id] === selected.id;
      return el("button", { type: "button", class: "kindChip" + (isOn ? " on" : ""), text: `${getPreset(agent.id).name}${isOn ? " ✓" : ""}`,
        onclick: () => { equipSkin(agent.id, isOn ? null : selected.id); openGacha(selected.id, lastResult); } });
    })), el("small", { class: "gachaNote", text: "팀원 이름을 누르면 그 책상에 놓여요. 다시 누르면 기본 키보드로." })) : null;
  const odds = RARITY_ORDER.map(key => `${RARITIES[key].label} ${(RARITIES[key].chance * 100).toFixed(1).replace(".0", "")}%`).join(" · ");
  zoom.replaceChildren(el("div", { class: "zoomCard chunky gachaCard", onclick: event => event.stopPropagation() },
    el("h3", { text: `⌨️ 키보드 뽑기 · 도감 ${ownedSkinCount()}/${KEYBOARD_SKINS.length}` }), stage, pullButton,
    el("small", { class: "gachaOdds", text: `확률: ${odds} · 희귀 이상이 ${GACHA_PITY_PULLS}번 연속 안 나오면 다음은 희귀 이상 확정(지금 ${gacha.pity}번째) · 중복은 코인으로` }),
    detail, grid));
  zoom.classList.add("show");
}
