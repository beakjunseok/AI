/* ================= 기기 간 동기화 (서버 /api/state → Vercel Blob 파일 하나) ================= */
// 같은 접속 코드로 들어온 모든 기기가 진행 상황(코인·뽑은 키보드·프로젝트·대화)을 공유한다.
// 무료 한도(저장 2,000회/월)를 아끼려고 저장은 ① 10분마다 ② 화면을 떠날 때 ③ 뽑기·장착 직후에만, 내용이 바뀐 경우에만 한다.
// 다른 기기에서 더 최신본을 올렸으면 그걸 받되, 뽑은 키보드는 절대 잃지 않게 두 쪽을 합친다(개수는 큰 쪽).
const SYNC_STORAGE_KEY = "ai-office-sync";
const SYNC_PERIODIC_MS = 10 * 60 * 1000;
const SYNC_HIDE_MIN_GAP_MS = 45 * 1000;
const SYNC_SOON_DELAY_MS = 6000;
const SYNC_SOON_MIN_GAP_MS = 20 * 1000;
const SYNC_PULL_MIN_GAP_MS = 60 * 1000;
const SYNC_STARTUP_TIMEOUT_MS = 3500;
const SYNC_KEEPALIVE_LIMIT = 60000;
const DEVICE_ONLY_FIELDS = ["sound", "bgm"];

const sync = { ...readSyncMeta(), lastPushedHash: "", lastPushAt: 0, lastPullAt: 0, busy: false, reloading: false, appStarted: false, soonTimer: null, gachaSignature: "", pushedGachaSignature: "" };

// etag: 마지막으로 맞춘 서버본 버전. pending: 합친 결과를 새로고침 뒤 올려야 함.
function readSyncMeta() {
  try {
    const meta = JSON.parse(localStorage.getItem(SYNC_STORAGE_KEY) || "{}");
    return { etag: meta.etag || "", pending: meta.pending === true };
  } catch (error) { return { etag: "", pending: false }; }
}

function writeSyncEtag(etag, pending = false) {
  sync.etag = etag || "";
  sync.pending = pending;
  try { localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify({ etag: sync.etag, pending })); } catch (error) { /* 저장 불가 */ }
}

const canSync = () => /^https?:$/.test(location.protocol) && Boolean(storedAccessCode());
const syncHeaders = () => ({ "Content-Type": "application/json", "x-access-code": storedAccessCode() });
const gachaSignatureOf = target => JSON.stringify([target.gacha?.owned, target.gacha?.equipped]);

// 변경 감지용 32비트 FNV-1a. O(n), 수 MB도 수 ms.
function quickHash(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return (hash >>> 0).toString(36) + ":" + text.length;
}

// 서버로 보낼 본문. 소리 설정처럼 기기마다 다른 게 자연스러운 값은 뺀다.
function stateTextForSync() {
  const copy = { ...state };
  DEVICE_ONLY_FIELDS.forEach(field => delete copy[field]);
  return JSON.stringify(copy);
}

// 서버본에 이 기기의 뽑기 결과를 합친다. 키보드 보유 수·총 뽑기 수는 큰 쪽.
// 처음 연결하는 기기(etag 없음)는 따로 쌓은 진행이 있을 수 있으니 코인·업적도 큰 쪽/합집합으로 살린다.
function mergeLocalProgress(remote, local, isFirstLink) {
  const owned = { ...(remote.gacha?.owned || {}) };
  Object.entries(local.gacha?.owned || {}).forEach(([skinId, count]) => { owned[skinId] = Math.max(owned[skinId] || 0, count || 0); });
  remote.gacha = { ...(remote.gacha || {}), owned, pulls: Math.max(remote.gacha?.pulls || 0, local.gacha?.pulls || 0) };
  if (isFirstLink) {
    remote.coins = Math.max(Number(remote.coins) || 0, Number(local.coins) || 0);
    remote.achievements = [...new Set([...(remote.achievements || []), ...(local.achievements || [])])];
    if ((local.gacha?.lastDate || "") > (remote.gacha.lastDate || "")) remote.gacha.lastDate = local.gacha.lastDate;
  }
  return remote;
}

// 서버본을 이 기기 상태로 들인다. 앱이 이미 돌고 있으면 저장 후 새로고침(걷는 캐릭터·타이머가 옛 상태를 쥐고 있으므로).
function adoptRemoteState(remoteState, etag, { isFirstLink = false } = {}) {
  const remoteSignature = gachaSignatureOf(remoteState);
  const merged = normalizeState(mergeLocalProgress(structuredClone(remoteState), state, isFirstLink));
  if (!merged) return false;
  DEVICE_ONLY_FIELDS.forEach(field => { merged[field] = state[field]; });
  const gainedProgress = isFirstLink || gachaSignatureOf(merged) !== remoteSignature;
  writeSyncEtag(etag, gainedProgress);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch (error) { /* 저장 불가 */ }
  if (!sync.appStarted) { state = merged; sync.lastPushedHash = gainedProgress ? "" : quickHash(stateTextForSync()); return true; }
  sync.reloading = true;   // 새로고침이 일으키는 pagehide 저장이 옛 상태를 올리지 않게
  location.reload();
  return true;
}

