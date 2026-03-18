export const config = { maxDuration: 30 };

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
    if (!response.ok) throw new Error(`Google returned ${response.status}`);

    const text = await response.text();
    const lines = text.split('\n');
    const total = lines.length - 1;

    // Parse header
    const rawHdr = lines[0].replace(/\r/g,'');
    const headers = rawHdr.split(',').map(h => h.replace(/^"|"$/g,'').trim());

    const ci = {
      date:   headers.indexOf('score_date'),
      hub:    headers.indexOf('hub_name'),
      szm:    headers.indexOf('system_szm_email'),
      zone:   headers.indexOf('Zone'),
      pod:    headers.indexOf('POD'),
      name:   headers.indexOf('SZM'),
      score:  headers.indexOf('Score'),
      mtype:  headers.indexOf('Metric_Type'),
      wt:     headers.indexOf('weighted_score'),
      cnt:    headers.indexOf('counts'),
      rank:   headers.indexOf('szm_wise_day_rank'),
    };

    // Compact hub map - use Map for memory efficiency
    const hubs = new Map();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].replace(/\r/g,'');
      if (!line) continue;

      // Fast split without regex
      const vals = line.split(',');
      const get = (idx) => idx >= 0 ? (vals[idx]||'').replace(/^"|"$/g,'').trim() : '';

      const szm = get(ci.szm);
      const hub = get(ci.hub);
      if (!szm || !hub) continue;

      const mtype = get(ci.mtype);
      const mkey = METRIC_MAP[mtype];
      if (!mkey) continue;

      const key = szm + '\x00' + hub;

      if (!hubs.has(key)) {
        const pod = get(ci.pod);
        hubs.set(key, {
          s: szm, h: hub,
          n: get(ci.name),
          p: (pod && !pod.includes('/') && !pod.includes(':')) ? pod : get(ci.zone),
          r: parseInt(get(ci.rank))||0,
          d: get(ci.date),
          sc: 0,
          m: {}
        });
      }

      const entry = hubs.get(key);
      if (!entry.m[mkey]) {
        const wt = parseFloat(get(ci.wt))||0;
        entry.m[mkey] = {
          s: parseFloat(get(ci.score))||0,
          p: parseInt(get(ci.cnt))||0
        };
        entry.sc += wt;
      }
    }

    // Convert to compact arrays
    const rows = [];
    for (const e of hubs.values()) {
      const m = e.m;
      const g = k => m[k] || {s:0,p:0};
      rows.push([
        e.s, e.h,
        +e.sc.toFixed(2),
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
    res.status(200).json({ rows, total });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
