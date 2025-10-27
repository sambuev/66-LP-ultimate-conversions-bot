// api/66-capi-server.js
const crypto = require('crypto');

function maybeHash(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

async function getFetch() {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch;
  // Try dynamic require if fetch is not available (older runtimes)
  try {
    // node-fetch v2.x default export
    // If you use node-fetch v3, use: const { default: fetch } = await import('node-fetch');
    // But since Vercel logs complained about node-fetch missing, prefer using global fetch or add node-fetch to dependencies
    const nf = require('node-fetch');
    return nf;
  } catch (err) {
    // No fetch available
    return null;
  }
}

module.exports = async (req, res) => {
// Always set CORS headers at the very top
const allowedOrigin = 'https://clients.thekey.properties';
res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
// IMPORTANT: do NOT include Access-Control-Allow-Credentials if client is NOT sending credentials
// res.setHeader('Access-Control-Allow-Credentials', 'true');  <-- REMOVE or comment out

  if (req.method === 'OPTIONS') {
    // preflight
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'OK' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // From here on, ensure any errors still include CORS headers (we already set them)
  try {
    // Vercel typically parses JSON body and exposes req.body - but ensure body present
    const body = req.body && Object.keys(req.body).length ? req.body : await (async () => {
      // fallback parse if body parser disabled
      let s = '';
      for await (const chunk of req) s += chunk;
      try { return JSON.parse(s || '{}'); } catch (e) { return {}; }
    })();

    console.log('Incoming request body:', body);

    const { event_name, user_data = {}, custom_data = {}, pixel_id, test_event_code, event_id } = body;
    const access_token = process.env.META_ACCESS_TOKEN;
    const default_pixel_id = process.env.META_PIXEL_ID;

    if (!access_token) {
      console.error('Access token not configured (META_ACCESS_TOKEN)');
      return res.status(500).json({ error: 'Access token not configured' });
    }
    if (!event_name) {
      return res.status(400).json({ error: 'Missing event_name' });
    }

    const client_ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection?.remoteAddress || '';

    const prepared_user_data = {
      client_ip_address: client_ip,
      client_user_agent: user_data.user_agent || '',
      fbp: user_data.fbp || undefined,
      fbc: user_data.fbc || undefined,
      // If you receive email/phone and want to include, uncomment and send hashed values:
      // em: maybeHash(user_data.email),
      // ph: maybeHash(user_data.phone),
    };

    const eventData = [{
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: req.headers.referer || 'unknown',
      user_data: prepared_user_data,
      custom_data,
      event_id: event_id || undefined
    }];

    const payload = { data: eventData };
    if (test_event_code) payload.test_event_code = test_event_code;

    const fetchFn = await getFetch();
    if (!fetchFn) {
      console.error('No fetch() available in runtime and node-fetch not installed.');
      return res.status(500).json({ error: 'Server missing fetch implementation' });
    }

    const usedPixel = pixel_id || default_pixel_id;
    const fbResp = await fetchFn(`https://graph.facebook.com/v20.0/${usedPixel}/events?access_token=${access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await fbResp.json();

    if (fbResp.ok) {
      console.log('CAPI event forwarded:', event_name, { result });
      return res.status(200).json({ success: true, result });
    } else {
      console.error('Meta API returned error:', result);
      // still return error body to client for debugging
      return res.status(fbResp.status || 500).json({ error: result });
    }
  } catch (err) {
    console.error('Server function error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
};
