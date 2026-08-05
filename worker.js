// CreditFlow Cloud Sync — Cloudflare Worker
// Paste this whole file into a Cloudflare Worker. Bind a KV namespace as CREDITFLOW_KV
// and set an environment variable SYNC_SECRET to your chosen passphrase.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-sync-key',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    const url = new URL(request.url);
    const key = request.headers.get('x-sync-key') || '';
    if (!env.SYNC_SECRET || key !== env.SYNC_SECRET) {
      return json({ error: 'unauthorised' }, 401);
    }

    if (url.pathname === '/ping') {
      return json({ ok: true, service: 'creditflow-sync' });
    }

    if (url.pathname === '/data' && request.method === 'GET') {
      const snap = await env.CREDITFLOW_KV.get('snapshot');
      return new Response(snap || 'null', { headers: { 'content-type': 'application/json', ...CORS } });
    }

    if (url.pathname === '/data' && request.method === 'PUT') {
      const body = await request.text();
      if (!body || body.length > 20 * 1024 * 1024) return json({ error: 'bad payload' }, 400);
      // sanity: must be JSON with _savedAt
      let parsed;
      try { parsed = JSON.parse(body); } catch (e) { return json({ error: 'not json' }, 400); }
      if (!parsed || !parsed._savedAt) return json({ error: 'missing _savedAt' }, 400);

      await env.CREDITFLOW_KV.put('snapshot', body);

      // One immutable backup per day, kept 60 days — "never gets deleted" safety net
      const day = new Date().toISOString().slice(0, 10);
      const existing = await env.CREDITFLOW_KV.get('backup:' + day);
      if (!existing) {
        await env.CREDITFLOW_KV.put('backup:' + day, body, { expirationTtl: 60 * 86400 });
      }
      return json({ ok: true, savedAt: parsed._savedAt });
    }

    if (url.pathname === '/backups' && request.method === 'GET') {
      const list = await env.CREDITFLOW_KV.list({ prefix: 'backup:' });
      return json({ backups: list.keys.map(k => k.name.replace('backup:', '')) });
    }

    if (url.pathname === '/restore' && request.method === 'GET') {
      const day = url.searchParams.get('day');
      if (!day) return json({ error: 'missing day' }, 400);
      const snap = await env.CREDITFLOW_KV.get('backup:' + day);
      return new Response(snap || 'null', { headers: { 'content-type': 'application/json', ...CORS } });
    }

    return json({ error: 'not found' }, 404);
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });
}
