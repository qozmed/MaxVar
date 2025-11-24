import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto'; // Native Node.js crypto for security
import { fileURLToPath } from 'url';
import { RecipeModel, UserModel, ReportModel, NotificationModel } from './models.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/gourmet_db';

// --- STATE ---
let isMongoConnected = false;

// In-Memory Storage (Acts as Cache when DB is connected, or Primary Storage when offline)
// We load ALL recipes into memory for high-performance filtering and sorting
let memUsers = [];
let memRecipes = []; 
let memReports = [];
let memNotifications = [];

let clients = [];

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

// --- DB CONNECTION & SYNC ---
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, { 
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      autoIndex: true, 
    });
    isMongoConnected = true;
    console.log('✅ MongoDB Connected successfully');

    // --- INITIAL DATA LOAD (CACHE WARMING) ---
    console.log('🔄 Loading data into memory for high-performance filtering...');
    
    // 1. Load Users
    const users = await UserModel.find().select('+password +salt').lean();
    memUsers = users.map(u => {
        const obj = { ...u, id: u._id.toString() };
        delete obj._id;
        return obj;
    });

    // 2. Load Recipes & Pre-calculate Time
    // We intentionally force delete ghost IDs if they sneaked into DB
    await RecipeModel.deleteMany({ id: { $in: ['1', '2', '3', '4'] } });

    const recipes = await RecipeModel.find().lean();
    memRecipes = recipes.map(r => {
        const obj = { ...r };
        // Pre-calculate numeric time for fast filtering
        obj._timeVal = parseCookingTime(r.parsed_content?.cooking_time);
        delete obj._id;
        return obj;
    });

    // 3. Load Reports & Notifications
    const reports = await ReportModel.find().lean();
    memReports = reports.map(r => ({ ...r, id: r.id || r._id.toString() }));
    
    const notifs = await NotificationModel.find().lean();
    memNotifications = notifs.map(n => ({ ...n, id: n.id || n._id.toString() }));

    console.log(`📊 Loaded: ${memRecipes.length} recipes, ${memUsers.length} users.`);

  } catch (err) {
    console.log('⚠️  MongoDB unreachable. Starting in Offline/Memory Mode.');
    console.error(err);
    isMongoConnected = false;
  }
};

mongoose.set('bufferCommands', false);
connectDB();

// --- CLEANUP TASK ---
setInterval(async () => {
    if (!isMongoConnected) return; // Only cleanup if DB is writable
    // ... cleanup logic ...
}, 60 * 60 * 1000);

const notifyClients = (type, payload) => {
  clients.forEach(client => {
    client.res.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
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
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', payload: { clientId } })}\n\n`);
  req.on('close', () => {
    clients = clients.filter(client => client.id !== clientId);
  });
});

app.get('/api/tags', async (req, res) => {
    const tags = new Set();
    memRecipes.forEach(r => r.parsed_content?.tags?.forEach(t => tags.add(t)));
    res.json(Array.from(tags).sort());
});

/**
 * HIGH PERFORMANCE SEARCH ENDPOINT
 * Uses In-Memory array for filtering/sorting (Node.js is extremely fast at this for <100k items)
 * Eliminates MongoDB Memory Limit error and allows complex time filtering.
 */
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

    // Direct ID fetch
    if (req.query.ids) {
        const ids = req.query.ids.split(',');
        const found = memRecipes.filter(r => ids.includes(r.id));
        return res.json({ data: found, pagination: { total: found.length, page: 1, pages: 1 } });
    }

    // 1. Filtering
    let results = memRecipes;

    // Ghost ID Cleanup (Just in case they are in memory)
    results = results.filter(r => !['1', '2', '3', '4'].includes(r.id));

    if (search) {
        results = results.filter(r => {
            const name = r.parsed_content?.dish_name?.toLowerCase() || '';
            const rTags = r.parsed_content?.tags || [];
            const ingredients = r.parsed_content?.ingredients || [];
            return name.includes(search) || 
                   rTags.some(t => t.toLowerCase().includes(search)) ||
                   ingredients.some(i => i.toLowerCase().includes(search));
        });
    }

    if (tags.length > 0) {
        results = results.filter(r => {
            const rTags = r.parsed_content?.tags || [];
            return tags.every(t => rTags.includes(t));
        });
    }

    if (complexity.length > 0) {
        results = results.filter(r => complexity.includes(r.parsed_content?.complexity));
    }

    if (minTime > 0 || maxTime < 180) {
        const effectiveMax = maxTime === 180 ? 99999 : maxTime;
        results = results.filter(r => {
            // Use cached time value if available, else parse
            const val = r._timeVal !== undefined ? r._timeVal : parseCookingTime(r.parsed_content?.cooking_time);
            return val >= minTime && val <= effectiveMax;
        });
    }

    // 2. Sorting
    if (sort === 'popular') {
        results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sort === 'discussed') {
        results.sort((a, b) => (b.comments?.length || 0) - (a.comments?.length || 0));
    } else if (sort === 'updated') {
        results.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    } else {
        // Newest
        results.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    // 3. Pagination
    const total = results.length;
    const start = (page - 1) * limit;
    const paginated = results.slice(start, start + limit);

    res.json({
        data: paginated,
        pagination: {
            total,
            page,
            pages: Math.max(1, Math.ceil(total / limit))
        }
    });

  } catch (e) {
    console.error("Search error", e);
    res.status(500).json({ error: "Server Error" });
  }
});

