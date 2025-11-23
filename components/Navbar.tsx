import React, { useState, useEffect, useRef } from 'react';
import { Search, X, User as UserIcon, Moon, Sun, LogOut, ShieldAlert, UtensilsCrossed, Star, Loader2, ChevronRight, Settings, Headphones, Filter, Tag } from 'lucide-react';
import { User, Recipe } from '../types';
import { StorageService } from '../services/storage';
import NotificationCenter from './NotificationCenter';

interface NavbarProps {
  onSearch: (query: string, tags?: string[]) => void;
  currentUser: User | null;
  onAuthClick: () => void;
  onLogout: () => void;
  toggleTheme: () => void;
  isDarkMode: boolean;
  goHome: () => void;
  onProfileClick: () => void;
  onAdminClick: () => void;
  onRecipeSelect?: (recipe: Recipe) => void;
  availableTags?: string[]; // New prop
  selectedTags?: string[]; // New prop
}

const Navbar: React.FC<NavbarProps> = ({ 
  onSearch, 
  currentUser, 
  onAuthClick, 
  onLogout,
  toggleTheme, 
  isDarkMode,
  goHome,
  onProfileClick,
  onAdminClick,
  onRecipeSelect,
  availableTags = [],
  selectedTags = []
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Recipe[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Filter Dropdown State
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [localSelectedTags, setLocalSelectedTags] = useState<string[]>(selectedTags);

  const searchRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Sync internal tag state when props change
  useEffect(() => {
      setLocalSelectedTags(selectedTags);
  }, [selectedTags]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length > 1) {
        setIsSearching(true);
        try {
            const result = await StorageService.searchRecipes(searchQuery, 1, 5, 'newest', localSelectedTags);
            setSuggestions(result.data);
            setShowSuggestions(true);
        } catch (e) { console.error(e); } finally { setIsSearching(false); }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 400);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, localSelectedTags]);

  useEffect(() => { if (isMobileSearchOpen && mobileSearchInputRef.current) mobileSearchInputRef.current.focus(); }, [isMobileSearchOpen]);
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setShowSuggestions(false);
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setIsUserMenuOpen(false);
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) setIsFilterOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    setIsMobileSearchOpen(false);
    setIsFilterOpen(false);
    onSearch(searchQuery, localSelectedTags);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (recipe: Recipe) => {
    if (!recipe.parsed_content) return;
    setSearchQuery('');
    setShowSuggestions(false);
    setIsMobileSearchOpen(false);
    if (onRecipeSelect) onRecipeSelect(recipe); else onSearch(recipe.parsed_content.dish_name, localSelectedTags);
  };

  const toggleTag = (tag: string) => {
      setLocalSelectedTags(prev => 
          prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
      );
  };

  const applyFilters = () => {
      setIsFilterOpen(false);
      onSearch(searchQuery, localSelectedTags);
  };

  const isModOrAdmin = currentUser && (currentUser.role === 'admin' || currentUser.role === 'moderator');

  return (
    <>
    <nav className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/20 dark:border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          <div className="flex-shrink-0 cursor-pointer flex items-center" onClick={goHome}>
            {!logoError ? (
                <img src="/logo.png" alt="Gourmet Magazine" className="h-8 sm:h-10 md:h-14 w-auto object-contain transition-transform hover:scale-105" onError={(e) => { const target = e.target as HTMLImageElement; if (!target.src.includes('flaticon')) target.src = "https://i.ibb.co/4n8HrRj6/logo.png"; else setLogoError(true); }} />
            ) : (
                <div className="flex items-center gap-2 group"><div className="p-1.5 sm:p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl group-hover:bg-emerald-200 text-emerald-600"><UtensilsCrossed className="w-5 h-5 sm:w-6 sm:h-6" /></div><div className="flex flex-col"><span className="font-serif text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-none tracking-tight group-hover:text-emerald-700 transition-colors">Gourmet</span></div></div>
            )}
          </div>

          <div className="hidden md:flex flex-1 max-w-xl mx-8 relative items-center gap-2" ref={searchRef}>
            {/* Filter Dropdown */}
            <div className="relative" ref={filterRef}>
                <button 
                    type="button"
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className={`p-2 rounded-xl border transition-all flex items-center gap-2 ${localSelectedTags.length > 0 ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white/50 dark:bg-black/50 border-gray-200 dark:border-gray-700 hover:bg-gray-100'}`}
                    title="Фильтр по тегам"
                >
                    <Filter className="w-5 h-5" />
                    {localSelectedTags.length > 0 && <span className="text-xs font-bold bg-white/50 px-1.5 rounded-full">{localSelectedTags.length}</span>}
                </button>
                {isFilterOpen && (
                    <div className="absolute top-full left-0 mt-2 w-64 max-h-80 overflow-y-auto custom-scrollbar bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 p-3 z-50 animate-fade-in">
                        <h4 className="text-xs font-bold uppercase text-gray-400 mb-2">Теги блюд</h4>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {availableTags.length > 0 ? availableTags.map(tag => (
                                <button
                                    key={tag}
                                    onClick={() => toggleTag(tag)}
                                    className={`text-xs px-2 py-1 rounded-md border transition-colors ${localSelectedTags.includes(tag) ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-emerald-400'}`}
                                >
                                    {tag}
                                </button>
                            )) : <p className="text-xs text-gray-400">Теги загружаются...</p>}
                        </div>
                        <button onClick={applyFilters} className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700">Применить</button>
                    </div>
                )}
            </div>

            <form onSubmit={handleSearchSubmit} className="relative flex-grow">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Search className="h-5 w-5 text-gray-400" /></div>
              <input type="text" className="block w-full pl-10 pr-10 py-2 border border-gray-200 dark:border-gray-700 rounded-full leading-5 bg-white/50 dark:bg-black/50 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm backdrop-blur-sm transition-all duration-300" placeholder="Поиск рецептов..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onFocus={() => { if(searchQuery.length > 1) setShowSuggestions(true); }} autoComplete="off" />
              <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-1">{isSearching && <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />}{searchQuery && <button type="button" onClick={handleClearSearch} className="p-1 rounded-full text-gray-400 hover:bg-gray-100"><X className="w-4 h-4" /></button>}</div>
            </form>

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-12 right-0 mt-2 bg-white/90 dark:bg-gray-900/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/20 dark:border-gray-700 overflow-hidden animate-fade-in max-h-[400px] overflow-y-auto custom-scrollbar z-50">
                <ul>
                  {suggestions.map((recipe) => (
                    <li key={recipe.id} onClick={() => handleSuggestionClick(recipe)} className="flex items-center gap-3 p-3 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0">
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-800">{recipe.images && recipe.images[0]?.url ? <img src={recipe.images[0].url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs text-gray-400 font-serif font-bold">{recipe.parsed_content?.dish_name?.charAt(0)}</div>}</div>
                      <div className="flex-1 min-w-0"><h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{recipe.parsed_content?.dish_name}</h4><p className="text-xs text-gray-500 truncate">от {recipe.author}</p></div>
                      {recipe.rating > 0 && <div className="flex items-center gap-1 text-yellow-400 text-xs font-bold"><Star className="w-3 h-3 fill-current" />{recipe.rating}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 sm:gap-3">
             <button onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)} className={`md:hidden p-2 rounded-full transition-colors ${isMobileSearchOpen ? 'bg-emerald-100 text-emerald-600' : 'hover:bg-gray-100 text-gray-600'}`}>{isMobileSearchOpen ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}</button>
             <button onClick={toggleTheme} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors text-gray-600 dark:text-gray-300">{isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
            <NotificationCenter currentUser={currentUser} />
            <div className="relative" ref={userMenuRef}>
                {currentUser ? (
                  <>
                    <div className="hidden md:flex items-center gap-3">
                        {isModOrAdmin && (
                           <button onClick={onAdminClick} className={`p-2 rounded-full transition-colors ${currentUser.role === 'admin' ? 'text-red-600 bg-red-50 hover:bg-red-100' : 'text-blue-600 bg-blue-50 hover:bg-blue-100'}`} title={currentUser.role === 'admin' ? "Админ Панель" : "Панель Модератора"}>
                                {currentUser.role === 'admin' ? <ShieldAlert className="h-5 w-5" /> : <Headphones className="h-5 w-5" />}
                           </button>
                        )}
                        <button onClick={onProfileClick} className="flex items-center gap-2 hover:bg-gray-100/50 dark:hover:bg-white/5 px-3 py-1.5 rounded-full transition-colors">
                            <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xs font-bold overflow-hidden">{currentUser.avatar ? <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" /> : currentUser.name.charAt(0)}</div>
                            <span className="font-medium text-sm text-gray-700 dark:text-gray-200">{currentUser.name}</span>
                        </button>
                        <button onClick={onLogout} className="p-2 rounded-full text-red-500 hover:bg-red-50" title="Выйти"><LogOut className="h-5 w-5" /></button>
                    </div>
                    <button onClick={() => setIsUserMenuOpen(!isUserMenuOpen)} className="md:hidden p-1 rounded-full ring-2 ring-transparent active:ring-emerald-500 transition-all ml-1">
                        <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm font-bold overflow-hidden shadow-md">{currentUser.avatar ? <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" /> : currentUser.name.charAt(0)}</div>
                    </button>
                    {isUserMenuOpen && (
                        <div className="absolute right-0 top-full mt-3 w-56 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden animate-fade-in origin-top-right z-50">
                            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                                <p className="text-sm font-bold text-gray-900 dark:text-white truncate flex items-center gap-1">
                                    {currentUser.name} 
                                    {currentUser.role === 'admin' && <ShieldAlert className="w-3 h-3 text-red-500" />}
                                    {currentUser.role === 'moderator' && <Headphones className="w-3 h-3 text-blue-500" />}
                                </p>
                                <p className="text-xs text-gray-500 truncate">{currentUser.email}</p>
                            </div>
                            <div className="p-1">
                                <button onClick={() => { onProfileClick(); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg transition-colors"><Settings className="w-4 h-4" /> Профиль</button>
                                {isModOrAdmin && (
                                    <button onClick={() => { onAdminClick(); setIsUserMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${currentUser.role === 'admin' ? 'text-red-600 hover:bg-red-50' : 'text-blue-600 hover:bg-blue-50'}`}>
                                        {currentUser.role === 'admin' ? <ShieldAlert className="w-4 h-4" /> : <Headphones className="w-4 h-4" />} Панель
                                    </button>
                                )}
                                <div className="h-px bg-gray-100 dark:bg-gray-800 my-1" />
                                <button onClick={() => { onLogout(); setIsUserMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><LogOut className="w-4 h-4" /> Выйти</button>
                            </div>
                        </div>
                    )}
                  </>
                ) : (
                  <button onClick={onAuthClick} className="flex items-center justify-center p-2 sm:px-4 sm:py-2 rounded-full text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/30 transition-all active:scale-95 ml-1"><UserIcon className="h-5 w-5 sm:mr-2" /><span className="hidden sm:inline text-sm font-medium">Войти</span></button>
                )}
            </div>
          </div>
        </div>
      </div>
      {isMobileSearchOpen && (
        <div className="md:hidden border-t border-gray-100 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl animate-slide-up px-4 py-3 absolute left-0 right-0 shadow-xl">
             <form onSubmit={handleSearchSubmit} className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <input ref={mobileSearchInputRef} type="text" className="block w-full pl-9 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-black/50 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none text-sm transition-all" placeholder="Что будем готовить?" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                {searchQuery && <button type="button" onClick={handleClearSearch} className="absolute right-3 top-2.5 text-gray-400"><X className="w-4 h-4" /></button>}
             </form>
             {availableTags.length > 0 && (
                <div className="mt-3 flex overflow-x-auto gap-2 pb-1 scrollbar-hide">
                    {availableTags.slice(0, 10).map(tag => (
                        <button key={tag} onClick={() => toggleTag(tag)} className={`text-xs px-2 py-1 rounded-md border whitespace-nowrap ${localSelectedTags.includes(tag) ? 'bg-emerald-500 text-white' : 'bg-gray-50 text-gray-600'}`}>{tag}</button>
                    ))}
                </div>
             )}
        </div>
      )}
    </nav>
    </>
  );
};

export default Navbar;
