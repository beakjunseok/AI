/* ================= 키보드 스킨 51종 + 하루 한 번 뽑기 ================= */
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
const GACHA_PITY_PULLS = 7;
const GACHA_SINGLE_COST = 300;  // 코인 1회
const GACHA_TEN_COST = 3000;    // 코인 10연속(희귀 이상 1개 확정) // 희귀 이상이 7번 연속 안 나오면 다음 뽑기는 희귀 이상 확정
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
  // ── 전설 7: 화려함 최대 ──
  S("hologram", "홀로그램 프리즘", "legend", "65", "#ffffff", "#c9d6ff", "rgba(255,255,255,.95)", "rgba(255,255,255,.8)", { case: "linear-gradient(115deg,#ff9ad5,#a6f6ff,#c8ffb0,#fff3a6,#d3b0ff,#ff9ad5)", fx: ["flow", "float", "hue"], glow: "#d3b0ff", desc: "보는 각도마다 색이 바뀐다" }),
  S("lava_core", "용암 코어", "legend", "tkl", "#2a0a04", "#120402", "#1a0f0c", "#241310", { case: "linear-gradient(90deg,#3a0a00,#ff4d00,#ffd000,#ff4d00,#3a0a00)", fx: ["flow", "flicker"], glow: "#ff5a00", desc: "식은 돌 틈으로 용암이 흐른다" }),
  S("milky_way", "은하수", "legend", "75", "#0a0620", "#04020e", "#e9e4ff", "#b6a8ff", { case: "radial-gradient(circle,#fff 0 .5px,transparent .9px) 0 0/7px 5px,radial-gradient(circle,#ffd6f6 0 .5px,transparent .9px) 3px 2px/9px 6px,linear-gradient(120deg,#0a0620,#3a1c71,#0b2a5c,#0a0620)", fx: ["float", "twinkle"], glow: "#8f7bff", desc: "책상 위에 뜬 작은 우주" }),
  S("glitch_404", "글리치 404", "legend", "65", "#101216", "#050608", "#4de8ff", "#ff5ac8", { case: "repeating-linear-gradient(0deg,#101216 0 2px,#1b2030 2px 3px)", fx: ["glitch"], glow: "#4de8ff", desc: "존재하지 않는 키보드입니다" }),
  S("golden_throne", "황금 왕좌", "legend", "full", "#ffe08a", "#b8860b", "#fff7d6", "#ffe9a3", { case: "linear-gradient(110deg,#b8860b,#ffe08a,#fffbe6,#ffe08a,#b8860b)", fx: ["flow", "sparkle"], glow: "#ffd54a", accent: "#e0115f", desc: "순금에 루비 한 알" }),
  S("quantum_rainbow", "무지개 양자", "legend", "split", "#14161d", "#07080c", "#ffffff", "#ffffff", { case: RAINBOW, fx: ["flow", "float", "hue"], glow: "#ffffff", keys: "ortho", desc: "모든 색이 동시에 존재한다" }),
  S("brass_overclock", "황동 오버클럭", "legend", "65", "#8a6a3c", "#3a2a18", "#2b2f3a", "#1c1f28", { case: "linear-gradient(110deg,#5a4024,#c9a25e,#7a5a34,#d8b878,#5a4024)", fx: ["flow", "breathe"], glow: "#a970ff", accent: "#4de8ff", desc: "톱니바퀴와 네온이 같이 돈다" })
];
const findSkin = skinId => KEYBOARD_SKINS.find(skin => skin.id === skinId);
// 전설 키보드 카드 일러스트: img/kb-<skinId>.webp(또는 .png). 그림이 있으면 뽑기 공개·도감 상세에서 크게 보여준다.
const hasKeyboardArt = skin => skin.rarity === "legend";

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

const isRareOrBetter = rarityKey => ["rare", "epic", "legend"].includes(rarityKey);

