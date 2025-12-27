import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto'; 
import { fileURLToPath } from 'url';
import { authenticator } from 'otplib'; // Lib for 2FA
import QRCode from 'qrcode'; // Lib for generating QR images
import { RecipeModel, UserModel, ReportModel, NotificationModel } from './models.js';

dotenv.config();

// Define __dirname immediately for ESM modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.set('trust proxy', true); // Enable IP capture behind proxies

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/gourmet_db';

// --- STATE ---
let isMongoConnected = false;

// In-Memory Storage (Fallback)
let memUsers = [];
let memRecipes = []; 
let memReports = [];
let memNotifications = [];

let clients = [];
// Map to track active connections per user: email -> connectionCount
const onlineUsers = new Map();

// --- HELPER: TIME PARSER ---
const parseCookingTime = (timeStr) => {
    if (!timeStr) return 0;
    let minutes = 0;
    const lower = timeStr.toLowerCase();
    const normalized = lower.replace(',', '.');
    const hoursMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:ч|час|h|hour)/);
    if (hoursMatch) minutes += parseFloat(hoursMatch[1]) * 60;
    const minMatch = normalized.match(/(\d+)\s*(?:м|мин|min)/);
    if (minMatch) minutes += parseInt(minMatch[1]);
    if (!hoursMatch && !minMatch) {
        const num = parseInt(normalized.replace(/\D/g, ''));
        if (!isNaN(num)) minutes = num;
    }
    return Math.round(minutes);
};

// --- SECURITY UTILS ---
const hashPassword = (password, salt) => {
    if (!salt) salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { hash, salt };
};

const verifyPassword = (inputPassword, storedHash, storedSalt) => {
    const hash = crypto.pbkdf2Sync(inputPassword, storedSalt, 1000, 64, 'sha512').toString('hex');
    return hash === storedHash;
};

const getClientIp = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.connection.remoteAddress || req.socket.remoteAddress || req.ip;
};

// --- ROBUST UNIQUE ID GENERATOR ---
const generateUniqueNumericId = async () => {
    let id;
    let exists = true;
    let attempts = 0;
    
    while (exists && attempts < 50) {
        id = crypto.randomInt(100000, 999999).toString();
        
        if (isMongoConnected) {
            const user = await UserModel.findOne({ numericId: id });
            exists = !!user;
        } else {
            exists = memUsers.some(u => u.numericId === id);
        }
        attempts++;
    }
    
    if (exists) return Date.now().toString().slice(-6);
    return id;
};

// --- AUTOMATED CLEANUP TASK (Reports > 48 hours) ---
const cleanupOldReports = async () => {
    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
    
    // 1. Clean Memory (for Offline Mode & Cache Consistency)
    const initialLen = memReports.length;
    memReports = memReports.filter(report => {
        const reportDate = new Date(report.createdAt);
        return reportDate > cutoffDate;
    });
    
    if (initialLen > memReports.length) {
        console.log(`🧹 [Auto-Cleanup] Removed ${initialLen - memReports.length} old reports from memory.`);
    }

    // 2. Clean MongoDB (Explicitly, to ensure sync if TTL is slow)
    if (isMongoConnected) {
        try {
            const result = await ReportModel.deleteMany({ createdAt: { $lt: cutoffDate } });
            if (result.deletedCount > 0) {
                 console.log(`🧹 [Auto-Cleanup] Removed ${result.deletedCount} old reports from MongoDB.`);
            }
        } catch (e) {
            console.error("⚠️ Error cleaning up old reports from DB:", e.message);
        }
    }
};

// Run cleanup every hour
setInterval(cleanupOldReports, 60 * 60 * 1000);


