
import { Recipe, User, RawRecipeImport, Report, Notification } from '../types';
import { MOCK_RECIPES } from '../mockData';

const generateId = () => Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
const generateNumericId = () => Math.floor(100000 + Math.random() * 900000).toString();

interface RecipeResponse {
    data: Recipe[];
    pagination: {
        total: number;
        page: number;
        pages: number;
    }
}

type EventListener = (type: string, payload: any) => void;

class StorageServiceImpl {
  private recipesCache: Recipe[] = [];
  private usersCache: User[] = [];
  private currentUserCache: User | null = null;
  private isDarkTheme: boolean = false;
  public isOfflineMode: boolean = false;
  
  private eventSource: EventSource | null = null;
  private listeners: EventListener[] = [];

  async initialize(): Promise<void> {
    try {
      this.loadLocalSettings();
      try {
          const response = await fetch('/api/users', { method: 'HEAD' });
          if (response.ok) {
              this.isOfflineMode = false;
              await this.refreshUsers();
              this.connectToSSE();
          } else {
              throw new Error("API unavailable");
          }
      } catch (e) {
          console.warn("⚠️ Server unavailable, switching to Offline Mode");
          this.isOfflineMode = true;
          this.usersCache = []; 
      }
      
      const storedEmail = localStorage.getItem('gourmet_user_email');
      if (storedEmail) {
          const foundUser = this.usersCache.find(u => u.email.toLowerCase() === storedEmail.toLowerCase());
          if (foundUser) {
              if (foundUser.isBanned) {
                  this.saveUser(null);
                  console.warn("User is banned, preventing login.");
              } else {
                  this.currentUserCache = foundUser;
                  this.syncFavoritesMigration(foundUser);
              }
          }
      }
    } catch (error) {
      console.warn("Initialization warning:", error);
    }
  }

  private async syncFavoritesMigration(user: User) {
      const localFavs = JSON.parse(localStorage.getItem('gourmet_favorites') || '[]');
      if (localFavs.length > 0 && (!user.favorites || user.favorites.length === 0)) {
          user.favorites = localFavs;
          await this.saveUser(user);
          await this.updateUserInDB(user);
          localStorage.removeItem('gourmet_favorites');
      }
  }

  private connectToSSE() {
      if (this.eventSource) return;

      this.eventSource = new EventSource('/api/events');
      
      this.eventSource.onmessage = (event) => {
          try {
              const data = JSON.parse(event.data);
              this.notifyListeners(data.type, data.payload);
          } catch (e) {
              console.error("Failed to parse SSE message", e);
          }
      };

      this.eventSource.onerror = () => {
          console.log("SSE Connection lost. It will auto-reconnect.");
      };
  }

  public subscribe(callback: EventListener) {
      this.listeners.push(callback);
      return () => {
          this.listeners = this.listeners.filter(cb => cb !== callback);
      };
  }

  private notifyListeners(type: string, payload: any) {
      this.listeners.forEach(cb => cb(type, payload));
  }

  private loadLocalSettings() {
    this.isDarkTheme = localStorage.getItem('gourmet_theme') === 'true';
  }

  public async refreshUsers() {
      try {
        const response = await fetch('/api/users');
        if(response.ok) {
            this.usersCache = await response.json();
        }
      } catch(e) { console.warn("Users fetch failed"); }
  }

  async getRecipesByIds(ids: string[]): Promise<Recipe[]> {
      if (!ids || ids.length === 0) return [];

      if (this.isOfflineMode) {
          const allKnown = [...MOCK_RECIPES, ...this.recipesCache];
          const uniqueKnown = Array.from(new Map(allKnown.map(item => [item.id, item])).values());
          return uniqueKnown.filter(r => ids.includes(r.id));
      }

      try {
          const params = new URLSearchParams();
          params.append('ids', ids.join(','));
          
          const response = await fetch(`/api/recipes?${params.toString()}`);
          if (!response.ok) throw new Error('Failed to fetch favorites');
          
          const json = await response.json();
          return json.data || [];
      } catch (e) {
          console.error("Fetch favorites failed", e);
          return [];
      }
  }

