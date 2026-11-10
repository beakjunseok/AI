/* ================= BGM (Web Audio 실시간 연주 · 음원 파일 없음) ================= */
// 직접 작곡한 약 2분 20초짜리 신스팝 곡 'Overclock'을 코드로 연주한다. 저작권 걱정 없음, 다운로드 0바이트.
// 곡 구조(64마디 · 108 BPM): 인트로 → 벌스 → 프리코러스 → 코러스 → 포스트(아르페지오 솔로) → 벌스2 →
//   프리 → 코러스 → 브릿지(드럼 빠짐) → 마지막 코러스(전조 +2) → 아웃트로. 섹션마다 악기 편성·드럼·베이스가 다르다.
// 한 바퀴 돌면 키를 바꿔(0 → +3 → -2 반음) 다시 시작해서 같은 곡이 똑같이 반복되지 않는다.
// 스케줄러는 ~150ms 앞을 미리 예약하는 lookahead 방식(타이머 지터에도 박자가 흔들리지 않음). 틱당 O(그 박의 음 수)

const BGM_VOLUME = 0.45;
const BGM_LOOKAHEAD_SECONDS = 0.15;
const BGM_TICK_MS = 30;
const BGM_FADE_SECONDS = 1.6;
const BGM_SWING = 0.04;
const BGM_BPM = 108;
const BGM_LOOP_TRANSPOSE = [0, 3, -2];

const midiToHz = midi => 440 * 2 ** ((midi - 69) / 12);
const bgm = { playing: false, timer: null, nextStepTime: 0, step: 0, bar: 0, bus: null, padBus: null, output: null, warmth: null, echoInput: null, crackle: null };

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
  // 패드는 킥이 칠 때마다 잠깐 작아졌다 돌아온다(사이드체인 '펌핑' → 신나는 그루브).
  bgm.padBus = context.createGain();
  bgm.padBus.connect(bgm.bus);
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
  const envelope = bgmEnvelope(context, time, { attack: 0.08, hold: Math.max(0, duration - 0.08), release: 0.5, peak: 0.028 });
  filter.connect(envelope.gain).connect(bgm.padBus);
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

// 16분음표 아르페지오: 짧은 사각파가 코드 음을 오르내린다(에코 살짝).
function playBgmArp(context, midi, time, velocity) {
  const envelope = bgmEnvelope(context, time, { attack: 0.003, release: 0.12, peak: 0.022 * velocity });
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 3200;
  filter.connect(envelope.gain);
  envelope.gain.connect(bgm.bus);
  envelope.gain.connect(bgm.echoInput);
  bgmOscillator(context, { type: "square", frequency: midiToHz(midi), startTime: time, endTime: envelope.endTime, destination: filter });
}

// 신스 베이스: 톱니파를 필터가 '뿅' 하고 닫히게 → 8분음표로 달리는 베이스.
function playBgmSynthBass(context, midi, time, duration, velocity) {
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 6;
  filter.frequency.setValueAtTime(1400, time);
  filter.frequency.exponentialRampToValueAtTime(220, time + duration);
  const envelope = bgmEnvelope(context, time, { attack: 0.004, hold: duration * 0.5, release: duration * 0.5, peak: 0.085 * velocity });
  filter.connect(envelope.gain).connect(bgm.bus);
  bgmOscillator(context, { type: "sawtooth", frequency: midiToHz(midi), startTime: time, endTime: envelope.endTime, destination: filter });
  bgmOscillator(context, { type: "sine", frequency: midiToHz(midi), startTime: time, endTime: envelope.endTime, destination: envelope.gain });
}

function duckPad(context, time) {
  bgm.padBus.gain.cancelScheduledValues(time);
  bgm.padBus.gain.setValueAtTime(0.35, time);
  bgm.padBus.gain.linearRampToValueAtTime(1, time + 0.22);
}

const playBgmOpenHat = (context, time) => playBgmNoise(context, time, { filterType: "highpass", frequency: 6500, peak: 0.03, release: 0.16 });
const playBgmClap = (context, time) => [0, 0.012, 0.024].forEach(offset => playBgmNoise(context, time + offset, { filterType: "bandpass", frequency: 1400, q: 1.2, peak: 0.05, release: 0.12 }));

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
  gain.gain.value = 0.02;
  source.connect(filter).connect(gain).connect(bgm.bus);
  source.start();
  bgm.crackle = source;
}

