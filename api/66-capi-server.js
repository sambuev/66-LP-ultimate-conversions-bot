// File: /api/66-capi-server.js
import crypto from 'crypto';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*'); // no credentials
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if(req.method === 'OPTIONS') return res.status(200).end();
  if(req.method !== 'POST') return res.status(405).json({error:'Method Not Allowed'});

  const { event_name, user_data = {}, custom_data = {}, pixel_id, test_event_code, event_id } = req.body;
  const access_token = process.env.META_ACCESS_TOKEN;
  const default_pixel_id = process.env.META_PIXEL_ID;

  if(!access_token) return res.status(500).json({error:'Access token not configured'});
  if(!event_name) return res.status(400).json({error:'Missing event_name'});

  const used_pixel_id = pixel_id || default_pixel_id;

  const client_ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const prepared_user_data = {
    client_ip_address: client_ip,
    client_user_agent: crypto.createHash('sha256').update(user_data.user_agent||'').digest('hex')
  };

  const eventData = [{
    event_name,
    event_time: Math.floor(Date.now()/1000),
    action_source: 'website',
    event_source_url: req.headers.referer || 'unknown',
    user_data: prepared_user_data,
    custom_data,
    event_id: event_id || undefined
  }];

  const payload = { data: eventData };
  if(test_event_code) payload.test_event_code = test_event_code;

  try {
    const response = await fetch(`https://graph.facebook.com/v20.0/${used_pixel_id}/events?access_token=${access_token}`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if(response.ok) return res.status(200).json({success:true, result});
    else return res.status(response.status).json({error: result});
  } catch(err) {
    return res.status(500).json({error: err.message});
  }
}
