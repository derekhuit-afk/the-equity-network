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
  var hs=d.housing_starts?Math.round(d.housing_starts)+'K':null;

  const s = {
    "rate-watch-daily":
      `The thirty-year fixed is at ${r2(r30)||'current levels'} today, with the fifteen-year at ${r2(r15)||'lower levels'} and the ten-year Treasury at ${r2(t10)||'current levels'}. The mortgage-to-Treasury spread is ${sp||'elevated'}, and the yield curve is ${yc}. The Fed holds rates at ${r2(ff)||'current levels'}. For clients asking whether to lock or float — the spread compression story argues for locking within thirty days. If you have sixty days or more of float time and believe in Fed cuts, there is a credible path lower. Set expectations honestly: volatility is still the dominant theme.`,

    "the-fed-report":
      `The Fed is holding the Funds rate at ${r2(ff)||'current levels'}, watching inflation data before committing to cuts. The ten-year Treasury at ${r2(t10)||'current levels'} and two-year at ${r2(t2)||'current levels'} give us a yield curve that is ${yc}. The ten-year inflation breakeven is ${ib||'current levels'}, signaling the market believes the Fed's job is nearly done. The balance sheet stands at ${bs||'a large level'}. Mortgage rates follow the ten-year — and the ten-year follows Fed expectations. When cuts come, mortgage rates will move before the Fed actually moves. Position your pipeline for that moment.`,

    "housing-market-weekly":
      `The national housing market is in ${cond} with ${sup||'limited'} months of supply. The median home price is ${med||'elevated'}, and housing starts are running at ${hs||'recent levels'} thousand annualized — still below the pace needed to close the structural supply deficit. For buyers, prices are holding because supply is not growing. For sellers, your pricing power remains real, but days on market are stretching at today's ${r2(r30)||'current'} rate. The market does not shift until rates move meaningfully lower. Until then, well-priced homes in desirable markets move — overpriced listings sit.`,

    "mortgage-news-now":
      `The thirty-year fixed at ${r2(r30)||'current levels'} is keeping refinance volume near historic lows and putting sustained pressure on purchase origination. The mortgage-to-Treasury spread of ${sp||'current levels'} signals lenders are pricing in meaningful credit risk. Credit card delinquency is at ${cc||'current levels'} and mortgage delinquency at ${md||'current levels'} — not alarming, but trending in a direction that tightens underwriting overlays. Cash-out refinances for debt consolidation are the product story that makes sense right now. If your referral partners are not hearing that from you, they are hearing it from someone else.`,

    "credit-score-clinic":
      `The thirty-year fixed at ${r2(r30)||'current levels'} means a four-hundred-thousand-dollar loan carries a monthly payment of ${p400||'significant levels'}, requiring roughly ${i400||'substantial income'} to qualify at a twenty-eight percent front-end DTI. Credit card delinquency is ${cc||'elevated'} and mortgage delinquency at ${md||'current levels'}, reflecting real cash-flow pressure. The two fastest credit moves that actually change approval odds: pay revolving balances below thirty percent utilization, and dispute any inaccurate derogatories before application. Done right, both can show results in thirty to forty-five days and potentially move a borrower an entire FICO tier — which at today's rates means real money.`,

    "down-payment-decoded":
      `At the national median price of ${med||'current levels'}, a three-percent down payment means bringing ${dp3||'a smaller amount'} to closing with a monthly payment of ${p3||'a higher amount'}, while twenty percent down requires ${dp20||'a larger sum'} and a payment of ${p20||'a lower amount'}. PMI often surprises buyers — for many, paying it while preserving liquidity makes more financial sense than waiting to save twenty percent while prices move. VA loans offer zero down with no PMI at all, and they are significantly underused by eligible veterans. Down payment assistance programs exist in virtually every state. The down payment conversation is never just about the check — it is about monthly cash flow, liquidity, and long-term strategy.`,

    "the-affordability-index":
      `With a median home price of ${med||'current levels'}, a thirty-year rate of ${r2(r30)||'current levels'}, and a national median income of ${inc||'current levels'}, the monthly principal and interest payment at twenty percent down is ${p20||'significant'}. That payment represents ${aff||'an elevated percentage'} of median monthly income, and qualifying requires ${iReq||'substantially more than median'} in annual household income. The buyers closing right now are largely dual-income households, move-up buyers with existing equity, or high earners. The entry-level buyer faces the most challenging affordability conditions in a generation. Meaningful improvement requires either a rate drop of at least one percent, sustained price softening, or income growth that the current labor market is not delivering.`,

    "hmda-deep-dive":
      `The current lending environment — a thirty-year rate of ${r2(r30)||'near six percent'}, mortgage delinquency at ${md||'current levels'}, and credit card stress at ${cc||'current levels'} — is one where market share is actively shifting between lenders. The Huit AI APEX platform holds seven years of HMDA data — fourteen-point-two million loan records — covering approval and denial rates, lender market share, origination trends, and rate spread analysis by county, lender, and loan type. In this environment, the origination mix tilts toward purchase and government loans while refinance contracts. HMDA tells you which lenders are gaining share, where denial rates are rising, and where opportunity exists. That intelligence is the difference between guessing where to prospect and knowing.`
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
