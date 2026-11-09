/* ================= 픽셀 스프라이트 ================= */
// 표정별 얼굴 픽셀. 좌우 대칭 축은 x=7.5.

// 템플릿+팔레트+표정+액세서리를 18x20 격자에 칠하고 외곽선을 자동으로 두른다. O(W×H), 결과는 캐시.
// 캐릭터를 SVG로 그린다(벡터·부드러운 외곽선). 표정·액세서리는 프리셋별 LOOK 설정으로 조합. 결과는 data URI로 캐시.
const CHARACTER_LOOKS = {
  lumi: { hair: "side", accessories: ["lanyard"], pants: "#2b3445", brows: "up" },
  moka: { hair: "fringe", accessories: ["beanie"], pants: "#2f3a35", brows: "soft" },
  bit: { hair: "messy", accessories: ["hood", "visorGlasses"], pants: "#1f242c", brows: "flat" },
  dubu: { hair: "neat", accessories: ["glasses", "tie"], pants: "#2e333b", brows: "flat" },
  sol: { hair: "shaggy", accessories: ["headphones"], pants: "#3a2a24", brows: "worried" }
};
const SKIN = "#f4d4bd", SKIN_SHADE = "#e3b89c", INK = "#14171c", EYE = "#1d2230";

const shade = (hex, amount) => {
  const value = parseInt(hex.slice(1), 16);
  const channel = shift => Math.max(0, Math.min(255, ((value >> shift) & 255) + amount));
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, "0")}`;
};

function hairShape(style, color) {
  const highlight = shade(color, 38);
  const shapes = {
    side: `<path d="M21 44 C17 18 33 7 52 7 C72 7 85 20 79 44 C76 33 70 27 60 25 C55 31 44 34 30 33 C26 36 23 40 21 44 Z" fill="${color}"/>
           <path d="M58 13 C66 14 73 18 76 25" stroke="${highlight}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    fringe: `<path d="M24 40 C24 30 30 26 38 27 C42 31 48 31 52 28 C57 32 64 31 68 27 C74 28 77 33 76 40 L76 30 L24 30 Z" fill="${color}"/>`,
    messy: `<path d="M20 44 C16 26 22 12 34 9 L37 3 L42 9 L50 2 L54 9 L63 4 L64 11 C77 14 85 27 80 44 C78 35 74 30 68 28 L64 34 L58 27 L50 33 L44 26 L36 33 L32 28 C26 31 22 37 20 44 Z" fill="${color}"/>`,
    neat: `<path d="M21 42 C18 18 34 8 51 8 C70 8 84 19 79 42 C77 32 72 26 64 24 L44 24 C42 27 36 29 28 30 C24 33 22 37 21 42 Z" fill="${color}"/>
           <path d="M44 10 C42 16 42 20 44 24" stroke="${shade(color, -30)}" stroke-width="1.6" fill="none"/>`,
    shaggy: `<path d="M18 54 C12 24 30 6 51 6 C73 6 89 24 82 54 L77 44 C76 34 70 28 62 26 C56 31 46 33 34 31 C28 35 24 40 23 46 Z" fill="${color}"/>
             <path d="M30 14 C38 9 48 8 56 9" stroke="${highlight}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
  };
  return shapes[style] || shapes.side;
}

function eyesAndMouth(expression, browStyle) {
  const leftX = 39, rightX = 61, eyeY = 43;
  const browY = eyeY - 9;
  const browTilt = { up: [-2, 1], soft: [0, 0], flat: [0, 0], worried: [2, -2] }[browStyle] || [0, 0];
  const brows = expression === "surprised" ? `<path d="M34 ${browY - 3} L44 ${browY - 4}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><path d="M56 ${browY - 4} L66 ${browY - 3}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`
    : `<path d="M34 ${browY + browTilt[1]} L44 ${browY + browTilt[0]}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" opacity=".85"/><path d="M56 ${browY + browTilt[0]} L66 ${browY + browTilt[1]}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>`;
  const openEye = x => `<rect x="${x - 3.2}" y="${eyeY - 4.5}" width="6.4" height="9" rx="3.2" fill="${EYE}"/><circle cx="${x + 1}" cy="${eyeY - 2}" r="1.5" fill="#fff"/>`;
  const eyes = {
    normal: openEye(leftX) + openEye(rightX),
    happy: [leftX, rightX].map(x => `<path d="M${x - 4} ${eyeY + 1} Q${x} ${eyeY - 5} ${x + 4} ${eyeY + 1}" stroke="${EYE}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`).join(""),
    blink: [leftX, rightX].map(x => `<path d="M${x - 4} ${eyeY} L${x + 4} ${eyeY}" stroke="${EYE}" stroke-width="2.4" stroke-linecap="round"/>`).join(""),
    sleepy: [leftX, rightX].map(x => `<path d="M${x - 4} ${eyeY} Q${x} ${eyeY + 3} ${x + 4} ${eyeY}" stroke="${EYE}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`).join(""),
    surprised: [leftX, rightX].map(x => `<circle cx="${x}" cy="${eyeY}" r="5" fill="#fff" stroke="${EYE}" stroke-width="1.8"/><circle cx="${x}" cy="${eyeY}" r="2.2" fill="${EYE}"/>`).join(""),
    dizzy: [leftX, rightX].map(x => `<path d="M${x - 3.5} ${eyeY - 3.5} L${x + 3.5} ${eyeY + 3.5} M${x + 3.5} ${eyeY - 3.5} L${x - 3.5} ${eyeY + 3.5}" stroke="${EYE}" stroke-width="2.4" stroke-linecap="round"/>`).join("")
  }[expression] || openEye(leftX) + openEye(rightX);
  const mouth = {
    happy: `<path d="M44 51 Q50 59 56 51 Z" fill="#b8474f"/><path d="M47 54.5 Q50 57 53 54.5" fill="#ff8f8f"/>`,
    surprised: `<ellipse cx="50" cy="54" rx="3" ry="3.6" fill="#7a2c33"/>`,
    sleepy: `<path d="M47 54 L53 54" stroke="#9a4a4f" stroke-width="2" stroke-linecap="round"/>`,
    dizzy: `<path d="M44 54 Q47 51 50 54 Q53 57 56 54" stroke="#9a4a4f" stroke-width="2" fill="none" stroke-linecap="round"/>`
  }[expression] || `<path d="M46 52.5 Q50 56 54 52.5" stroke="#9a4a4f" stroke-width="2.1" fill="none" stroke-linecap="round"/>`;
  const blush = `<ellipse cx="32" cy="51" rx="4.5" ry="2.6" fill="#ff8a8a" opacity=".28"/><ellipse cx="68" cy="51" rx="4.5" ry="2.6" fill="#ff8a8a" opacity=".28"/>`;
  return brows + eyes + mouth + blush;
}

