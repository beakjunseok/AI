/* ================= BGM (Web Audio 실시간 생성 · 음원 파일 없음) ================= */
// 로파이 사이버펑크 루프를 코드로 즉석 작곡·연주한다. 저작권 걱정 없음, 다운로드 0바이트.
// 구성: 패드(디튠 톱니파) · 로즈 건반 · 베이스 · 펜타토닉 멜로디(에코) · 킥/스네어/하이햇 · 바이닐 지글거림.
// 스케줄러는 ~150ms 앞을 미리 예약하는 lookahead 방식(타이머 지터에도 박자가 흔들리지 않음). 틱당 O(1)
// 분위기: 밤(21~6시)은 느리고 어둡게, 토론·브레인스토밍 중엔 드럼과 멜로디가 늘어난다. 8마디마다 코드 진행이 바뀐다.

const BGM_VOLUME = 0.45;
const BGM_LOOKAHEAD_SECONDS = 0.15;
const BGM_TICK_MS = 30;
const BGM_FADE_SECONDS = 1.6;
const BGM_SWING = 0.16;
// 섹션별 코드(미디 번호)와 베이스 루트. A: Fmaj7–Em7–Dm7–Cmaj7, B: Am7–Dm9–G7–Cmaj9
const BGM_SECTIONS = [
  { chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]], bass: [41, 40, 38, 36] },
  { chords: [[57, 60, 64, 67], [50, 53, 57, 60, 64], [55, 59, 62, 65], [48, 52, 55, 59, 62]], bass: [45, 38, 43, 36] }
];
const BGM_MELODY_SCALE = [69, 72, 74, 76, 79, 81, 84];

const midiToHz = midi => 440 * 2 ** ((midi - 69) / 12);
const bgm = { playing: false, timer: null, nextStepTime: 0, step: 0, bar: 0, melodyIndex: 2, bus: null, output: null, warmth: null, echoInput: null, crackle: null };

// 출력 경로: 각 악기 → bus → 따뜻한 로우패스 → output(페이드용) → 스피커. 멜로디는 에코(딜레이 피드백)도 거친다.
function buildBgmGraph(context) {
  if (bgm.bus) return;
  bgm.bus = context.createGain();
  bgm.warmth = context.createBiquadFilter();
  bgm.warmth.type = "lowpass";
  bgm.warmth.frequency.value = 5200;
  bgm.output = context.createGain();
  bgm.output.gain.value = 0.0001;
  bgm.bus.connect(bgm.warmth).connect(bgm.output).connect(context.destination);
  const delay = context.createDelay(1);
  delay.delayTime.value = 0.42;
  const feedback = context.createGain();
  feedback.gain.value = 0.3;
  const echoTone = context.createBiquadFilter();
  echoTone.type = "lowpass";
  echoTone.frequency.value = 2200;
  bgm.echoInput = context.createGain();
  bgm.echoInput.gain.value = 0.6;
  bgm.echoInput.connect(delay);
  delay.connect(echoTone).connect(feedback).connect(delay);
  echoTone.connect(bgm.bus);
}

// 공통 엔벌로프: 어택 → 유지 → 지수 감쇠.
function bgmEnvelope(context, startTime, { attack = 0.01, hold = 0, release = 0.3, peak = 0.1 }) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peak, startTime + attack);
  gain.gain.setValueAtTime(peak, startTime + attack + hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + attack + hold + release);
  return { gain, endTime: startTime + attack + hold + release + 0.05 };
}

function bgmOscillator(context, { type, frequency, detune = 0, startTime, endTime, destination, glideFrom }) {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.detune.value = detune;
  oscillator.frequency.setValueAtTime(glideFrom || frequency, startTime);
  if (glideFrom) oscillator.frequency.exponentialRampToValueAtTime(frequency, startTime + 0.06);
  oscillator.connect(destination);
  oscillator.start(startTime);
  oscillator.stop(endTime);
}

function playBgmPad(context, notes, time, duration, mood) {
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(mood.padCutoff * 0.7, time);
  filter.frequency.linearRampToValueAtTime(mood.padCutoff, time + duration * 0.5);
  filter.frequency.linearRampToValueAtTime(mood.padCutoff * 0.75, time + duration);
  const envelope = bgmEnvelope(context, time, { attack: 0.8, hold: Math.max(0, duration - 0.8), release: 1.2, peak: 0.03 });
  filter.connect(envelope.gain).connect(bgm.bus);
  notes.forEach(midi => [-7, 7].forEach(detune => bgmOscillator(context, { type: "sawtooth", frequency: midiToHz(midi), detune, startTime: time, endTime: envelope.endTime, destination: filter })));
}

