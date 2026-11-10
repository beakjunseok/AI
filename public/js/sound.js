/* ================= 효과음 (Web Audio 합성 · 음원 파일 없음) ================= */
// 모든 소리를 오실레이터·잡음으로 즉석 합성한다. 파일 다운로드·저작권 걱정이 없고 용량도 0.
// 브라우저 자동재생 정책 때문에 첫 터치/키 입력 때 오디오를 깨우고, 그 전의 자동 이벤트 소리는 조용히 건너뛴다.
// 같은 소리가 연달아 터지지 않게 종류별 최소 간격을 둔다. 소리 1회당 O(음 개수)

const SOUND_MASTER_VOLUME = 0.3;
const SOUND_MIN_GAP_MS = { typing: 70, step: 180, keyClick: 45, ui: 40, default: 80 };
const SOUND_UNLOCK_GRACE_MS = 400;

let audioContext = null;
let masterGain = null;
let noiseBuffer = null;
const soundLastPlayedAt = {};

function ensureAudioContext() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    masterGain.gain.value = SOUND_MASTER_VOLUME;
    // 여러 소리가 겹쳐도 갑자기 커지지 않도록 컴프레서를 거친다.
    const compressor = audioContext.createDynamicsCompressor();
    masterGain.connect(compressor).connect(audioContext.destination);
  } catch (error) {
    audioContext = null;
  }
  return audioContext;
}

// 사용자 입력 안에서 호출돼야 재생이 허용된다(iOS Safari 포함).
function unlockAudio() {
  if (!state.sound && !state.bgm) return;
  const context = ensureAudioContext();
  if (context && context.state === "suspended") context.resume().catch(() => {});
  if (state.bgm && !bgm.playing) startBgm();
}

// 한 음: 주파수 미끄러짐(glide) + 짧은 어택 + 지수 감쇠.
function playTone(context, { frequency, endFrequency, type = "sine", startOffset = 0, duration = 0.12, volume = 0.4, attack = 0.006 }) {
  const startTime = context.currentTime + startOffset;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain).connect(masterGain);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.03);
}

