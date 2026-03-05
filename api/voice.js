// api/voice.js — AI voice overview: Claude script + ElevenLabs TTS + Supabase cache
// GET /api/voice?show=rate-watch-daily

const SHOW_CONFIG = {
  "rate-watch-daily":        { voice: "onwK4e9ZLuTAKqWW03F9", name: "Daniel",   color: "#C9A84C" },
  "the-fed-report":          { voice: "pqHfZKP75CvOlQylNhV4", name: "Bill",     color: "#8B5CF6" },
  "housing-market-weekly":   { voice: "SAz9YHcvj6GT2YYXdXww", name: "River",   color: "#10B981" },
  "mortgage-news-now":       { voice: "cjVigY5qzO86Huf0OWal", name: "Eric",    color: "#E74C3C" },
  "credit-score-clinic":     { voice: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice",   color: "#F59E0B" },
  "down-payment-decoded":    { voice: "ZT9u07TYPVl83ejeLakq", name: "Rachelle",color: "#1ABC9C" },
  "the-affordability-index": { voice: "nPczCjzI2devNBz1zQrb", name: "Brian",   color: "#3B82F6" },
  "hmda-deep-dive":          { voice: "JBFqnCBsd6RMkjVDRZzb", name: "George",  color: "#06B6D4" },
};

const SHOW_PROMPTS = {
  "rate-watch-daily": (d) => `You are Daniel, the Rate Watch Daily host on The Equity Network. Deliver a crisp 45-second broadcast-style rate briefing using this live FRED data: 30-year fixed at ${d.r30}%, 15-year fixed at ${d.r15}%, 10-year Treasury at ${d.t10}%, Fed Funds at ${d.ff}%, mortgage-Treasury spread ${d.spread}%, yield curve ${d.yieldCurve}. Interpret what these numbers mean for a loan officer's clients TODAY. Be direct, data-driven, confident. No intro music cues or stage directions.`,
  
  "the-fed-report": (d) => `You are Bill, The Fed Report host on The Equity Network. Deliver a 45-second authoritative monetary policy briefing using live data: Fed Funds rate ${d.ff}%, 10-year Treasury ${d.t10}%, 2-year Treasury ${d.t2}%, 10-year inflation breakeven ${d.inflation_breakeven}%, Fed balance sheet $${d.fed_balance_sheet ? (d.fed_balance_sheet/1e9).toFixed(0) : 'N/A'}B. Analyze what the yield curve shape (${d.t10 && d.t2 ? (d.t10>d.t2?'Normal':'Inverted') : 'check'}) signals for rate direction. Speak to mortgage professionals who need to explain Fed policy to clients. Concise, wise, factual.`,
  
  "housing-market-weekly": (d) => `You are River, Housing Market Weekly host on The Equity Network. Deliver a 45-second market conditions briefing using live FRED data: median home price $${d.median_price ? Math.round(d.median_price/1000) : 'N/A'}K, ${d.months_supply} months of supply, ${d.housing_starts ? (d.housing_starts/1000).toFixed(1) : 'N/A'}K housing starts, ${d.new_home_sales}K new home sales, ${d.existing_home_sales ? (d.existing_home_sales/1e6).toFixed(2) : 'N/A'}M existing home sales, 30-year rate ${d.r30}%. Interpret market conditions — is it a buyer's or seller's market and why? Practical, grounded, useful for real estate professionals.`,
  
  "mortgage-news-now": (d) => `You are Eric, Mortgage News Now host on The Equity Network. Deliver a 45-second industry intelligence briefing using live data: 30-year fixed ${d.r30}%, 15-year fixed ${d.r15}%, credit card delinquency ${d.cc_delinquency}%, mortgage delinquency ${d.mortgage_delinquency}%, 10-year Treasury ${d.t10}%. Interpret the consumer credit stress signals and what they mean for origination conditions and underwriting risk. Sharp, industry-insider tone for mortgage professionals.`,
  
  "credit-score-clinic": (d) => `You are Alice, Credit Score Clinic host on The Equity Network. Deliver a 45-second credit and qualification briefing using live data: credit card delinquency rate ${d.cc_delinquency}%, mortgage delinquency ${d.mortgage_delinquency}%, 30-year rate ${d.r30}%. At today's rate, on a $400K loan, monthly P&I is approximately $${d.r30 ? Math.round(400000*(d.r30/100/12)*Math.pow(1+d.r30/100/12,360)/(Math.pow(1+d.r30/100/12,360)-1)) : 'N/A'}. Explain what today's numbers mean for credit qualification, DTI ratios, and what loan officers should focus on for rate-sensitive buyers. Clear, educational, practical.`,
  
  "down-payment-decoded": (d) => `You are Rachelle, Down Payment Decoded host on The Equity Network. Deliver a 45-second down payment briefing using live data: national median home price $${d.median_price ? Math.round(d.median_price/1000) : 'N/A'}K, 30-year fixed ${d.r30}%, 15-year fixed ${d.r15}%. At today's median price: 3% down = $${d.median_price ? Math.round(d.median_price*0.03/1000) : 'N/A'}K, 20% down = $${d.median_price ? Math.round(d.median_price*0.20/1000) : 'N/A'}K. Monthly P&I at 3% down: ~$${d.median_price && d.r30 ? Math.round(d.median_price*0.97*(d.r30/100/12)*Math.pow(1+d.r30/100/12,360)/(Math.pow(1+d.r30/100/12,360)-1)) : 'N/A'}. Walk buyers through their real options today. Warm, wise, empowering tone.`,
  
  "the-affordability-index": (d) => `You are Brian, The Affordability Index host on The Equity Network. Deliver a 45-second affordability analysis using live data: median home price $${d.median_price ? Math.round(d.median_price/1000) : 'N/A'}K, median household income $${d.median_income ? Math.round(d.median_income/1000) : 'N/A'}K/year, 30-year rate ${d.r30}%, months supply ${d.months_supply}. At 20% down today, monthly P&I is ~$${d.monthly_payment}. The affordability ratio is ${d.affordability_ratio}% of median monthly income. Income needed to qualify: ~$${d.median_price && d.r30 ? Math.round(d.median_price*0.80*(d.r30/100/12)*Math.pow(1+d.r30/100/12,360)/(Math.pow(1+d.r30/100/12,360)-1)*12/0.28/1000) : 'N/A'}K/year. Deliver a real picture of who can afford to buy today and what it would take for affordability to improve. Authoritative, data-first.`,
  
  "hmda-deep-dive": (d) => `You are George, HMDA Deep Dive host on The Equity Network. Deliver a 45-second market intelligence briefing using live lending environment data: 30-year rate ${d.r30}%, mortgage delinquency ${d.mortgage_delinquency}%, credit card delinquency ${d.cc_delinquency}%, median home price $${d.median_price ? Math.round(d.median_price/1000) : 'N/A'}K, housing starts ${d.housing_starts ? (d.housing_starts/1000).toFixed(1) : 'N/A'}K. The Huit.AI APEX platform has 7 years of HMDA data — 14.2 million loan records — available for market intelligence. Explain what the current lending environment means for loan officers analyzing their market position and where the opportunity is. Warm, storytelling tone.`,
};

async function generateScript(show, fredData) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) throw new Error('No ANTHROPIC_API_KEY');
  const prompt = SHOW_PROMPTS[show] ? SHOW_PROMPTS[show](fredData) : `Deliver a 45-second mortgage market briefing using: ${JSON.stringify(fredData)}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'x-api-key':ANTHROPIC_KEY, 'anthropic-version':'2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: 'You are a professional broadcast host. Write ONLY the spoken script. No stage directions, no brackets, no music cues. Just the words to be spoken, in a single paragraph. Keep it under 100 words.',
      messages: [{ role:'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`Claude ${res.status}`);
  const data = await res.json();
  return data.content?.filter(b=>b.type==='text').map(b=>b.text).join('').trim();
}

async function generateAudio(script, voiceId, elKey) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': elKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.42, similarity_boost: 0.78, style: 0.28, use_speaker_boost: true }
    })
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text().then(t=>t.slice(0,200))}`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

