// api/fred.js — Vercel serverless FRED data fetcher
// Show-specific series + shared base rates

const BASE_SERIES = {
  MORTGAGE30US: 'r30',
  MORTGAGE15US: 'r15',
  DGS10:        't10',
  DGS2:         't2',
  FEDFUNDS:     'ff',
};

const SHOW_SERIES = {
  'rate-watch-daily': {
    MORTGAGE30US: 'r30', MORTGAGE15US: 'r15',
    DGS10: 't10', DGS2: 't2', FEDFUNDS: 'ff',
  },
  'the-fed-report': {
    FEDFUNDS: 'ff', DGS10: 't10', DGS2: 't2',
    T10YIE: 'inflation_breakeven',
    WALCL: 'fed_balance_sheet',
    CPIAUCSL: 'cpi',
  },
  'housing-market-weekly': {
    HOUST:          'housing_starts',
    MSPUS:          'median_price',
    MSACSR:         'months_supply',
    HSN1F:          'new_home_sales',
    EXHOSLUSM495S:  'existing_home_sales',
    MORTGAGE30US:   'r30',
  },
  'mortgage-news-now': {
    MORTGAGE30US: 'r30', MORTGAGE15US: 'r15',
    DGS10: 't10', FEDFUNDS: 'ff',
    DRCCLACBS:    'cc_delinquency',
  },
  'credit-score-clinic': {
    DRCCLACBS:    'cc_delinquency',
    DRSFRMACBS:   'mortgage_delinquency',
    MORTGAGE30US: 'r30',
    DGS10:        't10',
  },
  'down-payment-decoded': {
    MSPUS:        'median_price',
    MORTGAGE30US: 'r30',
    MORTGAGE15US: 'r15',
    FEDFUNDS:     'ff',
  },
  'the-affordability-index': {
    MSPUS:          'median_price',
    MORTGAGE30US:   'r30',
    MEHOINUSA672N:  'median_income',
    HOUST:          'housing_starts',
    MSACSR:         'months_supply',
  },
  'hmda-deep-dive': {
    MORTGAGE30US: 'r30',
    DRSFRMACBS:   'mortgage_delinquency',
    DRCCLACBS:    'cc_delinquency',
    HOUST:        'housing_starts',
    MSPUS:        'median_price',
  },
};

function parseCsv(csv, histN = 24) {
  const rows = csv.trim().split('\n').filter(r => !r.startsWith('DATE') && r.trim());
  if (!rows.length) return { v: null, prev: null, date: null, hist: [] };
  const last = rows[rows.length - 1].split(',');
  const prev = rows.length > 1 ? rows[rows.length - 2].split(',') : last;
  const hist = rows.slice(-histN).map(r => {
    const [d, v] = r.split(',');
    return { date: d, v: parseFloat(v) };
  }).filter(x => !isNaN(x.v));
  return { v: parseFloat(last[1]), prev: parseFloat(prev[1]), date: last[0], hist };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');

  const show = req.query.show || null;
  const seriesMap = show && SHOW_SERIES[show] ? SHOW_SERIES[show] : BASE_SERIES;

  try {
    const fetches = Object.keys(seriesMap).map(id =>
      fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`)
        .then(r => r.text())
        .then(csv => ({ id, key: seriesMap[id], ...parseCsv(csv) }))
    );
    const results = await Promise.all(fetches);

    const data = { show, live: true, fetchedAt: new Date().toISOString() };
    for (const r of results) {
      data[r.key]          = r.v;
      data[r.key + 'Prev'] = r.prev;
      data[r.key + 'Date'] = r.date;
      data[r.key + 'Hist'] = r.hist;
    }

    // Derived fields
    if (data.r30 && data.t10) data.spread = parseFloat((data.r30 - data.t10).toFixed(2));
    if (data.t10 && data.t2)  data.yieldCurve = data.t10 > data.t2 ? 'Normal' : 'Inverted';
    if (data.t10 && data.t2)  data.t10t2spread = parseFloat((data.t10 - data.t2).toFixed(2));
    if (data.median_price && data.r30 && data.median_income) {
      const monthlyRate = data.r30 / 100 / 12;
      const n = 360;
      const loanAmt = data.median_price * 0.8;
      const pmt = loanAmt * (monthlyRate * Math.pow(1+monthlyRate,n)) / (Math.pow(1+monthlyRate,n)-1);
      const monthlyIncome = data.median_income / 12;
      data.affordability_ratio = parseFloat((pmt / monthlyIncome * 100).toFixed(1));
      data.monthly_payment = Math.round(pmt);
    }

    res.status(200).json(data);
  } catch (err) {
    res.status(200).json({
      show, live: false, error: err.message,
      r30: 5.98, r30Prev: 6.01, r15: 5.44, t10: 4.06, t10Prev: 4.12,
      t2: 3.51, ff: 3.64, spread: 1.92, yieldCurve: 'Normal',
      median_price: 405300, median_income: 83730, monthly_payment: 1924,
      affordability_ratio: 27.7, housing_starts: 1404, months_supply: 7.6,
      new_home_sales: 745, existing_home_sales: 3910000,
      cc_delinquency: 2.94, mortgage_delinquency: 1.78,
      inflation_breakeven: 2.29, fed_balance_sheet: 6613797, cpi: 326.6,
      fetchedAt: new Date().toISOString(),
    });
  }
}
