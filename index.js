require('dotenv').config();
const axios = require('axios');
const nodemailer = require('nodemailer');
const qs = require('querystring');
const http = require('http');

// ─── Config ───────────────────────────────────────────────
const API_KEY      = process.env.API_KEY;
const MASTER_KEY   = process.env.MASTER_KEY;
const PRODUCT_ID   = process.env.PRODUCT_ID;
const ANDROID_ID   = process.env.ANDROID_ID;
const GMAIL_USER   = process.env.GMAIL_USER;
const GMAIL_PASS   = process.env.GMAIL_PASS;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const INTERVAL_MS  = parseInt(process.env.CHECK_INTERVAL_MS) || 15000;
const PORT         = process.env.PORT || 3000;

const API_URL = 'https://xyzcheats.com/api/reseller_v1.php';

// ─── Price List (highest first) ───────────────────────────
const PRICE_LIST = [
  { duration: '7 DaYs',  price: 1680 },
  { duration: '5 DaYs',  price: 1200 },
  { duration: '3 DaYs',  price: 720  },
  { duration: '2 DaYs',  price: 480  },
  { duration: '1 DaYs',  price: 240  },
  { duration: '12 Hours', price: 120 },
  { duration: '6 Hours',  price: 60  },
  { duration: '3 Hours',  price: 30  },
  { duration: '1 Hours',  price: 10  },
];

// ─── Bot State ────────────────────────────────────────────
let botStatus = 'running';
let lastCheck = 'Never';
let lastBalance = '₹0';
let attempt = 0;
let keyGenerated = false;

// ─── Simple HTTP Server (keeps Render alive) ──────────────
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`
    <html>
      <head><title>XYZ Bot Status</title></head>
      <body style="font-family:Arial;background:#1a1a2e;color:#fff;padding:30px;text-align:center;">
        <h2 style="color:#e94560;">🤖 XYZ Cheats Bot</h2>
        <p>Status: <strong style="color:#00ff88;">${botStatus.toUpperCase()}</strong></p>
        <p>Last Check: ${lastCheck}</p>
        <p>Last Balance: ${lastBalance}</p>
        <p>Checks Done: ${attempt}</p>
        <p>Key Generated: ${keyGenerated ? '✅ YES' : '❌ Not yet'}</p>
      </body>
    </html>
  `);
});

server.listen(PORT, () => {
  console.log(`[SERVER] ✅ HTTP server running on port ${PORT}`);
});

// ─── Email Transporter ────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: GMAIL_USER, pass: GMAIL_PASS }
});

// ─── Send Email ───────────────────────────────────────────
async function sendEmail(duration, price, key, rawResponse) {
  const mailOptions = {
    from: GMAIL_USER,
    to: NOTIFY_EMAIL,
    subject: `✅ Key Ready! ${duration} - XYZ Cheats`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.15);">
        <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:25px;text-align:center;">
          <h2 style="color:#e94560;margin:0;">🎮 XYZ Cheats</h2>
          <p style="color:#aaa;margin:5px 0 0;">Auto Key Generator</p>
        </div>
        <div style="padding:25px;background:#f9f9f9;">
          <p style="font-size:15px;">✅ <strong>${duration}</strong> key generate ho gayi!</p>
          <p style="font-size:13px;color:#666;">💸 Balance used: <strong>₹${price}</strong></p>
          <p style="font-size:13px;font-weight:bold;color:#555;margin-bottom:5px;">🔑 Your Key:</p>
          <div style="background:#1a1a2e;color:#00ff88;font-family:monospace;font-size:16px;padding:15px;border-radius:8px;text-align:center;word-break:break-all;">
            ${key}
          </div>
          <p style="margin-top:20px;font-size:12px;color:#999;font-weight:bold;">📋 Full Response:</p>
          <pre style="background:#eee;padding:10px;border-radius:6px;font-size:11px;overflow:auto;white-space:pre-wrap;">${JSON.stringify(rawResponse, null, 2)}</pre>
          <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;"/>
          <p style="color:#aaa;font-size:11px;text-align:center;">📱 Android ID: ${ANDROID_ID} | PID: ${PRODUCT_ID}</p>
        </div>
      </div>
    `
  };
  await transporter.sendMail(mailOptions);
  console.log(`[EMAIL] ✅ Sent to ${NOTIFY_EMAIL}`);
}

// ─── Buy Key ─────────────────────────────────────────────
async function buyKey(duration) {
  const data = qs.stringify({
    api_key:    API_KEY,
    action:     'buy',
    product_id: PRODUCT_ID,
    duration:   duration,
    android_id: ANDROID_ID
  });
  const res = await axios.post(API_URL, data, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-master-key': MASTER_KEY
    },
    timeout: 15000
  });
  return res.data;
}

// ─── Main Loop ────────────────────────────────────────────
async function run() {
  if (keyGenerated) return;

  attempt++;
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  lastCheck = now;
  console.log(`\n[${now}] 🔄 Attempt #${attempt} — Buy try kar raha hoon...`);

  // Sabse badi duration se start karo, neeche aao
  for (const item of PRICE_LIST) {
    try {
      console.log(`[TRY] ${item.duration} (₹${item.price})`);
      const buyRes = await buyKey(item.duration);
      const resStr = typeof buyRes === 'object' ? JSON.stringify(buyRes) : String(buyRes);
      console.log(`[RESP] ${resStr}`);

      // Low balance — chhoti duration try karo
      if (resStr.toLowerCase().includes('low balance')) {
        lastBalance = 'Low (trying smaller...)';
        console.log(`[LOW] ₹ kam hai, chhoti key try karta hoon...`);
        continue;
      }

      // Koi aur error
      if (resStr.toLowerCase().includes('error')) {
        console.log(`[ERROR] ${resStr}`);
        continue;
      }

      // 🎉 Key mil gayi!
      const key = buyRes?.key || buyRes?.license || buyRes?.code || buyRes?.data || resStr;
      console.log(`[SUCCESS] 🎉 Key: ${key}`);
      lastBalance = `Used ₹${item.price}`;
      keyGenerated = true;
      botStatus = 'done - key generated!';
      await sendEmail(item.duration, item.price, key, buyRes);
      console.log(`[DONE] ✅ Email bhej diya!`);
      return;

    } catch (err) {
      console.log(`[ERR] ${item.duration}: ${err.message}`);
    }
  }

  console.log(`[WAIT] Koi bhi key nahi bani — 15s baad dobara try...`);
}

// ─── Start ────────────────────────────────────────────────
console.log('🤖 XYZ Cheats Smart Bot Started! (Free Web Service Mode)');
console.log(`⚡ Checking every ${INTERVAL_MS / 1000} seconds`);

run();
setInterval(run, INTERVAL_MS);
