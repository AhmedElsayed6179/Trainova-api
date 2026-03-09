const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// ── Nodemailer transporter ──
const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 10000
});

async function sendResetEmail(toEmail, resetUrl, lang = 'en') {
    const isAr = lang === 'ar';
    const subject = isAr ? 'إعادة تعيين كلمة المرور — Trainova' : 'Reset Your Password — Trainova';
    const html = isAr ? `
    <div dir="rtl" style="font-family:'Cairo',Arial,sans-serif;background:#0d0d0d;color:#fff;padding:40px 20px;max-width:600px;margin:0 auto;border-radius:12px;">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-flex;align-items:center;gap:10px;">
          <div style="background:linear-gradient(135deg,#ffc107,#ff6b00);border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;font-size:22px;">⚡</div>
          <span style="font-size:1.8rem;font-weight:900;letter-spacing:3px;color:#ffc107;">TRAINOVA</span>
        </div>
      </div>
      <h2 style="color:#ffc107;margin-bottom:12px;">إعادة تعيين كلمة المرور</h2>
      <p style="color:#ccc;line-height:1.8;">مرحباً،<br>تلقّينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك. انقر على الزر أدناه لإنشاء كلمة مرور جديدة.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${resetUrl}" style="background:linear-gradient(135deg,#ffc107,#ff6b00);color:#000;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:1rem;display:inline-block;">إعادة تعيين كلمة المرور</a>
      </div>
      <p style="color:#888;font-size:0.85rem;line-height:1.7;">هذا الرابط صالح لمدة <strong style="color:#ffc107;">ساعة واحدة</strong> فقط.<br>إذا لم تطلب ذلك، تجاهل هذه الرسالة وسيبقى حسابك آمناً.</p>
      <hr style="border:none;border-top:1px solid #222;margin:24px 0;">
      <p style="color:#555;font-size:0.8rem;text-align:center;">© ${new Date().getFullYear()} Trainova. جميع الحقوق محفوظة.</p>
    </div>` : `
    <div style="font-family:'Rajdhani',Arial,sans-serif;background:#0d0d0d;color:#fff;padding:40px 20px;max-width:600px;margin:0 auto;border-radius:12px;">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="display:inline-flex;align-items:center;gap:10px;">
          <div style="background:linear-gradient(135deg,#ffc107,#ff6b00);border-radius:50%;width:48px;height:48px;display:inline-flex;align-items:center;justify-content:center;font-size:22px;">⚡</div>
          <span style="font-size:1.8rem;font-weight:900;letter-spacing:3px;color:#ffc107;">TRAINOVA</span>
        </div>
      </div>
      <h2 style="color:#ffc107;margin-bottom:12px;">Reset Your Password</h2>
      <p style="color:#ccc;line-height:1.8;">Hi there,<br>We received a request to reset the password for your account. Click the button below to create a new password.</p>
      <div style="text-align:center;margin:32px 0;">
        <a href="${resetUrl}" style="background:linear-gradient(135deg,#ffc107,#ff6b00);color:#000;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:1rem;display:inline-block;">Reset My Password</a>
      </div>
      <p style="color:#888;font-size:0.85rem;line-height:1.7;">This link is valid for <strong style="color:#ffc107;">1 hour</strong> only.<br>If you didn't request this, you can safely ignore this email — your account remains secure.</p>
      <hr style="border:none;border-top:1px solid #222;margin:24px 0;">
      <p style="color:#555;font-size:0.8rem;text-align:center;">© ${new Date().getFullYear()} Trainova. All rights reserved.</p>
    </div>`;

    await emailTransporter.sendMail({ from: `"Trainova" <${process.env.EMAIL_USER}>`, to: toEmail, subject, html });
}

// ── Cloudinary config (set these 3 vars in Railway environment variables) ──
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isCloudinaryConfigured = !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

const app = express();

const allowedOrigins = [
    'https://trainova.up.railway.app'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS blocked: ${origin} not allowed`));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
// Profile images now served from Cloudinary — no local static needed

app.get('/api/gif-proxy', (req, res) => {
    const url = req.query.url;
    if (!url || typeof url !== 'string') return res.status(400).end();
    const allowed = ['fitnessprogramer.com', 'wger.de', 'cdn.jsdelivr.net', 'raw.githubusercontent.com'];
    let hostname;
    try { hostname = new URL(url).hostname; } catch { return res.status(400).end(); }
    if (!allowed.some(d => hostname.endsWith(d))) return res.status(403).end();
    const https = require('https');
    const http = require('http');
    const client = url.startsWith('https') ? https : http;
    client.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; Trainova/1.0)',
            'Referer': `https://${hostname}/`,
            'Accept': 'image/gif,image/webp,image/*'
        }
    }, (upstream) => {
        if (upstream.statusCode !== 200) return res.status(upstream.statusCode || 502).end();
        res.set('Content-Type', upstream.headers['content-type'] || 'image/gif');
        res.set('Cache-Control', 'public, max-age=604800'); // 7 days
        upstream.pipe(res);
    }).on('error', () => res.status(502).end());
});

// ==================== GIF PROXY (bypasses hotlink protection) ====================
app.get('/api/gif-proxy', async (req, res) => {
    const url = req.query.url;
    if (!url || !url.includes('fitnessprogramer.com')) {
        return res.status(400).json({ error: 'Invalid URL' });
    }
    try {
        const https = require('https');
        const options = new URL(url);
        const request = https.get({
            hostname: options.hostname,
            path: options.pathname + options.search,
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'image/gif,image/*',
                'Referer': 'https://fitnessprogramer.com/'
            }
        }, (response) => {
            res.set('Content-Type', response.headers['content-type'] || 'image/gif');
            res.set('Cache-Control', 'public, max-age=86400');
            response.pipe(res);
        });
        request.on('error', () => res.status(500).end());
    } catch (e) {
        res.status(500).end();
    }
});



// ── Multer → Cloudinary storage ──
const cloudinaryStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'trainova/profiles',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto' }],
        public_id: (req, file) => `profile-${req.params?.userId || Date.now()}-${Date.now()}`,
    },
});

// Fallback: memory storage when Cloudinary not configured
const memStorage = multer.memoryStorage();

const upload = multer({
    storage: isCloudinaryConfigured ? cloudinaryStorage : memStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|gif|webp/;
        if (allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed'));
        }
    }
});

const MONGO_URL = process.env.MONGO_URL || 'mongodb://mongo:CsEpNPhRPbjNqHkOxcovGDgPdXHzzuqq@gondola.proxy.rlwy.net:28397/trainova?authSource=admin';

let isDbConnected = false;

mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 5000, socketTimeoutMS: 45000 })
    .then(() => { console.log('✅ MongoDB connected'); isDbConnected = true; })
    .catch(err => { console.error('❌ MongoDB error:', err.message); });

mongoose.connection.on('connected', () => { isDbConnected = true; });
mongoose.connection.on('error', () => { isDbConnected = false; });
mongoose.connection.on('disconnected', () => { isDbConnected = false; });

// ==================== SCHEMAS ====================

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    age: { type: Number, required: true, min: 10, max: 70 },
    gender: { type: String, required: true, enum: ['male', 'female', 'other'] },
    email: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    weight: { type: Number, required: true, max: 300 },
    height: { type: Number, required: true, max: 300 },
    phone: { type: String, required: true, unique: true },
    goal: { type: String, required: true, enum: ['abs', 'legs', 'full-body', 'back', 'all'] },
    profileImage: { type: String, default: null },
    completed_days: { type: Number, default: 0 },
    total_workouts: { type: Number, default: 0 },
    current_streak: { type: Number, default: 0 },
    last_workout_date: { type: Date },
    created_at: { type: Date, default: Date.now }
});

const workoutHistorySchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    exercise_id: { type: String, required: true },
    exercise_name: { type: String, required: true },
    exercise_name_ar: { type: String },
    category: { type: String, required: true },
    sets: { type: Number, required: true },
    reps: { type: mongoose.Schema.Types.Mixed, required: true },
    duration: { type: Number },
    calories_burned: { type: Number },
    completed_at: { type: Date, default: Date.now }
});

const workoutPlanSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    start_date: { type: Date, default: Date.now },
    current_day: { type: Number, default: 1 },
    goal: { type: String },
    days: [{
        day_number: { type: Number, required: true },
        date: { type: Date },
        completed: { type: Boolean, default: false },
        exercises: [{
            id: { type: String, required: true },
            name: { type: String, required: true },
            name_ar: { type: String },
            category: { type: String, required: true },
            sets: { type: Number, required: true },
            reps: { type: mongoose.Schema.Types.Mixed, required: true },
            restTime: { type: Number, required: true },
            gifUrl: { type: String },
            instructions: [String],
            instructions_ar: [String],
            tips: [String],
            tips_ar: [String],
            completed: { type: Boolean, default: false }
        }],
        total_exercises: { type: Number, required: true },
        completed_exercises: { type: Number, default: 0 },
        duration: { type: Number },
        calories_burned: { type: Number }
    }],
    total_days: { type: Number, default: 30 },
    completed_days: { type: Number, default: 0 }
});

const User = mongoose.model('User', userSchema);
const WorkoutHistory = mongoose.model('WorkoutHistory', workoutHistorySchema);
const WorkoutPlan = mongoose.model('WorkoutPlan', workoutPlanSchema);
// ── Password Reset Token Schema ──
const passwordResetTokenSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false }
});
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const PasswordResetToken = mongoose.model('PasswordResetToken', passwordResetTokenSchema);


// ==================== MIDDLEWARE ====================

const checkDb = (req, res, next) => {
    if (!isDbConnected || mongoose.connection.readyState !== 1) {
        return res.status(503).json({ success: false, error: 'Database disconnected' });
    }
    next();
};

['/api/check-username', '/api/check-email', '/api/check-phone', '/api/register',
    '/api/login', '/api/users', '/api/profile', '/api/workout', '/api/user', '/api/dashboard',
    '/api/change-password', '/api/profile', '/api/check-user'].forEach(route => app.use(route, checkDb));

// ==================== EXERCISE LIBRARY ====================
// Real exercises for each category with progressive difficulty