// --- DB CONNECTION ---
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, { 
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      autoIndex: true, 
    });
    // Connection state is handled by event listeners below
    console.log('✅ MongoDB Connection Initiated');

    try {
        await RecipeModel.deleteMany({ id: { $in: ['1', '2', '3', '4'] } });

        // Initial Data Load
        const users = await UserModel.find().select('+password +salt +totpSecret').lean();
        memUsers = users.map(u => {
            const obj = { ...u, id: u._id.toString() };
            delete obj._id;
            return obj;
        });

        const recipes = await RecipeModel.find().lean();
        memRecipes = recipes.map(r => {
            const obj = { ...r };
            obj._timeVal = parseCookingTime(r.parsed_content?.cooking_time);
            delete obj._id;
            return obj;
        });

        const reports = await ReportModel.find().lean();
        memReports = reports.map(r => ({ ...r, id: r.id || r._id.toString() }));
        
        const notifs = await NotificationModel.find().lean();
        memNotifications = notifs.map(n => ({ ...n, id: n.id || n._id.toString() }));
        
        console.log(`📊 Loaded ${memRecipes.length} recipes, ${memReports.length} reports from DB`);
        
        // Run cleanup immediately on startup
        cleanupOldReports();

    } catch (loadErr) {
        console.error("⚠️ Error loading initial data from DB:", loadErr.message);
    }

  } catch (err) {
    console.log('⚠️  MongoDB unreachable. Starting in Offline/Memory Mode.');
    isMongoConnected = false;
    // Still run cleanup for memory mode
    cleanupOldReports();
  }
};

mongoose.connection.on('connected', () => {
    isMongoConnected = true;
    console.log('🟢 MongoDB Connected');
});

mongoose.connection.on('error', err => {
    console.error('🔥 MongoDB Connection Error:', err.message);
    isMongoConnected = false;
});

mongoose.connection.on('disconnected', () => {
    console.log('🔴 MongoDB Disconnected');
    isMongoConnected = false;
});

connectDB();

const notifyClients = (type, payload) => {
  clients.forEach(client => {
    // CRITICAL FIX: Check if writable to avoid crashing on page refresh
    if (!client.res.writable || client.res.closed || client.res.destroyed) {
        return;
    }
    try {
        client.res.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
    } catch (e) {
        console.error(`⚠️ SSE Write Error (Client ${client.id}):`, e.message);
        // We do not remove client here, the 'close' event handler will do it
    }
  });
};

// --- ROUTES ---

app.get('/api/events', (req, res) => {
  const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache'
  };
  res.writeHead(200, headers);
  
  const clientId = Date.now();
  const newClient = { id: clientId, res };
  clients.push(newClient);
  
  // Track Online Status
  const userEmail = req.query.email;
  if (userEmail) {
      const currentCount = onlineUsers.get(userEmail) || 0;
      onlineUsers.set(userEmail, currentCount + 1);
  }

  // Send initial ping
  try {
      res.write(`data: ${JSON.stringify({ type: 'CONNECTED', payload: { clientId } })}\n\n`);
  } catch(e) { console.error("Initial SSE write failed"); }

  // Clean up on connection close (Page Refresh triggers this)
  req.on('close', async () => {
    clients = clients.filter(client => client.id !== clientId);
    
    // Update Online Status
    if (userEmail) {
        const count = onlineUsers.get(userEmail) || 0;
        if (count <= 1) {
            onlineUsers.delete(userEmail);
            // Update last seen in DB
            const lastSeen = new Date();
            if (isMongoConnected) {
                await UserModel.updateOne({ email: userEmail }, { lastSeen });
            }
            // Update memory
            const idx = memUsers.findIndex(u => u.email === userEmail);
            if (idx > -1) memUsers[idx].lastSeen = lastSeen;
        } else {
            onlineUsers.set(userEmail, count - 1);
        }
    }
  });
  
  // Handle errors specifically on this response object
  res.on('error', (err) => {
      console.error(`SSE Response Error (Client ${clientId}):`, err.message);
      clients = clients.filter(client => client.id !== clientId);
  });
});

