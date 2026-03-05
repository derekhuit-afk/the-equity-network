// api/voice.js — AI voice briefings: ElevenLabs TTS, ~105 words each (~45 seconds)

const SHOW_CONFIG = {
  "rate-watch-daily":        { voice: "onwK4e9ZLuTAKqWW03F9", name: "Daniel"   },
  "the-fed-report":          { voice: "pqHfZKP75CvOlQylNhV4", name: "Bill"     },
  "housing-market-weekly":   { voice: "SAz9YHcvj6GT2YYXdXww", name: "River"    },
  "mortgage-news-now":       { voice: "cjVigY5qzO86Huf0OWal", name: "Eric"     },
  "credit-score-clinic":     { voice: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice"    },
  "down-payment-decoded":    { voice: "ZT9u07TYPVl83ejeLakq", name: "Rachelle" },
  "the-affordability-index": { voice: "nPczCjzI2devNBz1zQrb", name: "Brian"    },
  "hmda-deep-dive":          { voice: "JBFqnCBsd6RMkjVDRZzb", name: "George"   },
};

const BUCKET = 'equity-audio';

function r2(v){ return v!=null?v.toFixed(2)+'%':null; }
function pr(v){ return v?'$'+Math.round(v/1000)+'K':null; }
function pmt(p,r){
  if(!p||!r)return null;
  var m=r/100/12,n=360;
  return '$'+Math.round(p*(m*Math.pow(1+m,n))/(Math.pow(1+m,n)-1)).toLocaleString();
}
function affPct(p,r,inc){
  if(!p||!r||!inc)return null;
  var m=r/100/12,n=360;
  return (p*0.80*(m*Math.pow(1+m,n))/(Math.pow(1+m,n)-1)/(inc/12)*100).toFixed(1);
}
function incReqK(p,r){
  if(!p||!r)return null;
  var m=r/100/12,n=360;
  return '$'+Math.round(p*0.80*(m*Math.pow(1+m,n))/(Math.pow(1+m,n)-1)*12/0.28/1000)+'K';
}

function buildScript(show, d) {
  var r30=d.r30, r15=d.r15, t10=d.t10, t2=d.t2, ff=d.ff;
  var sp=r30&&t10?(r30-t10).toFixed(2)+'%':null;
  var yc=t10&&t2?(t10>t2?'normal, with a '+(t10-t2).toFixed(2)+'% spread':'inverted by '+Math.abs((t10-t2).toFixed(2))+'%'):'unclear';
  var cond=!d.months_supply?'mixed':d.months_supply<3?'a hot seller\'s market':d.months_supply<5?'a seller\'s market':d.months_supply<7?'balanced':' a buyer\'s market';
  var sup=d.months_supply?d.months_supply.toFixed(1):null;
  var med=pr(d.median_price);
  var inc=d.median_income?'$'+Math.round(d.median_income/1000)+'K':null;
  var dp3=d.median_price?'$'+Math.round(d.median_price*0.03/1000)+'K':null;
  var dp20=d.median_price?'$'+Math.round(d.median_price*0.20/1000)+'K':null;
  var p20=pmt(d.median_price?d.median_price*0.80:null,r30);
  var p3=pmt(d.median_price?d.median_price*0.97:null,r30);
  var p400=pmt(400000,r30);
  var i400=r30?'$'+Math.round(400000*(r30/100/12)*Math.pow(1+r30/100/12,360)/(Math.pow(1+r30/100/12,360)-1)*12/0.28/1000)+'K':null;
  var aff=affPct(d.median_price,r30,d.median_income);
  var iReq=incReqK(d.median_price,r30);
  var ib=d.inflation_breakeven?d.inflation_breakeven.toFixed(2)+'%':null;
  var bs=d.fed_balance_sheet?'$'+(d.fed_balance_sheet/1e9).toFixed(0)+'B':null;
  var cc=d.cc_delinquency?d.cc_delinquency.toFixed(2)+'%':null;
  var md=d.mortgage_delinquency?d.mortgage_delinquency.toFixed(2)+'%':null;
  var hs  = d.housing_starts      ? Math.round(d.housing_starts)+'K'                   : null;
  var ns  = d.new_home_sales      ? d.new_home_sales+'K'                                   : null;
  var es  = d.existing_home_sales ? (d.existing_home_sales/1e6).toFixed(2)+'M'             : null;
  var spTxt = r30&&t10 ? (r30-t10 > 2.0
    ? 'historically wide above the 150 to 175 basis point norm — compression is possible without Treasury yields falling'
    : 'near the historical average, so mortgage rates will largely track Treasury moves') : 'notable';

  const s = {

"rate-watch-daily":
`Today the thirty-year fixed is ${r2(r30)||'at current levels'}, the fifteen-year at ${r2(r15)||'current levels'}, and the ten-year Treasury at ${r2(t10)||'current levels'} with a Fed Funds rate of ${r2(ff)||'current levels'}. The mortgage-to-Treasury spread is ${sp||'notable'} — ${spTxt||'watch Treasury moves closely'}. The yield curve is ${yc||'worth monitoring'}. For clients on the lock-float question: close in thirty days, lock today. Floating is only defensible if you have sixty-plus days and a defined trigger — a quarter-point improvement minimum. Volatility in this environment punishes indecision.`,

"the-fed-report":
`The Fed holds the Funds rate at ${r2(ff)||'current levels'} while running the balance sheet at ${bs||'a substantial level'} through quantitative tightening. The ten-year Treasury at ${r2(t10)||'current levels'} and two-year at ${r2(t2)||'current levels'} produce a yield curve that is ${yc||'worth watching'}. The inflation breakeven at ${ib||'current levels'} tells us the bond market believes the Fed's fight is largely won. Mortgage rates track the ten-year, not the Funds rate. When the Fed signals cuts, the ten-year reprices first — that is the window that matters for origination volume.`,

"housing-market-weekly":
`The housing market is in ${cond} with ${sup||'limited'} months of supply, holding the median home price at ${med||'elevated levels'}. Housing starts at ${hs||'recent levels'} thousand annualized remain below replacement pace — the supply deficit is not closing. New home sales at ${ns||'current levels'} thousand and existing sales at ${es||'current levels'} million reflect the rate lock-in effect among owners with sub-four-percent mortgages. A one-percent rate drop would simultaneously unlock supply and reignite demand. Watch the ten-year Treasury as the trigger, not the Federal Reserve meeting date.`,

"mortgage-news-now":
`The thirty-year at ${r2(r30)||'current levels'} and fifteen-year at ${r2(r15)||'current levels'} are suppressing refinance volume near historic lows, with purchase origination constrained by affordability. The mortgage-to-Treasury spread of ${sp||'current levels'} — ${spTxt||'relevant to rate direction'} — determines how quickly improvement reaches borrowers when bonds rally. Credit card delinquency at ${cc||'current levels'} and mortgage delinquency at ${md||'current levels'} are manageable but trending toward tighter overlays. The opportunity right now is cash-out refi for debt consolidation among equity-rich borrowers — build that narrative into your referral conversations this week.`,

"credit-score-clinic":
`At ${r2(r30)||'today\'s rate'}, a four-hundred-thousand-dollar loan carries a monthly principal and interest of ${p400||'a significant amount'}, requiring ${i400||'substantial income'} at a twenty-eight percent front-end DTI. With credit card delinquency at ${cc||'current levels'} and mortgage delinquency at ${md||'current levels'}, credit profiles are under heavier lender scrutiny. Moving from a seven-nineteen to a seven-twenty FICO unlocks a full pricing tier — worth real money at today's loan sizes. Two moves before application: bring revolving utilization below thirty percent and dispute inaccurate derogatories. Both can shift a full tier in thirty to forty-five days.`,

"down-payment-decoded":
`At the national median price of ${med||'current levels'}: three-percent conventional down is ${dp3||'a smaller sum'} with a payment of ${p3||'a higher amount'}, while twenty percent down is ${dp20||'more upfront'} with a payment of ${p20||'a lower amount'} and no mortgage insurance. For most buyers today, preserving liquidity by paying PMI is smarter than waiting to save twenty percent while prices hold firm. VA loans remain the most underutilized product available — zero down, no PMI, available to millions of eligible borrowers. Down payment assistance programs exist in nearly every state. The best strategy gets your client in the home today.`,

"the-affordability-index":
`At a median price of ${med||'current levels'}, a thirty-year rate of ${r2(r30)||'current levels'}, and median income of ${inc||'current levels'}, the monthly payment at twenty percent down is ${p20||'significant'} — representing ${aff||'an elevated share'} percent of median monthly income. Qualifying at twenty-eight percent DTI requires ${iReq||'substantially more than median'} annually. Entry-level buyers face the most challenged affordability conditions in four decades. Meaningful improvement requires at least a one-percent rate drop, sustained inventory growth, or income expansion the current labor market is not delivering. Until then, the buyers closing are high earners, dual-income households, or move-up buyers converting equity.`,

"hmda-deep-dive":
`With the thirty-year at ${r2(r30)||'current levels'}, mortgage delinquency at ${md||'current levels'}, and credit card stress at ${cc||'current levels'}, lender market share is actively shifting — and loan officers with access to that data have a real edge. The Huit AI APEX platform holds seven years of HMDA federal data — fourteen-point-two million loan records — covering approval and denial rates, origination volume, rate spread analysis, and market share by county, lender, and loan type. HMDA reveals where share is moving and where denial rates are rising. That intelligence grows a business in a down market.`,

  }
  };

  return s[show] || `The thirty-year fixed rate is ${r2(r30)||'at current levels'} today. Live mortgage and housing market intelligence from The Equity Network, powered by Huit dot A I.`;
}