const exerciseLibrary = {
    abs: [
        {
            id: 'crunch', name: 'Ab Crunch', name_ar: 'تمرين انقباض البطن', category: 'abs',
            sets: 3, reps: 15, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/246.png',
            instructions: ['Lie on your back with knees bent and feet flat', 'Place hands behind head lightly', 'Exhale and lift shoulders off the floor', 'Lower slowly and repeat'],
            instructions_ar: ['استلق على ظهرك مع ثني الركبتين والقدمين مسطحتين', 'ضع يديك خلف رأسك بخفة', 'ازفر وارفع كتفيك عن الأرض', 'اخفض ببطء وكرر'],
            tips: ['Don\'t pull your neck', 'Focus on contracting abs'],
            tips_ar: ['لا تشد رقبتك', 'ركز على انقباض عضلات البطن']
        },
        {
            id: 'leg-raises', name: 'Hanging Leg Raise', name_ar: 'رفع الأرجل المعلق', category: 'abs',
            sets: 3, reps: 12, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/91.png',
            instructions: ['Lie flat on your back, legs straight', 'Keep hands under your hips for support', 'Raise legs to 90 degrees', 'Lower slowly without touching the floor'],
            instructions_ar: ['استلق مسطحاً على ظهرك، أرجلك مستقيمة', 'ضع يديك تحت وركيك للدعم', 'ارفع الأرجل 90 درجة', 'اخفض ببطء دون لمس الأرض'],
            tips: ['Keep lower back pressed to floor', 'Control the lowering phase'],
            tips_ar: ['حافظ على أسفل الظهر على الأرض', 'تحكم في مرحلة الخفض']
        },
        {
            id: 'plank', name: 'Forearm Plank Hold', name_ar: 'تثبيت البلانك على الساعدين', category: 'abs',
            sets: 3, reps: '30 sec', restTime: 30,
            gifUrl: 'https://wger.de/static/images/exercises/small/222.png',
            instructions: ['Start in forearm plank position', 'Keep body in a straight line from head to heels', 'Engage core and glutes', 'Hold the position'],
            instructions_ar: ['ابدأ في وضع البلانك على الساعدين', 'حافظ على استقامة الجسم من الرأس للكعب', 'شد البطن والأرداف', 'اثبت على الوضع'],
            tips: ['Don\'t let hips sag or rise', 'Breathe steadily'],
            tips_ar: ['لا تترك الوركين ينخفضان أو يرتفعان', 'تنفس بانتظام']
        },
        {
            id: 'russian-twist', name: 'Oblique Rotational Twist', name_ar: 'تدوير العضلة المائلة', category: 'abs',
            sets: 3, reps: 20, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/307.png',
            instructions: ['Sit with knees bent at 45 degrees', 'Lean back slightly keeping back straight', 'Clasp hands together in front', 'Rotate torso side to side'],
            instructions_ar: ['اجلس مع ثني الركبتين بزاوية 45 درجة', 'انحن للخلف قليلاً مع الحفاظ على استقامة الظهر', 'اضم يديك معاً أمامك', 'دوّر الجذع من جانب لآخر'],
            tips: ['Keep feet off floor for more difficulty', 'Touch ground each side'],
            tips_ar: ['ابقِ القدمين مرفوعتين لصعوبة أكبر', 'المس الأرض من كل جانب']
        },
        {
            id: 'bicycle-crunch', name: 'Cross-Body Crunch', name_ar: 'انقباض البطن المتقاطع', category: 'abs',
            sets: 3, reps: 20, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/247.png',
            instructions: ['Lie on back, hands behind head', 'Bring right knee to chest while twisting left elbow toward it', 'Alternate sides in pedaling motion'],
            instructions_ar: ['استلق على الظهر، يدين خلف الرأس', 'اجلب الركبة اليمنى للصدر مع لي الكوع الأيسر نحوها', 'بدّل الجوانب في حركة ركوب الدراجة'],
            tips: ['Move slowly and controlled', 'Keep shoulders lifted throughout'],
            tips_ar: ['تحرك ببطء وتحكم', 'ابقِ الكتفين مرفوعين طوال الوقت']
        },
        {
            id: 'heel-touch', name: 'Lateral Oblique Reach', name_ar: 'مد العضلة المائلة الجانبي', category: 'abs',
            sets: 3, reps: 25, restTime: 30,
            gifUrl: 'https://wger.de/static/images/exercises/small/246.png',
            instructions: ['Lie on back with knees bent', 'Lift shoulders slightly off floor', 'Reach right hand to right heel', 'Alternate sides rhythmically'],
            instructions_ar: ['استلق على الظهر مع ثني الركبتين', 'ارفع الكتفين قليلاً عن الأرض', 'مد اليد اليمنى نحو الكعب الأيمن', 'بدّل الجوانب بإيقاع'],
            tips: ['Keep core engaged', 'Don\'t hold your breath'],
            tips_ar: ['حافظ على شد البطن', 'لا تحبس أنفاسك']
        },
        {
            id: 'mountain-climber', name: 'Dynamic Plank Drive', name_ar: 'دفع البلانك الديناميكي', category: 'abs',
            sets: 3, reps: '30 sec', restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/343.png',
            instructions: ['Start in high plank position', 'Drive right knee toward chest', 'Quickly switch legs', 'Maintain flat back throughout'],
            instructions_ar: ['ابدأ في وضع البلانك العالي', 'ادفع الركبة اليمنى نحو الصدر', 'بدّل الأرجل بسرعة', 'حافظ على استواء الظهر طوال الوقت'],
            tips: ['Keep hips level', 'Increase pace for cardio effect'],
            tips_ar: ['حافظ على مستوى الوركين', 'زد السرعة لتأثير الكارديو']
        },
        {
            id: 'hollow-hold', name: 'Hollow Body Hold', name_ar: 'تثبيت الجسم المجوف', category: 'abs',
            sets: 3, reps: '20 sec', restTime: 30,
            gifUrl: 'https://wger.de/static/images/exercises/small/222.png',
            instructions: ['Lie on back, extend arms overhead', 'Lift legs, arms and shoulders off ground', 'Press lower back into floor', 'Hold position'],
            instructions_ar: ['استلق على الظهر، مد الذراعين فوق الرأس', 'ارفع الأرجل والذراعين والكتفين عن الأرض', 'اضغط أسفل الظهر على الأرض', 'اثبت على الوضع'],
            tips: ['Lower back must stay on floor', 'Keep legs as low as possible'],
            tips_ar: ['يجب أن يبقى أسفل الظهر على الأرض', 'ابقِ الأرجل منخفضة قدر الإمكان']
        },
        {
            id: 'dead-bug', name: 'Core Stability Extension', name_ar: 'تمرين تثبيت الجذع', category: 'abs',
            sets: 3, reps: 10, restTime: 30,
            gifUrl: 'https://wger.de/static/images/exercises/small/222.png',
            instructions: ['Lie on back, arms up, knees at 90°', 'Slowly extend right arm and left leg toward floor', 'Return to start and alternate', 'Keep lower back flat throughout'],
            instructions_ar: ['استلق على الظهر، ذراعان للأعلى، ركبتان بزاوية 90°', 'مد الذراع اليمنى والرجل اليسرى ببطء نحو الأرض', 'عد للبداية وبدّل', 'ابقِ أسفل الظهر مسطحاً طوال الوقت'],
            tips: ['Move slowly with control', 'Breathe out as you extend'],
            tips_ar: ['تحرك ببطء وتحكم', 'ازفر عند المد']
        },
        {
            id: 'v-ups', name: 'Full Body V-Raise', name_ar: 'الرفع الكامل على شكل V', category: 'abs',
            sets: 3, reps: 12, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/91.png',
            instructions: ['Lie flat, arms overhead and legs straight', 'Simultaneously raise legs and torso to form a V', 'Touch toes at the top', 'Lower slowly'],
            instructions_ar: ['استلق مسطحاً، ذراعان فوق الرأس وأرجل مستقيمة', 'ارفع الأرجل والجذع في آن واحد لتكوين شكل V', 'المس أصابع القدم في الأعلى', 'اخفض ببطء'],
            tips: ['Keep legs straight', 'Explosive upward, slow downward'],
            tips_ar: ['ابقِ الأرجل مستقيمة', 'سريع للأعلى، بطيء للأسفل']
        },
        {
            id: 'side-plank', name: 'Lateral Core Plank', name_ar: 'بلانك الجذع الجانبي', category: 'abs',
            sets: 3, reps: '20 sec each', restTime: 30,
            gifUrl: 'https://wger.de/static/images/exercises/small/222.png',
            instructions: ['Lie on side, prop on forearm', 'Lift hips to form a straight line', 'Stack feet or stagger for balance', 'Hold position then switch sides'],
            instructions_ar: ['استلق على الجانب، اتكئ على الساعد', 'ارفع الوركين لتكوين خط مستقيم', 'ضع القدمين فوق بعض أو افرق بينهما للتوازن', 'اثبت ثم بدّل الجانب'],
            tips: ['Keep body in straight line', 'Don\'t let hips drop'],
            tips_ar: ['حافظ على استقامة الجسم', 'لا تترك الوركين ينخفضان']
        },
        {
            id: 'flutter-kicks', name: 'Low Leg Flutter', name_ar: 'رفرفة الأرجل المنخفضة', category: 'abs',
            sets: 3, reps: '30 sec', restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/91.png',
            instructions: ['Lie flat on back, hands under hips', 'Lift legs about 6 inches off ground', 'Alternate kicking legs up and down in small motions', 'Keep core tight throughout'],
            instructions_ar: ['استلق على الظهر، يدان تحت الوركين', 'ارفع الأرجل نحو 15 سم عن الأرض', 'بدّل ركل الأرجل لأعلى وأسفل في حركات صغيرة', 'حافظ على شد البطن طوال الوقت'],
            tips: ['Lower back stays flat', 'Small controlled movements'],
            tips_ar: ['أسفل الظهر يبقى مسطحاً', 'حركات صغيرة ومتحكم بها']
        }
    ],

    legs: [
        {
            id: 'bodyweight-squat', name: 'Deep Air Squat', name_ar: 'القرفصاء العميقة', category: 'legs',
            sets: 4, reps: 15, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/8.png',
            instructions: ['Stand feet shoulder-width apart, toes slightly out', 'Push hips back and bend knees', 'Lower until thighs parallel to floor', 'Drive through heels to stand'],
            instructions_ar: ['قف بعرض الكتفين، أصابع القدم للخارج قليلاً', 'ادفع الوركين للخلف واثنِ الركبتين', 'انخفض حتى تتوازى الفخذان مع الأرض', 'ادفع بالكعبين للوقوف'],
            tips: ['Chest up, core braced', 'Knees track over toes'],
            tips_ar: ['الصدر مرفوع، البطن مشدود', 'الركبتان تتبعان اتجاه أصابع القدم']
        },
        {
            id: 'forward-lunge', name: 'Forward Power Lunge', name_ar: 'الاندفاع الأمامي القوي', category: 'legs',
            sets: 3, reps: 12, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/33.png',
            instructions: ['Stand tall with feet together', 'Step forward with one leg', 'Lower hips until both knees at 90°', 'Push off front foot to return'],
            instructions_ar: ['قف مستقيماً، القدمان معاً', 'تقدم للأمام برجل واحدة', 'اخفض الوركين حتى تصبح الركبتان بزاوية 90°', 'ادفع بالقدم الأمامية للعودة'],
            tips: ['Keep front knee over ankle', 'Torso upright throughout'],
            tips_ar: ['الركبة الأمامية فوق الكاحل', 'الجذع مستقيم طوال الوقت']
        },
        {
            id: 'reverse-lunge', name: 'Reverse Step Lunge', name_ar: 'الاندفاع الخطوي الخلفي', category: 'legs',
            sets: 3, reps: 12, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/33.png',
            instructions: ['Stand with feet hip-width apart', 'Step one foot backward', 'Lower back knee toward floor', 'Return to start and alternate'],
            instructions_ar: ['قف بعرض الوركين', 'تراجع بقدم واحدة للخلف', 'اخفض الركبة الخلفية نحو الأرض', 'عد للبداية وبدّل'],
            tips: ['Control the movement', 'Great for balance'],
            tips_ar: ['تحكم في الحركة', 'ممتاز للتوازن']
        },
        {
            id: 'calf-raises', name: 'Standing Calf Raise', name_ar: 'رفع الكعب الواقف', category: 'legs',
            sets: 3, reps: 20, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/18.png',
            instructions: ['Stand with feet hip-width apart', 'Rise up on toes as high as possible', 'Hold briefly at top', 'Lower slowly'],
            instructions_ar: ['قف بعرض الوركين', 'ارتفع على أصابع القدم قدر الإمكان', 'اثبت لحظة في الأعلى', 'اخفض ببطء'],
            tips: ['Full range of motion', 'Use a step edge for more range'],
            tips_ar: ['نطاق حركة كامل', 'استخدم حافة الدرجة لنطاق أوسع']
        },
        {
            id: 'wall-sit', name: 'Isometric Wall Squat', name_ar: 'قرفصاء الحائط الثابتة', category: 'legs',
            sets: 3, reps: '45 sec', restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/8.png',
            instructions: ['Stand against wall, feet shoulder-width', 'Slide down until knees at exactly 90°', 'Thighs parallel to floor', 'Hold position'],
            instructions_ar: ['قف مقابل الحائط، قدمان بعرض الكتفين', 'انزلق لأسفل حتى تصبح الركبتان بزاوية 90° تماماً', 'الفخذان موازيان للأرض', 'اثبت على الوضع'],
            tips: ['Back flat against wall', 'Don\'t let knees cave in'],
            tips_ar: ['الظهر مسطح على الحائط', 'لا تترك الركبتين تنهاران للداخل']
        },
        {
            id: 'glute-bridge', name: 'Glute Bridge Press', name_ar: 'ضغط الجسر الخلفي', category: 'legs',
            sets: 3, reps: 15, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/75.png',
            instructions: ['Lie on back, knees bent, feet flat', 'Drive hips up by squeezing glutes', 'Form straight line from knees to shoulders', 'Lower slowly'],
            instructions_ar: ['استلق على الظهر، ركبتان مثنيتان، قدمان مسطحتان', 'ارفع الوركين بضغط الأرداف', 'كوّن خطاً مستقيماً من الركبتين للكتفين', 'اخفض ببطء'],
            tips: ['Squeeze glutes at top', 'Press feet firmly into floor'],
            tips_ar: ['اضغط الأرداف في الأعلى', 'اضغط القدمين على الأرض بقوة']
        },
        {
            id: 'single-leg-glute-bridge', name: 'Single Leg Hip Thrust', name_ar: 'دفع الورك أحادي الساق', category: 'legs',
            sets: 3, reps: 10, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/75.png',
            instructions: ['Lie on back, one knee bent, other leg extended', 'Drive hips up using the bent leg', 'Hold at top for 2 seconds', 'Lower slowly and repeat then switch'],
            instructions_ar: ['استلق على الظهر، ركبة واحدة مثنية، الأخرى ممدودة', 'ارفع الوركين بالرجل المثنية', 'اثبت في الأعلى ثانيتين', 'اخفض ببطء وكرر ثم بدّل'],
            tips: ['Level hips throughout', 'More challenging than standard bridge'],
            tips_ar: ['حافظ على مستوى الوركين', 'أصعب من رفع الحوض العادي']
        },
        {
            id: 'sumo-squat', name: 'Wide Stance Power Squat', name_ar: 'القرفصاء القوية الواسعة', category: 'legs',
            sets: 3, reps: 15, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/8.png',
            instructions: ['Stand with feet wider than shoulders, toes pointed out', 'Lower hips straight down', 'Keep chest tall', 'Drive through heels to return'],
            instructions_ar: ['قف بعرض أوسع من الكتفين، أصابع القدم للخارج', 'اخفض الوركين مباشرة للأسفل', 'حافظ على ارتفاع الصدر', 'ادفع بالكعبين للعودة'],
            tips: ['Targets inner thighs', 'Keep knees over toes'],
            tips_ar: ['يستهدف الفخذ الداخلي', 'الركبتان فوق أصابع القدم']
        },
        {
            id: 'step-up', name: 'Elevated Step Drive', name_ar: 'الدفع على المرتفع', category: 'legs',
            sets: 3, reps: 12, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/33.png',
            instructions: ['Stand in front of step or bench', 'Step up with right foot, drive left knee up', 'Step back down with control', 'Alternate legs'],
            instructions_ar: ['قف أمام درجة أو مقعد', 'اصعد بالقدم اليمنى، ارفع الركبة اليسرى', 'انزل بتحكم', 'بدّل الأرجل'],
            tips: ['Push through heel of stepping foot', 'Keep torso upright'],
            tips_ar: ['ادفع بكعب القدم الصاعدة', 'حافظ على استقامة الجذع']
        },
        {
            id: 'lateral-lunge', name: 'Side Squat Stretch', name_ar: 'القرفصاء الجانبية الممتدة', category: 'legs',
            sets: 3, reps: 10, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/33.png',
            instructions: ['Stand with feet together', 'Step wide to the right side', 'Sit into right hip, keep left leg straight', 'Push back to center and repeat other side'],
            instructions_ar: ['قف بقدمين معاً', 'افرد للجانب الأيمن', 'اجلس على الورك الأيمن، ابقِ الرجل اليسرى مستقيمة', 'ادفع للمركز وكرر على الجانب الآخر'],
            tips: ['Knee stays over foot', 'Works inner thighs and glutes'],
            tips_ar: ['الركبة تبقى فوق القدم', 'يعمل الفخذ الداخلي والأرداف']
        },
        {
            id: 'jump-squat', name: 'Explosive Jump Squat', name_ar: 'القرفصاء التفجيرية', category: 'legs',
            sets: 3, reps: 10, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/8.png',
            instructions: ['Stand in squat stance', 'Lower into squat position', 'Explosively jump up', 'Land softly and immediately lower into next squat'],
            instructions_ar: ['قف في وضع القرفصاء', 'انخفض في وضع القرفصاء', 'اقفز بشكل انفجاري للأعلى', 'انزل بلطف وانخفض فوراً في قرفصاء التالية'],
            tips: ['Soft landing to protect knees', 'Land with soft bent knees'],
            tips_ar: ['هبوط لطيف لحماية الركبتين', 'انزل بركبتين مثنيتين لطيفاً']
        },
        {
            id: 'donkey-kick', name: 'Glute Kickback', name_ar: 'رفع الساق الخلفي', category: 'legs',
            sets: 3, reps: 15, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/75.png',
            instructions: ['Start on hands and knees', 'Keep knee bent at 90°', 'Push one leg back and up', 'Squeeze glute at top, lower and repeat'],
            instructions_ar: ['ابدأ على اليدين والركبتين', 'ابقِ الركبة مثنية بزاوية 90°', 'ادفع رجل للخلف والأعلى', 'اضغط الأردافات في الأعلى، اخفض وكرر'],
            tips: ['Don\'t rotate hips', 'Full extension at top'],
            tips_ar: ['لا تدور الوركين', 'مد كامل في الأعلى']
        }
    ],

    'full-body': [
        {
            id: 'pushup', name: 'Standard Push-Up', name_ar: 'تمرين الضغط الأساسي', category: 'full-body',
            sets: 3, reps: 12, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Start in plank, hands shoulder-width', 'Lower chest toward floor, elbows at 45°', 'Push back up to full arm extension', 'Keep body rigid throughout'],
            instructions_ar: ['ابدأ في البلانك، يدان بعرض الكتفين', 'اخفض الصدر نحو الأرض، المرفقان بزاوية 45°', 'ادفع للأعلى لمد الذراعين بالكامل', 'حافظ على صلابة الجسم طوال الوقت'],
            tips: ['Don\'t flare elbows out', 'Full range of motion'],
            tips_ar: ['لا تفرد المرفقين للخارج', 'نطاق حركة كامل']
        },
        {
            id: 'wide-pushup', name: 'Wide Grip Push-Up', name_ar: 'الضغط بالقبضة الواسعة', category: 'full-body',
            sets: 3, reps: 10, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Hands placed wider than shoulders', 'Lower chest to floor', 'Keep elbows flared outward', 'Push back up'],
            instructions_ar: ['اليدان أوسع من الكتفين', 'اخفض الصدر للأرض', 'ابقِ المرفقين منفرجين للخارج', 'ادفع للأعلى'],
            tips: ['Targets chest more', 'Great for pec development'],
            tips_ar: ['يستهدف الصدر أكثر', 'رائع لتطوير عضلة الصدر']
        },
        {
            id: 'diamond-pushup', name: 'Close Grip Tricep Push-Up', name_ar: 'ضغط الترايسبس الضيق', category: 'full-body',
            sets: 3, reps: 8, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Hands together, forming a diamond under chest', 'Lower chest toward hands', 'Keep elbows close to body', 'Push back up'],
            instructions_ar: ['يدان معاً، تكوّن شكل ماسة تحت الصدر', 'اخفض الصدر نحو اليدين', 'ابقِ المرفقين قريبين من الجسم', 'ادفع للأعلى'],
            tips: ['Hardest variation, targets triceps', 'Keep body straight'],
            tips_ar: ['التنويع الأصعب، يستهدف الترايسبس', 'حافظ على استقامة الجسم']
        },
        {
            id: 'incline-pushup', name: 'Elevated Push-Up', name_ar: 'الضغط على المرتفع', category: 'full-body',
            sets: 3, reps: 15, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Hands on elevated surface like chair or step', 'Perform standard pushup', 'Easier on joints for beginners'],
            instructions_ar: ['اليدان على سطح مرتفع كالكرسي أو الدرجة', 'أدِّ ضغطاً عادياً', 'أسهل على المفاصل للمبتدئين'],
            tips: ['Good starting point for beginners', 'Lower surface = harder'],
            tips_ar: ['نقطة بداية جيدة للمبتدئين', 'السطح المنخفض = أصعب']
        },
        {
            id: 'decline-pushup', name: 'Feet-Elevated Push-Up', name_ar: 'الضغط برفع القدمين', category: 'full-body',
            sets: 3, reps: 10, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Feet elevated on chair or bench', 'Hands on floor, shoulder-width', 'Lower chest to floor', 'Push back up'],
            instructions_ar: ['القدمان مرتفعتان على كرسي أو مقعد', 'اليدان على الأرض، بعرض الكتفين', 'اخفض الصدر للأرض', 'ادفع للأعلى'],
            tips: ['Works upper chest more', 'Harder than regular push-up'],
            tips_ar: ['يعمل أعلى الصدر أكثر', 'أصعب من الضغط العادي']
        },
        {
            id: 'dips', name: 'Bench Tricep Dip', name_ar: 'غطس الترايسبس على المقعد', category: 'full-body',
            sets: 3, reps: 10, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/90.png',
            instructions: ['Sit on edge of chair, hands gripping edge', 'Slide off, supporting weight on hands', 'Bend elbows to lower body', 'Push back up to start'],
            instructions_ar: ['اجلس على حافة الكرسي، يدان تمسك الحافة', 'انزلق للأمام، دعم الوزن على اليدين', 'اثنِ المرفقين لخفض الجسم', 'ادفع للأعلى للبداية'],
            tips: ['Keep hips close to chair', 'Elbows point straight back'],
            tips_ar: ['ابقِ الوركين قريبين من الكرسي', 'المرفقان يشيران مباشرة للخلف']
        },
        {
            id: 'burpee', name: 'Full Burpee Complex', name_ar: 'تمرين البيربي الكامل', category: 'full-body',
            sets: 3, reps: 8, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/343.png',
            instructions: ['Stand, then drop hands to floor', 'Jump feet back to plank position', 'Do a push up', 'Jump feet forward, then jump up with arms overhead'],
            instructions_ar: ['قف، ثم ضع اليدين على الأرض', 'اقفز بالقدمين للخلف لوضع البلانك', 'أدِّ ضغطة واحدة', 'اقفز بالقدمين للأمام، ثم اقفز للأعلى مع رفع الذراعين'],
            tips: ['Full body exercise', 'Modify by stepping instead of jumping'],
            tips_ar: ['تمرين جسم كامل', 'يمكن التعديل بالمشي بدل القفز']
        },
        {
            id: 'pike-pushup', name: 'Inverted V Press', name_ar: 'الضغط المقلوب على شكل V', category: 'full-body',
            sets: 3, reps: 10, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/76.png',
            instructions: ['Form inverted V with hips high', 'Bend elbows, lower head toward floor', 'Press back up', 'Targets shoulders primarily'],
            instructions_ar: ['كوّن شكل V مقلوب مع رفع الوركين', 'اثنِ المرفقين، اخفض الرأس نحو الأرض', 'ادفع للأعلى', 'يستهدف الأكتاف بشكل رئيسي'],
            tips: ['Walk hands closer to feet for harder version', 'Great shoulder builder'],
            tips_ar: ['قرّب اليدين من القدمين للنسخة الأصعب', 'رائع لبناء الأكتاف']
        },
        {
            id: 'plank-to-pushup', name: 'Plank-to-Press Transition', name_ar: 'الانتقال من البلانك للضغط', category: 'full-body',
            sets: 3, reps: 10, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/222.png',
            instructions: ['Start in forearm plank', 'Press up to high plank one arm at a time', 'Lower back to forearms one at a time', 'Alternate leading arm'],
            instructions_ar: ['ابدأ في البلانك على الساعدين', 'ارفع لبلانك عالٍ ذراع واحدة في كل مرة', 'اخفض للساعدين ذراع واحدة في كل مرة', 'بدّل الذراع القيادية'],
            tips: ['Keep hips level', 'Slow and controlled'],
            tips_ar: ['حافظ على مستوى الوركين', 'ببطء وتحكم']
        },
        {
            id: 'superman-push', name: 'Superman Press-Up', name_ar: 'ضغط السوبرمان المتقدم', category: 'full-body',
            sets: 3, reps: 8, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Start in pushup position', 'Lower to floor completely', 'Lift arms and legs off floor like superman', 'Place hands back and push up'],
            instructions_ar: ['ابدأ في وضع الضغط', 'انخفض للأرض بالكامل', 'ارفع الذراعين والرجلين كسوبرمان', 'ضع اليدين مجدداً وادفع للأعلى'],
            tips: ['Advanced exercise', 'Build toward it with regular pushups'],
            tips_ar: ['تمرين متقدم', 'ابنِ قوتك بالضغط العادي أولاً']
        },
        {
            id: 'jump-rope-sim', name: 'Cardio Jump Drill', name_ar: 'تدريب القفز الكارديو', category: 'full-body',
            sets: 3, reps: '45 sec', restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Stand with feet together', 'Jump on balls of feet', 'Rotate wrists as if holding rope', 'Keep elbows close to sides'],
            instructions_ar: ['قف بقدمين معاً', 'اقفز على مقدمة القدمين', 'دوّر الرسغين كأنك تمسك حبلاً', 'ابقِ المرفقين قريبين من الجانبين'],
            tips: ['Light bouncy jumps', 'Great warm-up or finisher'],
            tips_ar: ['قفزات خفيفة ومرنة', 'رائع كإحماء أو إنهاء']
        },
        {
            id: 'inchworm', name: 'Walking Plank Reach', name_ar: 'المشي بالبلانك للأمام', category: 'full-body',
            sets: 3, reps: 8, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Stand tall, hinge forward', 'Walk hands out to plank', 'Do a push up (optional)', 'Walk hands back to feet, stand up'],
            instructions_ar: ['قف مستقيماً، انحن للأمام', 'امشِ بيديك للأمام لوضع البلانك', 'أدِّ ضغطة (اختياري)', 'امشِ بيديك للخلف نحو القدمين، قف'],
            tips: ['Keep legs as straight as possible', 'Great mobility exercise'],
            tips_ar: ['ابقِ الأرجل مستقيمة قدر الإمكان', 'تمرين حركة رائع']
        }
    ],

    back: [
        {
            id: 'superman', name: 'Prone Back Extension Lift', name_ar: 'رفع مد الظهر على البطن', category: 'back',
            sets: 3, reps: 15, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Lie face down, arms extended overhead', 'Simultaneously lift arms, chest, and legs', 'Squeeze lower back and glutes at top', 'Hold 2-3 seconds, lower slowly'],
            instructions_ar: ['استلق على البطن، الذراعان ممدودتان للأمام', 'ارفع الذراعين والصدر والأرجل في آن واحد', 'اضغط أسفل الظهر والأرداف في الأعلى', 'اثبت 2-3 ثواني، اخفض ببطء'],
            tips: ['Keep neck neutral', 'Squeeze glutes throughout'],
            tips_ar: ['حافظ على استقامة الرقبة', 'اضغط الأرداف طوال الوقت']
        },
        {
            id: 'reverse-snow-angel', name: 'Prone Shoulder Arc', name_ar: 'قوس الكتف على البطن', category: 'back',
            sets: 3, reps: 15, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Lie face down, arms by sides', 'Lift chest and arms slightly', 'Move arms in wide arc overhead then back', 'Like making a snow angel'],
            instructions_ar: ['استلق على البطن، الذراعان بالجانبين', 'ارفع الصدر والذراعين قليلاً', 'حرّك الذراعين في قوس واسع للأمام ثم عد', 'مثل صنع ملاك الثلج'],
            tips: ['Squeeze shoulder blades together', 'Controlled movement throughout'],
            tips_ar: ['اضغط لوحي الكتف معاً', 'حركة متحكم بها طوال الوقت']
        },
        {
            id: 'back-extension', name: 'Lumbar Extension', name_ar: 'مد أسفل الظهر', category: 'back',
            sets: 3, reps: 12, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Lie face down, hands behind head', 'Slowly lift chest and upper body', 'Squeeze lower back muscles', 'Lower slowly and repeat'],
            instructions_ar: ['استلق على البطن، يدان خلف الرأس', 'ارفع الصدر والجزء العلوي من الجسم ببطء', 'اضغط عضلات أسفل الظهر', 'اخفض ببطء وكرر'],
            tips: ['Don\'t hyperextend the neck', 'Control both up and down'],
            tips_ar: ['لا تفرط في مد الرقبة', 'تحكم في الأعلى والأسفل']
        },
        {
            id: 'bird-dog', name: 'Contralateral Balance Extension', name_ar: 'تمرين التوازن المتقاطع', category: 'back',
            sets: 3, reps: 10, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/222.png',
            instructions: ['Start on hands and knees', 'Extend right arm forward and left leg back', 'Hold 3 seconds, return to start', 'Alternate sides'],
            instructions_ar: ['ابدأ على اليدين والركبتين', 'مد الذراع اليمنى للأمام والرجل اليسرى للخلف', 'اثبت 3 ثواني، عد للبداية', 'بدّل الجوانب'],
            tips: ['Keep back flat and level', 'Don\'t rotate hips'],
            tips_ar: ['حافظ على استواء الظهر', 'لا تدور الوركين']
        },
        {
            id: 'prone-y-raise', name: 'Prone Y-Trap Raise', name_ar: 'رفع الشبكي على شكل Y', category: 'back',
            sets: 3, reps: 12, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Lie face down, arms in Y position overhead', 'Lift arms off ground, squeezing upper back', 'Hold 2 seconds at top', 'Lower with control'],
            instructions_ar: ['استلق على البطن، الذراعان بشكل Y فوق الرأس', 'ارفع الذراعين عن الأرض مع ضغط أعلى الظهر', 'اثبت ثانيتين في الأعلى', 'اخفض بتحكم'],
            tips: ['Thumbs pointing up', 'Targets lower traps'],
            tips_ar: ['الإبهامان يشيران للأعلى', 'يستهدف الشبكي السفلي']
        },
        {
            id: 'prone-t-raise', name: 'Prone T-Rear Delt Raise', name_ar: 'رفع الدالية الخلفية على شكل T', category: 'back',
            sets: 3, reps: 12, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Lie face down, arms straight out to sides in T position', 'Raise arms off floor squeezing shoulder blades', 'Hold 2 seconds', 'Lower slowly'],
            instructions_ar: ['استلق على البطن، الذراعان مستقيمتان للجانبين بشكل T', 'ارفع الذراعين مع ضغط لوحي الكتف', 'اثبت ثانيتين', 'اخفض ببطء'],
            tips: ['Thumbs point up', 'Feel squeeze in middle back'],
            tips_ar: ['الإبهامان للأعلى', 'اشعر بالضغط في منتصف الظهر']
        },
        {
            id: 'cat-cow', name: 'Spinal Mobility Flow', name_ar: 'تمرين حركية العمود الفقري', category: 'back',
            sets: 3, reps: 10, restTime: 30,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Start on hands and knees', 'Arch back up (cat) rounding spine', 'Then drop belly down (cow), lift head and tailbone', 'Alternate smoothly'],
            instructions_ar: ['ابدأ على اليدين والركبتين', 'قوّس الظهر للأعلى (القطة) مع تقريس العمود الفقري', 'ثم اخفض البطن (البقرة)، ارفع الرأس والعجز', 'بدّل بسلاسة'],
            tips: ['Breathe in during cow, out during cat', 'Great for spinal mobility'],
            tips_ar: ['تنفس للداخل أثناء البقرة، للخارج أثناء القطة', 'رائع لحركة العمود الفقري']
        },
        {
            id: 'child-pose-pull', name: 'Active Spinal Stretch', name_ar: 'الإطالة النشطة للعمود الفقري', category: 'back',
            sets: 3, reps: 10, restTime: 30,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Kneel and sit back toward heels', 'Extend arms forward on floor', 'Pull chest down toward floor', 'Hold 3 seconds, return'],
            instructions_ar: ['اركع واجلس للخلف نحو الكعبين', 'مد الذراعين للأمام على الأرض', 'اسحب الصدر نحو الأرض', 'اثبت 3 ثواني، عد'],
            tips: ['Stretches the whole back', 'Great for lower back relief'],
            tips_ar: ['يمد الظهر بالكامل', 'رائع لراحة أسفل الظهر']
        },
        {
            id: 'table-row', name: 'Inverted Bodyweight Row', name_ar: 'الشد العكسي بوزن الجسم', category: 'back',
            sets: 3, reps: 10, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Lie under a sturdy table', 'Grab table edge with overhand grip', 'Pull chest up to touch table', 'Lower with control'],
            instructions_ar: ['استلق تحت طاولة متينة', 'أمسك حافة الطاولة بقبضة من فوق', 'اشد الصدر للأعلى لملامسة الطاولة', 'اخفض بتحكم'],
            tips: ['Feet flat on floor for easier version', 'Best bodyweight back exercise'],
            tips_ar: ['القدمان مسطحتان للنسخة الأسهل', 'أفضل تمرين ظهر بوزن الجسم']
        },
        {
            id: 'door-frame-row', name: 'Isometric Doorway Pull', name_ar: 'الشد الثابت على إطار الباب', category: 'back',
            sets: 3, reps: 10, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Hold both sides of door frame at hip height', 'Lean back until arms straight', 'Pull chest to door frame', 'Lower with control'],
            instructions_ar: ['أمسك جانبي إطار الباب على ارتفاع الوركين', 'انحن للخلف حتى تستقيم الذراعان', 'اشد الصدر نحو إطار الباب', 'اخفض بتحكم'],
            tips: ['Great no-equipment row', 'Adjust lean for difficulty'],
            tips_ar: ['شد رائع بدون معدات', 'اضبط الميل لتغيير الصعوبة']
        },
        {
            id: 'prone-cobra', name: 'Prone Spinal Extension', name_ar: 'مد العمود الفقري على البطن', category: 'back',
            sets: 3, reps: 12, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Lie face down, palms by shoulders', 'Press up lifting chest, keeping pelvis on floor', 'Squeeze shoulder blades together', 'Hold then lower'],
            instructions_ar: ['استلق على البطن، راحتا اليدين بجانب الكتفين', 'ادفع للأعلى رافعاً الصدر مع إبقاء الحوض على الأرض', 'اضغط لوحي الكتف معاً', 'اثبت ثم اخفض'],
            tips: ['Look slightly up, not straight ahead', 'Stretches the spine'],
            tips_ar: ['انظر للأعلى قليلاً، ليس للأمام مباشرة', 'يمد العمود الفقري']
        },
        {
            id: 'swimming-exercise', name: 'Prone Alternating Raise', name_ar: 'الرفع المتناوب على البطن', category: 'back',
            sets: 3, reps: '30 sec', restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Lie face down, arms extended', 'Lift opposite arm and leg simultaneously', 'Alternate in smooth swimming motion', 'Keep core engaged'],
            instructions_ar: ['استلق على البطن، الذراعان ممدودتان', 'ارفع ذراعاً ورجلاً متعاكستين في آن واحد', 'بدّل في حركة سباحة سلسة', 'حافظ على شد البطن'],
            tips: ['Flutter like swimming', 'Builds endurance in back muscles'],
            tips_ar: ['رفرف كالسباحة', 'يبني تحمل عضلات الظهر']
        },
        {
            id: 'wall-angel', name: 'Wall Shoulder Slide', name_ar: 'انزلاق الكتف على الحائط', category: 'back',
            sets: 3, reps: 12, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Stand with back flat against wall', 'Arms at 90 degrees against wall', 'Slowly slide arms up overhead keeping contact', 'Return to start'],
            instructions_ar: ['قف بظهرك مسطحاً على الحائط', 'الذراعان بزاوية 90 درجة على الحائط', 'ارفع الذراعين للأعلى ببطء مع الحفاظ على الاتصال', 'عد للبداية'],
            tips: ['Keep lower back pressed to wall', 'Excellent for posture correction'],
            tips_ar: ['حافظ على ضغط أسفل الظهر على الحائط', 'ممتاز لتصحيح الوضعية']
        },
        {
            id: 'lat-stretch', name: 'Doorway Lat Mobilizer', name_ar: 'تحريك العضلة العريضة بالباب', category: 'back',
            sets: 3, reps: '20 sec hold', restTime: 30,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Hold door frame at shoulder height with one hand', 'Step through slightly and rotate torso away', 'Feel stretch along side of back', 'Hold 20 sec each side'],
            instructions_ar: ['أمسك إطار الباب على ارتفاع الكتف بيد واحدة', 'اخطُ للأمام قليلاً وادر الجذع بعيداً', 'اشعر بالشد على جانب الظهر', 'اثبت 20 ثانية لكل جانب'],
            tips: ['Great lat stretch without equipment', 'Breathe deeply during hold'],
            tips_ar: ['تمدد رائع للعضلة العريضة بدون أدوات', 'تنفس بعمق أثناء الثبات']
        },
        {
            id: 'thoracic-rotation', name: 'Thoracic Spine Mobilization', name_ar: 'تحريك العمود الفقري الصدري', category: 'back',
            sets: 3, reps: 10, restTime: 30,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Lie on side, knees bent at 90 degrees', 'Top arm reaches behind rotating thoracic spine', 'Follow hand with eyes', 'Return and repeat both sides'],
            instructions_ar: ['استلق على جانبك، الركبتان مثنيتان بزاوية 90 درجة', 'الذراع العليا تمتد للخلف مع دوران العمود الصدري', 'تابع اليد بعينيك', 'عد وكرر على الجانبين'],
            tips: ['Keep hips stacked', 'Improves upper back mobility'],
            tips_ar: ['حافظ على تراكب الوركين', 'يحسن حركية أعلى الظهر']
        },
        {
            id: 'scapular-pushup', name: 'Scapular Protraction Press', name_ar: 'ضغط تقدُّم لوح الكتف', category: 'back',
            sets: 3, reps: 15, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Start in high plank position', 'Without bending elbows, pinch shoulder blades together', 'Then push them apart as far as possible', 'Repeat controlled'],
            instructions_ar: ['ابدأ في وضع البلانك العالي', 'دون ثني المرفقين، اضغط لوحي الكتف معاً', 'ثم ابعدهما قدر الإمكان', 'كرر بتحكم'],
            tips: ['Arms stay straight throughout', 'Activates serratus anterior and rhomboids'],
            tips_ar: ['تبقى الذراعان مستقيمتان طوال الوقت', 'ينشط العضلة المنشارية والمعينية']
        },
        {
            id: 'good-morning', name: 'Hip Hinge Lower Back Pull', name_ar: 'ثني الورك لأسفل الظهر', category: 'back',
            sets: 3, reps: 12, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Stand feet shoulder-width, hands behind head', 'Hinge at hips pushing them back', 'Lower torso until parallel to floor', 'Drive hips forward to return'],
            instructions_ar: ['قف بعرض الكتفين، يدان خلف الرأس', 'انحنِ من الوركين بدفعهما للخلف', 'اخفض الجذع حتى يوازي الأرض', 'ادفع الوركين للأمام للعودة'],
            tips: ['Keep back straight throughout', 'Strengthens lower back and hamstrings'],
            tips_ar: ['حافظ على استقامة الظهر طوال الوقت', 'يقوي أسفل الظهر وأوتار الركبة']
        },
        {
            id: 'reverse-hyper', name: 'Prone Glute-Back Extension', name_ar: 'مد الأرداف والظهر على البطن', category: 'back',
            sets: 3, reps: 12, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Lie face down on bed edge or bench, legs hanging', 'Squeeze glutes and raise legs to body level', 'Lower slowly', 'Keep upper body still'],
            instructions_ar: ['استلق على البطن على حافة السرير أو المقعد، الأرجل معلقة', 'اضغط الأرداف وارفع الأرجل لمستوى الجسم', 'اخفض ببطء', 'حافظ على ثبات الجزء العلوي'],
            tips: ['Amazing for lower back', 'Use controlled motion only'],
            tips_ar: ['رائع لأسفل الظهر', 'استخدم حركة متحكماً بها فقط']
        }
    ],

    shoulders: [
        {
            id: 'pike-pushup-sh', name: 'Shoulder Press Pike', name_ar: 'ضغط الكتف بوضع V', category: 'shoulders',
            sets: 3, reps: 10, restTime: 60,
            gifUrl: 'https://wger.de/static/images/exercises/small/76.png',
            instructions: ['Form inverted V', 'Lower head toward floor', 'Press back up'],
            instructions_ar: ['كوّن شكل V مقلوب', 'اخفض الرأس نحو الأرض', 'ادفع للأعلى'],
            tips: ['Targets anterior deltoids', 'Walk feet closer to hands for harder'],
            tips_ar: ['يستهدف الدالية الأمامية', 'قرّب القدمين من اليدين للصعوبة']
        },
        {
            id: 'wall-pushup', name: 'Vertical Wall Press', name_ar: 'الضغط الرأسي على الحائط', category: 'shoulders',
            sets: 3, reps: 15, restTime: 45,
            gifUrl: 'https://wger.de/static/images/exercises/small/141.png',
            instructions: ['Stand facing wall', 'Place hands on wall shoulder-width', 'Lean in and push back'],
            instructions_ar: ['قف مقابل الحائط', 'ضع اليدين على الحائط بعرض الكتفين', 'ميل للأمام وادفع للخلف'],
            tips: ['Good for beginners', 'Increase distance from wall for harder'],
            tips_ar: ['مناسب للمبتدئين', 'زد المسافة من الحائط للصعوبة']
        }
    ]
};

