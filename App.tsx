import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Navbar from './components/Navbar';
import RecipeCard from './components/RecipeCard';
import RecipeDetail from './components/RecipeDetail';
import UserProfile from './components/UserProfile';
import AuthModal from './components/AuthModal';
import AdminPanel from './components/AdminPanel';
import ModeratorPanel from './components/ModeratorPanel';
import { ModalProvider, useModal } from './components/ModalProvider';
import { Recipe, User, AppView } from './types';
import { StorageService } from './services/storage';
import { Star, MessageCircle, Loader2, ChevronDown, WifiOff, X } from 'lucide-react';

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
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  
  // SEARCH & FILTER STATE
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedComplexity, setSelectedComplexity] = useState<string[]>([]);
  const [selectedTimeRange, setSelectedTimeRange] = useState<[number, number]>([0, 180]);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecipes, setTotalRecipes] = useState(0);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(false);

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Initialize App Data & Restore State
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

      // Fetch Tags
      const tags = await StorageService.getAllTags();
      setAvailableTags(tags);

      // --- RESTORE STATE LOGIC ---
      const savedState = StorageService.getAppState();
      let restored = false;

      if (savedState) {
          if (savedState.searchQuery) setSearchQuery(savedState.searchQuery);
          if (savedState.tags) setSelectedTags(savedState.tags);
          // Note: Complexity and Time are not currently persisted in basic app state, 
          // but could be added here if needed.

          if (savedState.view === AppView.RECIPE_DETAIL && savedState.selectedRecipeId) {
             try {
                const recipes = await StorageService.getRecipesByIds([savedState.selectedRecipeId]);
                if (recipes.length > 0) {
                    setSelectedRecipe(recipes[0]);
                    setView(AppView.RECIPE_DETAIL);
                    restored = true;
                }
             } catch (e) { console.warn("Failed to restore recipe view"); }
          } else if (savedState.view === AppView.PUBLIC_PROFILE && savedState.viewingUserEmail) {
             try {
                // Try to find in cache first
                let user = StorageService.getAllUsers().find(u => u.email === savedState.viewingUserEmail);
                if (!user) {
                    // Force refresh users if not found
                     await StorageService.refreshUsers();
                     user = StorageService.getAllUsers().find(u => u.email === savedState.viewingUserEmail);
                }
                if (user) {
                    setViewingUser(user);
                    setView(AppView.PUBLIC_PROFILE);
                    restored = true;
                }
             } catch (e) { console.warn("Failed to restore profile view"); }
          } else if (savedState.view === AppView.PROFILE && StorageService.getUser()) {
              setView(AppView.PROFILE);
              restored = true;
          } else if (savedState.view === AppView.ADMIN) {
              const user = StorageService.getUser();
              if (user && (user.role === 'admin' || user.role === 'moderator')) {
                  setView(AppView.ADMIN);
                  restored = true;
              }
          }
      }

      // Initial Fetch (if not restored to a specific detail view, load feed)
      if (!restored || savedState?.view === AppView.HOME) {
          await fetchMainContent(
              savedState?.searchQuery || '', 
              savedState?.tags || [],
              [], 
              [0, 180]
          );
      } else {
          // Still fetch main content in background so navigation back works
          fetchMainContent(
              savedState?.searchQuery || '', 
              savedState?.tags || [],
              [], 
              [0, 180]
          );
      }

      setIsInitialized(true);
    };
    initApp();
  }, []);

  // --- PERSISTENCE EFFECT ---
  useEffect(() => {
      if (!isInitialized) return;
      
      const stateToSave = {
          view,
          selectedRecipeId: selectedRecipe?.id,
          viewingUserEmail: viewingUser?.email,
          searchQuery,
          tags: selectedTags
      };
      StorageService.saveAppState(stateToSave);
  }, [view, selectedRecipe, viewingUser, searchQuery, selectedTags, isInitialized]);


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
              
              setRecipes(prev => prev.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
              setFeaturedRecipes(prev => prev.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));
              setDiscussedRecipes(prev => prev.map(r => r.id === updatedRecipe.id ? updatedRecipe : r));

              setSelectedRecipe(currentSelected => {
                  if (currentSelected && currentSelected.id === updatedRecipe.id) {
                      return updatedRecipe;
                  }
                  return currentSelected;
              });
          } else if (type === 'RECIPES_IMPORTED') {
              fetchMainContent(searchQuery, selectedTags, selectedComplexity, selectedTimeRange);
          } else if (type === 'USER_UPDATED') {
              const updatedUser = payload as User;
              
              setAllUsers(prev => {
                  const idx = prev.findIndex(u => u.email === updatedUser.email);
                  if (idx >= 0) {
                      const newArr = [...prev];
                      newArr[idx] = updatedUser;
                      return newArr;
                  }
                  return [...prev, updatedUser];
              });

              setViewingUser(prevViewing => {
                  if (prevViewing && prevViewing.email === updatedUser.email) {
                      return updatedUser;
                  }
                  return prevViewing;
              });
              
              const currentSessionUser = StorageService.getUser();
              if (currentSessionUser && currentSessionUser.email === updatedUser.email) {
                  setCurrentUser(updatedUser);
                  if (updatedUser.isBanned) {
                      performLogout();
                      showAlert('Доступ ограничен', 'Ваш аккаунт был заблокирован администратором.', 'error');
                  }
              }
          }
      });

      return () => unsubscribe();
  }, [performLogout, showAlert, searchQuery, selectedTags, selectedComplexity, selectedTimeRange]);

  const fetchMainContent = async (
      query: string = '', 
      tags: string[] = [], 
      complexity: string[] = [], 
      time: [number, number] = [0, 180]
    ) => {
      setIsLoadingRecipes(true);
      try {
          // 1. Fetch Main Feed (Newest with Filters)
          const result = await StorageService.searchRecipes(query, 1, ITEMS_PER_PAGE, 'newest', tags, complexity, time);
          setRecipes(result.data);
          setTotalRecipes(result.pagination.total);
          setCurrentPage(1);

          // Check offline status again after request
          setIsOffline(StorageService.isOfflineMode);

          // 2. Fetch Featured (Popular) - Only if no search/filter active
          if (!query && tags.length === 0 && complexity.length === 0 && (time[0] === 0 && time[1] === 180)) {
            const featured = await StorageService.searchRecipes('', 1, 3, 'popular');
            setFeaturedRecipes(featured.data);

            const discussed = await StorageService.searchRecipes('', 1, 3, 'discussed');
            setDiscussedRecipes(discussed.data);
          } else {
              setFeaturedRecipes([]);
              setDiscussedRecipes([]);
          }

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
          const result = await StorageService.searchRecipes(searchQuery, nextPage, ITEMS_PER_PAGE, 'newest', selectedTags, selectedComplexity, selectedTimeRange);
          setRecipes(prev => [...prev, ...result.data]); // Append new recipes
          setCurrentPage(nextPage);
      } catch (e) {
          console.error("Load more failed", e);
      } finally {
          setIsLoadingRecipes(false);
      }
  };

  // Handle search & filters
  const handleSearch = useCallback(async (
      query: string, 
      tags: string[] = [], 
      complexity: string[] = [], 
      timeRange: [number, number] = [0, 180]
    ) => {
    setSearchQuery(query);
    setSelectedTags(tags);
    setSelectedComplexity(complexity);
    setSelectedTimeRange(timeRange);
    
    setView(AppView.HOME);
    await fetchMainContent(query, tags, complexity, timeRange);
  }, []);

  const handleTagClick = useCallback((tag: string) => {
      // When a tag is clicked, reset search query but filter by this tag
      setSearchQuery('');
      const newTags = [tag];
      setSelectedTags(newTags);
      setSelectedComplexity([]);
      setSelectedTimeRange([0, 180]);
      
      setView(AppView.HOME);
      window.scrollTo(0, 0);
      fetchMainContent('', newTags, [], [0, 180]);
  }, []);

  const handleClearTag = (tagToRem: string) => {
      const newTags = selectedTags.filter(t => t !== tagToRem);
      setSelectedTags(newTags);
      fetchMainContent(searchQuery, newTags, selectedComplexity, selectedTimeRange);
  };
  
  const handleClearFilters = () => {
      handleSearch('', [], [], [0, 180]);
  };

  // Handle recipe click
  const handleRecipeClick = useCallback((recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setView(AppView.RECIPE_DETAIL);
    window.scrollTo(0, 0);
  }, []);

  // Handle Navigation from Notifications
  const handleNotificationNavigation = useCallback(async (link: string) => {
      if (!link) return;

      // Extract ID from /recipe/:id
      if (link.startsWith('/recipe/')) {
          const id = link.split('/recipe/')[1];
          if (id) {
              // Check if we have it in memory first
              const existing = recipes.find(r => r.id === id);
              if (existing) {
                  handleRecipeClick(existing);
              } else {
                  // Fetch it
                  try {
                      const fetched = await StorageService.getRecipesByIds([id]);
                      if (fetched && fetched.length > 0) {
                          handleRecipeClick(fetched[0]);
                      } else {
                          showAlert('Ошибка', 'Рецепт не найден или был удален.');
                      }
                  } catch (e) {
                      showAlert('Ошибка', 'Не удалось загрузить рецепт.');
                  }
              }
          }
      }
  }, [recipes, handleRecipeClick, showAlert]);

  const handleUserProfileClick = useCallback((userName: string) => {
      if (currentUser && currentUser.name === userName) {
          setView(AppView.PROFILE);
          window.scrollTo(0, 0);
          return;
      }
      const foundUser = allUsers.find(u => u.name === userName);
      if (foundUser) {
          setViewingUser(foundUser);
          setView(AppView.PUBLIC_PROFILE);
          window.scrollTo(0, 0);
      } else {
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

  const userMap = useMemo(() => {
      const map: Record<string, User> = {};
      allUsers.forEach(u => {
          map[u.name] = u;
      });
      return map;
  }, [allUsers]);

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
      await StorageService.saveRecipe(updatedRecipe);
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

  const isFilterActive = selectedTags.length > 0 || selectedComplexity.length > 0 || (selectedTimeRange[0] > 0 || selectedTimeRange[1] < 180);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar 
        onSearch={handleSearch}
        currentUser={currentUser}
        onAuthClick={() => setIsAuthOpen(true)}
        onLogout={handleUserLogout}
        toggleTheme={toggleTheme}
        isDarkMode={isDarkMode}
        goHome={handleClearFilters}
        onProfileClick={() => { setView(AppView.PROFILE); window.scrollTo(0,0); }}
        onAdminClick={() => { setView(AppView.ADMIN); window.scrollTo(0,0); }}
        onRecipeSelect={handleRecipeClick}
        availableTags={availableTags}
        selectedTags={selectedTags}
        onNavigate={handleNotificationNavigation}
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
             {/* Hero Section - only when no search/filter active */}
             {!searchQuery && !isFilterActive && (
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

             {/* Selected Filters Display */}
             {isFilterActive && (
                 <div className="flex flex-wrap gap-2 justify-center mb-8">
                     {selectedTags.map(tag => (
                         <div key={tag} className="flex items-center gap-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 px-3 py-1 rounded-full text-sm font-bold">
                             <span>#{tag}</span>
                             <button onClick={() => handleClearTag(tag)} className="hover:text-emerald-900"><X className="w-4 h-4"/></button>
                         </div>
                     ))}
                     {selectedComplexity.map(c => (
                         <div key={c} className="flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-sm font-bold">
                             <span>{c}</span>
                             <button onClick={() => {
                                 const newC = selectedComplexity.filter(x => x !== c);
                                 handleSearch(searchQuery, selectedTags, newC, selectedTimeRange);
                             }} className="hover:text-blue-900"><X className="w-4 h-4"/></button>
                         </div>
                     ))}
                     {(selectedTimeRange[0] > 0 || selectedTimeRange[1] < 180) && (
                         <div className="flex items-center gap-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-3 py-1 rounded-full text-sm font-bold">
                             <span>{selectedTimeRange[0]} - {selectedTimeRange[1] === 180 ? '3ч+' : selectedTimeRange[1] + 'мин'}</span>
                             <button onClick={() => handleSearch(searchQuery, selectedTags, selectedComplexity, [0, 180])} className="hover:text-amber-900"><X className="w-4 h-4"/></button>
                         </div>
                     )}
                     <button onClick={handleClearFilters} className="text-sm text-gray-500 underline hover:text-emerald-600">Сбросить всё</button>
                 </div>
             )}

             {/* Feeds - Only show if no search/filter */}
             {!searchQuery && !isFilterActive && (
               <div className="space-y-12 sm:space-y-16 mb-12 sm:mb-16">
                  {featuredRecipes.length > 0 && (
                      <section>
                          <div className="flex items-center gap-2 mb-6">
                              <Star className="w-5 h-5 sm:w-6 sm:h-6 text-yellow-400 fill-yellow-400" />
                              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Выбор Гурманов</h2>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                             {featuredRecipes.map(recipe => (
                                <RecipeCard key={recipe.id} recipe={recipe} onClick={handleRecipeClick} onTagClick={handleTagClick} />
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
                                <RecipeCard key={recipe.id} recipe={recipe} onClick={handleRecipeClick} onTagClick={handleTagClick} />
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
                        {searchQuery || isFilterActive ? "Результаты поиска" : "Свежие Рецепты"}
                    </h2>
                    <div className="h-px flex-grow bg-gray-200 dark:bg-gray-800"></div>
                </div>
                
                {recipes.length === 0 && !isLoadingRecipes ? (
                    <div className="text-center text-gray-500 py-20 text-lg sm:text-xl">Рецепты не найдены.</div>
                ) : (
                   <>
                     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                        {recipes.map(recipe => (
                          <RecipeCard key={recipe.id} recipe={recipe} onClick={handleRecipeClick} onTagClick={handleTagClick} />
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
            userMap={userMap}
            onTagClick={handleTagClick}
          />
        )}

        {view === AppView.PROFILE && currentUser && (
            <UserProfile 
                user={currentUser}
                favorites={currentUser.favorites}
                onUpdateUser={handleUpdateUserProfile}
                onRecipeClick={handleRecipeClick}
                onTagClick={handleTagClick}
            />
        )}
        
        {view === AppView.PUBLIC_PROFILE && viewingUser && (
            <UserProfile 
                user={viewingUser}
                favorites={viewingUser.favorites}
                onRecipeClick={handleRecipeClick}
                isReadOnly={true}
                onBack={handleBack}
                onTagClick={handleTagClick}
            />
        )}

        {view === AppView.ADMIN && currentUser && (
            currentUser.role === 'admin' ? (
                <AdminPanel 
                    currentUser={currentUser}
                    onBack={() => setView(AppView.HOME)}
                    onRecipeSelect={handleRecipeClick}
                    onTagClick={handleTagClick}
                />
            ) : currentUser.role === 'moderator' ? (
                 <ModeratorPanel 
                    currentUser={currentUser}
                    onBack={() => setView(AppView.HOME)}
                    onRecipeSelect={handleRecipeClick}
                />
            ) : null
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