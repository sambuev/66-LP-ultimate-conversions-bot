const fetch = require('node-fetch');
const crypto = require('crypto');

// Helper to hash with SHA-256 (Meta requirement for user data)
function hashData(data) {
  if (!data) return null;
  return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { event_name, user_data = {}, custom_data = {}, pixel_id } = req.body;
  const access_token = process.env.META_ACCESS_TOKEN;
  const default_pixel_id = process.env.META_PIXEL_ID;

  if (!access_token) {
    return res.status(500).json({ error: 'Access token not configured' });
  }

  const used_pixel_id = pixel_id || default_pixel_id;

  // Get client IP from Vercel headers (for user_data)
  const client_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  // Prepare hashed user data (add more if you collect email/phone in future)
  const prepared_user_data = {
    client_ip_address: client_ip,
    client_user_agent: hashData(user_data.user_agent),
    // fbp/fbc: Pass from client if available for dedup
    fbp: user_data.fbp,
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
      res.status(200).json({ success: true, result });
    } else {
      res.status(response.status).json({ error: result });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
