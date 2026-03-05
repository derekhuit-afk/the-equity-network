// api/voice.js — AI voice overview: Claude script + ElevenLabs TTS + Supabase cache
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

function fmtRate(v){ return v ? v.toFixed(2)+'%' : 'unavailable'; }
function fmtPrice(v){ return v ? '$'+Math.round(v/1000)+'K' : 'unavailable'; }
function fmtIncome(v){ return v ? '$'+Math.round(v/1000)+'K' : 'unavailable'; }
function fmtB(v){ return v ? '$'+(v/1e9).toFixed(0)+'B' : 'unavailable'; }
function fmtK(v){ return v ? Math.round(v)+'K' : 'unavailable'; }
function fmtMo(v){ return v ? v.toFixed(1)+' months' : 'unavailable'; }
function fmtM(v){ return v ? (v/1e6).toFixed(2)+'M' : 'unavailable'; }
function fmtPmt(price, rate){
  if(!price||!rate) return 'unavailable';
  var mr=rate/100/12, n=360;
  return '$'+Math.round(price*(mr*Math.pow(1+mr,n))/(Math.pow(1+mr,n)-1)).toLocaleString();
}
function yieldCurve(t10, t2){
  if(!t10||!t2) return 'indeterminate';
  var sp=(t10-t2).toFixed(2);
  return t10>t2 ? 'normal, with a '+sp+'% spread' : 'inverted by '+Math.abs(sp)+'%';
}
function mktCondition(sup){
  if(!sup) return 'conditions unclear';
  if(sup<3) return 'a hot seller\'s market';
  if(sup<5) return 'a seller\'s market';
  if(sup<7) return 'a balanced market';
  return 'a buyer\'s market';
}
function affordRatio(price, rate, income){
  if(!price||!rate||!income) return null;
  var mr=rate/100/12, n=360;
  var pmt=price*0.80*(mr*Math.pow(1+mr,n))/(Math.pow(1+mr,n)-1);
  return (pmt/(income/12)*100).toFixed(1);
}
function incomeNeeded(price, rate){
  if(!price||!rate) return 'unavailable';
  var mr=rate/100/12, n=360;
  var pmt=price*0.80*(mr*Math.pow(1+mr,n))/(Math.pow(1+mr,n)-1);
  return '$'+Math.round(pmt*12/0.28/1000)+'K';
}

