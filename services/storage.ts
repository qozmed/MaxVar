// ... (Previous imports) ...
import { Recipe, User, RawRecipeImport, Report, Notification, AppView } from '../types';
import { MOCK_RECIPES } from '../mockData';

// ... (Helper functions) ...
const generateId = () => Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
const parseCookingTime = (timeStr: string): number => {
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

interface RecipeResponse {
    data: Recipe[];
    pagination: { total: number; page: number; pages: number; }
}

interface AppState {
    view: AppView;
    selectedRecipeId?: string;
    viewingUserEmail?: string;
    searchQuery?: string;
    tags?: string[];
}

type EventListener = (type: string, payload: any) => void;

class StorageServiceImpl {
  private recipesCache: Recipe[] = [];
  private usersCache: User[] = [];
  private tagsCache: string[] = [];
  private currentUserCache: User | null = null;
  private isDarkTheme: boolean = false;
  public isOfflineMode: boolean = false;
  
  private eventSource: EventSource | null = null;
  private listeners: EventListener[] = [];

  async initialize(): Promise<void> {
    try {
      this.loadLocalSettings();
      // Load user first to send ID in SSE
      const storedEmail = localStorage.getItem('gourmet_user_email');
      
      try {
          const response = await fetch('/api/users', { method: 'HEAD' });
          if (response.ok) {
              this.isOfflineMode = false;
              await this.refreshUsers();
              // Load user info
              if (storedEmail) {
                const foundUser = this.usersCache.find(u => u.email.toLowerCase() === storedEmail.toLowerCase());
                if (foundUser) {
                    if (foundUser.isBanned) {
                        this.saveUser(null);
                    } else {
                        this.currentUserCache = foundUser;
                    }
                }
              }
              this.connectToSSE(this.currentUserCache?.email);
          } else {
              throw new Error("API unavailable");
          }
      } catch (e) {
          console.warn("⚠️ Server unavailable, switching to Offline Mode");
          this.isOfflineMode = true;
          this.usersCache = []; 
      }
    } catch (error) { console.warn("Init error:", error); }
  }

  private connectToSSE(userEmail?: string) {
      if (this.eventSource) {
          this.eventSource.close();
      }
      const url = userEmail ? `/api/events?email=${encodeURIComponent(userEmail)}` : '/api/events';
      this.eventSource = new EventSource(url);
      this.eventSource.onmessage = (event) => {
          try {
              const data = JSON.parse(event.data);
              this.notifyListeners(data.type, data.payload);
          } catch (e) {}
      };
  }

  public subscribe(callback: EventListener) {
      this.listeners.push(callback);
      return () => { this.listeners = this.listeners.filter(cb => cb !== callback); };
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
        if(response.ok) this.usersCache = await response.json();
      } catch(e) {}
  }

  // --- NEW AUTH METHODS ---
  
  async login(email: string, password: string, code?: string): Promise<{ success: boolean; user?: User; require2FA?: boolean; message: string }> {
      if (this.isOfflineMode) return { success: false, message: "Сервер недоступен" };
      try {
          const res = await fetch('/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, password, code })
          });
          const data = await res.json();
          if (res.ok) {
              if (data.require2FA) {
                  return { success: false, require2FA: true, message: data.message };
              }
              this.connectToSSE(data.user.email); // Reconnect SSE with user context
              return { success: true, user: data.user, message: "Вход успешен" };
          }
          return { success: false, message: data.message || "Ошибка входа" };
      } catch (e) { return { success: false, message: "Ошибка сети" }; }
  }

  async register(name: string, email: string, password: string): Promise<{ success: boolean; user?: User; message: string }> {
      if (this.isOfflineMode) return { success: false, message: "Сервер недоступен" };
      try {
          const res = await fetch('/api/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, email, password })
          });
          const data = await res.json();
          if (res.ok && data.user) {
              this.connectToSSE(data.user.email); // Reconnect SSE with user context
              return { success: true, user: data.user, message: "Регистрация успешна" };
          }
          return { success: false, message: data.message || "Ошибка регистрации" };
      } catch (e) { return { success: false, message: "Ошибка сети" }; }
  }

  // --- 2FA MANAGEMENT ---
  async generate2FA(email: string): Promise<{ success: boolean; qrCode?: string; message?: string }> {
      if (this.isOfflineMode) return { success: false };
      try {
          const res = await fetch('/api/auth/2fa/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email })
          });
          return await res.json();
      } catch(e) { return { success: false }; }
  }

  async enable2FA(email: string, code: string): Promise<{ success: boolean; user?: User; message?: string }> {
      if (this.isOfflineMode) return { success: false };
      try {
          const res = await fetch('/api/auth/2fa/enable', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, code })
          });
          return await res.json();
      } catch(e) { return { success: false }; }
  }

  async disable2FA(email: string): Promise<{ success: boolean; user?: User; message?: string }> {
      if (this.isOfflineMode) return { success: false };
      try {
          const res = await fetch('/api/auth/2fa/disable', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email })
          });
          return await res.json();
      } catch(e) { return { success: false }; }
  }


  // --- EXISTING METHODS (Legacy support if needed, generally replaced by above) ---
  // ... (Kept for compatibility with other components if they call them directly, though updated logic preferred) ...
  async loginStep1() { return {success: false, message: "Deprecated"}; }
  async loginStep2() { return {success: false, message: "Deprecated"}; }
  async registerStep1() { return {success: false, message: "Deprecated"}; }
  async registerStep2() { return {success: false, message: "Deprecated"}; }

  async saveUser(user: User | null): Promise<void> {
      this.currentUserCache = user;
      if (user) {
          localStorage.setItem('gourmet_user_email', user.email);
      } else {
          localStorage.removeItem('gourmet_user_email');
          // Reconnect SSE anonymously on logout
          this.connectToSSE();
      }
  }
  getAllUsers(): User[] { return this.usersCache; }
  getUser(): User | null { return this.currentUserCache; }
  getRecipes(): Recipe[] { return this.recipesCache; }
  
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
        } catch (e) {}
      }
  }

  async searchRecipes(query: string = '', page: number = 1, limit: number = 12, sort: string = 'newest', tags: string[] = [], complexity: string[] = [], timeRange: [number, number] = [0, 180]): Promise<RecipeResponse> {
      if (this.isOfflineMode) throw new Error("Offline");
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString(), search: query, sort: sort });
      if (tags.length) params.append('tags', tags.join(','));
      if (complexity.length) params.append('complexity', complexity.join(','));
      if (timeRange[0] > 0 || timeRange[1] < 180) { params.append('minTime', timeRange[0].toString()); params.append('maxTime', timeRange[1].toString()); }
      
      const response = await fetch(`/api/recipes?${params.toString()}`);
      if (!response.ok) throw new Error("Server Error");
      return await response.json();
  }

  async getAllTags(): Promise<string[]> {
      try {
          const res = await fetch('/api/tags');
          return await res.json();
      } catch(e) { return []; }
  }

  async getRecipesByIds(ids: string[]): Promise<Recipe[]> {
      try {
          const res = await fetch(`/api/recipes?ids=${ids.join(',')}`);
          const json = await res.json();
          return json.data;
      } catch(e) { return []; }
  }

  // ... passthrough for other methods ...
  async saveRecipe(r: Recipe) { if(!this.isOfflineMode) fetch('/api/recipes', { method: 'POST', body: JSON.stringify(r), headers: {'Content-Type':'application/json'} }); }
  async deleteRecipe(id: string) { if(!this.isOfflineMode) { const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' }); return res.ok; } return false; }
  async importRecipes(raw: RawRecipeImport[]) { if(this.isOfflineMode) return { success: false, count: 0, message: '' }; const res = await fetch('/api/recipes/import', { method: 'POST', body: JSON.stringify(raw), headers: {'Content-Type':'application/json'} }); return await res.json(); }
  
  async getReports(): Promise<Report[]> { if(this.isOfflineMode) return []; const res = await fetch('/api/reports'); return await res.json(); }
  async sendReport(r: any) { if(!this.isOfflineMode) await fetch('/api/reports', { method: 'POST', body: JSON.stringify(r), headers: {'Content-Type':'application/json'} }); }
  async updateReportStatus(id: string, status: string) { if(!this.isOfflineMode) await fetch(`/api/reports/${id}`, { method: 'PUT', body: JSON.stringify({status}), headers: {'Content-Type':'application/json'} }); }
  
  async getNotifications(uid: string) { if(this.isOfflineMode) return []; const res = await fetch(`/api/notifications?userId=${uid}`); return await res.json(); }
  async sendNotification(n: any) { if(!this.isOfflineMode) await fetch('/api/notifications', { method: 'POST', body: JSON.stringify(n), headers: {'Content-Type':'application/json'} }); }
  async markNotificationRead(id: string) { if(!this.isOfflineMode) await fetch(`/api/notifications/${id}/read`, { method: 'PUT' }); }
  async markAllNotificationsRead(uid: string) { if(!this.isOfflineMode) await fetch(`/api/notifications/${encodeURIComponent(uid)}/read-all`, { method: 'PUT' }); }
  async deleteReadNotifications(uid: string) { if(!this.isOfflineMode) await fetch(`/api/notifications/${encodeURIComponent(uid)}/read`, { method: 'DELETE' }); }
  async sendGlobalBroadcast(t: string, m: string, type: string) { await fetch('/api/notifications/broadcast', { method: 'POST', body: JSON.stringify({title:t, message:m, type}), headers: {'Content-Type':'application/json'} }); }

  getTheme() { return this.isDarkTheme; }
  async saveTheme(d: boolean) { this.isDarkTheme = d; localStorage.setItem('gourmet_theme', String(d)); }
  saveAppState(s: AppState) { localStorage.setItem('gourmet_app_state', JSON.stringify(s)); }
  getAppState() { try { return JSON.parse(localStorage.getItem('gourmet_app_state') || 'null'); } catch(e) { return null; } }
}

export const StorageService = new StorageServiceImpl();
