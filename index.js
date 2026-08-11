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
let keyHistory = []; // All generated keys history
let failedCount = 0;  // Failed attempts counter

// ─── Simple HTTP Server (keeps Render alive) ──────────────
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });

  const historyHTML = keyHistory.length === 0
    ? `<p style="color:#888;text-align:center;margin-top:20px;">Abhi tak koi key generate nahi hui...</p>`
    : keyHistory.map((k, i) => `
      <div style="background:#0f3460;border-radius:10px;padding:15px;margin-bottom:15px;text-align:left;border-left:4px solid #e94560;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="color:#e94560;font-weight:bold;font-size:13px;">#${keyHistory.length - i} &nbsp;|&nbsp; ${k.duration} &nbsp;|&nbsp; ₹${k.price}</span>
          <span style="color:#888;font-size:11px;">${k.time}</span>
        </div>
        <div style="background:#1a1a2e;border-radius:6px;padding:10px;font-family:monospace;font-size:12px;color:#00ff88;word-break:break-all;">${k.key}</div>
        <button onclick="navigator.clipboard.writeText('${k.key}')" style="margin-top:8px;background:#e94560;color:#fff;border:none;padding:5px 12px;border-radius:5px;cursor:pointer;font-size:12px;">📋 Copy Key</button>
      </div>
    `).join('');

  res.end(`<!DOCTYPE html>
    <html>
    <head>
      <title>XYZ Cheats Bot</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; background: #1a1a2e; color: #fff; min-height: 100vh; }
        .header { background: linear-gradient(135deg,#16213e,#0f3460); padding: 25px; text-align: center; border-bottom: 2px solid #e94560; }
        .header h1 { color: #e94560; font-size: 24px; } 
        .header p { color: #aaa; font-size: 13px; margin-top: 5px; }
        .stats { display: flex; flex-wrap: wrap; gap: 12px; padding: 20px; justify-content: center; }
        .stat { background: #16213e; border-radius: 10px; padding: 15px 25px; text-align: center; min-width: 140px; border: 1px solid #0f3460; }
        .stat .val { font-size: 22px; font-weight: bold; color: #00ff88; }
        .stat .lbl { font-size: 11px; color: #888; margin-top: 4px; }
        .section { padding: 0 20px 20px; max-width: 800px; margin: 0 auto; }
        .section h2 { color: #e94560; margin-bottom: 15px; font-size: 18px; border-bottom: 1px solid #0f3460; padding-bottom: 10px; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .badge.running { background: #00ff8833; color: #00ff88; }
        .badge.done { background: #e9456033; color: #e94560; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🤖 XYZ Cheats Bot</h1>
        <p>Auto Key Generator Dashboard</p>
      </div>

      <div class="stats">
        <div class="stat">
          <div class="val"><span class="badge ${keyGenerated ? 'done' : 'running'}">${botStatus.toUpperCase()}</span></div>
          <div class="lbl">Bot Status</div>
        </div>
        <div class="stat">
          <div class="val">${attempt}</div>
          <div class="lbl">Total Checks</div>
        </div>
        <div class="stat">
          <div class="val">${keyHistory.length}</div>
          <div class="lbl">Keys Generated</div>
        </div>
        <div class="stat">
          <div class="val" style="font-size:14px;">${lastCheck}</div>
          <div class="lbl">Last Check</div>
        </div>
      </div>

      <div class="section">
        <h2>🔑 Generated Keys History</h2>
        ${historyHTML}
      </div>
    </body>
    </html>
  `);
});

server.listen(PORT, () => {
  console.log(`[SERVER] ✅ HTTP server running on port ${PORT}`);
});

// ─── Email Transporter (Explicit SMTP for Render) ─────────
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // SSL
  auth: {
    user: GMAIL_USER,
    pass: (GMAIL_PASS || '').replace(/\s/g, '') // Spaces remove karo
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000
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

      // History mein save karo
      keyHistory.unshift({
        key: key,
        duration: item.duration,
        price: item.price,
        time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
      });

      await sendEmail(item.duration, item.price, key, buyRes);
      console.log(`[DONE] ✅ Email bhej diya!`);
      return;

    } catch (err) {
      console.log(`[ERR] ${item.duration}: ${err.message}`);
    }
  }

  // ─── Har 2 failed checks pe email ────────────────────────
  failedCount++;
  console.log(`[FAIL] Failed attempt #${failedCount}`);

  if (failedCount % 2 === 0) {
    console.log(`[ALERT] 2 fails ho gaye — balance low email bhej raha hoon...`);
    try {
      await transporter.sendMail({
        from: GMAIL_USER,
        to: NOTIFY_EMAIL,
        subject: `⚠️ Balance Low! Recharge Karo — XYZ Bot`,
        html: `
          <div style="font-family:Arial;max-width:480px;margin:auto;border-radius:12px;overflow:hidden;">
            <div style="background:#1a1a2e;padding:20px;text-align:center;border-bottom:3px solid #e94560;">
              <h2 style="color:#e94560;margin:0;">⚠️ Balance Low Alert!</h2>
            </div>
            <div style="background:#f9f9f9;padding:25px;">
              <p style="font-size:15px;color:#333;">Bot ne <strong>${failedCount}</strong> baar check kiya — balance kaafi nahi hai key generate karne ke liye।</p>
              <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:15px;margin:15px 0;">
                <p style="color:#856404;margin:0;">💰 <strong>Minimum ₹10 recharge karo</strong> taaki bot automatically key generate kar sake!</p>
              </div>
              <p style="color:#888;font-size:12px;">Total failed attempts: ${failedCount} | Bot har 15 seconds mein check karta hai।</p>
              <hr/>
              <p style="color:#aaa;font-size:11px;text-align:center;">XYZ Cheats Auto Bot 🤖</p>
            </div>
          </div>
        `
      });
      console.log(`[ALERT EMAIL] ✅ Low balance email sent!`);
    } catch (e) {
      console.log(`[ALERT EMAIL ERROR] ${e.message}`);
    }
  }

  console.log(`[WAIT] Koi bhi key nahi bani — 15s baad dobara try...`);
}

// ─── Start ────────────────────────────────────────────────
console.log('🤖 XYZ Cheats Smart Bot Started! (Free Web Service Mode)');
console.log(`⚡ Checking every ${INTERVAL_MS / 1000} seconds`);

run();
setInterval(run, INTERVAL_MS);
