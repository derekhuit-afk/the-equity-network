// api/news.js — AI housing news feed (Claude Haiku + web search)
const FALLBACK = [
  { id:1, headline:"Mortgage Rates Stabilize Near 6% on Fed Hold Signals", summary:"The 30-year fixed rate held near 6% as Federal Reserve officials signaled patience with monetary policy. Bond markets are pricing in two cuts by year-end, keeping rates range-bound for spring homebuyers.", category:"Rates", urgency:"high", source:"Freddie Mac", url:"" },
  { id:2, headline:"Existing Home Sales Post Third Consecutive Monthly Gain", summary:"NAR reported a third straight monthly increase in existing home sales as inventory continued to recover. Median days on market fell to 24 days nationally, signaling sustained buyer demand.", category:"Market", urgency:"medium", source:"NAR", url:"" },
  { id:3, headline:"Housing Starts Beat Forecasts in Latest Census Report", summary:"New residential construction came in above consensus estimates, led by single-family starts. Builder sentiment improved as lumber costs retreated and lot availability increased in key markets.", category:"Construction", urgency:"medium", source:"Census Bureau", url:"" },
  { id:4, headline:"FHA Updates Loan Limits for High-Cost Metro Areas", summary:"HUD released revised FHA loan limits reflecting updated median price data. Several major metropolitan areas see ceiling increases, expanding FHA eligibility for moderate-income buyers.", category:"Policy", urgency:"medium", source:"HUD", url:"" },
  { id:5, headline:"Homeowner Equity Reaches Record $11.4 Trillion Nationally", summary:"Despite affordability headwinds, aggregate homeowner equity hit a new high as sustained price appreciation drove gains. Tappable equity now exceeds $11T, creating HELOC and cash-out refi opportunities.", category:"Equity", urgency:"low", source:"CoreLogic", url:"" },
  { id:6, headline:"CFPB Clarifies Trigger Lead Enforcement Priorities", summary:"The Consumer Financial Protection Bureau issued new guidance on mortgage trigger lead restrictions, signaling heightened scrutiny of unsolicited marketing following origination inquiry events.", category:"Regulation", urgency:"high", source:"CFPB", url:"" },
  { id:7, headline:"Affordability Improves in 18 Major Metros Year-Over-Year", summary:"A new analysis identified 18 of the top 50 metros showing improved affordability versus the prior year, primarily in markets that experienced 5–12% price corrections and saw new construction supply additions.", category:"Affordability", urgency:"medium", source:"NAR Research", url:"" },
  { id:8, headline:"VA Loan Volume Climbs 8% as Veteran Homebuying Activity Rises", summary:"VA-backed originations increased year-over-year as more eligible veterans leveraged the zero-down benefit. VA loans now represent nearly 10% of all purchase originations in military-concentrated markets.", category:"Programs", urgency:"low", source:"VA", url:"" },
  { id:9, headline:"Fannie Mae Raises 2026 Origination Forecast on Purchase Demand", summary:"Fannie Mae's ESR group lifted its 2026 mortgage origination volume forecast, citing stronger-than-expected purchase demand. A modest refi wave is projected if 30-year rates dip below 6% by mid-year.", category:"Forecast", urgency:"medium", source:"Fannie Mae", url:"" },
  { id:10, headline:"Active Listings Reach Highest Level Since Pre-Pandemic Era", summary:"National active listing inventory climbed to its highest point since early 2020, with Sun Belt and Mountain West markets posting the largest gains. Analysts attribute the shift to softening remote work demand and new construction completions.", category:"Inventory", urgency:"high", source:"Realtor.com", url:"" },
];

async function fetchWithClaude() {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) throw new Error('No ANTHROPIC_API_KEY');

  const today = new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key':ANTHROPIC_KEY,
      'anthropic-version':'2023-06-01',
      'anthropic-beta':'web-search-2025-03-05'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      tools:[{type:'web_search_20250305',name:'web_search'}],
      system:`Housing news editor. Today: ${today}. Return ONLY a JSON array, no markdown.`,
      messages:[{
        role:'user',
        content:`Search for top 10 housing/mortgage/real estate news stories from the last 48 hours. Return ONLY this JSON array:\n[{"id":1,"headline":"under 12 words","summary":"2 sentences with data","category":"Rates|Market|Construction|Policy|Regulation|Affordability|Programs|Forecast|Inventory|Economy","urgency":"high|medium|low","source":"publication","url":"url if found"}]\nReturn ONLY the JSON array.`
      }]
    })
  });

  if(!res.ok) throw new Error(`Claude ${res.status}: ${await res.text().then(t=>t.slice(0,200))}`);
  const data = await res.json();
  const text = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('');
  const s = text.indexOf('['), e = text.lastIndexOf(']')+1;
  if(s===-1||e===0) throw new Error('No JSON array');
  const stories = JSON.parse(text.slice(s,e));
  if(!Array.isArray(stories)||!stories.length) throw new Error('Empty');
  return stories.slice(0,10).map((s,i)=>({
    id:i+1,
    headline:s.headline||'Housing Update',
    summary:s.summary||'',
    category:s.category||'Market',
    urgency:s.urgency||'medium',
    source:s.source||'',
    url:s.url||''
  }));
}

let _cache=null, _cacheTime=0;
const TTL=2*60*60*1000;

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','s-maxage=7200,stale-while-revalidate=3600');
  const now=Date.now();
  if(_cache&&(now-_cacheTime)<TTL){
    return res.status(200).json({stories:_cache,cached:true,fetchedAt:new Date(_cacheTime).toISOString()});
  }
  try{
    const stories=await fetchWithClaude();
    _cache=stories; _cacheTime=now;
    return res.status(200).json({stories,cached:false,fetchedAt:new Date().toISOString()});
  }catch(err){
    console.error('News API:',err.message);
    return res.status(200).json({stories:FALLBACK,cached:false,fallback:true,error:err.message,fetchedAt:new Date().toISOString()});
  }
}
