import { BigQuery } from '@google-cloud/bigquery';

const bigquery = new BigQuery({
  projectId: process.env.BQ_PROJECT_ID,
  credentials: JSON.parse(process.env.BQ_SERVICE_ACCOUNT_KEY),
});

export default async function handler(req, res) {
  try {
    const query = `
      SELECT
        system_szm_email,
        hub_name,
        Hub_Score_Live,
        Issue_Raised_Shipments_Score_out_of_100,
        Issue_Raised_Pending_Shipments_Count,
        Clearance_Score_out_of_100,
        Clearance_Pending_Shipments_Count,
        D2ZA_Score_out_of_100,
        D2ZA_Pending_Shipments_Count,
        FASR_Score_out_of_100,
        FASR_Pending_Shipments_Count,
        Tally_Score_out_of_100,
        Tally_Pending_Shipments_Count,
        Bagging_Pendency_Score_out_of_100,
        Bagging_Pending_Shipments_Count,
        szm_wise_day_rank,
        system_pod_name,
        ist_last_calculated_at,
        score_date
      FROM \`${process.env.BQ_PROJECT_ID}.szm_scorecard.szm_scorecard\`
      ORDER BY system_szm_email, hub_name
    `;

    const [rows] = await bigquery.query({ query });

    const headers = [
      'system_szm_email','hub_name','Hub_Score_Live',
      'Issue_Raised_Shipments_Score_out_of_100','Issue_Raised_Pending_Shipments_Count',
      'Clearance_Score_out_of_100','Clearance_Pending_Shipments_Count',
      'D2ZA_Score_out_of_100','D2ZA_Pending_Shipments_Count',
      'FASR_Score_out_of_100','FASR_Pending_Shipments_Count',
      'Tally_Score_out_of_100','Tally_Pending_Shipments_Count',
      'Bagging_Pendency_Score_out_of_100','Bagging_Pending_Shipments_Count',
      'szm_wise_day_rank','system_pod_name','ist_last_calculated_at','score_date'
    ];

    const csvRows = rows.map(r =>
      headers.map(h => {
        const v = r[h] ?? '';
        return String(v).includes(',') ? `"${v}"` : v;
      }).join(',')
    );

    const csv = [headers.join(','), ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(csv);

  } catch (err) {
    console.error('BigQuery error:', err);
    res.status(500).json({ error: 'Failed to fetch data', detail: err.message });
  }
}