// 포즈별 SVG 내부 애니메이션. 다단계 키프레임(접지→통과→반대 접지)으로 몸 들썩임·고개 흔들림·팔꿈치 꺾임까지 넣어 중간 동작을 촘촘하게 만든다.
const POSE_STYLES = {
  idle: `.upper{animation:breathe 2.6s ease-in-out infinite}@keyframes breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(.7px)}}`,
  walk: `.legL{animation:legL .8s ease-in-out infinite}.legR{animation:legR .8s ease-in-out infinite}
    .armL{animation:armL .8s ease-in-out infinite}.armR{animation:armR .8s ease-in-out infinite}
    .foreL{animation:foreL .8s ease-in-out infinite}.foreR{animation:foreR .8s ease-in-out infinite}
    .upper{animation:bob .8s ease-in-out infinite}.head{animation:nod .8s ease-in-out infinite}.shadow{animation:shadow .4s ease-in-out infinite}
    @keyframes legL{0%,50%,100%{transform:translateY(0)}20%{transform:translateY(-3.5px) scaleY(.94)}35%{transform:translateY(-1.5px)}}
    @keyframes legR{0%,50%,100%{transform:translateY(0)}70%{transform:translateY(-3.5px) scaleY(.94)}85%{transform:translateY(-1.5px)}}
    @keyframes armL{0%,100%{transform:rotate(1deg) scaleY(.98)}25%{transform:rotate(-3deg) translateY(-1.5px) scaleY(.9)}50%{transform:rotate(1deg) scaleY(.98)}75%{transform:rotate(2deg) translateY(.5px) scaleY(.95)}}
    @keyframes armR{0%,100%{transform:rotate(-1deg) scaleY(.98)}25%{transform:rotate(-2deg) translateY(.5px) scaleY(.95)}50%{transform:rotate(-1deg) scaleY(.98)}75%{transform:rotate(3deg) translateY(-1.5px) scaleY(.9)}}
    @keyframes foreL{0%,50%,100%{transform:scaleY(1)}25%{transform:scaleY(.86)}}
    @keyframes foreR{0%,50%,100%{transform:scaleY(1)}75%{transform:scaleY(.86)}}
    @keyframes bob{0%,50%,100%{transform:translateY(.8px) rotate(0)}20%{transform:translateY(-1.6px) rotate(1.2deg)}70%{transform:translateY(-1.6px) rotate(-1.2deg)}}
    @keyframes nod{0%,50%,100%{transform:rotate(0)}28%{transform:rotate(-1.5deg)}78%{transform:rotate(1.5deg)}}
    @keyframes shadow{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.92)}}`,
  type: `.tapL{animation:tap .28s ease-in-out infinite}.tapR{animation:tap .28s ease-in-out infinite -.14s}
    .upper{animation:lean 3.2s ease-in-out infinite}.head{animation:glance 3.2s ease-in-out infinite}
    @keyframes tap{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.4px)}}
    @keyframes lean{0%,100%{transform:translateY(1px) rotate(0)}50%{transform:translateY(1.6px) rotate(.8deg)}}
    @keyframes glance{0%,55%,100%{transform:rotate(0) translateY(0)}62%,85%{transform:rotate(5deg) translateY(.5px)}70%{transform:rotate(5deg) translateY(1.2px)}}`,
  flail: `.armL{animation:flailL .62s ease-in-out infinite}.armR{animation:flailR .62s ease-in-out infinite -.21s}
    .foreL{animation:elbowL .31s ease-in-out infinite}.foreR{animation:elbowR .31s ease-in-out infinite -.1s}
    .legL{animation:kickL .44s ease-in-out infinite}.legR{animation:kickR .44s ease-in-out infinite}
    .upper{animation:squirm .5s ease-in-out infinite}.head{animation:shake .5s ease-in-out infinite -.12s}
    @keyframes flailL{0%,100%{transform:rotate(55deg)}20%{transform:rotate(98deg)}40%{transform:rotate(68deg)}60%{transform:rotate(104deg)}80%{transform:rotate(62deg)}}
    @keyframes flailR{0%,100%{transform:rotate(-55deg)}20%{transform:rotate(-98deg)}40%{transform:rotate(-68deg)}60%{transform:rotate(-104deg)}80%{transform:rotate(-62deg)}}
    @keyframes elbowL{0%,100%{transform:rotate(-30deg)}50%{transform:rotate(5deg)}}
    @keyframes elbowR{0%,100%{transform:rotate(30deg)}50%{transform:rotate(-5deg)}}
    @keyframes kickL{0%,100%{transform:rotate(-12deg)}35%{transform:rotate(10deg) translateY(-3px)}65%{transform:rotate(4deg)}}
    @keyframes kickR{0%,100%{transform:rotate(12deg)}35%{transform:rotate(-4deg)}65%{transform:rotate(-10deg) translateY(-3px)}}
    @keyframes squirm{0%,100%{transform:translateY(-1px) rotate(-3.5deg)}50%{transform:translateY(-2.5px) rotate(3.5deg)}}
    @keyframes shake{0%,100%{transform:rotate(3deg)}50%{transform:rotate(-3deg)}}`
};
const POSE_PIVOTS = ".armL,.armR,.legL,.legR,.foreL,.foreR,.upper,.head,.shadow{transform-box:view-box}"
  + ".armL{transform-origin:31px 65px}.armR{transform-origin:69px 65px}.foreL{transform-origin:26px 76px}.foreR{transform-origin:74px 76px}"
  + ".legL{transform-origin:42px 86px}.legR{transform-origin:58px 86px}.upper{transform-origin:50px 92px}.head{transform-origin:50px 60px}.shadow{transform-origin:50px 107px}";