/* ---------- 곡 데이터 ---------- */
// 코드: [화음 음들(미디), 베이스 루트]
const BGM_CHORDS = {
  Am7: [[57, 60, 64, 67], 45], Fmaj7: [[53, 57, 60, 64], 41], C: [[55, 60, 64, 67], 48], G: [[55, 59, 62, 67], 43],
  Dm7: [[50, 53, 57, 60], 38], Em7: [[52, 55, 59, 62], 40], Gsus: [[55, 60, 62, 67], 43], F: [[53, 57, 60, 65], 41],
  G7: [[55, 59, 62, 65], 43], Em: [[52, 55, 59, 64], 40], E7: [[52, 56, 59, 62], 40]
};
// 멜로디: 마디별 [16분음표 위치, 미디 음, 길이(16분 단위)]
const LEAD_VERSE = [
  [[0, 76, 2], [2, 74, 2], [4, 72, 2], [6, 69, 4], [12, 72, 2], [14, 74, 2]],
  [[0, 76, 3], [3, 77, 1], [4, 76, 2], [6, 72, 6], [14, 69, 2]],
  [[0, 67, 2], [2, 69, 2], [4, 72, 2], [6, 76, 4], [10, 74, 2], [12, 72, 4]],
  [[0, 74, 6], [6, 71, 2], [8, 67, 6]],
  [[0, 76, 2], [2, 74, 2], [4, 72, 2], [6, 69, 4], [12, 72, 2], [14, 74, 2]],
  [[0, 76, 3], [3, 77, 1], [4, 76, 2], [6, 79, 6], [14, 77, 2]],
  [[0, 76, 2], [2, 74, 2], [4, 72, 2], [6, 76, 4], [10, 79, 2], [12, 81, 4]],
  [[0, 74, 2], [2, 76, 2], [4, 79, 4], [8, 76, 4], [12, 74, 4]]
];
const LEAD_PRE = [
  [[0, 69, 4], [4, 72, 4], [8, 74, 4], [12, 77, 4]],
  [[0, 79, 4], [4, 76, 4], [8, 74, 4], [12, 71, 4]],
  [[0, 72, 4], [4, 77, 4], [8, 81, 8]],
  [[0, 79, 8], [8, 74, 2], [10, 76, 2], [12, 77, 2], [14, 79, 2]]
];
const LEAD_CHORUS = [
  [[0, 81, 2], [2, 79, 2], [4, 81, 2], [6, 84, 4], [10, 81, 2], [12, 79, 4]],
  [[0, 79, 2], [2, 77, 2], [4, 79, 2], [6, 83, 4], [10, 79, 2], [12, 74, 4]],
  [[0, 76, 2], [2, 79, 2], [4, 83, 4], [8, 81, 2], [10, 79, 2], [12, 76, 4]],
  [[0, 81, 6], [6, 79, 2], [8, 76, 2], [10, 79, 2], [12, 81, 4]],
  [[0, 81, 2], [2, 79, 2], [4, 81, 2], [6, 84, 4], [10, 81, 2], [12, 79, 4]],
  [[0, 79, 2], [2, 77, 2], [4, 79, 2], [6, 83, 4], [10, 79, 2], [12, 74, 4]],
  [[0, 80, 2], [2, 83, 2], [4, 86, 4], [8, 83, 2], [10, 80, 2], [12, 76, 4]],
  [[0, 81, 8], [8, 76, 2], [10, 81, 2], [12, 84, 4]]
];
const LEAD_BRIDGE = [[[0, 76, 8], [8, 79, 8]], [[0, 81, 16]], [[0, 79, 8], [8, 76, 8]], [[0, 71, 8], [8, 74, 4], [12, 76, 4]]];

