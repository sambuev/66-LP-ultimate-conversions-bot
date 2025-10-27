const crypto = require('crypto'); // Built-in Node module, no install needed

// Helper to hash with SHA-256 (Meta requirement for privacy/compliance in user data)
function hashData(data) {
  if (!data) return null;
  return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    console.error('Invalid method:', req.method); // For Vercel logs
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { event_name, user_data = {}, custom_data = {}, pixel_id } = req.body;
  const access_token = process.env.META_ACCESS_TOKEN;
  const default_pixel_id = process.env.META_PIXEL_ID;

  if (!access_token) {
    console.error('Access token not configured'); // Log for easy debugging
    return res.status(500).json({ error: 'Access token not configured' });
  }

  if (!event_name) {
    console.error('Missing event_name in request body'); // Log for debugging
    return res.status(400).json({ error: 'Missing event_name' });
  }

  const used_pixel_id = pixel_id || default_pixel_id;

  // Get client IP from Vercel headers (for user_data hashing)
  const client_ip = req.headers['x-forwarded-for']?.split(',')[0] || req.connection.remoteAddress;

  // Prepare hashed user data (extendable for email/phone if forms collect them)
  const prepared_user_data = {
    client_ip_address: client_ip,
    client_user_agent: hashData(user_data.user_agent),
    fbp: user_data.fbp, // For event deduplication
    fbc: user_data.fbc,
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${used_pixel_id}/events?access_token=${access_token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: [
            {
              event_name,
              event_time: Math.floor(Date.now() / 1000),
              action_source: 'website',
              event_source_url: req.headers.referer || 'unknown',
              user_data: prepared_user_data,
              custom_data,
            },
          ],
        }),
      }
    );

    const result = await response.json();
    if (response.ok) {
      console.log('CAPI event sent successfully:', event_name); // Success log
      res.status(200).json({ success: true, result });
    } else {
      console.error('Meta API error:', result); // Error log
      res.status(response.status).json({ error: result });
    }
  } catch (error) {
    console.error('Function execution error:', error.message); // Catch-all log
    res.status(500).json({ error: error.message });
  }
};
