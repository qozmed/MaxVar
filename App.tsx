
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Navbar from './components/Navbar';
import RecipeCard from './components/RecipeCard';
import RecipeDetail from './components/RecipeDetail';
import UserProfile from './components/UserProfile';
import AuthModal from './components/AuthModal';
import AdminPanel from './components/AdminPanel';
import { ModalProvider, useModal } from './components/ModalProvider';
import { Recipe, User, AppView } from './types';
import { StorageService } from './services/storage';
import { Star, MessageCircle, Loader2, ChevronDown, WifiOff } from 'lucide-react';

const ITEMS_PER_PAGE = 12;

const AppContent: React.FC = () => {
  const { showAlert } = useModal();
  const [isInitialized, setIsInitialized] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  
  const [view, setView] = useState<AppView>(AppView.HOME);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  
  // DATA STATE
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [featuredRecipes, setFeaturedRecipes] = useState<Recipe[]>([]);
  const [discussedRecipes, setDiscussedRecipes] = useState<Recipe[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]); // Store all users for avatars lookup
  
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecipes, setTotalRecipes] = useState(0);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Initialize App Data
  useEffect(() => {
    const initApp = async () => {
      await StorageService.initialize();
      
      setCurrentUser(StorageService.getUser());
      setIsOffline(StorageService.isOfflineMode);
      setAllUsers(StorageService.getAllUsers()); // Load initial users list
      
      const theme = StorageService.getTheme();
      setIsDarkMode(theme);
      if (theme) document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');

      // Initial Fetch
      await fetchMainContent();

      setIsInitialized(true);
    };
    initApp();
  }, []);

  // Defined here to be used in subscription
  const performLogout = useCallback(async () => {
      setCurrentUser(null);
      await StorageService.saveUser(null);
      setView(AppView.HOME);
  }, []);

  // --- REAL-TIME LISTENER ---
  useEffect(() => {
      // Subscribe to real-time events from server
      const unsubscribe = StorageService.subscribe((type, payload) => {
          if (type === 'RECIPE_UPDATED') {
              const updatedRecipe = payload as Recipe;
              
              // 1. Update the list if the recipe is present
              setRecipes(prev => prev.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
              
              // 2. Update the featured/discussed lists if present
              setFeaturedRecipes(prev => prev.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
              setDiscussedRecipes(prev => prev.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));

              // 3. Update the selected recipe if it's the one currently open
              // Note: We use the function form of setSelectedRecipe to access the current state value reliably
              setSelectedRecipe(currentSelected => {
                  if (currentSelected && currentSelected.id === updatedRecipe.id) {
                      return updatedRecipe;
                  }
                  return currentSelected;
              });
          } else if (type === 'RECIPES_IMPORTED') {
              // Reload feed if bulk import happened
              fetchMainContent();
          } else if (type === 'USER_UPDATED') {
              const updatedUser = payload as User;
              
              // A. Update Global User List (for avatars in comments)
              setAllUsers(prev => {
                  const idx = prev.findIndex(u => u.email === updatedUser.email);
                  if (idx >= 0) {
                      const newArr = [...prev];
                      newArr[idx] = updatedUser;
                      return newArr;
                  }
                  return [...prev, updatedUser];
              });

              // B. Update Viewing User (Real-time Public Profile)
              setViewingUser(prevViewing => {
                  if (prevViewing && prevViewing.email === updatedUser.email) {
                      return updatedUser;
                  }
                  return prevViewing;
              });
              
              // C. Update Current Session User
              const currentSessionUser = StorageService.getUser();
              if (currentSessionUser && currentSessionUser.email === updatedUser.email) {
                  // Update local user state to reflect changes (e.g. bio, avatar)
                  setCurrentUser(updatedUser);
                  
                  // CRITICAL: Check for Ban Status
                  if (updatedUser.isBanned) {
                      performLogout();
                      showAlert('Доступ ограничен', 'Ваш аккаунт был заблокирован администратором.', 'error');
                  }
              }
          }
      });

      return () => unsubscribe();
  }, [performLogout, showAlert]);

  const fetchMainContent = async () => {
      setIsLoadingRecipes(true);
      try {
          // 1. Fetch Main Feed (Newest)
          const result = await StorageService.searchRecipes('', 1, ITEMS_PER_PAGE, 'newest');
          setRecipes(result.data);
          setTotalRecipes(result.pagination.total);
          setCurrentPage(1);

          // Check offline status again after request
          setIsOffline(StorageService.isOfflineMode);

          // 2. Fetch Featured (Popular) - Separate call to get best rated
          const featured = await StorageService.searchRecipes('', 1, 3, 'popular');
          setFeaturedRecipes(featured.data);

           // 3. Fetch Discussed
           const discussed = await StorageService.searchRecipes('', 1, 3, 'discussed');
           setDiscussedRecipes(discussed.data);

      } catch (e) {
          console.error("Failed to load main content", e);
      } finally {
          setIsLoadingRecipes(false);
      }
  };

  const fetchMoreRecipes = async () => {
      const nextPage = currentPage + 1;
      setIsLoadingRecipes(true);
      try {
          const result = await StorageService.searchRecipes(searchQuery, nextPage, ITEMS_PER_PAGE);
          setRecipes(prev => [...prev, ...result.data]); // Append new recipes
          setCurrentPage(nextPage);
      } catch (e) {
          console.error("Load more failed", e);
      } finally {
          setIsLoadingRecipes(false);
      }
  };

  // Handle search
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    setView(AppView.HOME);
    setIsLoadingRecipes(true);
    setCurrentPage(1);
    try {
        const result = await StorageService.searchRecipes(query, 1, ITEMS_PER_PAGE);
        setRecipes(result.data);
        setTotalRecipes(result.pagination.total);
    } catch (e) {
        console.error("Search failed", e);
    } finally {
        setIsLoadingRecipes(false);
    }
  }, []);

  // Handle recipe click
  const handleRecipeClick = useCallback((recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setView(AppView.RECIPE_DETAIL);
    window.scrollTo(0, 0);
    // Don't clear search query, so user can go back to results
  }, []);

  const handleUserProfileClick = useCallback((userName: string) => {
      // If user clicks on their own name, go to private profile
      if (currentUser && currentUser.name === userName) {
          setView(AppView.PROFILE);
          window.scrollTo(0, 0);
          return;
      }
      
      // Find user in cache (using the updated list)
      const foundUser = allUsers.find(u => u.name === userName);
      
      if (foundUser) {
          setViewingUser(foundUser);
          setView(AppView.PUBLIC_PROFILE);
          window.scrollTo(0, 0);
      } else {
          // Fallback if allUsers isn't perfectly synced yet, try storage direct
          const storeUsers = StorageService.getAllUsers();
          const fallbackFound = storeUsers.find(u => u.name === userName);
          if (fallbackFound) {
              setViewingUser(fallbackFound);
              setView(AppView.PUBLIC_PROFILE);
              window.scrollTo(0, 0);
          } else {
              showAlert("Пользователь не найден", "Профиль этого пользователя недоступен.");
          }
      }
  }, [currentUser, allUsers, showAlert]);

  // Memoize user map for quick avatar lookup in comments
  const userMap = useMemo(() => {
      const map: Record<string, User> = {};
      allUsers.forEach(u => {
          map[u.name] = u;
      });
      return map;
  }, [allUsers]);

  // Show loading screen while initializing
  if (!isInitialized) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 text-emerald-600">
              <Loader2 className="w-12 h-12 animate-spin mb-4" />
              <h2 className="text-xl font-serif font-bold text-gray-800 dark:text-white">Загрузка Кулинарной Книги...</h2>
              <p className="text-sm text-gray-500 mt-2">Подключение к серверу</p>
          </div>
      );
  }

  const handleUserLogin = async (user: User) => {
      setCurrentUser(user);
      await StorageService.saveUser(user);
  };

  const handleUserLogout = async () => {
      await performLogout();
  };

  const handleUpdateUserProfile = async (updatedUser: User) => {
    setCurrentUser(updatedUser);
    await StorageService.saveUser(updatedUser);
    await StorageService.updateUserInDB(updatedUser);
  };

  const toggleTheme = async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    await StorageService.saveTheme(newMode);
    if (newMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  };

  const handleBack = () => {
    // If we came from Public Profile to Recipe, going back might be tricky logic
    // For simplicity, back always goes Home or to previous logical view if state history was better
    // But currently handleBack resets to HOME usually.
    setSelectedRecipe(null);
    setView(AppView.HOME);
  };

  const toggleFavorite = async (recipeId: string) => {
    if (!currentUser) {
        setIsAuthOpen(true);
        return;
    }
    
    const currentFavorites = currentUser.favorites || [];
    let newFavorites;
    
    if (currentFavorites.includes(recipeId)) {
        newFavorites = currentFavorites.filter(id => id !== recipeId);
    } else {
        newFavorites = [...currentFavorites, recipeId];
    }

    const updatedUser = {
        ...currentUser,
        favorites: newFavorites
    };
    
    setCurrentUser(updatedUser);
    await StorageService.saveUser(updatedUser);
    await StorageService.updateUserInDB(updatedUser);
  };

  const handleRecipeUpdate = async (updatedRecipe: Recipe, userRateScore?: number) => {
      // Optimistic update for the triggering user
      // But server will also broadcast the update via SSE which will confirm it
      await StorageService.saveRecipe(updatedRecipe);
      
      // We manually update state here to give instant feedback before the SSE roundtrip
      setSelectedRecipe(updatedRecipe);
      setRecipes(prev => prev.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
      
      if (userRateScore !== undefined && currentUser) {
          const updatedUser = {
              ...currentUser,
              ratedRecipeIds: [...(currentUser.ratedRecipeIds || []), updatedRecipe.id]
          };
          await handleUpdateUserProfile(updatedUser);
      }
  };

  const currentFavorites = currentUser?.favorites || [];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar 
        onSearch={handleSearch}
        currentUser={currentUser}
        onAuthClick={() => setIsAuthOpen(true)}
        onLogout={handleUserLogout}
        toggleTheme={toggleTheme}
        isDarkMode={isDarkMode}
        goHome={() => { handleSearch(''); }}
        onProfileClick={() => { setView(AppView.PROFILE); window.scrollTo(0,0); }}
        onAdminClick={() => { setView(AppView.ADMIN); window.scrollTo(0,0); }}
        onRecipeSelect={handleRecipeClick}
      />

      <main className="flex-grow pt-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        
        {isOffline && (
             <div className="mb-6 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30 rounded-xl flex items-center justify-center gap-3 text-amber-800 dark:text-amber-200 animate-fade-in">
                <WifiOff className="w-5 h-5" />
                <span className="text-sm font-medium">Сервер недоступен. Работает демонстрационный режим.</span>
             </div>
        )}

        {view === AppView.HOME && (
          <div className="animate-fade-in">
             {/* Hero Section - only when no search active */}
             {!searchQuery && (
                 <div className="text-center py-8 sm:py-12 md:py-20">
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold tracking-widest uppercase text-xs sm:text-sm mb-2 block">
                      Кулинарное Вдохновение
                    </span>
                    <h2 className="font-serif text-4xl sm:text-5xl md:text-7xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
                      Искусство <span className="italic text-emerald-600 dark:text-emerald-400">Готовить</span>
                    </h2>
                    <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto px-4">
                      Откройте для себя 16,000+ рецептов. Оценивайте блюда, делитесь фото и присоединяйтесь к сообществу.
                    </p>
                 </div>
             )}

             {/* Feeds - Only show if no search */}
             {!searchQuery && (
               <div className="space-y-12 sm:space-y-16 mb-12 sm:mb-16">
                  {featuredRecipes.length > 0 && (
                      <section>
                          <div className="flex items-center gap-2 mb-6">
                              <Star className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400 fill-yellow-400" />
                              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Выбор Гурманов</h2>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                             {featuredRecipes.map(recipe => (
                                <RecipeCard key={recipe.id} recipe={recipe} onClick={handleRecipeClick} />
                             ))}
                          </div>
                      </section>
                  )}

                  {discussedRecipes.length > 0 && (
                      <section>
                          <div className="flex items-center gap-2 mb-6">
                              <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 dark:text-emerald-400" />
                              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Сейчас Обсуждают</h2>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                             {discussedRecipes.map(recipe => (
                                <RecipeCard key={recipe.id} recipe={recipe} onClick={handleRecipeClick} />
                             ))}
                          </div>
                      </section>
                  )}
               </div>
             )}

             {/* Main Recipe Grid */}
             <section className="pb-20">
                <div className="flex items-center gap-2 mb-6">
                    <div className="h-px flex-grow bg-gray-200 dark:bg-gray-800"></div>
                    <h2 className="font-serif text-lg sm:text-2xl font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest text-center whitespace-nowrap">
                        {searchQuery ? `Поиск: "${searchQuery}"` : "Все Рецепты"}
                    </h2>
                    <div className="h-px flex-grow bg-gray-200 dark:bg-gray-800"></div>
                </div>
                
                {recipes.length === 0 && !isLoadingRecipes ? (
                    <div className="text-center text-gray-500 py-20 text-lg sm:text-xl">Рецепты не найдены.</div>
                ) : (
                   <>
                     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                        {recipes.map(recipe => (
                          <RecipeCard key={recipe.id} recipe={recipe} onClick={handleRecipeClick} />
                        ))}
                     </div>
                     
                     {/* Load More Button */}
                     {recipes.length < totalRecipes && (
                       <div className="mt-12 flex justify-center">
                         <button 
                           onClick={fetchMoreRecipes}
                           disabled={isLoadingRecipes}
                           className="group flex items-center gap-2 px-8 py-3 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg hover:border-emerald-500 transition-all duration-300 disabled:opacity-50"
                         >
                           {isLoadingRecipes ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                               <>
                                <span className="font-medium text-gray-700 dark:text-gray-200 group-hover:text-emerald-600">Показать еще</span>
                                <div className="p-1 rounded-full bg-gray-100 dark:bg-gray-700 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/50 transition-colors">
                                    <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-emerald-600" />
                                </div>
                               </>
                           )}
                         </button>
                       </div>
                     )}
                     
                     <p className="w-full text-center mt-6 text-xs text-gray-400">
                        Показано {recipes.length} из {totalRecipes}
                     </p>
                   </>
                )}
             </section>
          </div>
        )}

        {view === AppView.RECIPE_DETAIL && selectedRecipe && (
          <RecipeDetail 
            recipe={selectedRecipe} 
            onBack={handleBack} 
            currentUser={currentUser}
            isFavorite={currentFavorites.includes(selectedRecipe.id)}
            toggleFavorite={() => toggleFavorite(selectedRecipe.id)}
            onUpdateRecipe={handleRecipeUpdate}
            onUpdateUser={handleUpdateUserProfile}
            onUserClick={handleUserProfileClick}
            userMap={userMap} // Pass the live map of users for avatars
          />
        )}

        {view === AppView.PROFILE && currentUser && (
            <UserProfile 
                user={currentUser}
                favorites={currentUser.favorites}
                onUpdateUser={handleUpdateUserProfile}
                onRecipeClick={handleRecipeClick}
            />
        )}
        
        {view === AppView.PUBLIC_PROFILE && viewingUser && (
            <UserProfile 
                user={viewingUser}
                favorites={viewingUser.favorites}
                onRecipeClick={handleRecipeClick}
                isReadOnly={true}
                onBack={handleBack}
            />
        )}

        {view === AppView.ADMIN && currentUser?.role === 'admin' && (
            <AdminPanel 
                currentUser={currentUser}
                onBack={() => setView(AppView.HOME)}
                onRecipeSelect={handleRecipeClick}
            />
        )}
      </main>

      <AuthModal 
        isOpen={isAuthOpen} 
        onClose={() => setIsAuthOpen(false)} 
        onLogin={handleUserLogin}
      />
      
      <footer className="glass-panel border-t border-white/20 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 dark:text-gray-400 text-sm">
           <p>© 2025 MaxVar Platform. Все права защищены.</p>
        </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ModalProvider>
      <AppContent />
    </ModalProvider>
  );
};

export default App;