app.post('/api/recipes', async (req, res) => {
  try {
    const recipeData = req.body;
    // Calculate time val for cache
    recipeData._timeVal = parseCookingTime(recipeData.parsed_content?.cooking_time);
    
    // Update Memory
    const idx = memRecipes.findIndex(r => r.id === recipeData.id);
    if (idx > -1) memRecipes[idx] = { ...memRecipes[idx], ...recipeData };
    else memRecipes.push(recipeData);

    // Update DB
    if (isMongoConnected) {
        // We use findOneAndUpdate with upsert
        await RecipeModel.findOneAndUpdate({ id: recipeData.id }, recipeData, { upsert: true, new: true });
    }

    notifyClients('RECIPE_UPDATED', recipeData);
    res.json(recipeData);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Update Memory
    const initialLen = memRecipes.length;
    memRecipes = memRecipes.filter(r => r.id !== id);
    const deleted = memRecipes.length < initialLen;

    // Update DB
    if (isMongoConnected) {
       await RecipeModel.deleteOne({ id });
    }

    if (deleted || isMongoConnected) {
      notifyClients('RECIPE_DELETED', { id });
      res.json({ success: true });
    } else {
      res.status(404).json({ message: "Recipe not found" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/recipes/import', async (req, res) => {
  try {
    const recipes = req.body;
    if (!Array.isArray(recipes)) return res.status(400).send("Not an array");

    // Pre-process
    recipes.forEach(r => {
        r._timeVal = parseCookingTime(r.parsed_content?.cooking_time);
    });

    // Update Memory
    recipes.forEach(newR => {
        const idx = memRecipes.findIndex(r => r.id === newR.id);
        if (idx > -1) memRecipes[idx] = newR;
        else memRecipes.push(newR);
    });
    
    // Update DB
    if (isMongoConnected) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < recipes.length; i += BATCH_SIZE) {
          const batch = recipes.slice(i, i + BATCH_SIZE);
          const operations = batch.map(recipe => ({
            updateOne: { filter: { id: recipe.id }, update: { $set: recipe }, upsert: true }
          }));
          await RecipeModel.bulkWrite(operations);
      }
    }

    res.json({ success: true, count: recipes.length });
    notifyClients('RECIPES_IMPORTED', { count: recipes.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users', async (req, res) => {
    // Return users from memory (fast)
    // Strip sensitive fields
    const safeUsers = memUsers.map(u => {
        const { password, salt, ...safe } = u;
        return safe;
    });
    res.json(safeUsers);
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Data missing" });
    
    const user = memUsers.find(u => u.email === email.toLowerCase());
    
    if (!user) return res.status(404).json({ message: "Пользователь не найден" });
    if (user.isBanned) return res.status(403).json({ message: "Аккаунт заблокирован" });

    // Verify
    let isValid = false;
    if (user.salt) {
        isValid = verifyPassword(password, user.password, user.salt);
    } else if (user.password === password) {
        // Legacy support
        isValid = true;
        // Migrate to secure in DB
        if (isMongoConnected) {
             const { hash, salt } = hashPassword(password);
             await UserModel.updateOne({ email: user.email }, { password: hash, salt });
             user.password = hash;
             user.salt = salt;
        }
    }

    if (!isValid) return res.status(401).json({ message: "Неверный пароль" });

    const { password: _, salt: __, ...safeUser } = user;
    res.json(safeUser);
  } catch (e) {
    res.status(500).json({ error: "Login failed" });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const userData = req.body;
    const normalizedEmail = userData.email.toLowerCase();
    
    if (memUsers.find(u => u.email === normalizedEmail)) {
        return res.status(400).json({ message: "Email занят" });
    }

    const { hash, salt } = hashPassword(userData.password);
    const newUser = { 
        ...userData, 
        email: normalizedEmail,
        password: hash, 
        salt 
    };

    memUsers.push(newUser);

    if (isMongoConnected) {
        const userDoc = new UserModel(newUser);
        await userDoc.save();
    }

    const { password, salt: s, ...safeUser } = newUser;
    res.json(safeUser);
    notifyClients('USER_UPDATED', safeUser);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    const idx = memUsers.findIndex(u => u.email === email);
    
    if (idx === -1) return res.status(404).json({ message: "User not found" });

    // Merge updates
    const updatedUser = { ...memUsers[idx], ...req.body };
    // Restore protected fields
    updatedUser.password = memUsers[idx].password;
    updatedUser.salt = memUsers[idx].salt;
    
    memUsers[idx] = updatedUser;

    if (isMongoConnected) {
        await UserModel.findOneAndUpdate({ email }, req.body);
    }

    const { password, salt, ...safe } = updatedUser;
    res.json(safe);
    notifyClients('USER_UPDATED', safe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/reports', (req, res) => res.json(memReports));

app.post('/api/reports', async (req, res) => {
    const uniqueId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const newReport = { ...req.body, id: uniqueId, createdAt: new Date().toISOString() };
    
    memReports.unshift(newReport);
    if (isMongoConnected) {
        const doc = new ReportModel(newReport);
        await doc.save();
    }
    
    res.json(newReport);
    notifyClients('REPORT_CREATED', newReport);
});

app.put('/api/reports/:id', async (req, res) => {
    const { id } = req.params;
    const idx = memReports.findIndex(r => r.id === id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });

    const updateData = { ...req.body };
    if (updateData.status === 'resolved') updateData.resolvedAt = new Date().toISOString();

    memReports[idx] = { ...memReports[idx], ...updateData };

    if (isMongoConnected) {
        await ReportModel.updateOne({ _id: id }, updateData).catch(() => {
             // Try by id string if _id fails
             ReportModel.updateOne({ id: id }, updateData);
        });
    }

    res.json(memReports[idx]);
    notifyClients('REPORT_UPDATED', memReports[idx]);
});

app.get('/api/notifications', (req, res) => {
    const { userId } = req.query;
    if (!userId) return res.json([]);
    const userNotifs = memNotifications.filter(n => n.userId === userId).reverse();
    res.json(userNotifs);
});

app.post('/api/notifications', async (req, res) => {
    const uniqueId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const notif = { ...req.body, id: uniqueId, createdAt: new Date().toISOString() };
    
    memNotifications.push(notif);
    if (isMongoConnected) {
        const doc = new NotificationModel(notif);
        await doc.save();
    }
    res.json(notif);
    notifyClients('NOTIFICATION_ADDED', notif);
});

app.post('/api/notifications/broadcast', async (req, res) => {
    const { title, message, type } = req.body;
    const notif = {
        id: 'global_' + Date.now(),
        type: type || 'info',
        title,
        message,
        createdAt: new Date().toISOString(),
        isRead: false,
        userId: 'all'
    };
    notifyClients('GLOBAL_NOTIFICATION', notif);
    res.json({ success: true });
});

app.put('/api/notifications/:id/read', async (req, res) => {
    const { id } = req.params;
    const idx = memNotifications.findIndex(n => n.id === id);
    if (idx > -1) memNotifications[idx].isRead = true;
    
    if (isMongoConnected) {
        await NotificationModel.updateOne({ _id: id }, { isRead: true }).catch(() => {});
    }
    res.json({ success: true });
});

app.put('/api/notifications/:userId/read-all', async (req, res) => {
    const { userId } = req.params;
    memNotifications.forEach(n => { if (n.userId === userId) n.isRead = true; });
    if (isMongoConnected) {
        await NotificationModel.updateMany({ userId, isRead: false }, { isRead: true });
    }
    res.json({ success: true });
});

app.delete('/api/notifications/:userId/read', async (req, res) => {
    const { userId } = req.params;
    memNotifications = memNotifications.filter(n => !(n.userId === userId && n.isRead));
    if (isMongoConnected) {
        await NotificationModel.deleteMany({ userId, isRead: true });
    }
    res.json({ success: true });
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../dist', 'index.html'));
  });
} else {
    app.get('/', (req, res) => res.send('Gourmet API (InMemory Cache)'));
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));