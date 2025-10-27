const crypto = require('crypto');
const fetch = require('node-fetch'); // make sure node-fetch is installed

function hashData(data) {
  if (!data) return null;
  return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
}

module.exports = async (req, res) => {
  const allowedOrigin = 'https://clients.thekey.properties';

  // --- CORS headers ---
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  // do NOT include Access-Control-Allow-Credentials

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { event_name, user_data = {}, custom_data = {}, pixel_id, test_event_code, event_id } = req.body;
    const access_token = process.env.META_ACCESS_TOKEN;
    const default_pixel_id = process.env.META_PIXEL_ID;

    if (!access_token) return res.status(500).json({ error: 'Access token not configured' });
    if (!event_name) return res.status(400).json({ error: 'Missing event_name' });

    const used_pixel_id = pixel_id || default_pixel_id;

    // Get client IP
    const client_ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;

    // Prepare hashed user data
    const prepared_user_data = {
      client_ip_address: client_ip,
      client_user_agent: hashData(user_data.user_agent || ''),
      fbp: user_data.fbp,
      fbc: user_data.fbc,
    };

    const eventData = [{
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: req.headers.referer || 'unknown',
      user_data: prepared_user_data,
      custom_data,
      event_id: event_id || undefined,
    }];

    const payload = { data: eventData };
    if (test_event_code) payload.test_event_code = test_event_code;

    const fbResponse = await fetch(
      `https://graph.facebook.com/v20.0/${used_pixel_id}/events?access_token=${access_token}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );

    const result = await fbResponse.json();
    if (fbResponse.ok) {
      console.log('CAPI event sent successfully:', event_name);
      return res.status(200).json({ success: true, result });
    } else {
      console.error('Meta API error:', result);
      return res.status(fbResponse.status).json({ error: result });
    }

  } catch (err) {
    console.error('Function execution error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