// 왼쪽 기준으로 그린 경로를 좌우 반전(x → 100 - x)해 오른쪽 팔을 만든다.
function mirrorPath(pathData) {
  let isX = true;
  return pathData.replace(/-?\d+(\.\d+)?/g, number => {
    const value = isX ? +(100 - Number(number)).toFixed(2) : number;
    isX = !isX;
    return String(value);
  });
}

function buildCharacterSvg(preset, expression, pose = "idle") {
  const look = CHARACTER_LOOKS[preset.id] || CHARACTER_LOOKS.lumi;
  const shirt = preset.palette.shirt, hair = preset.palette.hair;
  const has = name => look.accessories.includes(name);
  const outline = `stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"`;
  const parts = [];
  parts.push(`<ellipse class="shadow" cx="50" cy="107" rx="25" ry="3.6" fill="#000" opacity=".35"/>`);
  const leg = side => `<g class="leg${side}"><rect x="${side === "L" ? 36 : 52}" y="84" width="12" height="19.5" rx="5" fill="${look.pants}" ${outline}/><ellipse cx="${side === "L" ? 41.5 : 58.5}" cy="104.5" rx="7.5" ry="3.4" fill="#e9edf2" ${outline}/></g>`;
  parts.push(leg("L") + leg("R"));
  parts.push(`<path d="M31.5 82 L68.5 82 L67.5 94 Q50 96.5 32.5 94 Z" fill="${look.pants}" ${outline}/>`);
  const sleeve = shade(shirt, -6);
  const UPPER_ARM = "M33 62 Q25 64 23.5 71 L22.4 78 L29.6 78 L31 72 Z";
  const FOREARM = "M22.4 74.5 L20.8 85 Q20.5 88.5 24 89 Q27 89.2 27.6 86 L29.6 74.5 Q26 72.5 22.4 74.5 Z";
  const isTyping = pose === "type";
  const arm = side => {
    const mirror = side === "R" ? mirrorPath : (pathData => pathData);
    const handX = side === "R" ? 76 : 24;
    const forearm = isTyping ? "" : `<g class="fore${side}"><path d="${mirror(FOREARM)}" fill="${sleeve}" ${outline}/><circle cx="${handX}" cy="89.3" r="4.2" fill="${SKIN}" ${outline}/></g>`;
    return `<g class="arm${side}"><path d="${mirror(UPPER_ARM)}" fill="${sleeve}" ${outline}/>${forearm}</g>`;
  };
  // 타이핑 포즈: 팔꿈치에서 몸 앞쪽(키보드)으로 뻗은 아래팔을 몸통 위에 그린다.
  const typingForearm = side => {
    const isLeft = side === "L";
    const pivotX = isLeft ? 25.5 : 74.5;
    const rectX = isLeft ? 24 : 59;
    const handX = isLeft ? 41 : 59;
    return `<g class="tap${side}"><rect x="${rectX}" y="74.4" width="17" height="7.4" rx="3.7" fill="${sleeve}" ${outline} transform="rotate(${isLeft ? 28 : -28} ${pivotX} 78)"/><circle cx="${handX}" cy="86.4" r="4.2" fill="${SKIN}" ${outline}/></g>`;
  };
  parts.push(`<g class="upper">`);
  if (has("hood")) parts.push(`<rect x="15" y="9" width="70" height="60" rx="31" fill="${shade(shirt, 14)}" ${outline}/>`);
  parts.push(arm("L") + arm("R"));
  parts.push(`<path d="M44 58 Q35 59 30.5 63.5 Q28 66.5 28.8 72 L30.8 89 Q50 92.5 69.2 89 L71.2 72 Q72 66.5 69.5 63.5 Q65 59 56 58 Z" fill="${shirt}" ${outline}/>`);
  parts.push(`<path d="M30.2 66 Q31.5 70 31 76 M69.8 66 Q68.5 70 69 76" stroke="${shade(shirt, -30)}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".8"/>`);
  parts.push(`<path d="M43.5 59.5 L50 66.5 L56.5 59.5" stroke="${shade(shirt, -28)}" stroke-width="2" fill="none" stroke-linejoin="round"/>`);
  if (has("hood")) parts.push(`<path d="M44 64 L42 80 M56 64 L58 80" stroke="#c9d2db" stroke-width="1.8" stroke-linecap="round"/><circle cx="42" cy="81" r="1.8" fill="#4de8ff"/><circle cx="58" cy="81" r="1.8" fill="#4de8ff"/>`);
  if (has("tie")) parts.push(`<path d="M47 62 L53 62 L55 66 L52 80 L50 83 L48 80 L45 66 Z" fill="#e07a5f" ${outline}/>`);
  if (has("lanyard")) parts.push(`<path d="M41 62 L48 76 M59 62 L52 76" stroke="#4de8ff" stroke-width="2" stroke-linecap="round"/><rect x="44" y="75" width="12" height="10" rx="2" fill="#eef3f7" ${outline}/><rect x="46" y="77.5" width="8" height="2" fill="#4de8ff"/>`);
  if (isTyping) parts.push(typingForearm("L") + typingForearm("R"));
  parts.push(`<rect x="44.5" y="55" width="11" height="9" rx="3" fill="${SKIN_SHADE}"/>`);
  parts.push(`<g class="head">`);
  parts.push(`<circle cx="22" cy="44" r="5.5" fill="${SKIN}" ${outline}/><circle cx="78" cy="44" r="5.5" fill="${SKIN}" ${outline}/>`);
  parts.push(`<rect x="21" y="13" width="58" height="50" rx="24" fill="${SKIN}" ${outline}/>`);
  parts.push(hairShape(look.hair, hair));
  if (has("beanie")) parts.push(`<path d="M20 36 C18 10 82 10 80 36 Z" fill="#59606d" ${outline}/><rect x="18" y="29" width="64" height="9" rx="4.5" fill="#474d59" ${outline}/><path d="M22 33.5 L78 33.5" stroke="#4de8ff" stroke-width="1.6"/>`);
  parts.push(eyesAndMouth(expression, look.brows));
  if (has("glasses") || has("visorGlasses")) {
    const lens = has("visorGlasses") ? "rgba(77,232,255,.22)" : "rgba(255,255,255,.08)";
    const frame = has("visorGlasses") ? "#8fa3b5" : "#6f747c";
    parts.push(`<circle cx="39" cy="43" r="7.5" fill="${lens}" stroke="${frame}" stroke-width="2.2"/><circle cx="61" cy="43" r="7.5" fill="${lens}" stroke="${frame}" stroke-width="2.2"/><path d="M46.5 43 L53.5 43" stroke="${frame}" stroke-width="2"/>`);
  }
  if (has("headphones")) parts.push(`<path d="M17 44 C15 8 85 8 83 44" stroke="#30363d" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="11" y="36" width="11" height="18" rx="5" fill="#30363d" ${outline}/><rect x="78" y="36" width="11" height="18" rx="5" fill="#30363d" ${outline}/><rect x="14.5" y="42" width="4" height="6" rx="2" fill="#4de8ff"/><rect x="81.5" y="42" width="4" height="6" rx="2" fill="#4de8ff"/>`);
  parts.push(`</g></g>`);
  const style = POSE_STYLES[pose] ? `<style>${POSE_PIVOTS}${POSE_STYLES[pose]}</style>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 112" width="100" height="112">${style}${parts.join("")}</svg>`;
}