// ==================== 30-DAY PLAN GENERATOR ====================

function generate30DayPlan(goal) {
    const plan = [];

    // Get exercise pools based on goal
    let primaryPool = [];
    let secondaryPool = [];

    if (goal === 'abs') {
        primaryPool = exerciseLibrary.abs;
        secondaryPool = exerciseLibrary['full-body'].slice(0, 4);
    } else if (goal === 'legs') {
        primaryPool = exerciseLibrary.legs;
        secondaryPool = exerciseLibrary.abs.slice(0, 3);
    } else if (goal === 'full-body') {
        primaryPool = exerciseLibrary['full-body'];
        secondaryPool = [...exerciseLibrary.abs.slice(0, 2), ...exerciseLibrary.legs.slice(0, 2)];
    } else if (goal === 'back') {
        primaryPool = exerciseLibrary.back;
        secondaryPool = [...exerciseLibrary.abs.slice(0, 2), ...exerciseLibrary['full-body'].slice(0, 2)];
    } else {
        // 'all' - mix everything
        primaryPool = [
            ...exerciseLibrary.abs.slice(0, 3),
            ...exerciseLibrary.legs.slice(0, 3),
            ...exerciseLibrary['full-body'].slice(0, 3),
            ...exerciseLibrary.back.slice(0, 3)
        ];
        secondaryPool = primaryPool;
    }

    // Difficulty progression phases:
    // Days 1-7:   Beginner (sets -1, lighter reps)
    // Days 8-14:  Build (base sets)
    // Days 15-21: Intermediate (sets +0, reps +2)
    // Days 22-30: Advanced (sets +1, reps +3)

    const startDate = new Date();

    for (let day = 1; day <= 30; day++) {
        const dayDate = new Date(startDate);
        dayDate.setDate(startDate.getDate() + day - 1);

        // Determine difficulty
        let setsModifier = 0;
        let repsModifier = 0;
        let phase = 'beginner';

        if (day <= 7) {
            setsModifier = -1;
            repsModifier = -2;
            phase = 'beginner';
        } else if (day <= 14) {
            setsModifier = 0;
            repsModifier = 0;
            phase = 'build';
        } else if (day <= 21) {
            setsModifier = 0;
            repsModifier = 2;
            phase = 'intermediate';
        } else {
            setsModifier = 1;
            repsModifier = 3;
            phase = 'advanced';
        }

        // Select 4 exercises for this day
        // Rotate through pool ensuring variety
        const dayExercises = [];
        const totalPrimary = primaryPool.length;

        // 3 primary + 1 secondary (or all primary for back/abs focused)
        const exerciseIndices = [];
        for (let i = 0; i < 4; i++) {
            const idx = (((day - 1) * 4 + i) * 3) % totalPrimary;
            // Avoid duplicates
            let finalIdx = idx;
            let attempts = 0;
            while (exerciseIndices.includes(finalIdx) && attempts < totalPrimary) {
                finalIdx = (finalIdx + 1) % totalPrimary;
                attempts++;
            }
            exerciseIndices.push(finalIdx);
        }

        for (let i = 0; i < 4; i++) {
            const pool = (i === 3 && secondaryPool.length > 0) ? secondaryPool : primaryPool;
            const poolIdx = exerciseIndices[i] % pool.length;
            const baseExercise = pool[poolIdx];

            // Deep copy and apply modifiers
            const exercise = JSON.parse(JSON.stringify(baseExercise));

            const newSets = Math.max(2, (exercise.sets || 3) + setsModifier);
            exercise.sets = newSets;

            // Handle reps that might be strings like "30 sec"
            if (typeof exercise.reps === 'number') {
                exercise.reps = Math.max(5, exercise.reps + repsModifier);
            } else if (typeof exercise.reps === 'string' && exercise.reps.includes('sec')) {
                // Increase time for timed exercises
                const seconds = parseInt(exercise.reps);
                const newSeconds = Math.max(15, seconds + (repsModifier * 2));
                exercise.reps = `${newSeconds} sec`;
            }

            exercise.completed = false;
            dayExercises.push(exercise);
        }

        plan.push({
            day_number: day,
            date: dayDate,
            completed: false,
            exercises: dayExercises,
            total_exercises: dayExercises.length,
            completed_exercises: 0,
            phase: phase
        });
    }

    return plan;
}

