export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const SHEET_ID = '1WV7v2CeS7RQHWCETpEF1SIVugrlrJf29XCYvcVvDZAI';
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=0`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw new Error(`Google returned ${response.status}`);
    const csv = await response.text();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sheet', detail: err.message });
  }
}
