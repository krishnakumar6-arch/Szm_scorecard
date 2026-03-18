export const config = { maxDuration: 30, memory: 1024 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const SHEET_ID = '1WV7v2CeS7RQHWCETpEF1SIVugrlrJf29XCYvcVvDZAI';
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

  const METRIC_MAP = {
    'Clearance':'clearance','Hub Clearance':'clearance',
    'Issue Raised Shipments Score':'issue','Issue Raised Shipments':'issue',
    'FASR':'fasr','FPSR':'fasr','FASR & FPSR':'fasr',
    'D2ZA':'d2za','D2+ ZA Pendency':'d2za',
    'Bagging Pendency':'bagging','Bagging & Connection':'bagging',
    'Tally':'tally','Shipment Tally':'tally',
  };

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    const text = await response.text();
    const lines = text.split('\n');

    // Parse headers
    // Columns: score_date(0), hub_name(1), system_szm_email(2), system_state_head_email(3),
    // system_pod_head_email(4), Zone(5), POD(6), State Head(7), SZM(8),
    // Score(9) = OVERALL HUB SCORE, Metric_Type(10), Priotity_type(11),
    // achieved_value(12) = METRIC-SPECIFIC SCORE, weighted_score(13),
    // counts(14), max_value(15), min_value(16), metric_weight(17), sub_category_weight(18)
    const headers = lines[0].replace(/\r/g,'').split(',').map(h=>h.replace(/^"|"$/g,'').trim());
    const ci = {
      date:     headers.indexOf('score_date'),
      hub:      headers.indexOf('hub_name'),
      szm:      headers.indexOf('system_szm_email'),
      zone:     headers.indexOf('Zone'),
      pod:      headers.indexOf('POD'),
      name:     headers.indexOf('SZM'),
      hubScore: headers.indexOf('Score'),          // Overall hub score
      mtype:    headers.indexOf('Metric_Type'),
      achieved: headers.indexOf('achieved_value'), // Per-metric score
      wt:       headers.indexOf('weighted_score'), // Contribution points
      cnt:      headers.indexOf('counts'),         // Pending count
      rank:     headers.indexOf('szm_wise_day_rank'),
    };

    // Pass 1: find latest date
    let latestDate = '';
    for (let i = 1; i < lines.length; i++) {
      const comma = lines[i].indexOf(',');
      if (comma < 0) continue;
      const d = lines[i].slice(0, comma).replace(/^"|"$/g,'').trim();
      if (d && d > latestDate) latestDate = d;
    }

    // Pass 2: process only latest date rows
    const hubs = new Map();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].replace(/\r/g,'');
      if (!line) continue;

      // Quick date check
      const comma = line.indexOf(',');
      const lineDate = line.slice(0, comma).replace(/^"|"$/g,'').trim();
      if (lineDate !== latestDate) continue;

      // Full CSV parse
      const vals = [];
      let cur = '', inQ = false;
      for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { vals.push(cur); cur = ''; }
        else { cur += ch; }
      }
      vals.push(cur);
      const get = idx => idx >= 0 ? (vals[idx]||'').replace(/^"|"$/g,'').trim() : '';

      const szm = get(ci.szm);
      const hub = get(ci.hub);
      if (!szm || !hub) continue;

      const mtype = get(ci.mtype);
      const mkey = METRIC_MAP[mtype];
      if (!mkey) continue;

      const key = szm + '|' + hub;
      if (!hubs.has(key)) {
        const pod = get(ci.pod);
        hubs.set(key, {
          s: szm, h: hub,
          n: get(ci.name),
          p: (pod && !pod.includes('/') && !pod.includes(':')) ? pod : get(ci.zone),
          r: parseInt(get(ci.rank)) || 0,
          d: latestDate,
          hubScore: parseFloat(get(ci.hubScore)) || 0, // Overall hub score
          m: {}
        });
      }

      const e = hubs.get(key);
      if (!e.m[mkey]) {
        // achieved_value = metric-specific score (e.g. 87.18 for clearance)
        // counts = pending shipments for this metric
        // weighted_score = contribution to total (e.g. 5 pts)
        e.m[mkey] = {
          s: parseFloat(get(ci.achieved)) || 0,  // METRIC score
          p: parseInt(get(ci.cnt)) || 0,          // Pending count
          w: parseFloat(get(ci.wt)) || 0          // Weighted contribution
        };
      }
    }

    // Output: use hubScore as overall score (already computed in sheet)
    // [szm(0), hub(1), hubScore(2), issue_s(3), issue_p(4), clear_s(5), clear_p(6),
    //  d2za_s(7), d2za_p(8), fasr_s(9), fasr_p(10), tally_s(11), tally_p(12),
    //  bag_s(13), bag_p(14), rank(15), pod(16), date(17), name(18)]
    const rows = [];
    for (const e of hubs.values()) {
      const g = k => e.m[k] || { s: 0, p: 0 };
      rows.push([
        e.s, e.h,
        e.hubScore,
        g('issue').s,    g('issue').p,
        g('clearance').s,g('clearance').p,
        g('d2za').s,     g('d2za').p,
        g('fasr').s,     g('fasr').p,
        g('tally').s,    g('tally').p,
        g('bagging').s,  g('bagging').p,
        e.r, e.p, e.d, e.n
      ]);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({ rows, total: lines.length - 1, date: latestDate });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
