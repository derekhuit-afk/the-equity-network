// api/voice.js — AI voice overview: Claude script + ElevenLabs TTS + Supabase cache
// Target: ~180 words = ~45 seconds at ElevenLabs turbo v2.5 pace

const SHOW_CONFIG = {
  "rate-watch-daily":        { voice: "onwK4e9ZLuTAKqWW03F9", name: "Daniel"  },
  "the-fed-report":          { voice: "pqHfZKP75CvOlQylNhV4", name: "Bill"    },
  "housing-market-weekly":   { voice: "SAz9YHcvj6GT2YYXdXww", name: "River"   },
  "mortgage-news-now":       { voice: "cjVigY5qzO86Huf0OWal", name: "Eric"    },
  "credit-score-clinic":     { voice: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice"   },
  "down-payment-decoded":    { voice: "ZT9u07TYPVl83ejeLakq", name: "Rachelle"},
  "the-affordability-index": { voice: "nPczCjzI2devNBz1zQrb", name: "Brian"   },
  "hmda-deep-dive":          { voice: "JBFqnCBsd6RMkjVDRZzb", name: "George"  },
};

const BUCKET = 'equity-audio';

// ── Data helpers ──────────────────────────────────────────────────────────────
function r2(v){ return v ? v.toFixed(2)+'%' : 'unavailable'; }
function price(v){ return v ? '$'+Math.round(v/1000)+'K' : 'unavailable'; }
function income(v){ return v ? '$'+Math.round(v/1000)+'K' : 'unavailable'; }
function mo(v){ return v ? v.toFixed(1)+' months' : 'unavailable'; }
function kk(v){ return v ? Math.round(v)+'K' : 'unavailable'; }
function mm(v){ return v ? (v/1e6).toFixed(2)+'M' : 'unavailable'; }
function pmt(principal, rate){
  if(!principal||!rate) return 'unavailable';
  var mr=rate/100/12, n=360;
  return '$'+Math.round(principal*(mr*Math.pow(1+mr,n))/(Math.pow(1+mr,n)-1)).toLocaleString();
}
function curve(t10,t2){
  if(!t10||!t2) return 'the yield curve shape is indeterminate';
  var sp=+(t10-t2).toFixed(2);
  return sp>0 ? 'the yield curve is normal with a '+sp+' percent spread between the 10-year and 2-year' : 'the yield curve is inverted by '+Math.abs(sp)+' percent';
}
function mktCond(sup){
  if(!sup) return 'market conditions unclear';
  if(sup<3) return 'a hot seller\'s market with only '+sup.toFixed(1)+' months of supply';
  if(sup<5) return 'a seller\'s market with '+sup.toFixed(1)+' months of supply';
  if(sup<7) return 'a balanced market with '+sup.toFixed(1)+' months of supply';
  return 'a buyer\'s market with '+sup.toFixed(1)+' months of supply';
}
function incReq(price, rate){
  if(!price||!rate) return 'unavailable';
  var mr=rate/100/12, n=360;
  return '$'+Math.round(price*0.80*(mr*Math.pow(1+mr,n))/(Math.pow(1+mr,n)-1)*12/0.28/1000)+'K';
}
function affRatio(price, rate, inc){
  if(!price||!rate||!inc) return null;
  var mr=rate/100/12, n=360;
  return (price*0.80*(mr*Math.pow(1+mr,n))/(Math.pow(1+mr,n)-1)/(inc/12)*100).toFixed(1);
}

// ── Show prompts ──────────────────────────────────────────────────────────────
// Each prompt instructs Claude to write ~180 words of flowing broadcast prose.
// 180 words ÷ 240 wpm (ElevenLabs turbo pace) = ~45 seconds.

const PROMPTS = {

"rate-watch-daily": d => `You are writing a spoken broadcast script for Daniel, host of Rate Watch Daily on The Equity Network — a live mortgage intelligence channel. Write EXACTLY 180 words of flowing broadcast prose. No stage directions, no bullets, no headers, no labels.

Live data for today's briefing:
- 30-year fixed: ${r2(d.r30)}
- 15-year fixed: ${r2(d.r15)}
- 10-year Treasury: ${r2(d.t10)}
- 2-year Treasury: ${r2(d.t2)}
- Fed Funds rate: ${r2(d.ff)}
- Mortgage-to-Treasury spread: ${d.r30&&d.t10?(d.r30-d.t10).toFixed(2)+'%':'unavailable'}
- ${curve(d.t10,d.t2)}

Script structure (DO NOT label these — write as one continuous paragraph):
Open with a confident one-sentence rate headline. Move into what is driving the current 30-year rate — the spread to Treasuries and what it signals about mortgage market risk premium. Interpret the yield curve shape and what it historically means for rate direction over the next 6 months. Explain how the Fed Funds rate is anchoring short-end expectations. Close with two specific, practical sentences a loan officer can say to a rate-anxious client today. End strong.`,

"the-fed-report": d => `You are writing a spoken broadcast script for Bill, host of The Fed Report on The Equity Network — a live mortgage intelligence channel. Write EXACTLY 180 words of flowing broadcast prose. No stage directions, no bullets, no headers, no labels.

Live data for today's briefing:
- Fed Funds rate: ${r2(d.ff)}
- 10-year Treasury: ${r2(d.t10)}
- 2-year Treasury: ${r2(d.t2)}
- 10-year inflation breakeven: ${d.inflation_breakeven?d.inflation_breakeven.toFixed(2)+'%':'unavailable'}
- Fed balance sheet: ${d.fed_balance_sheet?'$'+(d.fed_balance_sheet/1e9).toFixed(0)+'B':'unavailable'}
- ${curve(d.t10,d.t2)}

Script structure (write as one continuous paragraph):
Open with a clear statement of the Fed's current policy stance. Explain what the inflation breakeven rate tells us about where the market expects inflation to land and what that means for rate cuts. Interpret the yield curve — is it signaling recession risk or a soft landing? Explain how the balance sheet size affects long-end Treasury yields and therefore mortgage rates. Close with a direct, confident answer to the question every loan officer's client is asking: where are rates going from here, and when?`,

"housing-market-weekly": d => `You are writing a spoken broadcast script for River, host of Housing Market Weekly on The Equity Network — a live mortgage intelligence channel. Write EXACTLY 180 words of flowing broadcast prose. No stage directions, no bullets, no headers, no labels.

Live data for today's briefing:
- Median home price: ${price(d.median_price)}
- Months of supply: ${mo(d.months_supply)} → ${mktCond(d.months_supply)}
- Housing starts: ${kk(d.housing_starts)} annualized
- New home sales: ${d.new_home_sales?d.new_home_sales+'K':'unavailable'} annualized
- Existing home sales: ${mm(d.existing_home_sales)} annualized
- 30-year fixed: ${r2(d.r30)}

Script structure (write as one continuous paragraph):
Open with a clear verdict on current market conditions using the supply number. Explain what the price level and trend mean for affordability and buyer psychology right now. Move through what new versus existing home sales volumes reveal about where demand is going. Interpret housing starts — is supply coming or not? Close with two concrete sentences a real estate agent or loan officer can use to set expectations with a buyer or seller walking in the door today.`,

"mortgage-news-now": d => `You are writing a spoken broadcast script for Eric, host of Mortgage News Now on The Equity Network — a live mortgage intelligence channel. Write EXACTLY 180 words of flowing broadcast prose. No stage directions, no bullets, no headers, no labels.

Live data for today's briefing:
- 30-year fixed: ${r2(d.r30)}
- 15-year fixed: ${r2(d.r15)}
- 10-year Treasury: ${r2(d.t10)}
- Fed Funds: ${r2(d.ff)}
- Credit card delinquency rate: ${d.cc_delinquency?d.cc_delinquency.toFixed(2)+'%':'unavailable'}
- Mortgage delinquency rate: ${d.mortgage_delinquency?d.mortgage_delinquency.toFixed(2)+'%':'unavailable'}

Script structure (write as one continuous paragraph):
Open with the rate environment snapshot — where benchmark rates stand and what the current level means for origination volume relative to recent history. Interpret the credit card delinquency signal — is consumer credit stress building, stable, or easing? Connect that to what it means for mortgage delinquency trends and underwriting tightening risk. Explain the spread between the 30-year rate and the 10-year Treasury and what it signals about lender appetite right now. Close with one sharp pipeline strategy insight for a loan officer managing their business in this environment.`,

"credit-score-clinic": d => `You are writing a spoken broadcast script for Alice, host of Credit Score Clinic on The Equity Network — a live mortgage intelligence channel. Write EXACTLY 180 words of flowing broadcast prose. No stage directions, no bullets, no headers, no labels.

Live data for today's briefing:
- 30-year fixed rate: ${r2(d.r30)}
- Credit card delinquency: ${d.cc_delinquency?d.cc_delinquency.toFixed(2)+'%':'unavailable'}
- Mortgage delinquency: ${d.mortgage_delinquency?d.mortgage_delinquency.toFixed(2)+'%':'unavailable'}
- Monthly P&I on $400K loan at today's rate: ${pmt(400000,d.r30)}
- Income required (28% DTI, $400K loan): ${d.r30?'$'+Math.round(400000*(d.r30/100/12)*Math.pow(1+d.r30/100/12,360)/(Math.pow(1+d.r30/100/12,360)-1)*12/0.28/1000)+'K annual':'unavailable'}

Script structure (write as one continuous paragraph):
Open with what today's delinquency data reveals about the overall credit health of borrowers in the market. Explain how today's rate directly amplifies DTI stress — walk through the monthly payment math and what income it demands. Explain how FICO score tiers affect pricing today — what a 720 versus a 760 score costs a borrower at this rate. Give loan officers two specific, actionable credit improvement strategies to move a borderline borrower to approval in 30 to 60 days. Close with encouragement — credit is the variable they can actually move.`,

"down-payment-decoded": d => `You are writing a spoken broadcast script for Rachelle, host of Down Payment Decoded on The Equity Network — a live mortgage intelligence channel. Write EXACTLY 180 words of flowing broadcast prose. No stage directions, no bullets, no headers, no labels.

Live data for today's briefing:
- Median home price: ${price(d.median_price)}
- 30-year fixed: ${r2(d.r30)}
- 15-year fixed: ${r2(d.r15)}
- 3% conventional down: ${d.median_price?'$'+Math.round(d.median_price*0.03/1000)+'K':'unavailable'} → monthly P&I: ${pmt(d.median_price?d.median_price*0.97:null,d.r30)}
- 3.5% FHA down: ${d.median_price?'$'+Math.round(d.median_price*0.035/1000)+'K':'unavailable'}
- 20% conventional down: ${d.median_price?'$'+Math.round(d.median_price*0.20/1000)+'K':'unavailable'} → monthly P&I: ${pmt(d.median_price?d.median_price*0.80:null,d.r30)}

Script structure (write as one continuous paragraph):
Open with the real cost of buying a home today using the median price. Compare the 3% conventional and FHA pathways — what is the actual dollar difference in down payment and monthly payment? Explain the PMI trade-off clearly: when does paying PMI make strategic sense versus waiting to save 20%? Walk through one alternative down payment source most buyers overlook — gift funds, DPA programs, or VA and USDA zero-down options. Close with warm, empowering guidance: what a buyer who feels priced out should actually do right now.`,

"the-affordability-index": d => {
  var ratio = affRatio(d.median_price, d.r30, d.median_income);
  var verdict = !ratio ? 'unclear' : +ratio<28 ? 'technically affordable for the median household nationally' : +ratio<36 ? 'stretched well beyond the 28% DTI guideline for the median household' : 'out of reach for the median American household without significant income above the national median';
  return `You are writing a spoken broadcast script for Brian, host of The Affordability Index on The Equity Network — a live mortgage intelligence channel. Write EXACTLY 180 words of flowing broadcast prose. No stage directions, no bullets, no headers, no labels.

Live data for today's briefing:
- Median home price: ${price(d.median_price)}
- 30-year fixed: ${r2(d.r30)}
- Median household income: ${income(d.median_income)} per year
- Months of supply: ${mo(d.months_supply)}
- Monthly P&I at 20% down: ${pmt(d.median_price?d.median_price*0.80:null,d.r30)}
- Housing payment as % of median monthly income: ${ratio?ratio+'%':'unavailable'}
- Annual income required to qualify (28% DTI): ${incReq(d.median_price,d.r30)}

Script structure (write as one continuous paragraph):
Open with the affordability verdict — right now homeownership is ${verdict}. Walk through the income math precisely: what the monthly payment is, what income that demands, and how that compares to the median. Explain the two levers — rates and prices — and what realistic movement in each would need to occur for affordability to meaningfully recover. Analyze what the supply number reveals about price trajectory. Close with a direct, honest assessment of who is actually buying today and what it says about the market's composition going forward.`;
},

"hmda-deep-dive": d => `You are writing a spoken broadcast script for George, host of HMDA Deep Dive on The Equity Network — a live mortgage intelligence channel. Write EXACTLY 180 words of flowing broadcast prose. No stage directions, no bullets, no headers, no labels.

Live data for today's briefing:
- 30-year fixed rate: ${r2(d.r30)}
- Mortgage delinquency rate: ${d.mortgage_delinquency?d.mortgage_delinquency.toFixed(2)+'%':'unavailable'}
- Credit card delinquency: ${d.cc_delinquency?d.cc_delinquency.toFixed(2)+'%':'unavailable'}
- Median home price: ${price(d.median_price)}
- Housing starts: ${kk(d.housing_starts)} annualized

The Huit AI APEX platform holds 7 years of HMDA federal data — 14.2 million loan records — covering lender market share, approval and denial rates, origination trends, rate spread analysis, and demographic lending patterns by county, lender, and loan type. This data updates annually as CFPB releases new LAR files.

Script structure (write as one continuous paragraph):
Open with a warm read of the current lending environment using the rate and delinquency signals. Explain what HMDA data uniquely reveals that LOS reports cannot — where market share is shifting, which lenders are gaining or losing ground, and where denial rates are climbing. Connect the current rate environment to what historically happens to origination mix — purchase versus refi, conventional versus government — during elevated rate periods. Close with one compelling, specific intelligence angle that would give a loan officer or branch manager a genuine competitive edge right now by mining HMDA data through the APEX platform.`,

};

// ── Core pipeline ──────────────────────────────────────────────────────────────
async function generateScript(show, fred) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('No ANTHROPIC_API_KEY');
  const promptFn = PROMPTS[show];
  if (!promptFn) throw new Error('No prompt for: '+show);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'x-api-key':key, 'anthropic-version':'2023-06-01' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: 'You are a professional broadcast script writer. Output ONLY the spoken script — no labels, no stage directions, no preamble, no explanation. One continuous paragraph of spoken broadcast prose. Hit the word count target precisely.',
      messages: [{ role:'user', content: promptFn(fred) }]
    })
  });
  if (!res.ok) throw new Error('Claude '+res.status+': '+(await res.text()).slice(0,100));
  const data = await res.json();
  return data.content?.filter(b=>b.type==='text').map(b=>b.text).join('').trim();
}