function shuffleArray(arr) {
    const array = [...arr];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// ==================== TEST APIs ====================

app.get('/api/test', (req, res) => {
    const dbState = mongoose.connection.readyState;
    res.json({
        message: 'Trainova API is running!',
        dbStatus: isDbConnected ? 'connected' : 'disconnected',
        readyState: dbState
    });
});

app.get('/api/db-status', (req, res) => {
    res.json({
        status: isDbConnected ? 'connected' : 'disconnected',
        readyState: mongoose.connection.readyState,
        isConnected: isDbConnected
    });
});

// ==================== AUTH APIs ====================

app.post('/api/check-username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.body.username });
        res.json({ exists: !!user });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/check-email', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        res.json({ exists: !!user });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/check-phone', async (req, res) => {
    try {
        const user = await User.findOne({ phone: req.body.phone });
        res.json({ exists: !!user });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/register', async (req, res) => {
    try {
        const userData = req.body;

        if (await User.findOne({ phone: userData.phone })) return res.json({ success: false, error: 'phone_exists' });
        if (await User.findOne({ email: userData.email })) return res.json({ success: false, error: 'email_exists' });
        if (await User.findOne({ username: userData.username })) return res.json({ success: false, error: 'username_exists' });

        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const newUser = new User({ ...userData, password: hashedPassword, completed_days: 0, total_workouts: 0, current_streak: 0 });
        await newUser.save();

        const { password, ...userToReturn } = newUser.toObject();
        res.json({
            success: true,
            message: 'Registration successful',
            user: userToReturn,
            token: Buffer.from(`${newUser._id}:${Date.now()}`).toString('base64')
        });
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            res.json({ success: false, error: `${field}_exists` });
        } else {
            res.status(500).json({ success: false, error: 'server_error' });
        }
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        const user = await User.findOne({ $or: [{ email: identifier }, { username: identifier }] });
        if (!user) return res.json({ success: false, error: 'invalid_credentials' });

        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) return res.json({ success: false, error: 'invalid_credentials' });

        const { password: pw, ...userData } = user.toObject();
        res.json({ success: true, user: userData, token: Buffer.from(`${user._id}:${Date.now()}`).toString('base64') });
    } catch (e) { res.status(500).json({ success: false, error: 'server_error' }); }
});