// 한 장 뽑기(무료·코인 공통). 중복이면 등급별 코인으로 돌려준다. 결과 { skin, duplicate, refund }
function rollKeyboard(forceRareOrBetter = false) {
  const gacha = state.gacha;
  const rarity = rollRarity(forceRareOrBetter || gacha.pity >= GACHA_PITY_PULLS - 1);
  const skin = pickRandom(KEYBOARD_SKINS.filter(item => item.rarity === rarity));
  const duplicate = Boolean(gacha.owned[skin.id]);
  const refund = duplicate ? RARITIES[rarity].refund : 0;
  gacha.owned[skin.id] = (gacha.owned[skin.id] || 0) + 1;
  gacha.pity = isRareOrBetter(rarity) ? 0 : gacha.pity + 1;
  gacha.pulls = (gacha.pulls || 0) + 1;
  state.coins += refund;
  return { skin, duplicate, refund };
}

// 오늘의 무료 뽑기 1회. 오늘 이미 뽑았으면 null.
function pullKeyboard() {
  if (!canPullToday()) return null;
  const result = rollKeyboard();
  state.gacha.lastDate = gachaDayKey();
  saveState();
  return result;
}

// 코인 뽑기: 1회 또는 10연속. 10연속은 희귀 이상 1개 확정(앞 9장에 없으면 마지막 장을 희귀 이상으로).
// 코인이 모자라면 null. O(뽑는 수 × 스킨 수)
function pullWithCoins(count) {
  const cost = count === 10 ? GACHA_TEN_COST : GACHA_SINGLE_COST;
  if (state.coins < cost) return null;
  state.coins -= cost;
  const results = [];
  for (let index = 0; index < count; index += 1) {
    const needsGuarantee = count === 10 && index === count - 1 && !results.some(item => isRareOrBetter(item.skin.rarity));
    results.push(rollKeyboard(needsGuarantee));
  }
  saveState();
  return results;
}

function renderGachaPill() {
  const pill = document.getElementById("gachaPill");
  pill.textContent = `⌨️ 뽑기 ${ownedSkinCount()}/${KEYBOARD_SKINS.length}`;
  pill.classList.toggle("ready", canPullToday());
}

// 이 스킨을 지금 몇 명이 쓰고 있는지.
const equippedCount = skinId => Object.values(state.gacha.equipped).filter(id => id === skinId).length;

// 뽑은 개수만큼만 장착할 수 있다(×2면 두 명까지). 모자라면 false.
function equipSkin(agentId, skinId) {
  if (skinId && state.gacha.equipped[agentId] !== skinId && equippedCount(skinId) >= (state.gacha.owned[skinId] || 0)) {
    playSound("error");
    showToast(`이 스킨은 ${state.gacha.owned[skinId] || 0}개뿐이라 ${state.gacha.owned[skinId] || 0}명까지만 쓸 수 있어요. 더 뽑거나 다른 팀원에게서 빼 주세요`);
    return false;
  }
  if (skinId) state.gacha.equipped[agentId] = skinId; else delete state.gacha.equipped[agentId];
  saveState();
  renderOffice();
  playSound("sit");
  return true;
}