async function uploadToSupabase(show, audioBuffer, sbUrl, sbKey) {
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const filename = `equity-network/${show}/${today}.mp3`;
  const res = await fetch(`${sbUrl}/storage/v1/object/${filename}`, {
    method: 'POST',
    headers: { 'Authorization':`Bearer ${sbKey}`, 'Content-Type':'audio/mpeg', 'x-upsert':'true' },
    body: audioBuffer
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase upload ${res.status}: ${txt.slice(0,200)}`);
  }
  return `${sbUrl}/storage/v1/object/public/${filename}`;
}

async function checkSupabaseCache(show, sbUrl, sbKey) {
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const filename = `equity-network/${show}/${today}.mp3`;
  const res = await fetch(`${sbUrl}/storage/v1/object/info/${filename}`, {
    headers: { 'Authorization':`Bearer ${sbKey}` }
  });
  if (res.ok) return `${sbUrl}/storage/v1/object/public/${filename}`;
  return null;
}

async function getFredData(show, baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/fred?show=${show}`);
    if (res.ok) return await res.json();
  } catch(e) {}
  return {};
}

export default async function handler(req, res) {
  const show = req.query.show;
  if (!show || !SHOW_CONFIG[show]) {
    return res.status(400).json({ error: 'Invalid show. Valid: '+Object.keys(SHOW_CONFIG).join(', ') });
  }

  const cfg = SHOW_CONFIG[show];
  const EL_KEY = process.env.ELEVENLABS_API_KEY;
  const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const baseUrl = `https://${req.headers.host}`;

  res.setHeader('Access-Control-Allow-Origin', '*');

  // Check Supabase cache first
  if (SB_URL && SB_KEY) {
    try {
      const cached = await checkSupabaseCache(show, SB_URL, SB_KEY);
      if (cached) {
        return res.status(200).json({ audioUrl: cached, show, voice: cfg.name, cached: true });
      }
    } catch(e) { console.warn('Cache check failed:', e.message); }
  }

  // Fetch live FRED data
  const fredData = await getFredData(show, baseUrl);

  // Generate script with Claude
  let script;
  try {
    script = await generateScript(show, fredData);
  } catch(e) {
    console.error('Script gen failed:', e.message);
    script = `Welcome to ${show.replace(/-/g,' ')} on The Equity Network. Today's live data shows the 30-year fixed rate at ${fredData.r30 || 'current levels'} percent. Stay tuned for comprehensive market analysis powered by Huit dot A I.`;
  }

  // Generate audio with ElevenLabs
  if (!EL_KEY) return res.status(500).json({ error: 'No ElevenLabs key', script });

  let audioBuffer;
  try {
    audioBuffer = await generateAudio(script, cfg.voice, EL_KEY);
  } catch(e) {
    console.error('TTS failed:', e.message);
    return res.status(500).json({ error: 'TTS failed: '+e.message, script });
  }

  // Upload to Supabase
  let audioUrl;
  if (SB_URL && SB_KEY) {
    try {
      audioUrl = await uploadToSupabase(show, audioBuffer, SB_URL, SB_KEY);
    } catch(e) {
      console.warn('Supabase upload failed:', e.message);
      // Fall through to direct serve
    }
  }

  if (audioUrl) {
    return res.status(200).json({ audioUrl, show, voice: cfg.name, script, cached: false });
  }

  // Fallback: serve audio directly
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', audioBuffer.length);
  res.setHeader('Cache-Control', 's-maxage=86400');
  return res.status(200).send(audioBuffer);
}
