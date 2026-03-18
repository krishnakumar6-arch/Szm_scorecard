export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const SHEET_ID = '1WV7v2CeS7RQHWCETpEF1SIVugrlrJf29XCYvcVvDZAI';
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

  const METRIC_MAP = {
    'Clearance': 'clearance',
    'Issue Raised Shipments Score': 'issue',
    'Issue Raised Shipments': 'issue',
    'FASR': 'fasr', 'FPSR': 'fasr', 'FASR & FPSR': 'fasr',
    'D2ZA': 'd2za', 'D2+ ZA Pendency': 'd2za',
    'Bagging Pendency': 'bagging', 'Bagging & Connection': 'bagging',
    'Tally': 'tally', 'Shipment Tally': 'tally',
    'Hub Clearance': 'clearance',
  };

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw new Error(`Google returned ${response.status}`);

    const csv = await response.text();
    const lines = csv.trim().split('\n');
    const headers = lines[0].replace(/\r/g, '').split(',').map(h => h.replace(/^"|"$/g, '').trim());

    // Column indices
    const idx = {};
    ['score_date','hub_name','system_szm_email','Zone','POD','SZM',
     'Score','Metric_Type','weighted_score','counts','szm_wise_day_rank']
      .forEach(col => { idx[col] = headers.indexOf(col); });

    // Pivot: group by szm+hub, aggregate metrics server-side
    const hubMap = {};

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].replace(/\r/g, '');
      if (!line.trim()) continue;

      // Fast CSV split
      const vals = [];
      let cur = '', inQ = false;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { vals.push(cur); cur = ''; }
        else { cur += ch; }
      }
      vals.push(cur);

      const get = (col) => (vals[idx[col]] || '').replace(/^"|"$/g, '').trim();

      const szm = get('system_szm_email');
      const hub = get('hub_name');
      if (!szm || !hub) continue;

      const key = szm + '||' + hub;
      if (!hubMap[key]) {
        const pod = get('POD');
        hubMap[key] = {
          szm, hub,
          name: get('SZM'),
          pod: (pod && !pod.includes('/') && !pod.includes(':')) ? pod : get('Zone'),
          rank: parseInt(get('szm_wise_day_rank')) || 0,
          date: get('score_date'),
          score: 0,
          m: {} // metrics
        };
      }

      const mtype = get('Metric_Type');
      const mkey = METRIC_MAP[mtype];
      if (!mkey) continue;

      const sc = parseFloat(get('Score')) || 0;
      const pend = parseInt(get('counts')) || 0;
      const wt = parseFloat(get('weighted_score')) || 0;

      const hub = hubMap[key];
      if (!hub.m[mkey]) {
        // First time seeing this metric for this hub
        hub.m[mkey] = { s: sc, p: pend, wt: wt };
        hub.score += wt;
      } else {
        // Same metric seen again (multiple sub-rows) — accumulate pending, keep highest score
        hub.m[mkey].p += pend;
        if (sc > hub.m[mkey].s) hub.m[mkey].s = sc;
      }
    }

    // Convert to compact array format
    // [szm, hub, score, issue_s, issue_p, clear_s, clear_p, d2za_s, d2za_p,
    //  fasr_s, fasr_p, tally_s, tally_p, bag_s, bag_p, rank, pod, date, name]
    const rows = Object.values(hubMap).map(h => {
      const m = h.m;
      const g = (k) => m[k] || { s: 0, p: 0 };
      return [
        h.szm, h.hub,
        parseFloat(h.score.toFixed(2)),
        g('issue').s, g('issue').p,
        g('clearance').s, g('clearance').p,
        g('d2za').s, g('d2za').p,
        g('fasr').s, g('fasr').p,
        g('tally').s, g('tally').p,
        g('bagging').s, g('bagging').p,
        h.rank, h.pod, h.date, h.name
      ];
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ rows, total: lines.length - 1 });

  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sheet', detail: err.message });
  }
}