  async searchRecipes(query: string = '', page: number = 1, limit: number = 12, sort: string = 'newest'): Promise<RecipeResponse> {
      try {
          if (this.isOfflineMode) throw new Error("Offline mode active");

          const params = new URLSearchParams({
              page: page.toString(),
              limit: limit.toString(),
              search: query,
              sort: sort
          });
          
          const response = await fetch(`/api/recipes?${params.toString()}`);
          
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("text/html")) {
             throw new Error("API Endpoint not found (Server likely offline)");
          }

          if (!response.ok) throw new Error(`Server Error: ${response.statusText}`);
          
          const json = await response.json();
          return json;

      } catch (e) {
          if (!this.isOfflineMode) {
             console.error("API Search failed, using local fallback:", e);
             if (e instanceof Error && (e.message.includes('fetch') || e.message.includes('Offline'))) {
                 this.isOfflineMode = true;
             }
          }
          
          let filtered = MOCK_RECIPES; 

          if (query) {
            const lowerSearch = query.toLowerCase();
            filtered = MOCK_RECIPES.filter(r => {
              const name = r.parsed_content?.dish_name?.toLowerCase() || '';
              const tags = r.parsed_content?.tags || [];
              const ings = r.parsed_content?.ingredients || [];
              
              return name.includes(lowerSearch) || 
                     tags.some(t => t.toLowerCase().includes(lowerSearch)) ||
                     ings.some(i => i.toLowerCase().includes(lowerSearch));
            });
          }

          if (sort === 'popular') {
              filtered = [...filtered].sort((a, b) => b.rating - a.rating);
          } else if (sort === 'newest') {
              filtered = [...filtered].reverse(); 
          }

          const total = filtered.length;
          const start = (page - 1) * limit;
          const end = start + limit;
          const data = filtered.slice(start, end);

          return { 
              data, 
              pagination: { 
                  total, 
                  page, 
                  pages: Math.max(1, Math.ceil(total / limit)) 
              } 
          };
      }
  }

  getRecipes(): Recipe[] { return this.recipesCache; }

  async saveRecipe(updatedRecipe: Recipe): Promise<void> {
    const index = this.recipesCache.findIndex(r => r.id === updatedRecipe.id);
    if (index !== -1) this.recipesCache[index] = updatedRecipe;

    if (!this.isOfflineMode) {
        try {
            await fetch('/api/recipes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedRecipe)
            });
        } catch (e) { console.error("Save error", e); }
    }
  }

  async deleteRecipe(id: string): Promise<boolean> {
      if (this.isOfflineMode) return false;
      try {
          const response = await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
          if (response.ok) {
              this.recipesCache = this.recipesCache.filter(r => r.id !== id);
              return true;
          }
          return false;
      } catch (e) {
          console.error("Delete error", e);
          return false;
      }
  }

  async importRecipes(rawRecipes: RawRecipeImport[]): Promise<{ success: boolean; count: number; message: string }> {
    try {
         const validRawRecipes = rawRecipes.filter(raw => raw && raw.parsed_content);
         if (validRawRecipes.length === 0) return { success: false, count: 0, message: "Нет валидных рецептов." };

         const newRecipes: Recipe[] = validRawRecipes.map(raw => ({
            id: generateId(),
            author: raw.author || 'Unknown',
            content: raw.content,
            parsed_content: raw.parsed_content,
            images: [],
            rating: 0,
            ratingCount: 0,
            comments: []
        }));

        if (this.isOfflineMode) {
             throw new Error("Импорт доступен только при запущенном сервере.");
        }

        const response = await fetch('/api/recipes/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newRecipes)
        });

        if (!response.ok) throw new Error('Server error during import');
        
        return { success: true, count: newRecipes.length, message: `Импортировано ${newRecipes.length} рецептов.` };
    } catch (e: any) {
        return { success: false, count: 0, message: "Ошибка: " + e.message };
    }
  }

  getUser(): User | null { return this.currentUserCache; }
  getAllUsers(): User[] { return this.usersCache; }

  async saveUser(user: User | null): Promise<void> {
      this.currentUserCache = user;
      if (user) localStorage.setItem('gourmet_user_email', user.email);
      else localStorage.removeItem('gourmet_user_email');
  }

  async registerUser(newUser: User): Promise<{ success: boolean; message: string; user?: User }> {
      if (this.isOfflineMode) return { success: false, message: 'Сервер недоступен (Offline Mode)' };
      if (!newUser.numericId) {
          newUser.numericId = generateNumericId();
      }
      try {
          const response = await fetch('/api/users', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newUser)
          });
          const contentType = response.headers.get("content-type");
          let data;
          if (contentType && contentType.includes("application/json")) {
             data = await response.json();
          } else {
             throw new Error("Invalid JSON response");
          }
          if (!response.ok) return { success: false, message: data.message || 'Ошибка сервера' };
          this.usersCache.push(data);
          return { success: true, message: 'Успешно!', user: data };
      } catch (e) {
          return { success: false, message: 'Сервер недоступен.' };
      }
  }

  async loginUser(email: string, password?: string): Promise<{ success: boolean; user?: User; message: string }> {
      if (this.isOfflineMode) return { success: false, message: 'Вход недоступен в Offline режиме' };
      try {
          const response = await fetch('/api/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password })
          });
          const contentType = response.headers.get("content-type");
          if (!contentType || !contentType.includes("application/json")) {
             return { success: false, message: "Ошибка сервера (500/502)" };
          }
          const data = await response.json();
          if (!response.ok) return { success: false, message: data.message || 'Ошибка входа' };
          if (!data.numericId) {
              data.numericId = generateNumericId();
              await this.updateUserInDB(data);
          }
          return { success: true, user: data, message: 'Вход выполнен' };
      } catch (e) {
          return { success: false, message: 'Сервер недоступен' };
      }
  }

  async updateUserInDB(updatedUser: User): Promise<void> {
      const index = this.usersCache.findIndex(u => u.email === updatedUser.email);
      if (index !== -1) this.usersCache[index] = updatedUser;
      if (this.currentUserCache && this.currentUserCache.email === updatedUser.email) {
          this.currentUserCache = updatedUser;
      }
      if (!this.isOfflineMode) {
        try {
            await fetch(`/api/users/${updatedUser.email}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedUser)
            });
        } catch (e) { console.error("Update user error", e); }
      }
  }

  async sendReport(report: Omit<Report, 'id' | 'createdAt' | 'status'>): Promise<void> {
      if (this.isOfflineMode) throw new Error("В офлайн режиме нельзя отправлять жалобы.");
      try {
          await fetch('/api/reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(report)
          });
      } catch (e) {
          console.error("Failed to send report", e);
          throw new Error("Не удалось отправить жалобу на сервер.");
      }
  }

  async getReports(): Promise<Report[]> {
      if (this.isOfflineMode) return [];
      try {
          const res = await fetch('/api/reports');
          return await res.json();
      } catch (e) {
          console.error("Failed to fetch reports", e);
          return [];
      }
  }

  async updateReportStatus(id: string, status: 'open' | 'resolved'): Promise<void> {
      if (this.isOfflineMode) return;
      try {
          await fetch(`/api/reports/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status })
          });
      } catch (e) {
          console.error("Failed to update report", e);
      }
  }

  async getNotifications(userId: string): Promise<Notification[]> {
      if (this.isOfflineMode) return [];
      try {
          const res = await fetch(`/api/notifications?userId=${encodeURIComponent(userId)}`);
          if (!res.ok) return [];
          return await res.json();
      } catch (e) {
          console.error("Failed to fetch notifications", e);
          return [];
      }
  }

  async sendNotification(notif: Omit<Notification, 'id' | 'createdAt' | 'isRead'>): Promise<void> {
      if (this.isOfflineMode) return;
      try {
          await fetch('/api/notifications', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(notif)
          });
      } catch (e) {
          console.error("Failed to send notification", e);
      }
  }

  async markNotificationRead(id: string): Promise<void> {
      if (this.isOfflineMode) return;
      try {
          await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      } catch(e) { console.error(e); }
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
      if (this.isOfflineMode) return;
      try {
          await fetch(`/api/notifications/${encodeURIComponent(userId)}/read-all`, { method: 'PUT' });
      } catch(e) { console.error(e); }
  }

  async deleteReadNotifications(userId: string): Promise<void> {
      if (this.isOfflineMode) return;
      try {
          await fetch(`/api/notifications/${encodeURIComponent(userId)}/read`, { method: 'DELETE' });
      } catch(e) { console.error(e); }
  }

  getFavorites(): string[] { return this.currentUserCache?.favorites || []; }
  
  async saveFavorites(favorites: string[]): Promise<void> {
      if (this.currentUserCache) {
          this.currentUserCache = { ...this.currentUserCache, favorites };
          await this.updateUserInDB(this.currentUserCache);
      } else {
          localStorage.setItem('gourmet_favorites', JSON.stringify(favorites));
      }
  }

  getTheme(): boolean { return this.isDarkTheme; }
  async saveTheme(isDark: boolean): Promise<void> {
      this.isDarkTheme = isDark;
      localStorage.setItem('gourmet_theme', String(isDark));
  }
}

export const StorageService = new StorageServiceImpl();