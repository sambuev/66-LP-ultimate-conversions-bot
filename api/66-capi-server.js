// api/66-capi-server.js
// Place this file in your Vercel project at: api/66-capi-server.js

import crypto from 'crypto';

// Helper to hash with SHA-256
function hashData(data) {
  if (!data) return null;
  return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
}

export default async function handler(req, res) {
  const allowedOrigin = 'https://clients.thekey.properties';
  
  // Set CORS headers - allows requests from your domain
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const {
    event_name,
    user_data = {},
    custom_data = {},
    pixel_id,
    test_event_code,
    event_id
  } = req.body;

  const access_token = process.env.META_ACCESS_TOKEN;
  const default_pixel_id = process.env.META_PIXEL_ID;

  // Validation
  if (!access_token) {
    console.error('❌ META_ACCESS_TOKEN not configured');
    return res.status(500).json({ error: 'Access token not configured' });
  }
  
  if (!default_pixel_id && !pixel_id) {
    console.error('❌ META_PIXEL_ID not configured');
    return res.status(500).json({ error: 'Pixel ID not configured' });
  }
  
  if (!event_name) {
    console.error('❌ Missing event_name');
    return res.status(400).json({ error: 'Missing event_name' });
  }

  const used_pixel_id = pixel_id || default_pixel_id;
  
  // Get client IP
  const client_ip = req.headers['x-forwarded-for']?.split(',')[0] || 
                    req.headers['x-real-ip'] ||
                    req.socket.remoteAddress;

  // Prepare user data - send raw user_agent (don't hash)
  const prepared_user_data = {
    client_ip_address: client_ip,
    client_user_agent: user_data.user_agent || req.headers['user-agent'],
    fbp: user_data.fbp || undefined,
    fbc: user_data.fbc || undefined
  };

  // Remove undefined values
  Object.keys(prepared_user_data).forEach(key => {
    if (prepared_user_data[key] === undefined) {
      delete prepared_user_data[key];
    }
  });

  const eventData = [{
    event_name,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    event_source_url: req.headers.referer || custom_data.url || 'unknown',
    user_data: prepared_user_data,
    custom_data,
    event_id: event_id || `${event_name}-${Date.now()}-${Math.random()}`
  }];

  const payload = { data: eventData };
  if (test_event_code) {
    payload.test_event_code = test_event_code;
  }

  // Debug logging
  console.log('📤 Sending to Meta CAPI:', {
    event_name,
    pixel_id: used_pixel_id,
    has_fbp: !!user_data.fbp,
    has_fbc: !!user_data.fbc,
    client_ip,
    test_mode: !!test_event_code,
    event_id: eventData[0].event_id
  });

  try {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/${used_pixel_id}/events?access_token=${access_token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    if (response.ok) {
      console.log('✅ CAPI event sent successfully:', {
        event_name,
        events_received: result.events_received,
        messages: result.messages
      });
      
      return res.status(200).json({ 
        success: true, 
        result,
        debug: {
          event_name,
          pixel_id: used_pixel_id,
          had_fbp: !!user_data.fbp,
          had_fbc: !!user_data.fbc
        }
      });
    } else {
      console.error('❌ Meta API error:', {
        status: response.status,
        error: result.error,
        messages: result.messages
      });
      
      return res.status(response.status).json({ 
        error: result,
        debug: {
          pixel_id: used_pixel_id,
          event_name,
          test_mode: !!test_event_code
        }
      });
    }
  } catch (err) {
    console.error('❌ Function execution error:', err.message);
    return res.status(500).json({ 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}
