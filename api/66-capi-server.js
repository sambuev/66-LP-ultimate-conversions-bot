// api/66-capi-server.js
const fetch = require('node-fetch'); // if runtime provides fetch, you can remove this import
const crypto = require('crypto');

function maybeHash(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

module.exports = async (req, res) => {
  // Allow your landing page origin for CORS (no credentials)
  const allowedOrigin = 'https://clients.thekey.properties';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method === 'GET') {
    return res.status(200).json({ status: 'OK' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = req.body || {};
    // If using Vercel with bodyParser disabled, ensure you parse JSON:
    // const body = JSON.parse(await new Promise(r => { let s=''; req.on('data',d=>s+=d); req.on('end',()=>r(s)); }));

    const { event_name, user_data = {}, custom_data = {}, pixel_id, test_event_code, event_id } = body;
    const access_token = process.env.META_ACCESS_TOKEN;
    const default_pixel_id = process.env.META_PIXEL_ID;

    if (!access_token) {
      console.error('Access token not configured');
      return res.status(500).json({ error: 'Access token not configured' });
    }
    if (!event_name) {
      return res.status(400).json({ error: 'Missing event_name' });
    }

    const client_ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress || '';

    // Prepare user_data for Meta: DO NOT hash user_agent here (Meta expects raw UA)
    const prepared_user_data = {
      client_ip_address: client_ip,
      client_user_agent: user_data.user_agent || '',
      fbp: user_data.fbp || undefined,
      fbc: user_data.fbc || undefined,
      // If you receive PII like email/phone and want to include, hash them:
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

    // Forward to Meta Conversions API
    const usedPixel = pixel_id || default_pixel_id;
    const fbResponse = await fetch(`https://graph.facebook.com/v20.0/${usedPixel}/events?access_token=${access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await fbResponse.json();

    if (fbResponse.ok) {
      console.log('CAPI event sent:', event_name, { result });
      return res.status(200).json({ success: true, result });
    } else {
      console.error('Meta API error:', result);
      return res.status(fbResponse.status || 500).json({ error: result });
    }
  } catch (err) {
    console.error('Server function error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
};