async function generateAudio(script, voiceId, elKey) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key':elKey, 'Content-Type':'application/json', 'Accept':'audio/mpeg' },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability:0.45, similarity_boost:0.80, style:0.25, use_speaker_boost:true }
    })
  });
  if (!res.ok) throw new Error('ElevenLabs '+res.status+': '+(await res.text()).slice(0,200));
  return Buffer.from(await res.arrayBuffer());
}

async function checkCache(show, sbUrl, sbKey) {
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const path = `${show}/${today}.mp3`;
  const res = await fetch(`${sbUrl}/storage/v1/object/info/${BUCKET}/${path}`, {
    headers: { 'Authorization':'Bearer '+sbKey }
  });
  if (res.ok) return `${sbUrl}/storage/v1/object/public/${BUCKET}/${path}`;
  return null;
}

async function uploadCache(show, buf, sbUrl, sbKey) {
  const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
  const path = `${show}/${today}.mp3`;
  const res = await fetch(`${sbUrl}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { 'Authorization':'Bearer '+sbKey, 'Content-Type':'audio/mpeg', 'x-upsert':'true' },
    body: buf
  });
  if (!res.ok) throw new Error('Supabase '+res.status+': '+(await res.text()).slice(0,200));
  return `${sbUrl}/storage/v1/object/public/${BUCKET}/${path}`;
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
    return res.status(400).json({ error:'Invalid show. Valid: '+Object.keys(SHOW_CONFIG).join(', ') });
  }

  const cfg    = SHOW_CONFIG[show];
  const EL_KEY = process.env.ELEVENLABS_API_KEY;
  const SB_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  res.setHeader('Access-Control-Allow-Origin', '*');

  // Check cache
  if (SB_URL && SB_KEY) {
    try {
      const cached = await checkCache(show, SB_URL, SB_KEY);
      if (cached) return res.status(200).json({ audioUrl:cached, show, voice:cfg.name, cached:true });
    } catch(e) { console.warn('Cache check:', e.message); }
  }

  // Live FRED data
  const fred = await getFredData(show, req.headers.host);

  // Generate script
  let script;
  try {
    script = await generateScript(show, fred);
    console.log(`[voice] ${show} script: ${script.split(' ').length} words`);
  } catch(e) {
    console.error('Script gen:', e.message);
    script = `Welcome to The Equity Network. The 30-year fixed mortgage rate is currently at ${fred.r30?fred.r30.toFixed(2):'current'} percent. Today's live market intelligence is brought to you by Huit dot A I — the mortgage industry's most comprehensive data platform. Stay tuned for the full briefing.`;
  }

  if (!EL_KEY) return res.status(500).json({ error:'No ElevenLabs key', script });

  // Generate audio
  let buf;
  try {
    buf = await generateAudio(script, cfg.voice, EL_KEY);
  } catch(e) {
    return res.status(500).json({ error:'TTS failed: '+e.message, script });
  }

  // Upload to Supabase
  if (SB_URL && SB_KEY) {
    try {
      const url = await uploadCache(show, buf, SB_URL, SB_KEY);
      return res.status(200).json({ audioUrl:url, show, voice:cfg.name, script, cached:false });
    } catch(e) { console.warn('Supabase upload:', e.message); }
  }

  // Serve binary directly as fallback
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Length', buf.length);
  res.setHeader('Cache-Control', 's-maxage=86400');
  return res.status(200).send(buf);
}
