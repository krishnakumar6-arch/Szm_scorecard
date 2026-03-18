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
    const total = lines.length - 1;

    // Parse headers
    const headers = lines[0].replace(/\r/g,'').split(',').map(h=>h.replace(/^"|"$/g,'').trim());
    const ci = {
      date:  headers.indexOf('score_date'),
      hub:   headers.indexOf('hub_name'),
      szm:   headers.indexOf('system_szm_email'),
      zone:  headers.indexOf('Zone'),
      pod:   headers.indexOf('POD'),
      name:  headers.indexOf('SZM'),
      score: headers.indexOf('Score'),
      mtype: headers.indexOf('Metric_Type'),
      wt:    headers.indexOf('weighted_score'),
      cnt:   headers.indexOf('counts'),
      rank:  headers.indexOf('szm_wise_day_rank'),
    };

    // Pass 1: find the latest date (just read col 0 of each line quickly)
    let latestDate = '';
    for (let i = 1; i < lines.length; i++) {
      const comma = lines[i].indexOf(',');
      if (comma < 0) continue;
      const d = lines[i].slice(0, comma).replace(/^"|"$/g,'').trim();
      if (d && d > latestDate) latestDate = d;
    }

    // Pass 2: process only rows with latest date
    const hubs = new Map();
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].replace(/\r/g,'');
      if (!line) continue;

      // Quick date check before full parse
      const comma = line.indexOf(',');
      const lineDate = line.slice(0, comma).replace(/^"|"$/g,'').trim();
      if (lineDate !== latestDate) continue;

      // Full parse only for today's rows
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
          s:szm, h:hub,
          n:get(ci.name),
          p:(pod&&!pod.includes('/')&&!pod.includes(':'))?pod:get(ci.zone),
          r:parseInt(get(ci.rank))||0,
          d:latestDate,
          sc:0, m:{}
        });
      }
      const e = hubs.get(key);
      if (!e.m[mkey]) {
        e.m[mkey] = { s:parseFloat(get(ci.score))||0, p:parseInt(get(ci.cnt))||0 };
        e.sc += parseFloat(get(ci.wt))||0;
      }
    }

    const rows = [];
    for (const e of hubs.values()) {
      const g = k => e.m[k]||{s:0,p:0};
      rows.push([
        e.s, e.h, +e.sc.toFixed(2),
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
    res.status(200).json({ rows, total, date: latestDate });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