app.get('/api/tags', async (req, res) => {
    const tags = new Set();
    memRecipes.forEach(r => r.parsed_content?.tags?.forEach(t => tags.add(t)));
    res.json(Array.from(tags).sort());
});

app.get('/api/recipes', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = (req.query.search || '').toLowerCase();
    const sort = req.query.sort || 'newest';
    const tags = req.query.tags ? req.query.tags.split(',') : [];
    const complexity = req.query.complexity ? req.query.complexity.split(',') : [];
    const minTime = parseInt(req.query.minTime) || 0;
    const maxTime = parseInt(req.query.maxTime) || 10000;

    if (req.query.ids) {
        const ids = req.query.ids.split(',');
        const safeIds = ids.filter(id => !['1','2','3','4'].includes(id));
        const found = memRecipes.filter(r => safeIds.includes(r.id));
        return res.json({ data: found, pagination: { total: found.length, page: 1, pages: 1 } });
    }

    let results = memRecipes.filter(r => !['1', '2', '3', '4'].includes(r.id));

    if (search) {
        const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        results = results.filter(r => {
            const name = r.parsed_content?.dish_name?.toLowerCase() || '';
            const rTags = r.parsed_content?.tags || [];
            const ingredients = r.parsed_content?.ingredients || [];
            return name.includes(search) || 
                   rTags.some(t => t.toLowerCase().includes(search)) ||
                   ingredients.some(i => i.toLowerCase().includes(search));
        });
    }

    if (tags.length > 0) results = results.filter(r => tags.every(t => (r.parsed_content?.tags || []).includes(t)));
    if (complexity.length > 0) results = results.filter(r => complexity.includes(r.parsed_content?.complexity));
    if (minTime > 0 || maxTime < 180) {
        const effectiveMax = maxTime === 180 ? 99999 : maxTime;
        results = results.filter(r => {
            const val = r._timeVal !== undefined ? r._timeVal : parseCookingTime(r.parsed_content?.cooking_time);
            return val >= minTime && val <= effectiveMax;
        });
    }

    if (sort === 'popular') results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else if (sort === 'discussed') results.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
    else if (sort === 'updated') results.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    else results.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const total = results.length;
    const start = (page - 1) * limit;
    res.json({ data: results.slice(start, start + limit), pagination: { total, page, pages: Math.max(1, Math.ceil(total / limit)) } });

  } catch (e) { res.status(500).json({ error: "Server Error" }); }
});

// --- NEW AUTH FLOW (OPTIONAL 2FA) ---

// 1. REGISTER: Single step. 2FA is now optional in settings.
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const normalizedEmail = email.toLowerCase().trim();
        const clientIp = getClientIp(req);

        const existing = memUsers.find(u => u.email === normalizedEmail);
        if (existing) {
            return res.status(400).json({ message: "Email уже зарегистрирован" });
        }

        const { hash, salt } = hashPassword(password);
        const numericId = await generateUniqueNumericId();

        const newUser = {
            numericId,
            name,
            email: normalizedEmail,
            password: hash,
            salt,
            joinedDate: new Date().toLocaleDateString('ru-RU'),
            role: 'user',
            isBanned: false,
            is2FAEnabled: false, // Default to false
            favorites: [],
            ratedRecipeIds: [],
            votedComments: {},
            settings: { showEmail: false, showFavorites: true, newsletter: true, dietaryPreferences: [] },
            lastLoginIp: clientIp,
            lastSeen: new Date()
        };

        if (isMongoConnected) {
             const doc = new UserModel(newUser);
             await doc.save();
        }

        // Clean for memory & response
        const safeUser = { ...newUser };
        delete safeUser.password;
        delete safeUser.salt;

        memUsers.push(safeUser);
        
        res.json({ success: true, user: safeUser, message: "Регистрация успешна" });
        notifyClients('USER_UPDATED', safeUser);

    } catch (e) {
        console.error("Register Error:", e);
        res.status(500).json({ message: "Ошибка сервера" });
    }
});