// 표정·포즈 조합별 data URI를 캐시한다. 포즈(idle/walk/flail)는 SVG 안 CSS 애니메이션으로 움직인다.
function spriteUrl(agentId, expression = "normal", pose = "idle") {
  const activePose = reducedMotion.matches ? "still" : pose;
  const cacheKey = `${agentId}:${expression}:${activePose}`;
  if (spriteCache.has(cacheKey)) return spriteCache.get(cacheKey);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildCharacterSvg(getPreset(agentId), expression, activePose))}`;
  spriteCache.set(cacheKey, url);
  return url;
}

function currentExpression(agentId) {
  const agent = getAgent(agentId);
  const transient = expressions[agentId];
  if (transient && transient.until > Date.now()) return transient.name;
  if (agent.sleeping) return "sleepy";
  return "normal";
}

function setExpression(agentId, name, durationMs) {
  expressions[agentId] = { name, until: Date.now() + durationMs };
  refreshSprites(agentId);
  setTimeout(() => refreshSprites(agentId), durationMs + 30);
}

function refreshSprites(agentId) {
  const expression = currentExpression(agentId);
  document.querySelectorAll(`img[data-sprite="${agentId}"]`).forEach(image => {
    if (image.dataset.expression === expression) return;
    image.dataset.expression = expression;
    image.src = spriteUrl(agentId, expression, image.dataset.pose || "idle");
  });
}

function spriteImage(agentId, className = "", pose = "idle") {
  const expression = currentExpression(agentId);
  return el("img", { class: className, src: spriteUrl(agentId, expression, pose), alt: getPreset(agentId).name, draggable: "false", dataset: { sprite: agentId, expression, pose } });
}

// 이미 그려진 스프라이트의 포즈만 바꾼다(걷기 시작·멈춤 등).
function setSpritePose(image, pose) {
  if (!image || image.dataset.pose === pose) return;
  image.dataset.pose = pose;
  image.src = spriteUrl(image.dataset.sprite, image.dataset.expression || "normal", pose);
}

// 무작위 눈 깜빡임.
function blinkLoop() {
  state.agents.forEach(agent => {
    if (agent.sleeping || Math.random() > 0.12) return;
    const transient = expressions[agent.id];
    if (transient && transient.until > Date.now()) return;
    setExpression(agent.id, "blink", 150);
  });
}

/* ================= 말풍선 ================= */
function say(agentId, text, durationMs = 2800) {
  bubbles[agentId] = { text, until: Date.now() + durationMs };
  applyBubble(agentId);
}

function applyBubble(agentId) {
  const bubble = bubbles[agentId];
  const visible = Boolean(bubble && bubble.until > Date.now());
  document.querySelectorAll(`#app .agent[data-agent="${agentId}"] .bubble`).forEach(node => {
    node.textContent = visible ? bubble.text : "";
    node.classList.toggle("show", visible);
  });
}
