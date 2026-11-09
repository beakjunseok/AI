// GET /api/models?code=  → 이 Gemini 키로 generateContent 가능한 모델 이름 목록 (키 값은 노출하지 않음)
const { hasAccess, readSetting } = require("../lib/providers");

module.exports = async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.query?.code) request.headers["x-access-code"] = request.query.code;
  if (!hasAccess(request)) return response.status(401).json({ code: "locked" });
  const apiKey = readSetting("GEMINI_API_KEY");
  if (!apiKey) return response.status(503).json({ code: "not_configured" });
  try {
    const upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": apiKey } });
    if (!upstream.ok) return response.status(502).json({ code: "upstream_error", status: upstream.status });
    const data = await upstream.json();
    const models = (data.models || []).filter(model => (model.supportedGenerationMethods || []).includes("generateContent")).map(model => model.name.replace("models/", ""));
    return response.status(200).json({ models });
  } catch (error) {
    return response.status(502).json({ code: "upstream_error", message: error.name });
  }
};
