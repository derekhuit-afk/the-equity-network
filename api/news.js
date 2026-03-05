// api/news.js — AI-powered housing news feed
// Calls Claude claude-sonnet-4-20250514 with web_search to get top 10 housing/mortgage stories
// Cached 2 hours at CDN edge

const FALLBACK = [
  { id:1, headline:"Mortgage Rates Hold Near 6% Amid Fed Pause Signals", summary:"The 30-year fixed rate remains in the upper 5s as Federal Reserve officials indicate patience with rate adjustments. Bond markets are pricing in two cuts by year-end, keeping mortgage rates range-bound.", category:"Rates", urgency:"high" },
  { id:2, headline:"Existing Home Sales Rise 3.2% in Latest NAR Report", summary:"The National Association of Realtors reported a third consecutive monthly gain in existing home sales, driven by increased inventory and slightly improved affordability in mid-tier markets.", category:"Market", urgency:"medium" },
  { id:3, headline:"New Construction Starts Beat Expectations in Q1", summary:"Housing starts came in above consensus estimates, with single-family construction leading the gain. Builder sentiment improved as lot costs stabilized and lumber prices retreated.", category:"Construction", urgency:"medium" },
  { id:4, headline:"FHA Announces Updated Loan Limits for High-Cost Areas", summary:"HUD released revised FHA loan limits effective immediately, reflecting updated median home price data. Several metropolitan areas see increases of up to $50K in the ceiling limit.", category:"Policy", urgency:"medium" },
  { id:5, headline:"Home Equity Levels Near Record High Despite Rate Pressure", summary:"Despite affordability challenges, aggregate homeowner equity reached a new high as sustained price appreciation offsets the lock-in effect. Tappable equity now exceeds $11 trillion nationally.", category:"Equity", urgency:"low" },
  { id:6, headline:"CFPB Issues Guidance on Trigger Lead Restrictions", summary:"The Consumer Financial Protection Bureau clarified enforcement priorities around mortgage trigger leads, signaling heightened scrutiny of unsolicited marketing following origination inquiries.", category:"Regulation", urgency:"high" },
  { id:7, headline:"Affordability Improves in 18 Major Metros Year-Over-Year", summary:"A new analysis shows affordability metrics improving in 18 of the top 50 metro areas compared to the same period last year, primarily in markets that saw price corrections of 5–12%.", category:"Affordability", urgency:"medium" },
  { id:8, headline:"VA Loan Volume Increases 8% as Veteran Homebuying Activity Rises", summary:"VA-backed mortgage originations climbed year-over-year as more eligible veterans and service members took advantage of the zero-down benefit amid tight inventory conditions.", category:"Programs", urgency:"low" },
  { id:9, headline:"Fannie Mae Revises 2026 Origination Forecast Upward", summary:"Fannie Mae's Economic and Strategic Research group raised its 2026 mortgage origination volume forecast, citing stronger-than-expected purchase demand and a modest refi wave if rates fall further.", category:"Forecast", urgency:"medium" },
  { id:10, headline:"Inventory Climbs to Highest Level Since Pre-Pandemic Era", summary:"Active listings nationally reached their highest point since early 2020, with the Sun Belt and Mountain West markets posting the largest inventory gains as remote work patterns shift.", category:"Inventory", urgency:"high" },
];

async function fetchWithClaude() {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) throw new Error('No ANTHROPIC_API_KEY');

  const today = new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'web-search-2025-03-05'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: `You are a housing and mortgage industry news editor. Today is ${today}. Search for the latest housing market, mortgage, and real estate news. You MUST return ONLY a valid JSON array. No markdown. No explanation. No preamble. Just the JSON array.`,
      messages: [{
        role: 'user',
        content: `Search for the top 10 most important housing market, mortgage rate, real estate, and housing policy stories from the past 48 hours. Include breaking news, FOMC/Fed actions affecting mortgage rates, housing data releases (NAR, Census, MBA), and significant regulatory changes.

Return ONLY this exact JSON format with no other text:
[
  {
    "id": 1,
    "headline": "Short punchy headline under 12 words",
    "summary": "2-3 sentence summary with specific data points and context. Include numbers when available.",
    "category": "one of: Rates|Market|Construction|Policy|Regulation|Affordability|Programs|Forecast|Inventory|Economy",
    "urgency": "one of: high|medium|low",
    "source": "Publication name",
    "url": "actual URL if found"
  }
]

Requirements:
- 10 stories total
- Prioritize stories with specific numbers and data
- Mix of rate news, market conditions, policy, and economic drivers
- Real current events only, no fabrication
- Return ONLY the JSON array, nothing else`
      }]
    })
  });

  if (!response.ok) throw new Error(`Claude API ${response.status}`);
  const data = await response.json();

  // Extract text content from response
  const textBlocks = data.content?.filter(b => b.type === 'text') || [];
  const rawText = textBlocks.map(b => b.text).join('');

  // Parse JSON — strip any accidental markdown
  const cleaned = rawText.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();

  // Find the array in the response
  const arrStart = cleaned.indexOf('[');
  const arrEnd = cleaned.lastIndexOf(']') + 1;
  if (arrStart === -1 || arrEnd === 0) throw new Error('No JSON array in response');

  const stories = JSON.parse(cleaned.slice(arrStart, arrEnd));
  if (!Array.isArray(stories) || stories.length === 0) throw new Error('Empty stories array');

  // Ensure required fields
  return stories.slice(0,10).map((s, i) => ({
    id: i + 1,
    headline: s.headline || 'Housing Market Update',
    summary: s.summary || '',
    category: s.category || 'Market',
    urgency: s.urgency || 'medium',
    source: s.source || '',
    url: s.url || ''
  }));
}

// Simple in-memory cache
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate=3600');

  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL) {
    return res.status(200).json({ stories: _cache, cached: true, fetchedAt: new Date(_cacheTime).toISOString() });
  }

  try {
    const stories = await fetchWithClaude();
    _cache = stories;
    _cacheTime = now;
    return res.status(200).json({ stories, cached: false, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('News API error:', err.message);
    // Return fallback but don't cache it
    return res.status(200).json({ stories: FALLBACK, cached: false, fallback: true, fetchedAt: new Date().toISOString() });
  }
}
