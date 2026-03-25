const puppeteer = require('puppeteer');
const nodemailer = require('nodemailer');

const SITE_URL = process.env.SITE_URL;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const TO_EMAIL = process.env.TO_EMAIL || GMAIL_USER;

// Validate secrets before doing anything
if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
  console.error('ERROR: GMAIL_USER or GMAIL_APP_PASSWORD secret is missing.');
  process.exit(1);
}

async function takeScreenshot() {
  console.log('Launching Chrome...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1440,900'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log(`Opening ${SITE_URL}...`);
  await page.goto(SITE_URL, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // Wait for data to actually load — look for a real element on the page
  console.log('Waiting for scorecard to render...');
  try {
    await page.waitForSelector('table, canvas, .scorecard, #root > *', {
      timeout: 30000
    });
  } catch (e) {
    console.log('Selector wait timed out, taking screenshot anyway...');
  }

  // Extra buffer for charts/data to finish rendering
  await new Promise(r => setTimeout(r, 5000));

  const screenshotPath = '/tmp/szm-scorecard.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved.');

  await browser.close();
  return screenshotPath;
}

async function sendEmail(screenshotPath) {
  console.log('Sending email...');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD
    }
  });

  const now = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  await transporter.sendMail({
    from: `"SZM Scorecard Bot 📊" <${GMAIL_USER}>`,
    to: TO_EMAIL,
    subject: `📊 SZM Scorecard Snapshot — ${now} IST`,
    html: `
      <div style="font-family:sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;border-radius:12px;overflow:hidden">
        <div style="background:#020817;padding:20px 28px;display:flex;align-items:center;gap:12px">
          <div>
            <div style="color:#F1EE1B;font-size:18px;font-weight:900;letter-spacing:0.02em">SHADOWFAX</div>
            <div style="color:#008A71;font-size:12px;margin-top:2px">SZM Scorecard — Hourly Snapshot</div>
          </div>
        </div>
        <div style="padding:24px 28px">
          <p style="color:#374151;font-size:14px;margin:0 0 16px">
            Automated snapshot captured at <strong>${now} IST</strong>
          </p>
          <img src="cid:scorecard"
            style="width:100%;border-radius:8px;border:1px solid #e5e7eb;display:block"/>
          <div style="margin-top:20px;padding:14px 16px;background:#fff;border-radius:8px;border:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#6b7280">
              🔗 View live dashboard: 
              <a href="${SITE_URL}" style="color:#008A71;font-weight:600">${SITE_URL}</a>
            </p>
            <p style="margin:8px 0 0;font-size:11px;color:#9ca3af">
              This email is auto-generated every hour by GitHub Actions. 
              To stop, disable the workflow in the repo settings.
            </p>
          </div>
        </div>
      </div>
    `,
    attachments: [{
      filename: `szm-scorecard-${Date.now()}.png`,
      path: screenshotPath,
      cid: 'scorecard'
    }]
  });

  console.log(`Email sent to ${TO_EMAIL}`);
}

(async () => {
  try {
    const path = await takeScreenshot();
    await sendEmail(path);
    console.log('Done!');
  } catch (e) {
    console.error('Failed:', e.message);
    process.exit(1);
  }
})();