// 로즈 느낌 건반: 사인 + 한 옥타브 위 삼각파, 살짝 '스트럼'하듯 음마다 늦게.
function playBgmKeys(context, notes, time, velocity) {
  notes.forEach((midi, index) => {
    const startTime = time + index * 0.014;
    const envelope = bgmEnvelope(context, startTime, { attack: 0.006, release: 1.5, peak: 0.045 * velocity });
    envelope.gain.connect(bgm.bus);
    bgmOscillator(context, { type: "sine", frequency: midiToHz(midi + 12), startTime, endTime: envelope.endTime, destination: envelope.gain });
    const shimmer = context.createGain();
    shimmer.gain.value = 0.25;
    shimmer.connect(envelope.gain);
    bgmOscillator(context, { type: "triangle", frequency: midiToHz(midi + 24), startTime, endTime: envelope.endTime, destination: shimmer });
  });
}

function playBgmBass(context, midi, time, duration, glideFromMidi) {
  const envelope = bgmEnvelope(context, time, { attack: 0.012, hold: duration * 0.6, release: 0.25, peak: 0.13 });
  envelope.gain.connect(bgm.bus);
  bgmOscillator(context, { type: "sine", frequency: midiToHz(midi), glideFrom: glideFromMidi ? midiToHz(glideFromMidi) : null, startTime: time, endTime: envelope.endTime, destination: envelope.gain });
  const grit = context.createGain();
  grit.gain.value = 0.18;
  grit.connect(envelope.gain);
  bgmOscillator(context, { type: "triangle", frequency: midiToHz(midi + 12), startTime: time, endTime: envelope.endTime, destination: grit });
}

function playBgmMelody(context, midi, time, duration) {
  const envelope = bgmEnvelope(context, time, { attack: 0.01, hold: duration * 0.4, release: duration * 1.4, peak: 0.04 });
  envelope.gain.connect(bgm.bus);
  envelope.gain.connect(bgm.echoInput);
  bgmOscillator(context, { type: "triangle", frequency: midiToHz(midi), startTime: time, endTime: envelope.endTime, destination: envelope.gain });
}

function playBgmNoise(context, time, { filterType, frequency, q = 1, peak, release }) {
  const source = context.createBufferSource();
  source.buffer = getNoiseBuffer(context);
  const filter = context.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  const envelope = bgmEnvelope(context, time, { attack: 0.002, release, peak });
  source.connect(filter).connect(envelope.gain).connect(bgm.bus);
  source.start(time, Math.random() * 0.3);
  source.stop(envelope.endTime);
}

function playBgmKick(context, time, velocity) {
  const envelope = bgmEnvelope(context, time, { attack: 0.003, release: 0.32, peak: 0.26 * velocity });
  envelope.gain.connect(bgm.bus);
  const oscillator = context.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(115, time);
  oscillator.frequency.exponentialRampToValueAtTime(42, time + 0.22);
  oscillator.connect(envelope.gain);
  oscillator.start(time);
  oscillator.stop(envelope.endTime);
}

function playBgmSnare(context, time, velocity) {
  playBgmNoise(context, time, { filterType: "bandpass", frequency: 1700, q: 0.8, peak: 0.06 * velocity, release: 0.18 });
  const envelope = bgmEnvelope(context, time, { attack: 0.002, release: 0.09, peak: 0.035 * velocity });
  envelope.gain.connect(bgm.bus);
  bgmOscillator(context, { type: "triangle", frequency: 190, startTime: time, endTime: envelope.endTime, destination: envelope.gain });
}

const playBgmHat = (context, time, velocity) => playBgmNoise(context, time, { filterType: "highpass", frequency: 7500, peak: 0.022 * velocity, release: 0.045 });

// 레코드판 지글거림 + 테이프 히스: 2초짜리 버퍼를 반복 재생.
function startBgmCrackle(context) {
  const length = Math.floor(context.sampleRate * 2);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    const hiss = (Math.random() * 2 - 1) * 0.04;
    const pop = Math.random() < 0.0006 ? (Math.random() * 2 - 1) * 0.9 : 0;
    samples[index] = hiss + pop;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1400;
  const gain = context.createGain();
  gain.gain.value = 0.05;
  source.connect(filter).connect(gain).connect(bgm.bus);
  source.start();
  bgm.crackle = source;
}

function bgmMood() {
  const hour = new Date().getHours();
  const isNight = hour >= 21 || hour < 6;
  const isBusy = typeof isDiscussionActive === "function" && isDiscussionActive();
  return {
    bpm: isNight ? 70 : 78,
    padCutoff: isNight ? 720 : 1150,
    drums: isBusy ? 1 : isNight ? 0.45 : 0.7,
    melody: isBusy ? 0.42 : isNight ? 0.16 : 0.26
  };
}

// 멜로디는 계단식으로 움직인다(한두 칸씩) → 무작위인데도 노래처럼 들림.
function nextMelodyNote() {
  const move = [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)];
  bgm.melodyIndex = clamp(bgm.melodyIndex + move, 0, BGM_MELODY_SCALE.length - 1);
  return BGM_MELODY_SCALE[bgm.melodyIndex];
}