// 서버 최신본을 확인한다. 같으면 아무것도 안 하고, 비어 있으면 이 기기 것을 첫 업로드.
async function pullState() {
  if (!canSync()) return "skip";
  sync.lastPullAt = Date.now();
  try {
    const response = await fetch("/api/state", { cache: "no-store", headers: { ...syncHeaders(), "x-sync-etag": sync.etag } });
    if (response.status === 404) { writeSyncEtag(""); sync.lastPushedHash = ""; await pushState("first"); return "uploaded"; }
    if (!response.ok) return "error";
    const data = await response.json();
    if (data.unchanged || (data.etag && data.etag === sync.etag)) return "same";
    if (!data.state) return "error";
    adoptRemoteState(data.state, data.etag, { isFirstLink: !sync.etag });
    return "adopted";
  } catch (error) { return "error"; }
}

// 내용이 마지막 업로드와 다를 때만 올린다. 다른 기기가 먼저 올렸으면(409) 서버본에 뽑기 결과를 합쳐 받고, 합친 걸 다시 올린다.
async function pushState(reason) {
  if (!canSync() || sync.busy || sync.reloading) return;
  const text = stateTextForSync();
  const hash = quickHash(text);
  const gachaAtPush = gachaSignatureOf(state);
  if (hash === sync.lastPushedHash && sync.etag) return;
  sync.busy = true;
  try {
    const body = `{"state":${text},"etag":${JSON.stringify(sync.etag || null)}}`;
    const response = await fetch("/api/state", { method: "PUT", headers: syncHeaders(), body, keepalive: reason === "hide" && body.length < SYNC_KEEPALIVE_LIMIT });
    sync.lastPushAt = Date.now();
    if (response.ok) {
      writeSyncEtag((await response.json()).etag, false);
      sync.lastPushedHash = hash;
      sync.pushedGachaSignature = gachaAtPush;
    } else if (response.status === 409) {
      const data = await response.json();
      if (data.state) { sync.busy = false; adoptRemoteState(data.state, data.etag, { isFirstLink: !sync.etag }); }
    }
  } catch (error) { /* 오프라인 등: 다음 기회에 다시 */ }
  sync.busy = false;
}

// 뽑기·장착처럼 잃으면 아쉬운 변화는 몇 초 뒤 바로 올린다(20초에 한 번까지).
function requestSyncSoon() {
  if (sync.soonTimer) return;
  const wait = Math.max(SYNC_SOON_DELAY_MS, sync.lastPushAt + SYNC_SOON_MIN_GAP_MS - Date.now());
  sync.soonTimer = setTimeout(() => { sync.soonTimer = null; pushState("soon"); }, wait);
}

// saveState가 부를 때마다: 뽑은 키보드·장착이 바뀌었는지만 가볍게 본다.
function noteStateSaved() {
  if (!sync.appStarted) return;
  const signature = gachaSignatureOf(state);
  if (signature !== sync.gachaSignature) { sync.gachaSignature = signature; requestSyncSoon(); }
}

function bindSyncEvents() {
  setInterval(() => pushState("periodic"), SYNC_PERIODIC_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") pushOnLeave();
    else if (Date.now() - sync.lastPullAt >= SYNC_PULL_MIN_GAP_MS) {
      pullState();
    }
  });
  window.addEventListener("pagehide", pushOnLeave);
}

// 화면을 떠날 때: 아직 안 올린 뽑기 결과가 있으면 무조건, 아니면 45초 간격을 지켜 올린다.
function pushOnLeave() {
  const hasUnsavedGacha = gachaSignatureOf(state) !== sync.pushedGachaSignature;
  if (hasUnsavedGacha || Date.now() - sync.lastPushAt >= SYNC_HIDE_MIN_GAP_MS) pushState("hide");
}

// 새 기기에서 접속 코드를 처음 넣었을 때: 서버 진행 상황을 바로 받아온다.
function syncAfterUnlock() {
  pullState();
}

// 시작 전에 서버본을 먼저 받아(최대 3.5초) 그 상태로 화면을 그린다. 늦게 오면 받은 뒤 새로고침으로 반영.
async function startWithSync() {
  const timeout = new Promise(resolve => setTimeout(() => resolve("timeout"), SYNC_STARTUP_TIMEOUT_MS));
  await Promise.race([pullState(), timeout]);
  sync.appStarted = true;
  sync.gachaSignature = gachaSignatureOf(state);
  if (!sync.pending) sync.pushedGachaSignature = sync.gachaSignature;
  startApp();
  bindSyncEvents();
  if (sync.pending) requestSyncSoon();
}
