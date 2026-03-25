const puppeteer = require('puppeteer-core');
const { Resend } = require('resend');
const fs = require('fs');
const { execSync } = require('child_process');

const SITE_URL = process.env.SITE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TO_EMAIL = process.env.TO_EMAIL;
const FROM_EMAIL = process.env.FROM_EMAIL || 'onboarding@resend.dev';

// Print all env vars (masked) for debugging
console.log('=== Config Check ===');
console.log('SITE_URL:', SITE_URL || 'MISSING');
console.log('RESEND_API_KEY:', RESEND_API_KEY ? `set (${RESEND_API_KEY.substring(0,8)}...)` : 'MISSING');
console.log('TO_EMAIL:', TO_EMAIL || 'MISSING');
console.log('FROM_EMAIL:', FROM_EMAIL);
console.log('===================');

if (!RESEND_API_KEY) { console.error('FATAL: RESEND_API_KEY missing'); process.exit(1); }
if (!TO_EMAIL) { console.error('FATAL: TO_EMAIL missing'); process.exit(1); }

function findChrome() {
  const paths = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium'
  ];
  for (const p of paths) {
    try {
      execSync(`test -f "${p}"`);
      console.log('Found Chrome at:', p);
      return p;
    } catch (_) {}
  }
  // Try which command
  try {
    const path = execSync('which google-chrome || which chromium-browser || which chromium').toString().trim();
    if (path) { console.log('Found Chrome via which:', path); return path; }
  } catch (_) {}
  throw new Error('Chrome not found on system');
}

async function takeScreenshot() {
  const chromePath = findChrome();

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  console.log('Navigating to:', SITE_URL);
  await page.goto(SITE_URL, { waitUntil: 'networkidle2', timeout: 60000 });

  try {
    await page.waitForSelector('table, canvas, #root > *', { timeout: 30000 });
  } catch (e) { console.log('Selector wait timed out'); }

  await new Promise(r => setTimeout(r, 5000));

  const screenshotPath = '/tmp/szm-scorecard.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const size = fs.statSync(screenshotPath).size;
  console.log(`Screenshot saved: ${screenshotPath} (${Math.round(size/1024)}KB)`);
  await browser.close();
  return screenshotPath;
}

async function sendEmail(screenshotPath) {
  console.log('Sending via Resend...');
  const resend = new Resend(RESEND_API_KEY);

  const now = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: '2-digit',
    month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  const imageData = fs.readFileSync(screenshotPath).toString('base64');

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: [TO_EMAIL],
    subject: `📊 SZM Scorecard — ${now} IST`,
    html: `
      <div style="font-family:sans-serif;max-width:700px;margin:0 auto;background:#f9fafb;border-radius:12px;overflow:hidden">
        <div style="background:#020817;padding:20px 28px">
          <div style="color:#F1EE1B;font-size:18px;font-weight:900">SHADOWFAX</div>
          <div style="color:#008A71;font-size:12px;margin-top:2px">SZM Scorecard — Hourly Snapshot</div>
        </div>
        <div style="padding:24px 28px">
          <p style="color:#374151;font-size:14px;margin:0 0 16px">Snapshot at <strong>${now} IST</strong></p>
          <img src="cid:scorecard" style="width:100%;border-radius:8px;border:1px solid #e5e7eb"/>
          <p style="margin:16px 0 0;font-size:12px;color:#6b7280">
            🔗 <a href="${SITE_URL}" style="color:#008A71">${SITE_URL}</a>
          </p>
        </div>
      </div>`,
    attachments: [{ filename: 'szm-scorecard.png', content: imageData }]
  });

  if (error) {
    console.error('Resend API error:', JSON.stringify(error, null, 2));
    throw new Error(`Resend failed: ${error.message}`);
  }

  console.log('Email sent! ID:', data.id);
}

(async () => {
  try {
    const path = await takeScreenshot();
    await sendEmail(path);
    console.log('All done!');
  } catch (e) {
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