// ── check-user: used by forgot-password page to verify identifier exists ──
app.post('/api/check-user', async (req, res) => {
    try {
        const { identifier } = req.body;
        if (!identifier) return res.status(400).json({ exists: false });
        const user = await User.findOne({
            $or: [
                { email: identifier.toLowerCase() },
                { username: identifier }
            ]
        });
        res.json({ exists: !!user });
    } catch (e) { res.status(500).json({ exists: false, error: e.message }); }
});

app.post('/api/forgot-password', async (req, res) => {
    try {
        const identifier = (req.body.identifier || req.body.email || '').trim();
        const lang = req.body.lang || 'en';
        if (!identifier) return res.status(400).json({ success: false, error: 'identifier_required' });

        const user = await User.findOne({
            $or: [
                { email: identifier.toLowerCase() },
                { username: identifier }
            ]
        });
        if (!user) return res.json({ success: false, error: 'user_not_found' });

        await PasswordResetToken.deleteMany({ userId: user._id });

        const rawToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await PasswordResetToken.create({ userId: user._id, token: rawToken, expiresAt });

        const appUrl = process.env.APP_URL || 'https://trainova.up.railway.app';
        const resetUrl = `${appUrl}/auth/reset-password?token=${rawToken}&lang=${lang}`;

        res.json({ success: true });

        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            sendResetEmail(user.email, resetUrl, lang)
                .catch(err => console.error('Email send failed:', err.message));
        } else {
            console.warn('EMAIL_USER / EMAIL_PASS not set — Reset URL:', resetUrl);
        }

    } catch (e) {
        console.error('forgot-password error:', e);
        res.status(500).json({ success: false, error: 'server_error' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ success: false, error: 'missing_fields' });

        // Validate password strength server-side
        const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(newPassword);
        if (!strongPassword) return res.status(400).json({ success: false, error: 'weak_password' });

        const resetToken = await PasswordResetToken.findOne({ token, used: false });
        if (!resetToken) return res.json({ success: false, error: 'invalid_token' });
        if (resetToken.expiresAt < new Date()) {
            await PasswordResetToken.deleteOne({ _id: resetToken._id });
            return res.json({ success: false, error: 'token_expired' });
        }

        const user = await User.findById(resetToken.userId);
        if (!user) return res.json({ success: false, error: 'user_not_found' });

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        // Mark token as used (then delete it)
        await PasswordResetToken.deleteOne({ _id: resetToken._id });

        res.json({ success: true });
    } catch (e) {
        console.error('reset-password error:', e);
        res.status(500).json({ success: false, error: 'server_error' });
    }
});

