// GET /api/health?code=  → 키가 설정된 공급자마다 짧은 실제 호출. 키 값은 노출하지 않는다.
const { PROVIDERS, configuredProviders, hasAccess, readSetting } = require("../lib/providers");

module.exports = async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (request.query?.code) request.headers["x-access-code"] = request.query.code;
  if (!hasAccess(request)) return response.status(401).json({ code: "locked" });
  const names = configuredProviders();
  const entries = await Promise.all(names.map(async name => {
    const startedAt = Date.now();
    try {
      const text = await PROVIDERS[name][1]("Reply with exactly: OK", 256);
      return [name, { ok: true, ms: Date.now() - startedAt, sample: text.slice(0, 20) }];
    } catch (error) {
      return [name, { ok: false, ms: Date.now() - startedAt, code: error.code || "error", message: error.message }];
    }
  }));
  return response.status(200).json({ configured: names, geminiModel: readSetting("GEMINI_MODEL"), groqModel: readSetting("GROQ_MODEL"), results: Object.fromEntries(entries) });
};