// 짧은 잡음: 발소리·바스락·쿵·휙. 필터 종류와 대역으로 음색을 고른다.
// 0.5초 백색잡음 버퍼(효과음·BGM 드럼 공용, 한 번만 만든다).
function getNoiseBuffer(context) {
  if (!noiseBuffer) {
    noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.5), context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function playNoise(context, { startOffset = 0, duration = 0.08, volume = 0.25, filterType = "bandpass", frequency = 1200, endFrequency, q = 1 }) {
  getNoiseBuffer(context);
  const startTime = context.currentTime + startOffset;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noiseBuffer;
  filter.type = filterType;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(frequency, startTime);
  if (endFrequency) filter.frequency.exponentialRampToValueAtTime(endFrequency, startTime + duration);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  source.connect(filter).connect(gain).connect(masterGain);
  source.start(startTime);
  source.stop(startTime + duration + 0.03);
}

// 음 목록을 차례로 친다: [주파수, 시작 오프셋(초), 길이(초)]
function playNotes(context, notes, { type = "triangle", volume = 0.3 } = {}) {
  notes.forEach(([frequency, startOffset, duration]) => playTone(context, { frequency, type, startOffset, duration, volume }));
}

const NOTE = { C5: 523.25, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760, B5: 987.77, C7: 2093 };

const SOUND_RECIPES = {
  // 상호작용
  tap: context => playTone(context, { frequency: 880, endFrequency: 1320, duration: 0.08, volume: 0.3 }),
  grab: context => {
    playTone(context, { frequency: 320, endFrequency: 780, type: "triangle", duration: 0.15, volume: 0.35 });
    playTone(context, { frequency: 1500, endFrequency: 2000, startOffset: 0.06, duration: 0.06, volume: 0.12 });
  },
  land: context => {
    playTone(context, { frequency: 200, endFrequency: 70, duration: 0.18, volume: 0.5 });
    playNoise(context, { duration: 0.06, volume: 0.16, filterType: "lowpass", frequency: 500 });
  },
  throw: context => {
    playNoise(context, { duration: 0.3, volume: 0.25, frequency: 600, endFrequency: 3400, q: 2 });
    [660, 520, 640, 500, 610].forEach((frequency, index) => playTone(context, { frequency, type: "triangle", startOffset: 0.2 + index * 0.09, duration: 0.1, volume: 0.16 }));
  },
  pet: context => {
    playTone(context, { frequency: 1040, endFrequency: 1250, duration: 0.07, volume: 0.22 });
    playTone(context, { frequency: 1250, endFrequency: 1580, startOffset: 0.08, duration: 0.09, volume: 0.22 });
  },
  grumble: context => {
    playTone(context, { frequency: 170, endFrequency: 140, type: "square", duration: 0.1, volume: 0.12 });
    playTone(context, { frequency: 150, endFrequency: 120, type: "square", startOffset: 0.13, duration: 0.14, volume: 0.12 });
  },
  crunch: context => {
    [0, 0.09, 0.2].forEach(startOffset => playNoise(context, { startOffset, duration: 0.05, volume: 0.22, filterType: "highpass", frequency: 2200 }));
    playTone(context, { frequency: NOTE.E6, endFrequency: NOTE.A6, startOffset: 0.3, duration: 0.12, volume: 0.2 });
  },
  // 보상
  coin: context => {
    playTone(context, { frequency: NOTE.B5, type: "square", duration: 0.07, volume: 0.12 });
    playTone(context, { frequency: NOTE.E6, type: "square", startOffset: 0.07, duration: 0.28, volume: 0.12 });
  },
  achievement: context => playNotes(context, [[NOTE.C6, 0, 0.12], [NOTE.E6, 0.08, 0.12], [NOTE.G6, 0.16, 0.12], [NOTE.C7, 0.24, 0.35]], { volume: 0.22 }),
  // 채팅
  send: context => {
    playTone(context, { frequency: 520, endFrequency: 1150, duration: 0.11, volume: 0.25 });
    playNoise(context, { duration: 0.09, volume: 0.07, filterType: "highpass", frequency: 3000 });
  },
  receive: context => {
    playTone(context, { frequency: NOTE.E6, duration: 0.2, volume: 0.2 });
    playTone(context, { frequency: NOTE.A6, startOffset: 0.08, duration: 0.28, volume: 0.18 });
  },
  typing: context => playNoise(context, { duration: 0.02, volume: 0.05 + Math.random() * 0.03, filterType: "highpass", frequency: 3500 + Math.random() * 1500 }),
  error: context => {
    playTone(context, { frequency: 230, type: "square", duration: 0.1, volume: 0.1 });
    playTone(context, { frequency: 175, type: "square", startOffset: 0.12, duration: 0.16, volume: 0.1 });
  },
  // 패널
  panelOpen: context => playNoise(context, { duration: 0.14, volume: 0.1, frequency: 1400, endFrequency: 4200, q: 1.5 }),
  panelClose: context => playNoise(context, { duration: 0.12, volume: 0.08, frequency: 4000, endFrequency: 1200, q: 1.5 }),
  // 기획 흐름
  brainstorm: context => [NOTE.C6, NOTE.D6, NOTE.E6, NOTE.G6, NOTE.A6, NOTE.C7].forEach((frequency, index) => playTone(context, { frequency, startOffset: index * 0.05, duration: 0.12, volume: 0.14 })),
  discussion: context => playNotes(context, [[NOTE.A5, 0, 0.25], [NOTE.E5, 0.18, 0.4]], { type: "sine", volume: 0.25 }),
  brief: context => playNotes(context, [[NOTE.G5, 0, 0.12], [NOTE.C6, 0.1, 0.12], [NOTE.E6, 0.2, 0.12], [NOTE.G6, 0.3, 0.5]], { volume: 0.22 }),
  granted: context => playNotes(context, [[NOTE.C6, 0, 0.1], [NOTE.G6, 0.09, 0.1], [NOTE.C7, 0.18, 0.3]], { type: "sine", volume: 0.22 }),
  // 사무실 분위기
  step: context => playNoise(context, { duration: 0.04, volume: 0.07, filterType: "lowpass", frequency: 380 + Math.random() * 120 }),
  meow: context => {
    const startTime = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(680, startTime);
    oscillator.frequency.linearRampToValueAtTime(1000, startTime + 0.12);
    oscillator.frequency.linearRampToValueAtTime(560, startTime + 0.42);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.16, startTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.45);
    oscillator.connect(gain).connect(masterGain);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.5);
  },
  // 추가 효과음
  ui: context => playTone(context, { frequency: 1800, endFrequency: 1500, duration: 0.025, volume: 0.06 }),
  toggleOn: context => { playTone(context, { frequency: 660, duration: 0.06, volume: 0.16 }); playTone(context, { frequency: 990, startOffset: 0.06, duration: 0.08, volume: 0.16 }); },
  toggleOff: context => { playTone(context, { frequency: 990, duration: 0.06, volume: 0.14 }); playTone(context, { frequency: 620, startOffset: 0.06, duration: 0.09, volume: 0.14 }); },
  keyClick: context => playNoise(context, { duration: 0.012 + Math.random() * 0.01, volume: 0.03 + Math.random() * 0.02, filterType: "bandpass", frequency: 2500 + Math.random() * 2500, q: 3 }),
  brew: context => {
    [0, 0.18, 0.4, 0.62].forEach(startOffset => playNoise(context, { startOffset, duration: 0.16, volume: 0.07, filterType: "lowpass", frequency: 700 + Math.random() * 300, endFrequency: 300 }));
    playTone(context, { frequency: NOTE.G6, startOffset: 0.9, duration: 0.25, volume: 0.1 });
  },
  vend: context => {
    playTone(context, { frequency: 140, endFrequency: 80, type: "square", duration: 0.08, volume: 0.08 });
    playNoise(context, { startOffset: 0.08, duration: 0.07, volume: 0.15, filterType: "lowpass", frequency: 900 });
  },
  purr: context => {
    for (let index = 0; index < 8; index += 1) playNoise(context, { startOffset: index * 0.11, duration: 0.09, volume: 0.06, filterType: "lowpass", frequency: 220, q: 4 });
  },
  snore: context => {
    playNoise(context, { duration: 0.7, volume: 0.06, filterType: "bandpass", frequency: 300, endFrequency: 600, q: 2 });
    playNoise(context, { startOffset: 0.9, duration: 0.5, volume: 0.04, filterType: "bandpass", frequency: 900, endFrequency: 400, q: 2 });
  },
  alarm: context => [0, 0.16, 0.32].forEach(startOffset => playTone(context, { frequency: 1760, type: "square", startOffset, duration: 0.09, volume: 0.07 })),
  commute: context => playNotes(context, [[NOTE.E6, 0, 0.2], [NOTE.C6, 0.18, 0.35]], { type: "sine", volume: 0.18 }),
  sit: context => { playNoise(context, { duration: 0.14, volume: 0.12, filterType: "lowpass", frequency: 400 }); playTone(context, { frequency: 220, endFrequency: 160, duration: 0.12, volume: 0.1 }); },
  switchProject: context => { playNoise(context, { duration: 0.16, volume: 0.08, frequency: 900, endFrequency: 3000, q: 2 }); playTone(context, { frequency: 520, endFrequency: 880, startOffset: 0.05, duration: 0.1, volume: 0.12 }); },
  taskAdd: context => playTone(context, { frequency: 700, endFrequency: 1050, type: "triangle", duration: 0.08, volume: 0.18 }),
  round: context => { playNoise(context, { duration: 0.12, volume: 0.07, filterType: "highpass", frequency: 2500 }); playTone(context, { frequency: NOTE.D6, startOffset: 0.08, duration: 0.18, volume: 0.12 }); },
  glitch: context => [0, 0.03, 0.07].forEach(startOffset => playTone(context, { frequency: 200 + Math.random() * 2400, type: "square", startOffset, duration: 0.02, volume: 0.025 })),
  yawn: context => playTone(context, { frequency: 520, endFrequency: 280, duration: 0.6, volume: 0.12, attack: 0.08 }),
  wake: context => playTone(context, { frequency: 300, endFrequency: 760, duration: 0.22, volume: 0.16 })
};

