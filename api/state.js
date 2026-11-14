// 기기 간 진행 상황 동기화. 저장소: Vercel Blob(private) 한 파일. 토큰은 Vercel 환경변수 BLOB_READ_WRITE_TOKEN.
// GET  /api/state            → 200 {state, etag} | 200 {unchanged:true, etag}(x-sync-etag 헤더가 최신과 같을 때) | 404 {code:"empty"}
// PUT  /api/state {state, etag?}
//   etag가 서버 최신본과 같을 때만 덮어쓴다(다른 기기가 먼저 저장했으면 409 + 서버본을 돌려줘 클라이언트가 합치게 함).
//   etag 없이 보내는 건 "서버가 비어 있을 때 첫 업로드"만 허용.
const { get, put, BlobPreconditionFailedError } = require("@vercel/blob");
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

// 최신본을 CDN 캐시 없이 읽는다. 클라이언트가 가진 etag와 같으면 본문 없이 unchanged.
async function readRemote(ifNoneMatch) {
  const result = await get(STATE_PATH, { access: "private", useCache: false, ifNoneMatch: ifNoneMatch || undefined });
  if (!result) return null;
  if (result.statusCode === 304) return { etag: result.blob?.etag || ifNoneMatch, unchanged: true };
  const text = await new Response(result.stream).text();
  return { etag: result.blob.etag, state: JSON.parse(text) };
}

async function handleRead(request, response) {
  const remote = await readRemote(String(request.headers["x-sync-etag"] || ""));
  if (!remote) return response.status(404).json({ code: "empty" });
  return response.status(200).json(remote);
}

async function handleWrite(request, response) {
  const body = typeof request.body === "string" ? safeParse(request.body) : (request.body || {});
  if (!body.state || typeof body.state !== "object" || !Array.isArray(body.state.projects)) return response.status(400).json({ code: "bad_request" });
  const text = JSON.stringify(body.state);
  if (text.length > MAX_STATE_BYTES) return response.status(413).json({ code: "too_large" });
  const options = { access: "private", contentType: "application/json", addRandomSuffix: false, cacheControlMaxAge: 60 };
  if (body.etag) options.ifMatch = body.etag; else options.allowOverwrite = false;
  try {
    const saved = await put(STATE_PATH, text, options);
    return response.status(200).json({ etag: saved.etag });
  } catch (error) {
    const isConflict = error instanceof BlobPreconditionFailedError || /exist|precondition/i.test(String(error.message));
    if (!isConflict) throw error;
    const remote = await readRemote("");
    return response.status(409).json({ code: "conflict", ...(remote || {}) });
  }
}

function safeParse(raw) {
  try { return JSON.parse(raw); } catch (error) { return {}; }
}
