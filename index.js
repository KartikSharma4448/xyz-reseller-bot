require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { Resend } = require('resend');
const qs = require('querystring');
const path = require('path');

// ─── Config ───────────────────────────────────────────────
const API_KEY      = process.env.API_KEY;
const MASTER_KEY   = process.env.MASTER_KEY;
const PRODUCT_ID   = process.env.PRODUCT_ID;
const ANDROID_ID   = process.env.ANDROID_ID;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const RESEND_KEY   = process.env.RESEND_API_KEY;

const SUPABASE_URL = process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const resend = new Resend(RESEND_KEY);
const PORT = process.env.PORT || 3000;
const API_URL = 'https://xyzcheats.com/api/reseller_v1.php';

// ─── Price List ───────────────────────────────────────────
const PRICE_LIST = [
  { duration: '7 DaYs',   price: 1680, ms: 7  * 24 * 60 * 60 * 1000 },
  { duration: '5 DaYs',   price: 1200, ms: 5  * 24 * 60 * 60 * 1000 },
  { duration: '3 DaYs',   price: 720,  ms: 3  * 24 * 60 * 60 * 1000 },
  { duration: '2 DaYs',   price: 480,  ms: 2  * 24 * 60 * 60 * 1000 },
  { duration: '1 DaYs',   price: 240,  ms: 1  * 24 * 60 * 60 * 1000 },
  { duration: '12 Hours', price: 120,  ms: 12 * 60 * 60 * 1000       },
  { duration: '6 Hours',  price: 60,   ms: 6  * 60 * 60 * 1000       },
  { duration: '3 Hours',  price: 30,   ms: 3  * 60 * 60 * 1000       },
  { duration: '1 Hours',  price: 10,   ms: 1  * 60 * 60 * 1000       },
];

let keyHistory = []; // In-memory history for panel

// ─── Express App Setup ────────────────────────────────────
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: 'xyz-panel-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// ─── Middleware: Check Auth ───────────────────────────────
const checkAuth = (req, res, next) => {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
};

// ─── Helper Functions ─────────────────────────────────────
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

async function sendEmail(duration, price, key, rawResponse) {
  const { error } = await resend.emails.send({
    from: 'XYZ Bot <onboarding@resend.dev>',
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
  });
  if (error) throw new Error(error.message);
  console.log(`[EMAIL] ✅ Sent to ${NOTIFY_EMAIL}`);
}

// ─── Routes ───────────────────────────────────────────────

app.get('/login', (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    // Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        return res.render('login', { error: error.message });
    }

    req.session.user = data.user;
    res.redirect('/');
});

app.get('/logout', async (req, res) => {
    await supabase.auth.signOut();
    req.session.destroy();
    res.redirect('/login');
});

app.get('/', checkAuth, (req, res) => {
    res.render('dashboard', { 
        user: req.session.user,
        prices: PRICE_LIST,
        history: keyHistory
    });
});

app.post('/generate', checkAuth, async (req, res) => {
    const { duration } = req.body;
    const item = PRICE_LIST.find(p => p.duration === duration);
    if (!item) return res.redirect('/');

    try {
        const buyRes = await buyKey(item.duration);
        const resStr = typeof buyRes === 'object' ? JSON.stringify(buyRes) : String(buyRes);
        
        if (resStr.toLowerCase().includes('low balance')) {
            console.log(`[ERROR] Low Balance`);
            // You can flash error messages here in future
        } else if (resStr.toLowerCase().includes('error')) {
            console.log(`[ERROR] ${resStr}`);
        } else {
            // Success
            const key = buyRes?.key || buyRes?.license || buyRes?.code || buyRes?.data || resStr;
            const expiryTime = new Date(Date.now() + item.ms);
            
            keyHistory.unshift({
                key: key,
                duration: item.duration,
                price: item.price,
                time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                expiresAt: expiryTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
            });

            await sendEmail(item.duration, item.price, key, buyRes);
        }
    } catch (err) {
        console.error(`[GENERATE ERROR]`, err.message);
    }
    
    res.redirect('/');
});

// ─── Start Server ─────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Reseller Panel running on http://localhost:${PORT}`);
});