// 팀원별 말소리: 말풍선이 뜰 때 캐릭터 목소리 높이로 '삐빗' 하고 웅얼거린다(동물의 숲 느낌). 글자 수에 비례해 2~5음.
const VOICE_PROFILES = {
  lumi: { base: 620, type: "square", spread: 0.25 },
  moka: { base: 700, type: "triangle", spread: 0.15 },
  bit: { base: 300, type: "sawtooth", spread: 0.1 },
  dubu: { base: 400, type: "square", spread: 0.05 },
  sol: { base: 820, type: "sine", spread: 0.2 }
};
const VOICE_MIN_GAP_MS = 500;
const voiceLastAt = {};

function playVoice(agentId, text) {
  const profile = VOICE_PROFILES[agentId];
  if (!profile || !state.sound || document.hidden || !audioContext || audioContext.state !== "running") return;
  const now = performance.now();
  if (now - (voiceLastAt[agentId] || 0) < VOICE_MIN_GAP_MS) return;
  voiceLastAt[agentId] = now;
  const syllables = clamp(Math.ceil(String(text || "").length / 7), 2, 5);
  try {
    for (let index = 0; index < syllables; index += 1) {
      const frequency = profile.base * (1 + (Math.random() * 2 - 1) * profile.spread);
      playTone(audioContext, { frequency, endFrequency: frequency * (0.9 + Math.random() * 0.2), type: profile.type, startOffset: index * 0.075, duration: 0.05, volume: profile.type === "sine" ? 0.07 : 0.035 });
    }
  } catch (error) { /* 무시 */ }
}

