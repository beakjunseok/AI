// 기기 간 진행 상황 동기화. 저장소: Vercel Blob(private) 한 파일. 토큰은 Vercel 환경변수 BLOB_READ_WRITE_TOKEN.
// GET  /api/state            → 200 {state, etag} | 200 {unchanged:true, etag}(x-sync-etag 헤더가 최신과 같을 때) | 404 {code:"empty"}
// PUT  /api/state {state, etag?}
//   etag가 서버 최신본과 같을 때만 덮어쓴다(다른 기기가 먼저 저장했으면 409 + 서버본을 돌려줘 클라이언트가 합치게 함).
//   etag 없이 보내는 건 "서버가 비어 있을 때 첫 업로드"만 허용. etag는 형식 차이를 없앤(따옴표·W/ 제거) 값으로 주고받는다.
const { get, head, put } = require("@vercel/blob");
const { hasAccess } = require("../lib/providers");

const STATE_PATH = "state/office.json";
const MAX_STATE_BYTES = 3_500_000;

module.exports = async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.query?.code) request.headers["x-access-code"] = request.query.code;
  if (!hasAccess(request)) return response.status(401).json({ code: "locked" });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return response.status(503).json({ code: "not_configured" });
  try {
    if (request.method === "GET") return await handleRead(request, response);
    if (request.method === "PUT" || request.method === "POST") return await handleWrite(request, response);
    return response.status(405).json({ code: "bad_request" });
  } catch (error) {
    return response.status(502).json({ code: "storage_error", message: String(error.message || error).slice(0, 200) });
  }
};

// Blob은 읽을 때 W/"abc", 저장할 때 "abc"처럼 형식이 달라서, 비교·응답은 항상 따옴표 없는 abc로 맞춘다.
const normalizeEtag = tag => String(tag || "").replace(/^W\//, "").replace(/"/g, "");

// 현재 버전 태그만 확인(본문 안 받음). 파일이 없으면 "".
async function currentEtag() {
  try { return normalizeEtag((await head(STATE_PATH)).etag); } catch (error) { return ""; }
}

// 최신본을 CDN 캐시 없이 읽는다. 클라이언트가 가진 버전과 같으면 본문 없이 unchanged.
async function readRemote(clientEtag) {
  const latest = await currentEtag();
  if (!latest) return null;
  if (clientEtag && normalizeEtag(clientEtag) === latest) return { etag: latest, unchanged: true };
  const result = await get(STATE_PATH, { access: "private", useCache: false });
  if (!result || !result.stream) return null;
  const text = await new Response(result.stream).text();
  return { etag: normalizeEtag(result.blob?.etag) || latest, state: JSON.parse(text) };
}

async function handleRead(request, response) {
  const remote = await readRemote(String(request.headers["x-sync-etag"] || ""));
  if (!remote) return response.status(404).json({ code: "empty" });
  if (remote.unchanged) return response.status(200).json({ unchanged: true, etag: remote.etag });
  return response.status(200).json(remote);
}

async function handleWrite(request, response) {
  const body = typeof request.body === "string" ? safeParse(request.body) : (request.body || {});
  if (!body.state || typeof body.state !== "object" || !Array.isArray(body.state.projects)) return response.status(400).json({ code: "bad_request" });
  const text = JSON.stringify(body.state);
  if (text.length > MAX_STATE_BYTES) return response.status(413).json({ code: "too_large" });
  // 충돌 판정은 여기서 직접: 서버 최신 버전이 클라이언트가 마지막으로 맞춘 버전과 다르면 409 + 서버본.
  const latest = await currentEtag();
  if (latest && normalizeEtag(body.etag) !== latest) {
    const remote = await readRemote("");
    return response.status(409).json({ code: "conflict", ...(remote || {}) });
  }
  const saved = await put(STATE_PATH, text, { access: "private", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 });
  return response.status(200).json({ etag: normalizeEtag(saved.etag) });
}

function safeParse(raw) {
  try { return JSON.parse(raw); } catch (error) { return {}; }
}
