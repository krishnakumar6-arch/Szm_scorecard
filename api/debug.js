export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const SHEET_ID = '1WV7v2CeS7RQHWCETpEF1SIVugrlrJf29XCYvcVvDZAI';
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const csv = await response.text();

    const lines = csv.trim().split('\n');
    const headers = lines[0].replace(/\r/g,'').split(',').map(h => h.replace(/^"|"$/g,'').trim());
    const metricTypeIdx = headers.indexOf('Metric_Type');
    const szmIdx = headers.indexOf('system_szm_email');
    const hubIdx = headers.indexOf('hub_name');

    // Get unique Metric_Type values and count rows
    const metricTypes = new Set();
    const szms = new Set();
    lines.slice(1).forEach(line => {
      const vals = line.replace(/\r/g,'').split(',');
      if (vals[metricTypeIdx]) metricTypes.add(vals[metricTypeIdx].replace(/^"|"$/g,'').trim());
      if (vals[szmIdx]) szms.add(vals[szmIdx].replace(/^"|"$/g,'').trim());
    });

    res.status(200).json({
      totalRows: lines.length - 1,
      headers,
      uniqueMetricTypes: [...metricTypes],
      uniqueSZMs: [...szms],
      sampleRow: lines[1]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
