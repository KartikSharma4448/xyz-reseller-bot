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

// ─── Products ───────────────────────────────────────────
const PRODUCTS = {
  133: {
    name: 'BALA MOD XYZ FF MAIN ID NONROOT',
    requiresAndroidId: true,
    durations: ['1 Hours', '3 Hours', '6 Hours', '12 Hours', '1 DaYs', '2 DaYs', '3 DaYs', '5 DaYs', '7 DaYs']
  },
  49: {
    name: 'BR MOD FF PC VERSION',
    requiresAndroidId: false,
    durations: ['1 Day Pc Aim Silent', '1 Day Pc Modmenu x86', '10 Day Pc Modmenu x86', '10 Days Pc Aim Silent', '10 Days Pc Bypass + Silent', '30 Day Pc Modmenu x86', '30 Days Pc Aim Silent', '30 Days Pc Bypass + Silent']
  },
  67: {
    name: 'BR MOD FF ROOT ANDROID',
    requiresAndroidId: false,
    durations: ['1 DaYs', '7 DaYs', '15 DaYs', '30 DaYs']
  },
  59: {
    name: 'DRIPCLIENT 8BP NONROOT ANDROID',
    requiresAndroidId: false,
    durations: ['1 DaYs', '7 DaYs', '30 DaYs']
  },
  62: {
    name: 'DRIPCLIENT FF NONROOT APKMOD',
    requiresAndroidId: false,
    durations: ['1 DaYS NONROOT', '3 DaYS NONROOT', '7 DaYS NONROOT', '15 DaYS NONROOT', '30 DaYS NONROOT']
  },
  44: {
    name: 'DRIPCLIENT FF PC AIMKILL',
    requiresAndroidId: false,
    durations: ['7 DaYS PC AIMKILL', '15 DaYS PC AIMKILL', '30 DaYS PC AIMKILL']
  },
  91: {
    name: 'DRIPCLIENT PROXY FF NONROOT ANDROID',
    requiresAndroidId: false,
    durations: ['1 DaYs', '3 DaYs', '7 DaYs', '30 DaYs']
  },
  136: {
    name: 'BALA MODS XYZ V2',
    requiresAndroidId: false,
    durations: ['1 Hours']
  }
};

let keyHistory = []; // In-memory history for panel
let activeBotTask = null;
let botConfig = null;

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
    // TEMPORARY BYPASS FOR UI PREVIEW
    req.session.user = { email: 'admin@xyzcheats.com' };
    next();
    
    // Original code:
    // if (req.session.user) {
    //     next();
    // } else {
    //     res.redirect('/login');
    // }
};

// ─── Helper Functions ─────────────────────────────────────
async function buyKey(product_id, duration) {
  const product = PRODUCTS[product_id];
  if (!product) throw new Error("Invalid Product ID");

  let payload = {
    api_key:    API_KEY,
    action:     'buy',
    product_id: product_id,
    duration:   duration
  };

  if (product.requiresAndroidId) {
    // Generate random android ID or use from env
    payload.android_id = ANDROID_ID || Math.random().toString(16).substring(2, 18);
  }

  const data = qs.stringify(payload);
  
  const res = await axios.post(API_URL, data, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-master-key': MASTER_KEY
    },
    timeout: 15000
  });
  return res.data;
}

async function sendEmail(productName, duration, key, rawResponse) {
  const { error } = await resend.emails.send({
    from: 'XYZ Bot <onboarding@resend.dev>',
    to: NOTIFY_EMAIL,
    subject: `✅ Key Ready! ${duration} - ${productName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.15);">
        <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:25px;text-align:center;">
          <h2 style="color:#e94560;margin:0;">🎮 ${productName}</h2>
          <p style="color:#aaa;margin:5px 0 0;">Auto Key Generator</p>
        </div>
        <div style="padding:25px;background:#f9f9f9;">
          <p style="font-size:15px;">✅ <strong>${duration}</strong> key generate ho gayi!</p>
          <p style="font-size:13px;font-weight:bold;color:#555;margin-bottom:5px;">🔑 Your Key:</p>
          <div style="background:#1a1a2e;color:#00ff88;font-family:monospace;font-size:16px;padding:15px;border-radius:8px;text-align:center;word-break:break-all;">
            ${key}
          </div>
          <p style="margin-top:20px;font-size:12px;color:#999;font-weight:bold;">📋 Full Response:</p>
          <pre style="background:#eee;padding:10px;border-radius:6px;font-size:11px;overflow:auto;white-space:pre-wrap;">${JSON.stringify(rawResponse, null, 2)}</pre>
          <hr style="border:none;border-top:1px solid #ddd;margin:20px 0;"/>
          <p style="color:#aaa;font-size:11px;text-align:center;">Reseller Panel Auto Bot 🤖</p>
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
        products: PRODUCTS,
        history: keyHistory,
        botConfig: botConfig
    });
});

app.post('/bot/start', checkAuth, (req, res) => {
    const { product_id, duration } = req.body;
    const product = PRODUCTS[product_id];
    
    if (!product || !product.durations.includes(duration)) return res.redirect('/');
    
    if (activeBotTask) clearInterval(activeBotTask);
    
    botConfig = { product_id, duration, productName: product.name };
    console.log(`[BOT] Started for ${product.name} - ${duration}`);

    activeBotTask = setInterval(async () => {
        if (!botConfig) return;
        try {
            console.log(`[BOT] Checking balance & attempting buy for ${botConfig.productName}...`);
            const buyRes = await buyKey(botConfig.product_id, botConfig.duration);
            const resStr = typeof buyRes === 'object' ? JSON.stringify(buyRes) : String(buyRes);
            
            if (resStr.toLowerCase().includes('low balance')) {
                console.log(`[BOT] Low Balance. Waiting...`);
            } else if (resStr.toLowerCase().includes('error') || resStr.toLowerCase().includes('invalid')) {
                console.log(`[BOT] Error: ${resStr}`);
            } else {
                // Success!
                console.log(`[BOT] SUCCESS! Key generated.`);
                const key = buyRes?.key || buyRes?.license || buyRes?.code || buyRes?.data || resStr;
                
                keyHistory.unshift({
                    productName: botConfig.productName,
                    key: key,
                    duration: botConfig.duration,
                    time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                });

                await sendEmail(botConfig.productName, botConfig.duration, key, buyRes);
                
                // Stop the bot after successful purchase
                clearInterval(activeBotTask);
                activeBotTask = null;
                botConfig = null;
                console.log(`[BOT] Stopped after successful purchase.`);
            }
        } catch (err) {
            console.error(`[BOT ERROR]`, err.message);
        }
    }, process.env.CHECK_INTERVAL_MS || 15000);

    // Call it immediately once
    setTimeout(() => {
        // Just triggering the first tick quickly
    }, 100);

    res.redirect('/');
});

app.post('/bot/stop', checkAuth, (req, res) => {
    if (activeBotTask) {
        clearInterval(activeBotTask);
        activeBotTask = null;
    }
    botConfig = null;
    console.log(`[BOT] Stopped manually.`);
    res.redirect('/');
});

// ─── Start Server ─────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Reseller Panel running on http://localhost:${PORT}`);
});