const SHOW_PROMPTS = {
  "rate-watch-daily": (d) => {
    var spread = d.r30&&d.t10 ? (d.r30-d.t10).toFixed(2)+'%' : 'unavailable';
    var spreadNote = d.r30&&d.t10 ? (d.r30-d.t10 > 2 ? ', which is elevated above the historical norm of 150 to 200 basis points' : ', within the historical range') : '';
    return `Write a 45-second broadcast-style rate briefing for loan officers. Exactly 115 words. Cover all of this data: The 30-year fixed is at ${fmtRate(d.r30)}, the 15-year at ${fmtRate(d.r15)}, the 10-year Treasury at ${fmtRate(d.t10)}, and the Fed Funds rate at ${fmtRate(d.ff)}. The mortgage-to-Treasury spread is ${spread}${spreadNote}. The yield curve is ${yieldCurve(d.t10,d.t2)}. Structure: open with the headline rate number, explain what is driving it, interpret the spread and yield curve, then close with one actionable takeaway for a loan officer advising clients today. Confident broadcast voice. No stage directions. No lists. Flowing spoken prose only.`;
  },

  "the-fed-report": (d) => {
    var curve = yieldCurve(d.t10, d.t2);
    var bsB = d.fed_balance_sheet ? (d.fed_balance_sheet/1e9).toFixed(0) : null;
    return `Write a 45-second authoritative monetary policy briefing for mortgage professionals. Exactly 115 words. Use this data: Fed Funds rate ${fmtRate(d.ff)}, 10-year Treasury ${fmtRate(d.t10)}, 2-year Treasury ${fmtRate(d.t2)}, 10-year inflation breakeven ${d.inflation_breakeven ? d.inflation_breakeven.toFixed(2)+'%' : 'unavailable'}, Fed balance sheet ${bsB ? '$'+bsB+'B' : 'unavailable'}. Yield curve is ${curve}. Structure: open with the Fed's current policy stance, explain what the inflation breakeven signals about rate direction, interpret the yield curve shape, then close with what this means for where mortgage rates are headed and how a loan officer should frame this for rate-anxious clients. Wise and authoritative tone. No stage directions. Flowing spoken prose only.`;
  },

  "housing-market-weekly": (d) => {
    var cond = mktCondition(d.months_supply);
    return `Write a 45-second housing market conditions briefing for real estate and mortgage professionals. Exactly 115 words. Use this live FRED data: median home price ${fmtPrice(d.median_price)}, months of supply ${fmtMo(d.months_supply)}, housing starts ${fmtK(d.housing_starts)} annualized, new home sales ${d.new_home_sales ? d.new_home_sales+'K' : 'unavailable'} annualized, existing home sales ${fmtM(d.existing_home_sales)} annualized, 30-year fixed rate ${fmtRate(d.r30)}. Right now it is ${cond}. Structure: open with the market condition verdict and the supply number that drives it, then move through price, sales activity, and construction, close with what this means for a buyer or a listing agent working deals right now. Grounded, practical tone. No stage directions. Flowing spoken prose only.`;
  },

  "mortgage-news-now": (d) => {
    var env = !d.r30 ? 'uncertain' : d.r30>=7 ? 'restrictive' : d.r30>=6.5 ? 'elevated' : d.r30>=6 ? 'moderately elevated' : 'relatively accommodative';
    return `Write a 45-second industry intelligence briefing for mortgage professionals. Exactly 115 words. Use this data: 30-year fixed ${fmtRate(d.r30)}, 15-year fixed ${fmtRate(d.r15)}, 10-year Treasury ${fmtRate(d.t10)}, Fed Funds ${fmtRate(d.ff)}, credit card delinquency rate ${d.cc_delinquency ? d.cc_delinquency.toFixed(2)+'%' : 'unavailable'}, mortgage delinquency rate ${d.mortgage_delinquency ? d.mortgage_delinquency.toFixed(2)+'%' : 'unavailable'}. The current rate environment is ${env} for origination. Structure: open with the rate environment and benchmark levels, move to what the delinquency data says about consumer credit stress and underwriting risk, close with one implication for pipeline strategy or lender relationships right now. Sharp insider tone. No stage directions. Flowing spoken prose only.`;
  },

  "credit-score-clinic": (d) => {
    var pmt400 = fmtPmt(400000, d.r30);
    var dtiFront = d.r30 ? '$'+Math.round(400000*(d.r30/100/12)*Math.pow(1+d.r30/100/12,360)/(Math.pow(1+d.r30/100/12,360)-1)*12/0.28/1000)+'K annual' : 'unavailable';
    return `Write a 45-second credit and qualification briefing for loan officers and buyers. Exactly 115 words. Use this data: credit card delinquency ${d.cc_delinquency ? d.cc_delinquency.toFixed(2)+'%' : 'unavailable'}, mortgage delinquency ${d.mortgage_delinquency ? d.mortgage_delinquency.toFixed(2)+'%' : 'unavailable'}, 30-year rate ${fmtRate(d.r30)}. At today's rate, the monthly principal and interest on a $400,000 loan is ${pmt400}, requiring approximately ${dtiFront} income to meet a 28% front-end DTI. Structure: open with what the delinquency data reveals about credit health nationally, explain how today's rate amplifies DTI stress, walk through the income qualification math, close with the one credit variable loan officers should focus on to move borderline borrowers to approval. Clear educator tone. No stage directions. Flowing spoken prose only.`;
  },

  "down-payment-decoded": (d) => {
    var dp3 = d.median_price ? '$'+Math.round(d.median_price*0.03/1000)+'K' : 'unavailable';
    var dp35 = d.median_price ? '$'+Math.round(d.median_price*0.035/1000)+'K' : 'unavailable';
    var dp20 = d.median_price ? '$'+Math.round(d.median_price*0.20/1000)+'K' : 'unavailable';
    var pmt3 = fmtPmt(d.median_price ? d.median_price*0.97 : null, d.r30);
    var pmt20 = fmtPmt(d.median_price ? d.median_price*0.80 : null, d.r30);
    return `Write a 45-second down payment strategy briefing for first-time buyers and loan officers. Exactly 115 words. Use this live data: national median home price ${fmtPrice(d.median_price)}, 30-year rate ${fmtRate(d.r30)}. At the median price: 3% conventional down is ${dp3} with a monthly payment of ${pmt3}; FHA 3.5% down is ${dp35}; 20% down is ${dp20} with a payment of ${pmt20}. Structure: open with the real cost of entry at today's median price, compare the 3% and 20% down scenarios including the payment difference, explain the PMI trade-off and when each makes sense, close with one piece of guidance for a buyer trying to decide right now. Warm and empowering tone. No stage directions. Flowing spoken prose only.`;
  },

  "the-affordability-index": (d) => {
    var ratio = affordRatio(d.median_price, d.r30, d.median_income);
    var incReq = incomeNeeded(d.median_price, d.r30);
    var verdict = !ratio ? 'unclear' : parseFloat(ratio)<28 ? 'technically affordable at the national median' : parseFloat(ratio)<35 ? 'stretched for the median household' : 'out of reach for the median household';
    return `Write a 45-second housing affordability analysis for mortgage professionals and market watchers. Exactly 115 words. Use this data: median home price ${fmtPrice(d.median_price)}, 30-year rate ${fmtRate(d.r30)}, median household income ${fmtIncome(d.median_income)}, months of supply ${fmtMo(d.months_supply)}. At 20% down, monthly P and I is ${fmtPmt(d.median_price ? d.median_price*0.80 : null, d.r30)}. The housing payment as a share of median monthly income is ${ratio ? ratio+'%' : 'unavailable'}. To qualify at a 28% front-end DTI, a buyer needs ${incReq} annual income. Right now homeownership is ${verdict}. Structure: open with the affordability verdict, walk through the income math, explain what would need to change for affordability to meaningfully improve, close with the implication for who is actually buying right now. Authoritative data-first tone. No stage directions. Flowing spoken prose only.`;
  },

  "hmda-deep-dive": (d) => {
    var env = !d.r30 ? 'uncertain' : d.r30>=7 ? 'highly restrictive' : d.r30>=6 ? 'elevated' : 'moderate';
    return `Write a 45-second mortgage market intelligence briefing for loan officers and branch managers. Exactly 115 words. Use this data: 30-year rate ${fmtRate(d.r30)}, mortgage delinquency rate ${d.mortgage_delinquency ? d.mortgage_delinquency.toFixed(2)+'%' : 'unavailable'}, credit card delinquency ${d.cc_delinquency ? d.cc_delinquency.toFixed(2)+'%' : 'unavailable'}, median home price ${fmtPrice(d.median_price)}, housing starts ${fmtK(d.housing_starts)} annualized. The current lending environment is ${env}. The Huit AI APEX platform holds 7 years of HMDA federal data — 14.2 million loan records — covering denial rates, lender market share, origination trends, and rate spread data by county, lender, and loan type. Structure: open with the current lending environment reading, connect the delinquency and rate signals, explain what HMDA data reveals about where market share is shifting, close with the one intelligence angle that would move the needle for a loan officer growing their business right now. Warm storytelling tone with authority. No stage directions. Flowing spoken prose only.`;
  },
};