// 섹션: 코드 진행 + 편성. kick: four/half/none, hats: 16/8/none, bass: pulse/funk/long/none, arp: 0~1, lead: 멜로디, riser: 마지막 마디 상승음
const BGM_SONG = [
  { name: "intro", chords: ["Am7", "Fmaj7", "Am7", "Fmaj7"], kick: "none", hats: "none", bass: "long", arp: 0.9, pad: true, sweep: true, riser: true },
  { name: "verse", chords: ["Am7", "Fmaj7", "C", "G", "Am7", "Fmaj7", "C", "G"], kick: "half", hats: "8", bass: "pulse", arp: 0, keys: true, lead: LEAD_VERSE },
  { name: "pre", chords: ["Dm7", "Em7", "Fmaj7", "Gsus"], kick: "four", hats: "8", bass: "pulse", arp: 0.6, pad: true, lead: LEAD_PRE, riser: true, fill: true },
  { name: "chorus", chords: ["F", "G", "Em", "Am7", "F", "G", "E7", "Am7"], kick: "four", hats: "16", bass: "pulse", arp: 0.5, pad: true, clap: true, crash: true, lead: LEAD_CHORUS, fill: true },
  { name: "post", chords: ["F", "G", "Em", "Am7"], kick: "four", hats: "16", bass: "funk", arp: 1, arpLead: true, pad: true, clap: true },
  { name: "verse2", chords: ["Am7", "Fmaj7", "C", "G", "Am7", "Fmaj7", "C", "G"], kick: "four", hats: "8", bass: "funk", arp: 0.35, keys: true, lead: LEAD_VERSE },
  { name: "pre", chords: ["Dm7", "Em7", "Fmaj7", "Gsus"], kick: "four", hats: "16", bass: "pulse", arp: 0.7, pad: true, lead: LEAD_PRE, riser: true, fill: true },
  { name: "chorus", chords: ["F", "G", "Em", "Am7", "F", "G", "E7", "Am7"], kick: "four", hats: "16", bass: "pulse", arp: 0.6, pad: true, clap: true, crash: true, lead: LEAD_CHORUS },
  { name: "bridge", chords: ["Fmaj7", "Fmaj7", "Em7", "Em7"], kick: "none", hats: "none", bass: "long", arp: 0.4, pad: true, keys: true, lead: LEAD_BRIDGE, riser: true, fill: true },
  { name: "final", chords: ["F", "G", "Em", "Am7", "F", "G", "E7", "Am7"], kick: "four", hats: "16", bass: "funk", arp: 0.8, pad: true, clap: true, crash: true, lead: LEAD_CHORUS, harmony: true, transpose: 2 },
  { name: "outro", chords: ["Am7", "Fmaj7", "Am7", "Am7"], kick: "half", hats: "8", bass: "long", arp: 0.7, pad: true, keys: true, sweepOut: true }
];

// 곡을 마디 단위 타임라인으로 펼친다(로드 시 1회). O(마디 수)
const BGM_TIMELINE = BGM_SONG.flatMap(section => section.chords.map((chordName, barInSection) => ({
  section, barInSection, isLastBar: barInSection === section.chords.length - 1, chord: BGM_CHORDS[chordName], lead: section.lead?.[barInSection % section.lead.length] || []
})));

/* ---------- 추가 악기 ---------- */
// 리드 신스: 톱니+사각파, 살짝 비브라토, 에코. 코러스·벌스 멜로디 담당.
function playBgmLead(context, midi, time, duration, velocity = 1) {
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(3800, time);
  filter.frequency.exponentialRampToValueAtTime(1800, time + duration + 0.1);
  const envelope = bgmEnvelope(context, time, { attack: 0.012, hold: duration * 0.75, release: 0.22, peak: 0.032 * velocity });
  filter.connect(envelope.gain);
  envelope.gain.connect(bgm.bus);
  envelope.gain.connect(bgm.echoInput);
  const vibrato = context.createOscillator();
  const vibratoDepth = context.createGain();
  vibrato.frequency.value = 5.5;
  vibratoDepth.gain.value = duration > 0.4 ? 9 : 0;
  vibrato.connect(vibratoDepth);
  [["sawtooth", -6], ["square", 6]].forEach(([type, detune]) => {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.detune.value = detune;
    oscillator.frequency.value = midiToHz(midi);
    vibratoDepth.connect(oscillator.detune);
    oscillator.connect(filter);
    oscillator.start(time);
    oscillator.stop(envelope.endTime);
  });
  vibrato.start(time);
  vibrato.stop(envelope.endTime);
}

// 다음 섹션 직전 '쉬이익' 올라가는 잡음 + 섹션 첫 박 심벌.
function playBgmRiser(context, time, duration) {
  const source = context.createBufferSource();
  source.buffer = getNoiseBuffer(context);
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(400, time);
  filter.frequency.exponentialRampToValueAtTime(7000, time + duration);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.05, time + duration * 0.95);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.05);
  source.connect(filter).connect(gain).connect(bgm.bus);
  source.start(time);
  source.stop(time + duration + 0.1);
}
const playBgmCrash = (context, time) => playBgmNoise(context, time, { filterType: "highpass", frequency: 4500, peak: 0.05, release: 1.4 });