function scheduleBgmStep(context, time, mood) {
  const step = bgm.step % 16;
  const sectionIndex = Math.floor(bgm.bar / 8) % BGM_SECTIONS.length;
  const section = BGM_SECTIONS[sectionIndex];
  const chordIndex = bgm.bar % 4;
  const chord = section.chords[chordIndex];
  const sixteenth = 60 / mood.bpm / 4;
  const isBreakdown = bgm.bar % 8 === 7;
  if (step === 0) {
    playBgmPad(context, chord, time, sixteenth * 16, mood);
    playBgmBass(context, section.bass[chordIndex], time, sixteenth * 6);
    bgm.warmth.frequency.setTargetAtTime(isBreakdown ? 1800 : 5200, time, 0.8);
  }
  if (step === 8 && !isBreakdown) playBgmBass(context, section.bass[chordIndex] + (Math.random() < 0.3 ? 7 : 0), time, sixteenth * 4, section.bass[chordIndex] - 2);
  if (step === 0 || step === 6 || (step === 10 && Math.random() < 0.4)) playBgmKeys(context, chord.slice(Math.random() < 0.5 ? 0 : 1), time, step === 0 ? 1 : 0.7);
  if (!isBreakdown && mood.drums > 0) {
    if (step === 0 || (step === 7 && Math.random() < 0.5) || (step === 10 && Math.random() < 0.6)) playBgmKick(context, time, step === 0 ? 1 : 0.75);
    if (step === 4 || step === 12) playBgmSnare(context, time, 0.9);
    const hatGrid = mood.drums >= 0.6 ? 2 : 4;
    if (step % hatGrid === 0) playBgmHat(context, time, 0.5 + Math.random() * 0.5);
    else if (mood.drums >= 1 && Math.random() < 0.18) playBgmHat(context, time, 0.35);
  }
  if (step % 2 === 0 && Math.random() < mood.melody * (isBreakdown ? 1.6 : 1)) playBgmMelody(context, nextMelodyNote(), time, sixteenth * (Math.random() < 0.5 ? 2 : 3));
}

function bgmTick() {
  const context = audioContext;
  if (!context || !bgm.playing) return;
  if (context.state !== "running" || document.hidden) { bgm.nextStepTime = context.currentTime + 0.05; return; }
  const mood = bgmMood();
  const sixteenth = 60 / mood.bpm / 4;
  if (bgm.nextStepTime < context.currentTime - 0.2) bgm.nextStepTime = context.currentTime + 0.05; // 오래 멈췄다 돌아오면 밀린 음을 몰아 치지 않음
  while (bgm.nextStepTime < context.currentTime + BGM_LOOKAHEAD_SECONDS) {
    const swingDelay = bgm.step % 2 === 1 ? sixteenth * BGM_SWING : 0;
    try { scheduleBgmStep(context, bgm.nextStepTime + swingDelay, mood); } catch (error) { /* 한 음 실패는 무시 */ }
    bgm.nextStepTime += sixteenth;
    bgm.step += 1;
    if (bgm.step % 16 === 0) bgm.bar += 1;
  }
}

function startBgm() {
  if (bgm.playing) return;
  const context = ensureAudioContext();
  if (!context) return;
  if (context.state === "suspended") context.resume().catch(() => {});
  buildBgmGraph(context);
  Object.assign(bgm, { playing: true, step: 0, bar: 0, nextStepTime: context.currentTime + 0.1 });
  bgm.output.gain.cancelScheduledValues(context.currentTime);
  bgm.output.gain.setValueAtTime(Math.max(bgm.output.gain.value, 0.0001), context.currentTime);
  bgm.output.gain.exponentialRampToValueAtTime(BGM_VOLUME, context.currentTime + BGM_FADE_SECONDS);
  startBgmCrackle(context);
  bgm.timer = setInterval(bgmTick, BGM_TICK_MS);
}

function stopBgm() {
  if (!bgm.playing) return;
  bgm.playing = false;
  clearInterval(bgm.timer);
  const context = audioContext;
  bgm.output.gain.cancelScheduledValues(context.currentTime);
  bgm.output.gain.setValueAtTime(Math.max(bgm.output.gain.value, 0.0001), context.currentTime);
  bgm.output.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.6);
  const crackle = bgm.crackle;
  bgm.crackle = null;
  setTimeout(() => { try { crackle?.stop(); } catch (error) { /* 이미 멈춤 */ } }, 700);
}

function renderBgmPill() {
  document.getElementById("bgmPill").textContent = state.bgm ? "🎵 BGM ON" : "🎵 BGM OFF";
}

function toggleBgm() {
  state.bgm = !state.bgm;
  saveState();
  renderBgmPill();
  if (state.bgm) startBgm(); else stopBgm();
  showToast(state.bgm ? "BGM을 켰어요 · 코드로 즉석 연주하는 로파이 루프" : "BGM을 껐어요");
}