// 2. LOGIN: Check pass. If 2FA on, require code. If off, log in.
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password, code } = req.body;
        const normalizedEmail = email.toLowerCase().trim();
        const clientIp = getClientIp(req);
        
        let user;
        if (isMongoConnected) {
            user = await UserModel.findOne({ email: normalizedEmail }).select('+password +salt +totpSecret');
        } else {
            user = memUsers.find(u => u.email === normalizedEmail);
        }

        if (!user) return res.status(404).json({ message: "Пользователь не найден" });
        if (user.isBanned) return res.status(403).json({ message: "Аккаунт заблокирован" });

        // Verify Password
        let isPassValid = false;
        if (user.salt) {
            isPassValid = verifyPassword(password, user.password, user.salt);
        } else if (user.password === password) {
            isPassValid = true; // Legacy
        }

        if (!isPassValid) return res.status(401).json({ message: "Неверный пароль" });

        // Check 2FA
        if (user.is2FAEnabled) {
            if (!code) {
                // Signal client to show code input
                return res.json({ success: false, require2FA: true, message: "Введите код 2FA" });
            }
            
            // Verify Code
            if (!user.totpSecret) return res.status(400).json({ message: "Ошибка конфигурации 2FA" });
            const isValid = authenticator.check(code, user.totpSecret);
            if (!isValid) return res.status(400).json({ message: "Неверный код" });
        }

        // Update IP and Last Seen
        if (isMongoConnected) {
             user.lastLoginIp = clientIp;
             user.lastSeen = new Date();
             await user.save();
        } else {
             const idx = memUsers.findIndex(u => u.email === normalizedEmail);
             if (idx > -1) {
                 memUsers[idx].lastLoginIp = clientIp;
                 memUsers[idx].lastSeen = new Date();
             }
        }

        // Success
        const safeUser = isMongoConnected ? user.toObject() : { ...user };
        delete safeUser.password;
        delete safeUser.salt;
        delete safeUser.totpSecret;

        res.json({ success: true, user: safeUser });

    } catch (e) {
        console.error("Login Error:", e);
        res.status(500).json({ message: "Ошибка сервера" });
    }
});

// --- 2FA MANAGEMENT ENDPOINTS ---

// Generate Secret & QR (User must be logged in on client side to call this, logic handled by passing email)
app.post('/api/auth/2fa/generate', async (req, res) => {
    try {
        const { email } = req.body;
        
        // Strict Check: Do not allow generation if already enabled
        let user;
        if (isMongoConnected) user = await UserModel.findOne({ email });
        else user = memUsers.find(u => u.email === email);

        if (!user) return res.status(404).json({ message: "User not found" });

        if (user.is2FAEnabled) {
             return res.status(400).json({ message: "2FA уже активна. Сначала отключите её." });
        }

        const totpSecret = authenticator.generateSecret();
        const otpauth = authenticator.keyuri(email, 'Gourmet Magazine', totpSecret);
        const qrCodeUrl = await QRCode.toDataURL(otpauth);

        // Store secret temporarily
        if (isMongoConnected) {
            await UserModel.updateOne({ email }, { totpSecret });
        } else {
            const idx = memUsers.findIndex(u => u.email === email);
            if (idx > -1) memUsers[idx].totpSecret = totpSecret;
        }

        res.json({ success: true, qrCode: qrCodeUrl });
    } catch(e) {
        console.error("2FA Generate Error:", e);
        res.status(500).json({ message: "Ошибка генерации 2FA" });
    }
});

