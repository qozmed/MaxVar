import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { RecipeModel, UserModel, ReportModel, NotificationModel } from './models.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/gourmet_db';

// --- STATE ---
let isMongoConnected = false;

// In-Memory Fallback Storage (для работы без MongoDB)
let memUsers = [];
let memRecipes = [];
let memReports = [];
let memNotifications = [];

// --- SSE CLIENTS ---
let clients = [];

// --- DB CONNECTION ---
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, { 
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    isMongoConnected = true;
    console.log('✅ MongoDB Connected successfully');
  } catch (err) {
    console.log('⚠️  MongoDB unreachable.');
    console.log('🚀 Server switching to IN-MEMORY MODE (Data will be lost on restart)');
    isMongoConnected = false;
  }
};

mongoose.set('bufferCommands', false);
connectDB();

mongoose.connection.on('connected', () => { isMongoConnected = true; console.log('✅ DB Connection restored'); });
mongoose.connection.on('disconnected', () => { isMongoConnected = false; console.log('⚠️ DB Disconnected'); });

// --- CLEANUP TASK ---
const CLEANUP_INTERVAL = 60 * 60 * 1000;
setInterval(async () => {
    const reportCutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const imageCutoffDate = new Date(Date.now() - 12 * 60 * 60 * 1000);
    
    if (isMongoConnected) {
        try {
            await ReportModel.deleteMany({ status: 'resolved', resolvedAt: { $lt: reportCutoffDate } });
            await RecipeModel.updateMany(
                { "images.status": "rejected", "images.rejectedAt": { $lt: imageCutoffDate } },
                { $pull: { images: { status: "rejected", rejectedAt: { $lt: imageCutoffDate } } } }
            );
        } catch (e) {
            console.error("[System] Cleanup failed:", e);
        }
    } else {
        memReports = memReports.filter(r => {
            if (r.status !== 'resolved') return true;
            return r.resolvedAt && new Date(r.resolvedAt) >= reportCutoffDate;
        });
        memRecipes.forEach(recipe => {
            if (recipe.images) {
                recipe.images = recipe.images.filter(img => {
                    if (img.status !== 'rejected') return true;
                    return img.rejectedAt && new Date(img.rejectedAt) >= imageCutoffDate;
                });
            }
        });
    }
}, CLEANUP_INTERVAL);

const notifyClients = (type, payload) => {
  clients.forEach(client => {
    client.res.write(`data: ${JSON.stringify({ type, payload })}\n\n`);
  });
};

// Helper to parse "1 hour 30 min" to minutes
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
    try {
        if (isMongoConnected) {
            const tags = await RecipeModel.distinct('parsed_content.tags');
            res.json(tags.filter(t => t)); // Filter nulls
        } else {
            const tags = new Set();
            memRecipes.forEach(r => {
                r.parsed_content?.tags?.forEach(t => tags.add(t));
            });
            res.json(Array.from(tags));
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/recipes', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = req.query.search || '';
    const sort = req.query.sort || 'newest';
    const tagsParam = req.query.tags || ''; 
    const tags = tagsParam ? tagsParam.split(',') : [];
    
    // New Filters
    const complexityParam = req.query.complexity || '';
    const complexity = complexityParam ? complexityParam.split(',') : [];
    const minTime = parseInt(req.query.minTime) || 0;
    const maxTime = parseInt(req.query.maxTime) || 10000; // default high if not provided

    if (req.query.ids !== undefined) {
        const idsStr = req.query.ids || '';
        const ids = idsStr.split(',').filter(id => id.trim().length > 0);
        if (isMongoConnected) {
            const recipes = await RecipeModel.find({ id: { $in: ids } });
            return res.json({ data: recipes, pagination: { total: recipes.length, page: 1, pages: 1 } });
        } else {
            const recipes = memRecipes.filter(r => ids.includes(r.id));
            return res.json({ data: recipes, pagination: { total: recipes.length, page: 1, pages: 1 } });
        }
    }

    let results = [];

    if (isMongoConnected) {
      const query = {};
      
      // Text Search
      if (search) {
        const regex = new RegExp(search, 'i');
        query.$or = [
          { 'parsed_content.dish_name': regex },
          { 'parsed_content.tags': regex },
          { 'parsed_content.ingredients': regex }
        ];
      }

      // Tag Filtering (AND logic)
      if (tags.length > 0) {
          query['parsed_content.tags'] = { $all: tags };
      }

      // Complexity Filtering (IN logic)
      if (complexity.length > 0) {
          query['parsed_content.complexity'] = { $in: complexity };
      }

      // Fetch all matches for the main query first (without time)
      // Note: For massive datasets, we should store time as number in DB. 
      // For this 16k prototype, fetching subset then filtering in JS is acceptable.
      let sortOption = { createdAt: -1 };
      if (sort === 'popular') sortOption = { rating: -1, ratingCount: -1 };
      if (sort === 'discussed') sortOption = { 'comments.length': -1 }; 
      if (sort === 'updated') sortOption = { updatedAt: -1 };

      results = await RecipeModel.find(query).sort(sortOption);

    } else {
      // In-Memory filtering
      results = memRecipes;
      
      // Tags
      if (tags.length > 0) {
          results = results.filter(r => {
              const recipeTags = r.parsed_content?.tags || [];
              return tags.every(t => recipeTags.includes(t));
          });
      }

      // Complexity
      if (complexity.length > 0) {
          results = results.filter(r => complexity.includes(r.parsed_content?.complexity));
      }

      // Search
      if (search) {
        const lowerSearch = search.toLowerCase();
        results = results.filter(r => {
          const name = r.parsed_content?.dish_name?.toLowerCase() || '';
          const rTags = r.parsed_content?.tags || [];
          const ings = r.parsed_content?.ingredients || [];
          return name.includes(lowerSearch) || rTags.some(t => t.toLowerCase().includes(lowerSearch)) || ings.some(i => i.toLowerCase().includes(lowerSearch));
        });
      }
      
      if (sort === 'popular') results.sort((a, b) => b.rating - a.rating);
      else if (sort === 'newest') results = [...results].reverse();
    }

    // --- TIME FILTERING (Post-processing) ---
    if (minTime > 0 || maxTime < 180) { // Only filter if constraints exist
        results = results.filter(r => {
            const tStr = r.parsed_content?.cooking_time;
            if (!tStr) return false;
            const mins = parseCookingTime(tStr);
            const effectiveMax = maxTime === 180 ? 99999 : maxTime;
            return mins >= minTime && mins <= effectiveMax;
        });
    }

    // Pagination
    const total = results.length;
    const start = (page - 1) * limit;
    const end = start + limit;
    const data = results.slice(start, end);

    res.json({ data, pagination: { total, page, pages: Math.ceil(total / limit) } });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server Error", data: [], pagination: { total: 0, page: 1, pages: 0 } });
  }
});