async function generateScript(show, fredData) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) throw new Error('No ANTHROPIC_API_KEY');

  const promptFn = SHOW_PROMPTS[show];
  if (!promptFn) throw new Error('No prompt for show: '+show);
  const userPrompt = promptFn(fredData);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: 'You are a professional broadcast host writer. Write ONLY the spoken script text — no stage directions, no brackets, no music cues, no labels, no preamble. Output a single paragraph of flowing spoken prose. Hit the word count target precisely.',
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!res.ok) throw new Error('Claude '+res.status);
  const data = await res.json();
  return data.content?.filter(b => b.type === 'text').map(b => b.text).join('').trim();
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
  if (!res.ok) throw new Error('ElevenLabs '+res.status+': '+(await res.text()).slice(0,200));
  return Buffer.from(await res.arrayBuffer());
}

async function uploadToSupabase(show, buf, sbUrl, sbKey) {
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const filename = `equity-network/${show}/${today}.mp3`;
  const res = await fetch(`${sbUrl}/storage/v1/object/${filename}`, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer '+sbKey, 'Content-Type': 'audio/mpeg', 'x-upsert': 'true' },
    body: buf
  });
  if (!res.ok) throw new Error('Supabase '+res.status+': '+(await res.text()).slice(0,200));
  return `${sbUrl}/storage/v1/object/public/${filename}`;
}