app.post('/api/auth/2fa/enable', async (req, res) => {
    try {
        const { email, code } = req.body;
        
        let user;
        if (isMongoConnected) user = await UserModel.findOne({ email }).select('+totpSecret');
        else user = memUsers.find(u => u.email === email);

        if (!user || !user.totpSecret) return res.status(400).json({ message: "Сначала сгенерируйте код" });

        const isValid = authenticator.check(code, user.totpSecret);
        if (!isValid) return res.status(400).json({ message: "Неверный код" });

        if (isMongoConnected) {
            user.is2FAEnabled = true;
            await user.save();
        } else {
            const idx = memUsers.findIndex(u => u.email === email);
            memUsers[idx].is2FAEnabled = true;
        }
        
        // Return updated user to client
        const safeUser = isMongoConnected ? user.toObject() : { ...user };
        delete safeUser.password; delete safeUser.salt; delete safeUser.totpSecret;
        
        res.json({ success: true, user: safeUser });
    } catch(e) {
        res.status(500).json({ message: "Ошибка включения 2FA" });
    }
});

app.post('/api/auth/2fa/disable', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (isMongoConnected) {
            const user = await UserModel.findOneAndUpdate({ email }, { is2FAEnabled: false }, { new: true });
             const safeUser = user.toObject();
             delete safeUser.password; delete safeUser.salt; delete safeUser.totpSecret;
             res.json({ success: true, user: safeUser });
        } else {
            const idx = memUsers.findIndex(u => u.email === email);
            if (idx > -1) {
                memUsers[idx].is2FAEnabled = false;
                res.json({ success: true, user: memUsers[idx] });
            } else res.status(404).json({ message: "User not found" });
        }
    } catch(e) {
         res.status(500).json({ message: "Ошибка отключения 2FA" });
    }
});

// --- API ROUTES CONTINUED ---

app.get('/api/users', (req, res) => {
    const safeUsers = memUsers.map(u => { 
        const {password, salt, totpSecret, ...rest} = u; 
        return {
            ...rest,
            isOnline: onlineUsers.has(u.email)
        }; 
    });
    res.json(safeUsers);
});