/* ---------- 마디·박 단위 연주 ---------- */
function scheduleBgmStep(context, time) {
  const step = bgm.step % 16;
  const loopIndex = Math.floor(bgm.bar / BGM_TIMELINE.length);
  const bar = BGM_TIMELINE[bgm.bar % BGM_TIMELINE.length];
  const { section } = bar;
  const transpose = BGM_LOOP_TRANSPOSE[loopIndex % BGM_LOOP_TRANSPOSE.length] + (section.transpose || 0);
  const [chordNotes, chordRoot] = bar.chord;
  const chord = chordNotes.map(note => note + transpose);
  const root = chordRoot + transpose;
  const sixteenth = 60 / BGM_BPM / 4;
  const barDuration = sixteenth * 16;
  const sectionProgress = (bar.barInSection + step / 16) / section.chords.length;

  if (step === 0) {
    if (section.pad) playBgmPad(context, chord, time, barDuration, { padCutoff: section.name === "bridge" ? 1400 : 2600 });
    if (section.crash && bar.barInSection === 0) playBgmCrash(context, time);
    if (section.riser && bar.isLastBar) playBgmRiser(context, time, barDuration);
    const cutoff = section.sweep ? 900 + 6600 * sectionProgress : section.sweepOut ? 7500 - 6000 * sectionProgress : 7500;
    bgm.warmth.frequency.setTargetAtTime(cutoff, time, 0.3);
  }
  // 베이스
  if (section.bass === "long" && step === 0) playBgmBass(context, root, time, barDuration * 0.8);
  if (section.bass === "pulse" && step % 2 === 0) playBgmSynthBass(context, root + (step === 6 || step === 14 ? 12 : 0), time, sixteenth * 1.8, step % 4 === 0 ? 1 : 0.75);
  if (section.bass === "funk" && [0, 3, 6, 8, 10, 11, 14].includes(step)) playBgmSynthBass(context, root + ([3, 11].includes(step) ? 12 : step === 14 ? 7 : 0), time, sixteenth * 1.4, [0, 8].includes(step) ? 1 : 0.7);
  // 화음·아르페지오
  if (section.keys && (step === 0 || step === 6 || step === 10)) playBgmKeys(context, chord.slice(1), time, step === 0 ? 0.9 : 0.6);
  if (section.arp && (section.arpLead || Math.random() < section.arp)) {
    const arpNotes = [...chord, chord[1] + 12, chord[2] + 12];
    const pattern = section.arpLead ? [0, 2, 4, 5, 4, 2, 3, 1, 0, 3, 5, 4, 2, 4, 1, 3] : [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 1, 3, 2, 4, 3, 5];
    playBgmArp(context, arpNotes[pattern[step] % arpNotes.length] + 12, time, (section.arpLead ? 1.5 : 1) * (step % 4 === 0 ? 1 : 0.65));
  }
  // 드럼
  const isFillBar = section.fill && bar.isLastBar;
  if (section.kick === "four" && step % 4 === 0 && !(isFillBar && step >= 12)) { playBgmKick(context, time, 1); duckPad(context, time); }
  if (section.kick === "half" && (step === 0 || step === 8 || (step === 10 && Math.random() < 0.5))) { playBgmKick(context, time, 0.9); duckPad(context, time); }
  if (section.kick !== "none" && (step === 4 || step === 12)) { playBgmSnare(context, time, 0.9); if (section.clap) playBgmClap(context, time); }
  if (section.hats === "8" && step % 2 === 0) playBgmHat(context, time, step % 4 === 2 ? 1 : 0.6);
  if (section.hats === "16") { if (step % 4 === 2) playBgmOpenHat(context, time); else playBgmHat(context, time, step % 2 === 0 ? 0.9 : 0.5); }
  if (isFillBar && step >= 8 && (step % 2 === 0 || step >= 12)) playBgmSnare(context, time, 0.45 + (step - 8) * 0.07);
  // 멜로디
  bar.lead.filter(note => note[0] === step).forEach(([, midi, length]) => {
    playBgmLead(context, midi + transpose, time, sixteenth * length);
    if (section.harmony) playBgmLead(context, midi + transpose - (length >= 4 ? 5 : 3), time, sixteenth * length, 0.5);
  });
}

function bgmTick() {
  const context = audioContext;
  if (!context || !bgm.playing) return;
  if (context.state !== "running" || document.hidden) { bgm.nextStepTime = context.currentTime + 0.05; return; }
  const sixteenth = 60 / BGM_BPM / 4;
  if (bgm.nextStepTime < context.currentTime - 0.2) bgm.nextStepTime = context.currentTime + 0.05; // 오래 멈췄다 돌아오면 밀린 음을 몰아 치지 않음
  while (bgm.nextStepTime < context.currentTime + BGM_LOOKAHEAD_SECONDS) {
    const swingDelay = bgm.step % 2 === 1 ? sixteenth * BGM_SWING : 0;
    try { scheduleBgmStep(context, bgm.nextStepTime + swingDelay); } catch (error) { /* 한 음 실패는 무시 */ }
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
  showToast(state.bgm ? "🎵 BGM ON · 'Overclock' (2분 22초, 직접 작곡)" : "BGM을 껐어요");
}
