const https = require('https');
const http  = require('http');
const url   = require('url');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  clientId:     process.env.SAP_CLIENT_ID,
  clientSecret: process.env.SAP_CLIENT_SECRET,
  tokenUrl:     process.env.SAP_TOKEN_URL,
  apiUrl:       process.env.SAP_API_URL,
  port:         process.env.PORT || 3000,
  allowedOrigin: process.env.ALLOWED_ORIGIN || '*',
};

// ─── TOKEN CACHE ────────────────────────────────────────────────────────────
let tokenCache = { token: null, expiresAt: 0 };

async function getToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 60000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CONFIG.clientId,
    client_secret: CONFIG.clientSecret,
  }).toString();

  const res = await httpRequest(CONFIG.tokenUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  }, body);

  let parsed;
  try { parsed = JSON.parse(res.body); }
  catch { throw new Error('Resposta inesperada do tokenUrl: ' + res.body.slice(0, 200)); }

  if (!parsed.access_token) throw new Error('Token não retornado: ' + res.body.slice(0, 200));

  tokenCache.token     = parsed.access_token;
  tokenCache.expiresAt = Date.now() + (parsed.expires_in || 3600) * 1000;
  return tokenCache.token;
}

// ─── HTTP HELPER ────────────────────────────────────────────────────────────
function httpRequest(targetUrl, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed  = new url.URL(targetUrl);
    const lib     = parsed.protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method || 'GET',
      headers:  options.headers || {},
    };

    if (body) {
      reqOpts.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = lib.request(reqOpts, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({ statusCode: res.statusCode, body: raw, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ─── CORS HEADERS ───────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  CONFIG.allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ─── BODY PARSER ────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolve(JSON.parse(raw)); }
      catch { reject(new Error('JSON inválido no body da requisição')); }
    });
    req.on('error', reject);
  });
}

// ─── SERVER ─────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  setCors(res);

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', ts: new Date().toISOString() }));
    return;
  }

  // Cadastrar BP
  if (req.method === 'POST' && req.url === '/cadastrar-bp') {
    try {
      const payload = await readBody(req);

      // Validação mínima
      if (!payload.cnpj_cpf) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'cnpj_cpf é obrigatório' }));
        return;
      }
      if (!payload.full_name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'full_name é obrigatório' }));
        return;
      }

      // Busca token (usa cache se válido)
      const token = await getToken();

      // Chama SAP
      const sapBody = JSON.stringify(payload);
      const sapRes  = await httpRequest(CONFIG.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + token,
          'Accept':        'application/json',
        },
      }, sapBody);

      // Log completo da resposta SAP para debug
      console.log('[SAP] HTTP', sapRes.statusCode, '| body:', sapRes.body.slice(0, 500));

      // Tenta parse JSON — se falhar, devolve raw para o frontend
      let sapData;
      try {
        sapData = JSON.parse(sapRes.body);
      } catch {
        sapData = { raw: sapRes.body, statusCode: sapRes.statusCode };
      }

      res.writeHead(sapRes.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sapData));

    } catch (err) {
      console.error('[ERRO]', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Rota não encontrada' }));
});

server.listen(CONFIG.port, () => {
  console.log(`[BP Backend] Rodando na porta ${CONFIG.port}`);
  console.log(`[BP Backend] SAP API: ${CONFIG.apiUrl}`);
});