app.post('/api/change-password/:userId', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ success: false, error: 'user_not_found' });

        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) return res.json({ success: false, error: 'invalid_current_password' });

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (e) { res.status(500).json({ success: false, error: 'server_error' }); }
});

app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find({}, '-password');
        res.json(users);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== DELETE ACCOUNT ====================

app.delete('/api/profile/:userId/delete-account', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ success: false, error: 'Username required for confirmation' });

        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        if (user.username !== username) {
            return res.status(400).json({ success: false, error: 'Username does not match. Account not deleted.' });
        }

        // Delete all user data
        await WorkoutPlan.deleteMany({ user_id: req.params.userId });
        await WorkoutHistory.deleteMany({ user_id: req.params.userId });

        // Delete profile image (Cloudinary or local)
        if (user.profileImage) {
            if (isCloudinaryConfigured && user.profileImage.includes('cloudinary.com')) {
                try {
                    const urlParts = user.profileImage.split('/upload/');
                    if (urlParts[1]) {
                        const publicIdWithExt = urlParts[1].replace(/^v\d+\//, '');
                        const publicId = publicIdWithExt.replace(/\.[^.]+$/, '');
                        await cloudinary.uploader.destroy(publicId);
                    }
                } catch (_) { /* ignore */ }
            } else if (user.profileImage.startsWith('/uploads/')) {
                const filePath = '.' + user.profileImage;
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
        }

        await User.findByIdAndDelete(req.params.userId);

        res.json({ success: true, message: 'Account permanently deleted' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== PROFILE APIs ====================

app.get('/api/profile/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId, '-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/profile/:userId', async (req, res) => {
    try {
        const updates = { ...req.body };
        ['password', '_id', 'created_at', 'profileImage'].forEach(k => delete updates[k]);

        const user = await User.findByIdAndUpdate(req.params.userId, { $set: updates }, { new: true, runValidators: true }).select('-password');
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/profile/:userId/upload-image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

        let imageUrl;

        if (isCloudinaryConfigured) {
            // Cloudinary: file.path = secure_url, file.filename = public_id
            imageUrl = req.file.path;

            // Delete old Cloudinary image if exists
            const user = await User.findById(req.params.userId);
            if (user?.profileImage && user.profileImage.includes('cloudinary.com')) {
                try {
                    // Extract public_id from URL
                    const parts = user.profileImage.split('/');
                    const filenameWithExt = parts[parts.length - 1];
                    const folderPart = parts[parts.length - 2];
                    const publicId = `trainova/profiles/${folderPart === 'profiles' ? filenameWithExt.split('.')[0] : filenameWithExt.split('.')[0]}`;
                    await cloudinary.uploader.destroy(publicId);
                } catch (_) { /* ignore delete errors */ }
            }
        } else {
            // Fallback: save to local uploads (dev only)
            const filename = `profile-${req.params.userId}-${Date.now()}.jpg`;
            const uploadDir = path.join(__dirname, 'uploads');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
            fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
            const baseUrl = process.env.BASE_URL || 'https://trainova-api.up.railway.app';
            imageUrl = `${baseUrl}/uploads/${filename}`;
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.userId,
            { profileImage: imageUrl },
            { new: true }
        ).select('-password');

        res.json({ success: true, user: updatedUser, imageUrl });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/profile/:userId/image', async (req, res) => {
    try {
        const { imageData } = req.body;
        if (!imageData) return res.status(400).json({ error: 'No image data provided' });

        let imageUrl;

        if (isCloudinaryConfigured) {
            // Upload base64 directly to Cloudinary
            const result = await cloudinary.uploader.upload(imageData, {
                folder: 'trainova/profiles',
                public_id: `profile-${req.params.userId}-${Date.now()}`,
                transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto' }],
                overwrite: true,
            });
            imageUrl = result.secure_url;

            // Delete old image
            const user = await User.findById(req.params.userId);
            if (user?.profileImage && user.profileImage.includes('cloudinary.com')) {
                try {
                    const urlParts = user.profileImage.split('/upload/');
                    if (urlParts[1]) {
                        const publicIdWithExt = urlParts[1].replace(/^v\d+\//, '');
                        const publicId = publicIdWithExt.replace(/\.[^.]+$/, '');
                        await cloudinary.uploader.destroy(publicId);
                    }
                } catch (_) { /* ignore */ }
            }
        } else {
            // Fallback local
            const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
            const filename = `profile-${req.params.userId}-${Date.now()}.jpg`;
            const uploadDir = path.join(__dirname, 'uploads');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
            fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(base64Data, 'base64'));
            const baseUrl = process.env.BASE_URL || 'https://trainova-api.up.railway.app';
            imageUrl = `${baseUrl}/uploads/${filename}`;
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.userId,
            { profileImage: imageUrl },
            { new: true }
        ).select('-password');

        res.json({ success: true, user: updatedUser, imageUrl });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/profile/:userId/image', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        if (user?.profileImage) {
            if (isCloudinaryConfigured && user.profileImage.includes('cloudinary.com')) {
                try {
                    const urlParts = user.profileImage.split('/upload/');
                    if (urlParts[1]) {
                        const publicIdWithExt = urlParts[1].replace(/^v\d+\//, '');
                        const publicId = publicIdWithExt.replace(/\.[^.]+$/, '');
                        await cloudinary.uploader.destroy(publicId);
                    }
                } catch (_) { /* ignore */ }
            } else if (user.profileImage.includes('/uploads/')) {
                const oldFilename = user.profileImage.replace(/^.*\/uploads\//, '');
                const oldPath = path.join(__dirname, 'uploads', oldFilename);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
        }
        const updatedUser = await User.findByIdAndUpdate(req.params.userId, { profileImage: null }, { new: true }).select('-password');
        res.json({ success: true, user: updatedUser });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== USER STATS ====================

app.get('/api/user/stats/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);
        const plan = await WorkoutPlan.findOne({ user_id: req.params.userId });

        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);

        const monthly = await WorkoutHistory.countDocuments({ user_id: req.params.userId, completed_at: { $gte: monthStart } });
        const weekly = await WorkoutHistory.countDocuments({ user_id: req.params.userId, completed_at: { $gte: weekStart } });

        res.json({
            total_workouts: user.total_workouts || 0,
            completed_days: user.completed_days || 0,
            current_streak: user.current_streak || 0,
            monthly,
            weekly,
            goal: user.goal,
            plan_completed_days: plan ? plan.completed_days : 0,
            plan_current_day: plan ? plan.current_day : 1
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== WORKOUT HISTORY ====================

app.get('/api/workout/history/:userId', async (req, res) => {
    try {
        const { period } = req.query;
        const startDate = new Date();
        if (period === 'week') startDate.setDate(startDate.getDate() - 7);
        else if (period === 'month') startDate.setMonth(startDate.getMonth() - 1);

        const history = await WorkoutHistory.find({
            user_id: req.params.userId,
            completed_at: { $gte: startDate }
        }).sort({ completed_at: -1 });

        const stats = { total: history.length, byCategory: {}, daily: {} };
        history.forEach(h => {
            stats.byCategory[h.category] = (stats.byCategory[h.category] || 0) + 1;
            const day = h.completed_at.toISOString().split('T')[0];
            stats.daily[day] = (stats.daily[day] || 0) + 1;
        });

        res.json({ history, stats });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== 30-DAY WORKOUT PLAN APIs ====================

// Generate new plan
app.post('/api/workout/plan/generate/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const goal = req.body.goal || user.goal;

        // Delete existing plan
        await WorkoutPlan.deleteMany({ user_id: userId });

        const days = generate30DayPlan(goal);

        const workoutPlan = new WorkoutPlan({
            user_id: userId,
            start_date: new Date(),
            current_day: 1,
            goal: goal,
            days: days,
            total_days: 30,
            completed_days: 0
        });

        await workoutPlan.save();
        console.log(`✅ Generated 30-day plan for user ${userId}, goal: ${goal}`);
        res.json(workoutPlan);
    } catch (e) {
        console.error('Error generating plan:', e);
        res.status(500).json({ error: e.message });
    }
});

// Get workout plan
app.get('/api/workout/plan/:userId', async (req, res) => {
    try {
        const plan = await WorkoutPlan.findOne({ user_id: req.params.userId });
        if (!plan) return res.status(404).json({ error: 'Workout plan not found' });
        res.json(plan);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get specific day
app.get('/api/workout/day/:userId/:dayNumber', async (req, res) => {
    try {
        const plan = await WorkoutPlan.findOne({ user_id: req.params.userId });
        if (!plan) return res.status(404).json({ error: 'Plan not found' });

        const day = plan.days.find(d => d.day_number === parseInt(req.params.dayNumber));
        if (!day) return res.status(404).json({ error: 'Day not found' });

        res.json({ day, exercises: day.exercises });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Complete exercise in a day
app.post('/api/workout/day/:userId/:dayNumber/exercise/:exerciseId', async (req, res) => {
    try {
        const { userId, dayNumber, exerciseId } = req.params;
        const plan = await WorkoutPlan.findOne({ user_id: userId });
        if (!plan) return res.status(404).json({ error: 'Plan not found' });

        const day = plan.days.find(d => d.day_number === parseInt(dayNumber));
        if (!day) return res.status(404).json({ error: 'Day not found' });

        const exercise = day.exercises.find(e => e.id === exerciseId);
        if (!exercise) return res.status(404).json({ error: 'Exercise not found' });

        if (!exercise.completed) {
            exercise.completed = true;
            day.completed_exercises++;

            // Calorie calculation: MET 5.0 * weight(kg) * duration(hrs)
            const exUser = await User.findById(userId).select('weight');
            const weightKg = (exUser && exUser.weight) ? exUser.weight : 70;
            const sets = exercise.sets || 3;
            const caloriesBurned = Math.round(5.0 * weightKg * 0.05 * sets);

            // Save to history
            const history = new WorkoutHistory({
                user_id: userId,
                exercise_id: exerciseId,
                exercise_name: exercise.name,
                exercise_name_ar: exercise.name_ar || exercise.name,
                category: exercise.category,
                sets: exercise.sets,
                reps: exercise.reps,
                calories_burned: caloriesBurned,
                completed_at: new Date()
            });
            await history.save();

            if (day.completed_exercises >= day.total_exercises) {
                day.completed = true;
                plan.completed_days++;
                plan.current_day = Math.min(30, parseInt(dayNumber) + 1);

                await User.findByIdAndUpdate(userId, {
                    $inc: { completed_days: 1, total_workouts: day.total_exercises },
                    last_workout_date: new Date()
                });

                // Update streak
                await updateStreak(userId);
            }
        }

        await plan.save();
        res.json({ success: true, day, exercise });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Complete entire day
app.post('/api/workout/day/:userId/:dayNumber/complete', async (req, res) => {
    try {
        const { userId, dayNumber } = req.params;
        const { duration } = req.body;
        const plan = await WorkoutPlan.findOne({ user_id: userId });
        if (!plan) return res.status(404).json({ error: 'Plan not found' });

        const day = plan.days.find(d => d.day_number === parseInt(dayNumber));
        if (!day) return res.status(404).json({ error: 'Day not found' });

        if (!day.completed) {
            day.exercises.forEach(e => {
                if (!e.completed) {
                    e.completed = true;
                    // Save to history
                    new WorkoutHistory({
                        user_id: userId,
                        exercise_id: e.id,
                        exercise_name: e.name,
                        exercise_name_ar: e.name_ar || e.name,
                        category: e.category,
                        sets: e.sets,
                        reps: e.reps,
                        completed_at: new Date()
                    }).save();
                }
            });

            day.completed_exercises = day.total_exercises;
            day.completed = true;
            day.duration = duration;
            plan.completed_days++;
            plan.current_day = Math.min(30, parseInt(dayNumber) + 1);

            await User.findByIdAndUpdate(userId, {
                $inc: { completed_days: 1, total_workouts: day.total_exercises },
                last_workout_date: new Date()
            });

            await updateStreak(userId);
        }

        await plan.save();
        res.json({ success: true, nextDay: parseInt(dayNumber) + 1, current_day: plan.current_day });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Reset a day
app.post('/api/workout/day/:userId/:dayNumber/reset', async (req, res) => {
    try {
        const { userId, dayNumber } = req.params;
        const plan = await WorkoutPlan.findOne({ user_id: userId });
        if (!plan) return res.status(404).json({ error: 'Plan not found' });

        const day = plan.days.find(d => d.day_number === parseInt(dayNumber));
        if (!day) return res.status(404).json({ error: 'Day not found' });

        const wasCompleted = day.completed;
        day.exercises.forEach(e => e.completed = false);
        day.completed_exercises = 0;
        day.completed = false;

        if (wasCompleted) {
            plan.completed_days = Math.max(0, plan.completed_days - 1);
            await User.findByIdAndUpdate(userId, {
                $inc: { completed_days: -1, total_workouts: -day.total_exercises }
            });
        }

        await plan.save();
        res.json({ success: true, day });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Navigate to a specific day (go back to previous day or jump to accessible day)
app.post('/api/workout/day/:userId/:dayNumber/navigate', async (req, res) => {
    try {
        const { userId, dayNumber } = req.params;
        const targetDay = parseInt(dayNumber);

        const plan = await WorkoutPlan.findOne({ user_id: userId });
        if (!plan) return res.status(404).json({ error: 'Plan not found' });

        if (targetDay < 1 || targetDay > 30) {
            return res.status(400).json({ error: 'Invalid day number' });
        }

        // Check if targetDay is accessible:
        // Day 1 is always accessible
        // Any completed day is accessible
        // current_day is accessible
        // Cannot skip ahead beyond current_day
        const dayData = plan.days.find(d => d.day_number === targetDay);
        const isCompleted = dayData ? dayData.completed : false;
        const isAccessible = targetDay === 1 || isCompleted || targetDay <= plan.current_day;

        if (!isAccessible) {
            return res.status(403).json({
                error: 'Day not accessible yet',
                message: 'Complete previous days first',
                current_day: plan.current_day
            });
        }

        // Do NOT change current_day when navigating backward
        // current_day should only advance when a day is completed
        const day = plan.days.find(d => d.day_number === targetDay);
        res.json({ success: true, day, current_day: plan.current_day });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Workout stats
app.get('/api/workout/stats/:userId', async (req, res) => {
    try {
        const plan = await WorkoutPlan.findOne({ user_id: req.params.userId });

        if (!plan) {
            return res.json({
                total_workouts: 0, total_exercises: 0, total_calories: 0,
                total_duration: 0, average_per_day: 0, best_streak: 0,
                current_streak: 0, weekly_stats: [], category_stats: []
            });
        }

        // Fetch user weight for calorie calculation
        const statsUser = await User.findById(req.params.userId).select('weight current_streak');
        const userWeightKg = (statsUser && statsUser.weight) ? statsUser.weight : 70;

        const completedDays = plan.days.filter(d => d.completed);
        const totalExercises = completedDays.reduce((s, d) => s + d.total_exercises, 0);

        // Calorie formula: MET * weight(kg) * duration(hrs)
        // Strength exercises: MET ~5, avg exercise ~3 min = 0.05hr → cal = 5 * kg * 0.05 * sets
        // Approx: each completed exercise set burns (weight * 0.25) kcal
        const totalCalories = completedDays.reduce((totalCal, day) => {
            const exerciseCal = day.exercises
                .filter(ex => ex.completed)
                .reduce((cal, ex) => {
                    const sets = ex.sets || 3;
                    // MET 5.0 for strength, 3 min per set = 0.05hr
                    const exerciseCalories = Math.round(5.0 * userWeightKg * 0.05 * sets);
                    return cal + exerciseCalories;
                }, 0);
            return totalCal + exerciseCal;
        }, 0);

        const categoryStats = {};
        plan.days.forEach(day => {
            day.exercises.forEach(ex => {
                if (ex.completed) {
                    categoryStats[ex.category] = (categoryStats[ex.category] || 0) + 1;
                }
            });
        });

        const weeklyStats = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const count = plan.days.filter(d => {
                const dDate = new Date(d.date);
                return dDate.toDateString() === date.toDateString() && d.completed;
            }).length;
            weeklyStats.push({ day: date.toISOString().split('T')[0], count });
        }

        // Accurate streak: count consecutive completed days ending at today
        const sortedDays = [...plan.days].sort((a, b) => a.day_number - b.day_number);
        let currentStreak = 0;
        for (let i = sortedDays.length - 1; i >= 0; i--) {
            if (sortedDays[i].completed) currentStreak++;
            else break;
        }

        res.json({
            total_workouts: completedDays.length,
            total_exercises: totalExercises,
            total_calories: totalCalories,
            total_duration: completedDays.reduce((s, d) => s + (d.duration || 0), 0),
            average_per_day: completedDays.length > 0 ? totalExercises / completedDays.length : 0,
            best_streak: currentStreak,
            current_streak: currentStreak,
            weekly_stats: weeklyStats,
            category_stats: Object.entries(categoryStats).map(([category, count]) => ({ category, count }))
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== DASHBOARD APIs ====================

app.get('/api/dashboard/weekly/:userId', async (req, res) => {
    try {
        const plan = await WorkoutPlan.findOne({ user_id: req.params.userId });
        if (!plan) return res.json([]);

        const weeklyProgress = [];
        const today = new Date();

        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const count = plan.days.filter(d => {
                const dDate = new Date(d.date);
                return dDate.toDateString() === date.toDateString() && d.completed;
            }).length;
            weeklyProgress.push({ day: date.toISOString().split('T')[0], count, date });
        }

        res.json(weeklyProgress);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/dashboard/categories/:userId', async (req, res) => {
    try {
        const plan = await WorkoutPlan.findOne({ user_id: req.params.userId });
        if (!plan) return res.json({});

        const dist = {};
        plan.days.forEach(day => {
            day.exercises.forEach(ex => {
                if (ex.completed) dist[ex.category] = (dist[ex.category] || 0) + 1;
            });
        });

        res.json(dist);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== TODAY'S WORKOUT ====================

app.get('/api/workout/today/:userId', async (req, res) => {
    try {
        const plan = await WorkoutPlan.findOne({ user_id: req.params.userId });
        if (!plan) return res.status(404).json({ error: 'No plan found' });

        const today = new Date();
        const todayDay = plan.days.find(d => {
            const dDate = new Date(d.date);
            return dDate.toDateString() === today.toDateString();
        });

        if (!todayDay) {
            // Return current day
            const currentDay = plan.days.find(d => d.day_number === plan.current_day) || plan.days[0];
            return res.json({
                _id: plan._id,
                day_number: currentDay.day_number,
                exercises: currentDay.exercises.map(e => ({
                    exercise_id: e.id,
                    exercise_name: e.name,
                    exercise_name_ar: e.name_ar || e.name,
                    sets: e.sets,
                    reps: e.reps,
                    completed: e.completed
                })),
                total_completed: currentDay.completed_exercises,
                total_exercises: currentDay.total_exercises,
                completed: currentDay.completed
            });
        }

        res.json({
            _id: plan._id,
            day_number: todayDay.day_number,
            exercises: todayDay.exercises.map(e => ({
                exercise_id: e.id,
                exercise_name: e.name,
                exercise_name_ar: e.name_ar || e.name,
                sets: e.sets,
                reps: e.reps,
                completed: e.completed
            })),
            total_completed: todayDay.completed_exercises,
            total_exercises: todayDay.total_exercises,
            completed: todayDay.completed
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ==================== STREAK HELPER ====================

async function updateStreak(userId) {
    const user = await User.findById(userId);
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lastWorkout = user.last_workout_date ? new Date(user.last_workout_date) : null;
    if (lastWorkout) lastWorkout.setHours(0, 0, 0, 0);

    let newStreak = user.current_streak || 0;

    if (!lastWorkout || lastWorkout.getTime() < yesterday.getTime()) {
        newStreak = 1;
    } else if (lastWorkout.getTime() === yesterday.getTime()) {
        newStreak = newStreak + 1;
    }
    // Same day = keep streak

    await User.findByIdAndUpdate(userId, { current_streak: newStreak });
}

// ==================== START SERVER ====================

const PORT = 8080;
app.listen(PORT, () => {
    console.log(`🚀 Trainova Server running on http://localhost:${PORT}`);
    console.log(`🔗 Test: http://localhost:${PORT}/api/test`);
});