function timeUntilMidnight() {
  const now = new Date();
  const minutes = Math.ceil((new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now) / 60000);
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

const skinPreview = (skin, agentId) => el("div", { class: "kbPreview" }, createKeyboardNode(skin, agentId));
const rarityStarCount = rarityKey => RARITY_ORDER.indexOf(rarityKey) + 1;

/* ---------- 뽑기 화면 ---------- */
// 오늘의 뽑기 버튼과 보유 현황만 보여준다. 도감은 openCollection()으로 따로.
function openGacha() {
  const zoom = document.getElementById("zoom");
  const ready = canPullToday();
  const ownedByRarity = RARITY_ORDER.map(key => {
    const total = KEYBOARD_SKINS.filter(skin => skin.rarity === key).length;
    const owned = KEYBOARD_SKINS.filter(skin => skin.rarity === key && state.gacha.owned[skin.id]).length;
    const chip = el("span", { class: "rarityCount", text: `${RARITIES[key].label} ${owned}/${total}` });
    chip.style.setProperty("--rarity", RARITIES[key].color);
    return chip;
  });
  const pullButton = el("button", { class: "btn pink gachaPull", type: "button", disabled: !ready, text: ready ? "🎰 오늘의 무료 뽑기" : `무료 뽑기는 ${timeUntilMidnight()} 뒤` });
  pullButton.addEventListener("click", () => {
    const result = pullKeyboard();
    if (!result) return;
    zoom.classList.remove("show");
    renderGachaPill();
    renderHeaderStats();
    playGachaSequence(result);
  });
  const coinButton = (count, cost, label) => {
    const affordable = state.coins >= cost;
    return el("button", { class: "btn gachaCoinPull" + (count === 10 ? " ten" : ""), type: "button", disabled: !affordable, onclick: () => startCoinPull(count) },
      el("b", { text: label }), el("small", { text: affordable ? `🪙 ${cost}` : `🪙 ${cost} · ${cost - state.coins} 부족` }));
  };
  const coinRow = el("div", { class: "gachaCoinRow" }, coinButton(1, GACHA_SINGLE_COST, "1회 뽑기"), coinButton(10, GACHA_TEN_COST, "10연속 · 희귀↑ 확정"));
  const odds = RARITY_ORDER.map(key => `${RARITIES[key].label} ${(RARITIES[key].chance * 100).toFixed(1).replace(".0", "")}%`).join(" · ");
  zoom.replaceChildren(el("div", { class: "zoomCard chunky gachaCard", onclick: event => event.stopPropagation() },
    el("h3", { text: "⌨️ 키보드 뽑기" }),
    el("div", { class: "gachaStage" + (ready ? " ready" : "") },
      el("div", { class: "gachaCapsuleIdle", text: "⌨️" }),
      el("small", { text: ready ? "오늘의 키보드가 기다리고 있어요" : `오늘은 뽑았어요 · ${timeUntilMidnight()} 뒤 다시` })),
    pullButton, coinRow,
    el("small", { class: "gachaWallet", text: `보유 🪙 ${state.coins} · 업무를 끝내면 코인이 쌓여요` }),
    el("div", { class: "rarityCounts" }, ownedByRarity),
    el("button", { class: "btn soft gachaToCollection", type: "button", text: `📖 도감 보기 ${ownedSkinCount()}/${KEYBOARD_SKINS.length}`, onclick: () => openCollection() }),
    el("small", { class: "gachaOdds", text: `확률: ${odds} · 희귀 이상이 ${GACHA_PITY_PULLS}번 연속 안 나오면 다음은 희귀 이상 확정(지금 ${state.gacha.pity}번째) · 중복은 코인으로` })));
  zoom.classList.add("show");
}

/* ---------- 뽑기 연출 ---------- */
// 단계: ① 충전(캡슐이 흔들리고 빛이 빨려 들어감, 빛 색이 일반→실제 등급까지 한 단계씩 올라감)
//      ② 폭발(화면 섬광·충격파·색종이, 전설은 화면이 흔들림) ③ 공개(회전 광선 + 키보드 등장, 별이 하나씩) ④ 이름·NEW/코인.
// 화면을 누르면 바로 결과로 건너뛴다. 동작 줄이기 설정이면 처음부터 결과만.
const GACHA_FX = { chargeMs: 1500, burstMs: 1500, revealMs: 1800, starStartMs: 2150, starGapMs: 220 };

function spawnGachaConfetti(overlay, rarityKey, count) {
  const palette = rarityKey === "legend" ? ["#ffd54a", "#ff5ac8", "#4de8ff", "#3dffa8", "#ffffff"] : [RARITIES[rarityKey].color, "#ffffff"];
  for (let index = 0; index < count; index += 1) {
    const piece = el("span", { class: "gfxConfetti" });
    const angle = Math.random() * Math.PI * 2;
    const distance = 120 + Math.random() * 260;
    piece.style.setProperty("--dx", `${Math.round(Math.cos(angle) * distance)}px`);
    piece.style.setProperty("--dy", `${Math.round(Math.sin(angle) * distance + 80)}px`);
    piece.style.setProperty("--rot", `${Math.round(Math.random() * 720 - 360)}deg`);
    piece.style.setProperty("--c", pickRandom(palette));
    piece.style.animationDelay = `${Math.random() * 0.12}s`;
    overlay.append(piece);
    setTimeout(() => piece.remove(), 2000);
  }
}

function playGachaSequence(result) {
  const { skin, duplicate, refund } = result;
  const rarity = RARITIES[skin.rarity];
  const rarityIndex = RARITY_ORDER.indexOf(skin.rarity);
  const stars = Array.from({ length: rarityStarCount(skin.rarity) }, () => el("span", { text: "★" }));
  const closeOverlay = () => { timers.forEach(clearTimeout); overlay.remove(); duckBgm(false); renderGachaPill(); renderHeaderStats(); };
  const resultCard = el("div", { class: "gfxResult" },
    el("div", { class: "gfxStars" }, stars),
    hasKeyboardArt(skin)
      ? el("div", { class: "gfxKb hasArt" }, artImage(`kb-${skin.id}`, { class: "gfxArt", alt: skin.name }, () => createKeyboardNode(skin)))
      : el("div", { class: "gfxKb" }, createKeyboardNode(skin)),
    el("div", { class: "gfxRarity", text: `${skin.rarity.toUpperCase()} · ${rarity.label}` }),
    el("b", { class: "gfxName", text: skin.name }),
    el("small", { class: "gfxDesc", text: skin.desc }),
    el("div", { class: "gfxBadge" + (duplicate ? " dup" : ""), text: duplicate ? `이미 가진 스킨 → 🪙 +${refund}` : "✨ NEW!" }),
    el("div", { class: "gfxActions" },
      el("button", { class: "btn pink", type: "button", text: "📖 도감에서 장착", onclick: event => { event.stopPropagation(); closeOverlay(); openCollection(skin.id); } }),
      el("button", { class: "btn soft", type: "button", text: "닫기", onclick: event => { event.stopPropagation(); closeOverlay(); } })));
  const overlay = el("div", { id: "gachaFx", class: `gachaFx rar-${skin.rarity}` },
    el("div", { class: "gfxRays" }), el("div", { class: "gfxLines" }), el("div", { class: "gfxRing" }), el("div", { class: "gfxRing late" }),
    el("div", { class: "gfxCapsule", text: "⌨️" }), resultCard, el("div", { class: "gfxFlash" }),
    el("small", { class: "gfxSkip", text: "화면을 누르면 건너뛰기" }));
  overlay.style.setProperty("--rarity", rarity.color);
  overlay.style.setProperty("--tease", "#ffffff");
  const timers = [];
  const at = (milliseconds, action) => timers.push(setTimeout(action, milliseconds));
  let finished = false;
  const lightStar = index => { stars[index].classList.add("on"); playSound(`gachaStar${index}`); };
  const finish = () => {
    if (finished) return;
    finished = true;
    overlay.classList.add("named");
    playSound(duplicate ? "coin" : "gachaNew");
    duckBgm(false);
  };
  const skipToEnd = () => {
    timers.forEach(clearTimeout);
    overlay.style.setProperty("--tease", rarity.color);
    if (!overlay.classList.contains("reveal")) playSound(`gachaFanfare_${skin.rarity}`);
    overlay.classList.add("burst", "reveal", "skipped");
    stars.forEach(star => star.classList.add("on"));
    finish();
  };
  overlay.addEventListener("click", event => {
    if (event.target.closest(".gfxActions")) return;
    if (finished) closeOverlay(); else skipToEnd();
  });
  document.body.append(overlay);
  duckBgm(true);
  if (reducedMotion.matches) { skipToEnd(); return; }

  overlay.classList.add("charge");
  playSound("gachaCharge");
  // 등급 예고: 흰빛에서 시작해 실제 등급 색까지 한 단계씩 올라간다(전설이면 5번 변함).
  RARITY_ORDER.slice(0, rarityIndex + 1).forEach((key, index) => at(150 + index * (1150 / (rarityIndex + 1)), () => {
    overlay.style.setProperty("--tease", RARITIES[key].color);
    playSound(`gachaTease${index}`);
  }));
  at(800, () => overlay.classList.add("intense"));
  at(GACHA_FX.burstMs, () => {
    overlay.classList.add("burst");
    playSound("gachaBurst");
    spawnGachaConfetti(overlay, skin.rarity, 16 + rarityIndex * 14);
  });
  at(GACHA_FX.revealMs, () => {
    overlay.classList.add("reveal");
    playSound(`gachaFanfare_${skin.rarity}`);
  });
  stars.forEach((star, index) => at(GACHA_FX.starStartMs + index * GACHA_FX.starGapMs, () => lightStar(index)));
  at(GACHA_FX.starStartMs + stars.length * GACHA_FX.starGapMs + 150, finish);
  if (skin.rarity === "legend") at(GACHA_FX.revealMs + 600, () => spawnGachaConfetti(overlay, "legend", 40));
}

// 코인 뽑기 시작: 결제 → (1회면 단일 연출, 10회면 카드 10장 연출)
function startCoinPull(count) {
  const results = pullWithCoins(count);
  if (!results) { playSound("error"); showToast("코인이 부족해요"); return; }
  document.getElementById("zoom").classList.remove("show");
  playSound("coinSpend");
  renderGachaPill();
  renderHeaderStats();
  if (count === 1) playGachaSequence(results[0]); else playGachaMultiSequence(results);
}

// 10연속 연출: 충전·폭발(최고 등급 기준 예고) → 카드 10장 등장 → 한 장씩 뒤집기 → 합계·최고 등급 팡파르.
// 희귀 이상 카드는 뒤집기 전부터 뒷면 테두리가 등급 색으로 빛난다(두근두근).
const GACHA_MULTI_FX = { burstMs: 1500, revealMs: 1800, flipStartMs: 2150, flipGapMs: 260 };

function playGachaMultiSequence(results) {
  const bestRarity = results.reduce((best, item) => (RARITY_ORDER.indexOf(item.skin.rarity) > RARITY_ORDER.indexOf(best) ? item.skin.rarity : best), "common");
  const bestIndex = RARITY_ORDER.indexOf(bestRarity);
  const newCount = results.filter(item => !item.duplicate).length;
  const refundTotal = results.reduce((sum, item) => sum + item.refund, 0);
  const cards = results.map((item, index) => {
    const card = el("div", { class: `gfxCard rar-${item.skin.rarity}` + (isRareOrBetter(item.skin.rarity) ? " hint" : "") },
      el("div", { class: "gfxCardInner" },
        el("div", { class: "gfxCardBack", text: "⌨️" }),
        el("div", { class: "gfxCardFront" },
          el("div", { class: "gfxCardStars", text: "★".repeat(rarityStarCount(item.skin.rarity)) }),
          el("div", { class: "gfxCardKb" }, createKeyboardNode(item.skin)),
          el("small", { text: item.skin.name }),
          el("i", { class: "gfxCardTag" + (item.duplicate ? " dup" : ""), text: item.duplicate ? `🪙+${item.refund}` : "NEW" }))));
    card.style.setProperty("--rarity", RARITIES[item.skin.rarity].color);
    card.style.setProperty("--i", String(index));
    return card;
  });
  const timers = [];
  const at = (milliseconds, action) => timers.push(setTimeout(action, milliseconds));
  let finished = false;
  const closeOverlay = () => { timers.forEach(clearTimeout); overlay.remove(); duckBgm(false); renderGachaPill(); renderHeaderStats(); };
  const again = el("button", { class: "btn pink", type: "button", text: `🎰 한 번 더 (🪙 ${GACHA_TEN_COST})`, disabled: state.coins < GACHA_TEN_COST,
    onclick: event => { event.stopPropagation(); closeOverlay(); startCoinPull(10); } });
  const resultCard = el("div", { class: "gfxResult multi" },
    el("div", { class: "gfxRarity", text: `10연속 · 최고 ${RARITIES[bestRarity].label}` }),
    el("div", { class: "gfxCards" }, cards),
    el("div", { class: "gfxBadge" + (newCount ? "" : " dup"), text: `✨ NEW ${newCount}개` + (refundTotal ? ` · 중복 ${results.length - newCount}개 → 🪙 +${refundTotal}` : "") }),
    el("div", { class: "gfxActions" },
      el("button", { class: "btn soft", type: "button", text: "📖 도감", onclick: event => { event.stopPropagation(); closeOverlay(); openCollection(); } }),
      again,
      el("button", { class: "btn soft", type: "button", text: "닫기", onclick: event => { event.stopPropagation(); closeOverlay(); } })));
  const overlay = el("div", { id: "gachaFx", class: `gachaFx multi rar-${bestRarity}` },
    el("div", { class: "gfxRays" }), el("div", { class: "gfxLines" }), el("div", { class: "gfxRing" }), el("div", { class: "gfxRing late" }),
    el("div", { class: "gfxCapsule", text: "⌨️" }), resultCard, el("div", { class: "gfxFlash" }),
    el("small", { class: "gfxSkip", text: "화면을 누르면 한 번에 뒤집기" }));
  overlay.style.setProperty("--rarity", RARITIES[bestRarity].color);
  overlay.style.setProperty("--tease", "#ffffff");
  const flipCard = index => {
    const card = cards[index];
    if (card.classList.contains("flipped")) return;
    card.classList.add("flipped");
    playSound("gachaFlip");
    playSound(`gachaStar${RARITY_ORDER.indexOf(results[index].skin.rarity)}`);
    if (["epic", "legend"].includes(results[index].skin.rarity)) playSound("gachaNew");
  };
  const finish = () => {
    if (finished) return;
    finished = true;
    overlay.classList.add("named");
    playSound(`gachaFanfare_${bestRarity}`);
    if (bestRarity === "legend") spawnGachaConfetti(overlay, "legend", 40);
    duckBgm(false);
  };
  const skipToEnd = () => {
    timers.forEach(clearTimeout);
    overlay.style.setProperty("--tease", RARITIES[bestRarity].color);
    overlay.classList.add("burst", "reveal", "skipped");
    cards.forEach(card => card.classList.add("flipped"));
    playSound("gachaFlip");
    finish();
  };
  overlay.addEventListener("click", event => {
    if (event.target.closest(".gfxActions")) return;
    if (finished) closeOverlay(); else skipToEnd();
  });
  document.body.append(overlay);
  duckBgm(true);
  if (reducedMotion.matches) { skipToEnd(); return; }

  overlay.classList.add("charge");
  playSound("gachaCharge");
  RARITY_ORDER.slice(0, bestIndex + 1).forEach((key, index) => at(150 + index * (1150 / (bestIndex + 1)), () => {
    overlay.style.setProperty("--tease", RARITIES[key].color);
    playSound(`gachaTease${index}`);
  }));
  at(800, () => overlay.classList.add("intense"));
  at(GACHA_MULTI_FX.burstMs, () => {
    overlay.classList.add("burst");
    playSound("gachaBurst");
    spawnGachaConfetti(overlay, bestRarity, 24 + bestIndex * 14);
  });
  at(GACHA_MULTI_FX.revealMs, () => { overlay.classList.add("reveal"); playSound("gachaFlip"); });
  cards.forEach((card, index) => at(GACHA_MULTI_FX.flipStartMs + index * GACHA_MULTI_FX.flipGapMs, () => flipCard(index)));
  at(GACHA_MULTI_FX.flipStartMs + cards.length * GACHA_MULTI_FX.flipGapMs + 250, finish);
}

/* ---------- 도감 (따로) ---------- */
// 등급 필터, 선택한 스킨 상세 + 팀원 책상에 장착/해제, 51칸 그리드.
function openCollection(selectedSkinId = null, rarityFilter = "all") {
  const zoom = document.getElementById("zoom");
  const gacha = state.gacha;
  const filterChips = el("div", { class: "collectionFilters" }, ["all", ...RARITY_ORDER.slice().reverse()].map(key => {
    const skins = key === "all" ? KEYBOARD_SKINS : KEYBOARD_SKINS.filter(skin => skin.rarity === key);
    const owned = skins.filter(skin => gacha.owned[skin.id]).length;
    const chip = el("button", { type: "button", class: "kindChip" + (key === rarityFilter ? " on" : ""), text: `${key === "all" ? "전체" : RARITIES[key].label} ${owned}/${skins.length}`,
      onclick: () => openCollection(selectedSkinId, key) });
    if (key !== "all") chip.style.color = RARITIES[key].color;
    return chip;
  }));
  const visibleSkins = [...KEYBOARD_SKINS].filter(skin => rarityFilter === "all" || skin.rarity === rarityFilter)
    .sort((first, second) => RARITY_ORDER.indexOf(second.rarity) - RARITY_ORDER.indexOf(first.rarity));
  const grid = el("div", { class: "skinGrid" }, visibleSkins.map(skin => {
    const owned = Boolean(gacha.owned[skin.id]);
    const cell = el("button", { type: "button", class: `skinCell rar-${skin.rarity}` + (owned ? "" : " locked") + (skin.id === selectedSkinId ? " selected" : ""), title: owned ? skin.name : "???",
      onclick: () => { if (owned) { playSound("ui"); openCollection(skin.id, rarityFilter); } else showToast(`🔒 ${RARITIES[skin.rarity].label} 등급 · 아직 못 뽑았어요`); } },
      owned ? skinPreview(skin) : el("div", { class: "kbPreview", text: "?" }),
      el("small", { text: owned ? skin.name : "???" }),
      owned && gacha.owned[skin.id] > 1 ? el("i", { class: "skinCount", text: `×${gacha.owned[skin.id]}` }) : null);
    cell.style.setProperty("--rarity", RARITIES[skin.rarity].color);
    return cell;
  }));
  const selected = findSkin(selectedSkinId);
  let detail = null;
  if (selected && gacha.owned[selected.id]) {
    detail = el("div", { class: "skinDetail" },
      hasKeyboardArt(selected) ? artImage(`kb-${selected.id}`, { class: "skinDetailArt", alt: selected.name }, () => null) : null,
      el("div", { class: "skinDetailPreview" }, createKeyboardNode(selected)),
      el("b", { text: `${"★".repeat(rarityStarCount(selected.rarity))} ${selected.name} · ${RARITIES[selected.rarity].label}` }),
      el("small", { text: selected.desc }),
      el("small", { class: "equipCount", text: `장착 ${equippedCount(selected.id)} / 보유 ${gacha.owned[selected.id]}` }),
      el("div", { class: "equipRow" }, state.agents.map(agent => {
        const isOn = gacha.equipped[agent.id] === selected.id;
        const isFull = !isOn && equippedCount(selected.id) >= gacha.owned[selected.id];
        return el("button", { type: "button", class: "kindChip" + (isOn ? " on" : "") + (isFull ? " full" : ""), text: `${getPreset(agent.id).name}${isOn ? " ✓" : ""}`,
          onclick: () => { equipSkin(agent.id, isOn ? null : selected.id); openCollection(selected.id, rarityFilter); } });
      })),
      el("small", { class: "gachaNote", text: "뽑은 개수만큼 팀원에게 줄 수 있어요. 이름을 누르면 장착, 다시 누르면 해제." }));
    detail.style.setProperty("--rarity", RARITIES[selected.rarity].color);
  }
  zoom.replaceChildren(el("div", { class: "zoomCard chunky gachaCard collectionCard", onclick: event => event.stopPropagation() },
    el("div", { class: "collectionHead" },
      el("h3", { text: `📖 키보드 도감 ${ownedSkinCount()}/${KEYBOARD_SKINS.length}` }),
      el("button", { class: "btn soft", type: "button", text: canPullToday() ? "🎰 뽑으러 가기" : "🎰 뽑기", onclick: () => openGacha() })),
    filterChips, detail, grid));
  zoom.classList.add("show");
}