app.post('/api/recipes', async (req, res) => {
  try {
    const recipeData = req.body;
    let savedRecipe;
    if (isMongoConnected) {
      savedRecipe = await RecipeModel.findOneAndUpdate({ id: recipeData.id }, recipeData, { upsert: true, new: true });
    } else {
      const idx = memRecipes.findIndex(r => r.id === recipeData.id);
      if (idx > -1) memRecipes[idx] = recipeData;
      else memRecipes.push(recipeData);
      savedRecipe = recipeData;
    }
    notifyClients('RECIPE_UPDATED', savedRecipe);
    res.json(savedRecipe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE RECIPE
app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let deleted = false;
    
    if (isMongoConnected) {
      const result = await RecipeModel.deleteOne({ id });
      deleted = result.deletedCount > 0;
    } else {
      const initialLen = memRecipes.length;
      memRecipes = memRecipes.filter(r => r.id !== id);
      deleted = memRecipes.length < initialLen;
    }

    if (deleted) {
      notifyClients('RECIPE_DELETED', { id });
      res.json({ success: true, message: "Recipe deleted" });
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
    
    if (isMongoConnected) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < recipes.length; i += BATCH_SIZE) {
          const batch = recipes.slice(i, i + BATCH_SIZE);
          const operations = batch.map(recipe => ({
            updateOne: { filter: { id: recipe.id }, update: { $set: recipe }, upsert: true }
          }));
          await RecipeModel.bulkWrite(operations);
      }
      res.json({ success: true, count: recipes.length });
    } else {
      recipes.forEach(newR => {
        const idx = memRecipes.findIndex(r => r.id === newR.id);
        if (idx > -1) memRecipes[idx] = newR;
        else memRecipes.push(newR);
      });
      res.json({ success: true, count: recipes.length });
    }
    notifyClients('RECIPES_IMPORTED', { count: recipes.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    if (isMongoConnected) {
      const users = await UserModel.find();
      res.json(users);
    } else {
      res.json(memUsers.map(u => { const { password, ...safe } = u; return safe; }));
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email и пароль обязательны" });
    const normalizedEmail = email.toLowerCase();
    let user;
    if (isMongoConnected) user = await UserModel.findOne({ email: normalizedEmail }).select('+password');
    else user = memUsers.find(u => u.email === normalizedEmail);
    
    if (!user) return res.status(404).json({ message: "Пользователь не найден" });
    const storedPassword = isMongoConnected ? user.password : user.password;
    if (storedPassword !== password) return res.status(401).json({ message: "Неверный пароль" });
    if (user.isBanned) return res.status(403).json({ message: "Аккаунт заблокирован" });

    const userObj = isMongoConnected ? user.toObject() : { ...user };
    delete userObj.password; 
    res.json(userObj);
  } catch (e) {
    res.status(500).json({ error: "Ошибка сервера при входе" });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const userData = req.body;
    if (!userData.email || !userData.password || !userData.name) return res.status(400).json({ message: "Заполните все поля" });
    const normalizedEmail = userData.email.toLowerCase();
    let safeUser;

    if (isMongoConnected) {
        const existing = await UserModel.findOne({ email: normalizedEmail });
        if (existing) return res.status(400).json({ message: "Такой Email уже зарегистрирован" });
        const newUser = new UserModel({ ...userData, email: normalizedEmail });
        await newUser.save();
        const userObj = newUser.toObject();
        delete userObj.password;
        safeUser = userObj;
    } else {
        const existing = memUsers.find(u => u.email === normalizedEmail);
        if (existing) return res.status(400).json({ message: "Email занят (In-Memory)" });
        const newUser = { ...userData, email: normalizedEmail };
        memUsers.push(newUser);
        const { password, ...rest } = newUser;
        safeUser = rest;
    }
    res.json(safeUser);
    notifyClients('USER_UPDATED', safeUser);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/users/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    let updatedUser;
    if (isMongoConnected) {
        updatedUser = await UserModel.findOneAndUpdate({ email }, req.body, { new: true });
    } else {
        const idx = memUsers.findIndex(u => u.email === email);
        if (idx > -1) {
            const oldPwd = memUsers[idx].password;
            memUsers[idx] = { ...memUsers[idx], ...req.body, password: oldPwd };
            const { password, ...safe } = memUsers[idx];
            updatedUser = safe;
        } else return res.status(404).json({ message: "User not found" });
    }
    res.json(updatedUser);
    notifyClients('USER_UPDATED', updatedUser);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/reports', async (req, res) => {
    try {
        if (isMongoConnected) {
            const reports = await ReportModel.find().sort({ createdAt: -1 });
            res.json(reports);
        } else res.json(memReports);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/reports', async (req, res) => {
    try {
        const reportData = req.body;
        let newReport;
        if (isMongoConnected) {
            const report = new ReportModel(reportData);
            await report.save();
            newReport = report.toJSON();
        } else {
            const uniqueId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            newReport = { ...reportData, id: uniqueId, createdAt: new Date().toISOString() };
            memReports.unshift(newReport);
        }
        res.json(newReport);
        notifyClients('REPORT_CREATED', newReport);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/reports/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const updateData = { status };
        if (status === 'resolved') updateData.resolvedAt = new Date().toISOString();
        let updated;
        if (isMongoConnected) updated = await ReportModel.findByIdAndUpdate(id, updateData, { new: true });
        else {
            const idx = memReports.findIndex(r => r.id === id);
            if (idx > -1) {
                memReports[idx] = { ...memReports[idx], ...updateData };
                updated = memReports[idx];
            }
        }
        if (!updated) return res.status(404).json({ error: "Report not found" });
        res.json(updated);
        notifyClients('REPORT_UPDATED', updated);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/notifications', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.json([]);
    if (isMongoConnected) {
        const notifs = await NotificationModel.find({ userId }).sort({ createdAt: -1 });
        res.json(notifs);
    } else {
        const notifs = memNotifications.filter(n => n.userId === userId).reverse();
        res.json(notifs);
    }
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
      const notifData = req.body;
      let savedNotif;
      if (isMongoConnected) {
          const notif = new NotificationModel(notifData);
          await notif.save();
          savedNotif = notif.toJSON();
      } else {
          const uniqueId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
          savedNotif = { ...notifData, id: uniqueId, createdAt: new Date().toISOString() };
          memNotifications.push(savedNotif);
      }
      notifyClients('NOTIFICATION_ADDED', savedNotif);
      res.json(savedNotif);
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

app.post('/api/notifications/broadcast', async (req, res) => {
    try {
        const { title, message, type } = req.body;
        if (!title || !message) return res.status(400).json({ message: "Заголовок и сообщение обязательны" });
        
        const notification = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            type: type || 'info',
            title,
            message,
            createdAt: new Date().toISOString(),
            isRead: false,
            userId: 'all' // Virtual ID for broadcast
        };
        
        notifyClients('GLOBAL_NOTIFICATION', notification);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
      const { id } = req.params;
      if (isMongoConnected) await NotificationModel.findByIdAndUpdate(id, { isRead: true });
      else {
          const idx = memNotifications.findIndex(n => n.id === id);
          if (idx > -1) memNotifications[idx].isRead = true;
      }
      res.json({ success: true });
  } catch (e) {
      res.status(500).json({ error: e.message });
  }
});

app.put('/api/notifications/:userId/read-all', async (req, res) => {
    try {
        const { userId } = req.params;
        if (isMongoConnected) await NotificationModel.updateMany({ userId, isRead: false }, { isRead: true });
        else {
            memNotifications.forEach(n => { if (n.userId === userId) n.isRead = true; });
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/notifications/:userId/read', async (req, res) => {
    try {
        const { userId } = req.params;
        if (isMongoConnected) await NotificationModel.deleteMany({ userId, isRead: true });
        else memNotifications = memNotifications.filter(n => !(n.userId === userId && n.isRead));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../dist', 'index.html'));
  });
} else {
    app.get('/', (req, res) => {
        res.send(`Gourmet API Running. Mode: ${isMongoConnected ? 'MongoDB' : 'In-Memory (Session Only)'}`);
    });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));