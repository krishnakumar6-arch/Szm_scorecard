const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');

const URL = process.env.SITE_URL;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const TO_EMAIL = process.env.TO_EMAIL || GMAIL_USER;

async function takeScreenshot() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    headless: 'new'
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  const path = '/tmp/szm-scorecard.png';
  await page.screenshot({ path, fullPage: true });
  await browser.close();
  console.log('Screenshot taken');
  return path;
}

async function sendEmail(screenshotPath) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
  });
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  await transporter.sendMail({
    from: `"SZM Scorecard Bot" <${GMAIL_USER}>`,
    to: TO_EMAIL,
    subject: `📊 SZM Scorecard — ${now} IST`,
    html: `
      <div style="font-family:sans-serif;max-width:700px;margin:0 auto">
        <div style="background:#020817;padding:20px 24px;border-radius:10px 10px 0 0">
          <span style="color:#F1EE1B;font-size:18px;font-weight:900">SHADOWFAX</span>
          <span style="color:#008A71;font-size:14px;margin-left:10px">SZM Scorecard</span>
        </div>
        <div style="background:#f9fafb;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 10px 10px">
          <p style="color:#374151;font-size:14px;margin:0 0 16px">Hourly snapshot at <strong>${now} IST</strong></p>
          <img src="cid:scorecard" style="width:100%;border-radius:8px;border:1px solid #e5e7eb"/>
          <p style="color:#9ca3af;font-size:12px;margin:16px 0 0">
            View live: <a href="${URL}" style="color:#008A71">${URL}</a>
          </p>
        </div>
      </div>`,
    attachments: [{ filename: 'szm-scorecard.png', path: screenshotPath, cid: 'scorecard' }]
  });
  console.log(`Email sent to ${TO_EMAIL}`);
}

(async () => {
  try {
    const path = await takeScreenshot();
    await sendEmail(path);
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
