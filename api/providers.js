// GET /api/providers → 접속 코드가 맞으면 {providers(키 설정됨), catalog(표시 정보)}, 아니면 {locked:true}
const { CATALOG, configuredProviders, hasAccess } = require("../lib/providers");

module.exports = (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  if (!hasAccess(request)) return response.status(200).json({ providers: [], locked: true });
  return response.status(200).json({ providers: configuredProviders(), catalog: CATALOG, locked: false });
};