async function checkCache(show, sbUrl, sbKey) {
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const filename = `equity-network/${show}/${today}.mp3`;
  const res = await fetch(`${sbUrl}/storage/v1/object/info/${filename}`, {
    headers: { 'Authorization': 'Bearer '+sbKey }
  });
  if (res.ok) return `${sbUrl}/storage/v1/object/public/${filename}`;
  return null;
}

async function getFredData(show, host) {
  try {
    const r = await fetch(`https://${host}/api/fred?show=${show}`);
    if (r.ok) return await r.json();
  } catch(e) {}
  return {};
}

export default async function handler(req, res) {
  const show = req.query.show;
  if (!show || !SHOW_CONFIG[show]) {
    return res.status(400).json({ error: 'Invalid show. Valid: '+Object.keys(SHOW_CONFIG).join(', ') });
  }

  const cfg    = SHOW_CONFIG[show];
  const EL_KEY = process.env.ELEVENLABS_API_KEY;
  const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  res.setHeader('Access-Control-Allow-Origin', '*');

  // Check Supabase cache
  if (SB_URL && SB_KEY) {
    try {
      const cached = await checkCache(show, SB_URL, SB_KEY);
      if (cached) return res.status(200).json({ audioUrl: cached, show, voice: cfg.name, cached: true });
    } catch(e) { console.warn('Cache check:', e.message); }
  }

  // Fetch live FRED data
  const fred = await getFredData(show, req.headers.host);

  // Generate script
  let script;
  try {
    script = await generateScript(show, fred);
  } catch(e) {
    console.error('Script gen:', e.message);
    script = `Welcome to The Equity Network. The 30-year fixed rate is currently at ${fred.r30 ? fred.r30.toFixed(2) : 'current levels'} percent. Stay tuned for comprehensive mortgage and housing intelligence powered by Huit dot A I.`;
  }

  if (!EL_KEY) return res.status(500).json({ error: 'No ElevenLabs key', script });

  // Generate audio
  let buf;
  try {
    buf = await generateAudio(script, cfg.voice, EL_KEY);
  } catch(e) {
    return res.status(500).json({ error: 'TTS failed: '+e.message, script });
  }

  // Upload to Supabase
  if (SB_URL && SB_KEY) {
    try {
      const url = await uploadToSupabase(show, buf, SB_URL, SB_KEY);
      return res.status(200).json({ audioUrl: url, show, voice: cfg.name, script, cached: false });
    } catch(e) { console.warn('Supabase upload:', e.message); }
  }

  // Serve binary directly
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', buf.length);
  res.setHeader('Cache-Control', 's-maxage=86400');
  return res.status(200).send(buf);
}