async function tryClaudeEnrich(script, show) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('no key');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
    body:JSON.stringify({
      model:'claude-haiku-4-5-20251001', max_tokens:600,
      system:'Rewrite the broadcast script in a more natural spoken voice. Keep every data point and the same approximate length. Output ONLY the rewritten script — no labels, no stage directions.',
      messages:[{role:'user',content:`Show: ${show}\n\nScript to rewrite:\n${script}`}]
    })
  });
  if (!res.ok) throw new Error('Claude '+res.status);
  const d = await res.json();
  return d.content?.filter(b=>b.type==='text').map(b=>b.text).join('').trim();
}

async function generateAudio(script, voiceId, elKey) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,{
    method:'POST',
    headers:{'xi-api-key':elKey,'Content-Type':'application/json','Accept':'audio/mpeg'},
    body:JSON.stringify({
      text:script, model_id:'eleven_turbo_v2_5',
      voice_settings:{stability:0.45,similarity_boost:0.80,style:0.25,use_speaker_boost:true}
    })
  });
  if (!res.ok) throw new Error('ElevenLabs '+res.status+': '+(await res.text()).slice(0,200));
  return Buffer.from(await res.arrayBuffer());
}

async function checkCache(show,sbUrl,sbKey){
  const today=new Date().toISOString().slice(0,10).replace(/-/g,'');
  const r=await fetch(`${sbUrl}/storage/v1/object/info/${BUCKET}/${show}/${today}.mp3`,{headers:{'Authorization':'Bearer '+sbKey}});
  return r.ok?`${sbUrl}/storage/v1/object/public/${BUCKET}/${show}/${today}.mp3`:null;
}
async function uploadCache(show,buf,sbUrl,sbKey){
  const today=new Date().toISOString().slice(0,10).replace(/-/g,'');
  const r=await fetch(`${sbUrl}/storage/v1/object/${BUCKET}/${show}/${today}.mp3`,{
    method:'POST',
    headers:{'Authorization':'Bearer '+sbKey,'Content-Type':'audio/mpeg','x-upsert':'true'},
    body:buf
  });
  if(!r.ok)throw new Error('Supabase '+r.status);
  return `${sbUrl}/storage/v1/object/public/${BUCKET}/${show}/${today}.mp3`;
}
async function getFred(show,host){
  try{const r=await fetch(`https://${host}/api/fred?show=${show}`);if(r.ok)return await r.json();}catch(e){}
  return {};
}