// 이름으로 효과음을 낸다. 소리 OFF·탭이 숨겨짐·잠금 해제 전이면 아무것도 하지 않는다. 실패해도 앱 동작엔 영향 없음.
function playSound(name) {
  const recipe = SOUND_RECIPES[name];
  if (!recipe || !state.sound || document.hidden || !audioContext) return;
  const now = performance.now();
  const minimumGap = SOUND_MIN_GAP_MS[name] ?? SOUND_MIN_GAP_MS.default;
  if (now - (soundLastPlayedAt[name] || 0) < minimumGap) return;
  soundLastPlayedAt[name] = now;
  const run = () => { try { recipe(audioContext); } catch (error) { /* 합성 실패는 무시 */ } };
  if (audioContext.state === "running") { run(); return; }
  // 방금 깨운 경우(resume 진행 중)만 잠깐 기다렸다 재생하고, 오래된 소리는 버린다.
  audioContext.resume().then(() => { if (performance.now() - now < SOUND_UNLOCK_GRACE_MS) run(); }).catch(() => {});
}

function renderSoundPill() {
  document.getElementById("soundPill").textContent = state.sound ? "🔊 소리 ON" : "🔇 소리 OFF";
}

function toggleSound() {
  state.sound = !state.sound;
  saveState();
  renderSoundPill();
  if (state.sound) { unlockAudio(); playSound("toggleOn"); }
  showToast(state.sound ? "효과음을 켰어요" : "효과음을 껐어요");
}

// 첫 입력에서 오디오를 깨운다. capture 단계라 같은 입력으로 나는 첫 소리도 들린다.
function bindAudioUnlock() {
  const handler = () => unlockAudio();
  ["pointerdown", "keydown", "touchstart"].forEach(type => document.addEventListener(type, handler, { capture: true, passive: true }));
  // 모든 버튼에 아주 작은 '딸깍' (기능별 효과음과 겹쳐도 거슬리지 않을 만큼 작게)
  document.addEventListener("click", event => { if (event.target.closest("button, .pill, select")) playSound("ui"); }, { capture: true, passive: true });
}
