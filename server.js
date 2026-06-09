const https = require('https');
const http  = require('http');
const url   = require('url');

const CONFIG = {
  clientId:      process.env.SAP_CLIENT_ID,
  clientSecret:  process.env.SAP_CLIENT_SECRET,
  tokenUrl:      process.env.SAP_TOKEN_URL,
  apiUrl:        process.env.SAP_API_URL,
  port:          process.env.PORT || 3000,
  allowedOrigin: process.env.ALLOWED_ORIGIN || '*',
};

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

  console.log('[TOKEN] HTTP', res.statusCode, '| body:', res.body.slice(0, 300));

  let parsed;
  try { parsed = JSON.parse(res.body); }
  catch { throw new Error('Resposta inesperada do tokenUrl: ' + res.body.slice(0, 300)); }

  if (!parsed.access_token) throw new Error('Token não retornado: ' + res.body.slice(0, 300));

  tokenCache.token     = parsed.access_token;
  tokenCache.expiresAt = Date.now() + (parsed.expires_in || 3600) * 1000;
  console.log('[TOKEN] obtido, expira em', parsed.expires_in, 's');
  return tokenCache.token;
}

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
    if (body) reqOpts.headers['Content-Length'] = Buffer.byteLength(body);

    const req = lib.request(reqOpts, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
        headers: res.headers,
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  CONFIG.allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', ts: new Date().toISOString() }));
    return;
  }

  if (req.method === 'POST' && req.url === '/cadastrar-bp') {
    try {
      // Lê body como string bruta primeiro
      const rawBody = await readRawBody(req);
      console.log('[REQ] body bruto recebido (primeiros 300 chars):', rawBody.slice(0, 300));
      console.log('[REQ] tipo do body:', typeof rawBody);

      // Parse seguro
      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch(e) {
        console.error('[REQ] falha ao parsear body:', e.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Body inválido: ' + e.message, raw: rawBody.slice(0, 200) }));
        return;
      }

      console.log('[REQ] payload parseado — cnpj_cpf:', payload.cnpj_cpf, '| full_name:', payload.full_name);

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

      const token   = await getToken();
      const sapBody = JSON.stringify(payload);
      console.log('[SAP] enviando payload:', sapBody.slice(0, 300));

      const sapRes = await httpRequest(CONFIG.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': 'Bearer ' + token,
          'Accept':        'application/json',
        },
      }, sapBody);

      console.log('[SAP] HTTP', sapRes.statusCode);
      console.log('[SAP] headers:', JSON.stringify(sapRes.headers));
      console.log('[SAP] body completo:', sapRes.body);

      let sapData;
      try { sapData = JSON.parse(sapRes.body); }
      catch { sapData = { raw: sapRes.body, statusCode: sapRes.statusCode }; }

      res.writeHead(sapRes.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(sapData));

    } catch (err) {
      console.error('[ERRO]', err.message);
      console.error('[STACK]', err.stack);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Rota não encontrada' }));
});

server.listen(CONFIG.port, () => {
  console.log('[BP Backend] porta', CONFIG.port);
  console.log('[BP Backend] SAP API:', CONFIG.apiUrl);
});
