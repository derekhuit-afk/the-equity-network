// api/fred.js — Vercel serverless FRED data fetcher
// Runs server-side, no CORS issues

const SERIES = {
  MORTGAGE30US: 'r30',
  MORTGAGE15US: 'r15',
  DGS10:        't10',
  DGS2:         't2',
  FEDFUNDS:     'ff',
};

function parseCsv(csv, histN = 16) {
  const rows = csv.trim().split('\n').filter(r => !r.startsWith('DATE') && r.trim());
  if (!rows.length) return { v: null, prev: null, date: null, hist: [] };
  const last = rows[rows.length - 1].split(',');
  const prev = rows.length > 1 ? rows[rows.length - 2].split(',') : last;
  const hist = rows.slice(-histN).map(r => {
    const val = parseFloat(r.split(',')[1]);
    return isNaN(val) ? null : val;
  }).filter(v => v !== null);
  return {
    v:    parseFloat(last[1]),
    prev: parseFloat(prev[1]),
    date: last[0],
    hist,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');

  try {
    const fetches = Object.keys(SERIES).map(id =>
      fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)
        .then(r => r.text())
        .then(csv => ({ id, ...parseCsv(csv) }))
    );

    const results = await Promise.all(fetches);

    const data = {};
    for (const r of results) {
      const key = SERIES[r.id];
      data[key]        = r.v;
      data[key + 'p']  = r.prev;
      data[key + 'date'] = r.date;
      if (r.id === 'MORTGAGE30US') data.hist30 = r.hist;
    }

    // Derived
    data.spread      = data.r30 && data.t10 ? parseFloat((data.r30 - data.t10).toFixed(2)) : null;
    data.yieldCurve  = data.t10 && data.t2  ? (data.t10 > data.t2 ? 'Normal' : 'Inverted') : 'Unknown';
    data.t10t2spread = data.t10 && data.t2  ? parseFloat((data.t10 - data.t2).toFixed(2)) : null;
    data.live        = true;
    data.fetchedAt   = new Date().toISOString();

    res.status(200).json(data);
  } catch (err) {
    // Fallback with known-good values
    res.status(200).json({
      r30: 5.98, r30p: 6.01, r30date: '2026-02-26',
      r15: 5.21, r15p: 5.24, r15date: '2026-02-26',
      t10: 4.28, t10p: 4.31, t10date: '2026-03-04',
      t2:  4.01, t2p:  4.03,
      ff:  4.33, ffp:  4.33,
      spread: 1.70, yieldCurve: 'Normal', t10t2spread: 0.27,
      hist30: [6.81,6.72,6.65,6.54,6.44,6.38,6.29,6.24,6.19,6.17,6.22,6.21,6.15,6.09,6.01,5.98],
      live: false, fetchedAt: new Date().toISOString(),
      error: err.message,
    });
  }
}
