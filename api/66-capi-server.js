const crypto = require('crypto'); // Built-in

// Helper to hash with SHA-256
function hashData(data) {
  if (!data) return null;
  return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
}

module.exports = async (req, res) => {
  // Enable CORS: Allow requests from your landing page origin (or '*' for any)
  res.setHeader('Access-Control-Allow-Origin', 'https://clients.thekey.properties'); // Or '*' for testing
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request (required for CORS with fetch)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    console.error('Invalid method:', req.method);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { event_name, user_data = {}, custom_data = {}, pixel_id, test_event_code, event_id } = req.body;
  const access_token = process.env.META_ACCESS_TOKEN;
  const default_pixel_id = process.env.META_PIXEL_ID;

  if (!access_token) {
    console.error('Access token not configured');
    return res.status(500).json({ error: 'Access token not configured' });
  }

  if (!event_name) {
    console.error('Missing event_name in request body');
    return res.status(400).json({ error: 'Missing event_name' });
  }

  const used_pixel_id = pixel_id || default_pixel_id;

  // Get client IP from Vercel headers
  const client_ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;

  // Prepare hashed user data
  const prepared_user_data = {
    client_ip_address: client_ip,
    client_user_agent: hashData(user_data.user_agent),
    fbp: user_data.fbp,
    fbc: user_data.fbc,
  };

  // Prepare the event data array
  const eventData = [
    {
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: req.headers.referer || 'unknown',
      user_data: prepared_user_data,
      custom_data,
      event_id: event_id || undefined, // Forward for deduplication
    },
  ];

  // Build root payload (test_event_code at root level)
  const payload = {
    data: eventData,
  };

  if (test_event_code) {
    payload.test_event_code = test_event_code; // Add at root for test mode
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${used_pixel_id}/events?access_token=${access_token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();
    if (response.ok) {
      console.log('CAPI event sent successfully:', event_name);
      res.status(200).json({ success: true, result });
    } else {
      console.error('Meta API error:', result);
      res.status(response.status).json({ error: result });
    }
  } catch (error) {
    console.error('Function execution error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
