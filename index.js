require('dotenv').config();
const axios = require('axios');
const nodemailer = require('nodemailer');
const qs = require('querystring');

// ─── Config ───────────────────────────────────────────────
const API_KEY      = process.env.API_KEY;
const MASTER_KEY   = process.env.MASTER_KEY;
const PRODUCT_ID   = process.env.PRODUCT_ID;
const ANDROID_ID   = process.env.ANDROID_ID;
const GMAIL_USER   = process.env.GMAIL_USER;
const GMAIL_PASS   = process.env.GMAIL_PASS;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const INTERVAL_MS  = parseInt(process.env.CHECK_INTERVAL_MS) || 15000;

const API_URL = 'https://xyzcheats.com/api/reseller_v1.php';

// ─── Price List (sorted: highest first = best value first) ─
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
          <h2 style="color:#e94560;margin:0;font-size:22px;">🎮 XYZ Cheats</h2>
          <p style="color:#aaa;margin:5px 0 0;">Auto Key Generator</p>
        </div>
        <div style="padding:25px;background:#f9f9f9;">
          <p style="font-size:15px;color:#333;">✅ <strong>${duration}</strong> key generate ho gayi!</p>
          <p style="font-size:13px;color:#666;">💸 Balance used: <strong>₹${price}</strong></p>

          <p style="font-size:13px;font-weight:bold;color:#555;margin-bottom:5px;">🔑 Your Key:</p>
          <div style="background:#1a1a2e;color:#00ff88;font-family:monospace;font-size:16px;padding:15px;border-radius:8px;text-align:center;letter-spacing:2px;word-break:break-all;">
            ${key}
          </div>

          <p style="margin-top:20px;font-size:12px;color:#999;font-weight:bold;">📋 Full API Response:</p>
          <pre style="background:#eee;padding:10px;border-radius:6px;font-size:11px;overflow:auto;white-space:pre-wrap;">${JSON.stringify(rawResponse, null, 2)}</pre>

          <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;"/>
          <p style="color:#aaa;font-size:11px;text-align:center;">
            📱 Android ID: ${ANDROID_ID} &nbsp;|&nbsp; PID: ${PRODUCT_ID}
          </p>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
  console.log(`[EMAIL] ✅ Key email sent to ${NOTIFY_EMAIL}`);
}

// ─── Check Balance ────────────────────────────────────────
async function checkBalance() {
  const data = qs.stringify({ api_key: API_KEY, action: 'balance' });
  const res = await axios.post(API_URL, data, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-master-key': MASTER_KEY
    },
    timeout: 10000
  });
  return res.data;
}

// ─── Extract Balance Number ───────────────────────────────
function extractBalance(data) {
  const str = typeof data === 'object' ? JSON.stringify(data) : String(data);
  // Match ₹0.00 or just a number
  const match = str.match(/[\u20b9₹]?\s*([\d]+\.?\d*)/);
  return match ? parseFloat(match[1]) : 0;
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
let attempt = 0;

async function run() {
  attempt++;
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  console.log(`\n[${now}] 🔄 Check #${attempt}`);

  try {
    // 1. Balance check karo
    const balRaw = await checkBalance();
    const balance = extractBalance(balRaw);
    console.log(`[BALANCE] ₹${balance}`);

    if (balance <= 0) {
      console.log(`[WAIT] Balance nahi hai. ${INTERVAL_MS / 1000}s baad check...`);
      return;
    }

    // 2. Sabse badi duration dhundo jo afford ho sake
    const best = PRICE_LIST.find(p => balance >= p.price);

    if (!best) {
      console.log(`[WAIT] Balance ₹${balance} hai lekin minimum ₹10 chahiye. Wait...`);
      return;
    }

    console.log(`[BUY] Balance ₹${balance} → Best key: ${best.duration} (₹${best.price})`);

    // 3. Key buy karo
    const buyRes = await buyKey(best.duration);
    console.log(`[BUY] Response:`, buyRes);

    const resStr = typeof buyRes === 'object' ? JSON.stringify(buyRes) : String(buyRes);

    if (resStr.toLowerCase().includes('error') || resStr.toLowerCase().includes('low balance')) {
      console.log(`[ERROR] Key nahi bani: ${resStr}`);
      return;
    }

    // 4. Key extract karo
    const key = buyRes?.key || buyRes?.license || buyRes?.code || buyRes?.data || resStr;
    console.log(`[SUCCESS] 🎉 Key: ${key}`);

    // 5. Email bhejo
    await sendEmail(best.duration, best.price, key, buyRes);

    console.log(`[DONE] ✅ Bot kaam kar chuka hai! Process exit.`);
    process.exit(0);

  } catch (err) {
    console.log(`[ERROR] ${err.message}`);
  }
}

// ─── Start ────────────────────────────────────────────────
console.log('🤖 XYZ Cheats Smart Bot Started!');
console.log(`📱 Android ID : ${ANDROID_ID}`);
console.log(`📦 Product ID : ${PRODUCT_ID}`);
console.log(`📧 Notify     : ${NOTIFY_EMAIL}`);
console.log(`⚡ Interval   : ${INTERVAL_MS / 1000} seconds`);
console.log(`\n💡 Logic: Jaise hi balance aayega → Maximum duration ki key buy hogi!\n`);

run();
setInterval(run, INTERVAL_MS);