export default async function handler(req,res){
  const show=req.query.show;
  if(!show||!SHOW_CONFIG[show])return res.status(400).json({error:'Invalid show: '+show});
  const cfg=SHOW_CONFIG[show];
  const EL=process.env.ELEVENLABS_API_KEY;
  const SBU=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SBK=process.env.SUPABASE_SERVICE_ROLE_KEY;
  res.setHeader('Access-Control-Allow-Origin','*');

  if(SBU&&SBK){try{const c=await checkCache(show,SBU,SBK);if(c)return res.status(200).json({audioUrl:c,show,voice:cfg.name,cached:true});}catch(e){}}

  const fred=await getFred(show,req.headers.host);
  let script=buildScript(show,fred);
  try{script=await tryClaudeEnrich(script,show);}catch(e){console.warn('[voice] Using data-driven script:',e.message);}

  if(!EL)return res.status(500).json({error:'No ElevenLabs key',script});
  let buf;
  try{buf=await generateAudio(script,cfg.voice,EL);}catch(e){return res.status(500).json({error:'TTS: '+e.message,script});}

  if(SBU&&SBK){try{const url=await uploadCache(show,buf,SBU,SBK);return res.status(200).json({audioUrl:url,show,voice:cfg.name,script,cached:false});}catch(e){console.warn('Supabase:',e.message);}}

  res.setHeader('Content-Type','audio/mpeg');
  res.setHeader('Content-Length',buf.length);
  res.setHeader('Cache-Control','s-maxage=86400');
  return res.status(200).send(buf);
}