app.post('/api/recipes', async (req, res) => {
  try {
    const recipeData = req.body;
    recipeData._timeVal = parseCookingTime(recipeData.parsed_content?.cooking_time);
    const idx = memRecipes.findIndex(r => r.id === recipeData.id);
    if (idx > -1) memRecipes[idx] = { ...memRecipes[idx], ...recipeData };
    else memRecipes.push(recipeData);
    if (isMongoConnected) {
        await RecipeModel.findOneAndUpdate({ id: recipeData.id }, recipeData, { upsert: true, new: true });
    }
    notifyClients('RECIPE_UPDATED', recipeData);
    res.json(recipeData);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const initialLen = memRecipes.length;
    memRecipes = memRecipes.filter(r => r.id !== id);
    const deleted = memRecipes.length < initialLen;
    if (isMongoConnected) await RecipeModel.deleteOne({ id });
    if (deleted || isMongoConnected) {
      notifyClients('RECIPE_DELETED', { id });
      res.json({ success: true });
    } else {
      res.status(404).json({ message: "Recipe not found" });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/users/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    const idx = memUsers.findIndex(u => u.email === email);
    if (idx === -1) return res.status(404).json({ message: "User not found" });
    const updatedUser = { ...memUsers[idx], ...req.body };
    updatedUser.password = memUsers[idx].password;
    updatedUser.salt = memUsers[idx].salt;
    memUsers[idx] = updatedUser;
    if (isMongoConnected) await UserModel.findOneAndUpdate({ email }, req.body);
    const { password, salt, totpSecret, ...safe } = updatedUser;
    res.json(safe);
    notifyClients('USER_UPDATED', safe);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/notifications', (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.json([]);
    const userNotifs = memNotifications.filter(n => n.userId === userId).reverse();
    res.json(userNotifs);
});
app.post('/api/notifications', async (req, res) => {
    try {
        const notif = { ...req.body, id: Date.now().toString(), createdAt: new Date().toISOString() };
        memNotifications.push(notif);
        if (isMongoConnected) { const doc = new NotificationModel(notif); await doc.save(); }
        res.json(notif);
        notifyClients('NOTIFICATION_ADDED', notif);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ROBUST NOTIFICATION ENDPOINTS ---
app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        const idx = memNotifications.findIndex(n => n.id === id);
        if (idx > -1) {
            memNotifications[idx].isRead = true;
        }
        if (isMongoConnected) {
            let result = await NotificationModel.updateOne({ id }, { isRead: true });
            if (result.matchedCount === 0) {
                 try { if (mongoose.Types.ObjectId.isValid(id)) await NotificationModel.findByIdAndUpdate(id, { isRead: true }); } catch(e) {}
            }
        }
        res.json({ success: true });
    } catch (e) {
        console.error("Error marking notif read:", e);
        res.json({ success: true }); 
    }
});

app.put('/api/notifications/:userId/read-all', async (req, res) => {
    try {
        const { userId } = req.params;
        memNotifications.forEach(n => { if (n.userId === userId) n.isRead = true; });
        if (isMongoConnected) await NotificationModel.updateMany({ userId }, { isRead: true });
        res.json({ success: true });
    } catch (e) {
        console.error("Error marking all read:", e);
        res.json({ success: true });
    }
});

app.delete('/api/notifications/:userId/read', async (req, res) => {
    try {
        const { userId } = req.params;
        memNotifications = memNotifications.filter(n => !(n.userId === userId && n.isRead));
        if (isMongoConnected) await NotificationModel.deleteMany({ userId, isRead: true });
        res.json({ success: true });
    } catch (e) {
        console.error("Error deleting notifications:", e);
        res.json({ success: true }); 
    }
});

app.post('/api/notifications/broadcast', async (req, res) => {
    const { title, message, type } = req.body;
    const notif = {
        id: 'global-' + Date.now(),
        userId: 'ALL',
        type,
        title,
        message,
        createdAt: new Date().toISOString(),
        isRead: false
    };
    notifyClients('GLOBAL_NOTIFICATION', notif);
    res.json({ success: true });
});
app.get('/api/reports', (req, res) => res.json(memReports));
app.post('/api/reports', async (req, res) => {
    try {
        const rep = { 
            status: 'open', // Fix: Explicitly set default status for memory storage
            ...req.body, 
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5), 
            createdAt: new Date().toISOString() 
        };
        memReports.unshift(rep);
        if (isMongoConnected) { const doc = new ReportModel(rep); await doc.save(); }
        res.json(rep);
        notifyClients('REPORT_CREATED', rep);
    } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/reports/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const idx = memReports.findIndex(r => r.id === id);
        if (idx === -1) return res.status(404).json({ error: "Not found" });
        const updates = { status };
        if (status === 'resolved') updates.resolvedAt = new Date();
        memReports[idx] = { ...memReports[idx], ...updates };
        
        if (isMongoConnected) {
             // Try updating by custom ID (new records)
             const result = await ReportModel.updateOne({ id: id }, updates);
             // Fallback: Try updating by _id (old/legacy records)
             if (result.matchedCount === 0 && mongoose.Types.ObjectId.isValid(id)) {
                 await ReportModel.updateOne({ _id: id }, updates);
             }
        }
        
        res.json(memReports[idx]);
        notifyClients('REPORT_UPDATED', memReports[idx]);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Universal Static File Serving
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  console.log('📦 Serving static files from dist');
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.resolve(distPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.send('Gourmet API Active (Dev Mode)'));
}

const PORT = process.env.PORT || 5008;
const server = app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

const shutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Stopping server...`);
  server.close(() => {
    console.log('✅ Server stopped successfully');
    process.exit(0);
  });
  setTimeout(() => {
    console.error('⚠️ Forcefully shutting down (timeout)');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => console.error('💥 Uncaught Exception:', err));
process.on('unhandledRejection', (reason, promise) => console.error('💥 Unhandled Rejection:', reason));