import React, { useState, useEffect } from 'react';
import { User, Recipe } from '../types';
import { Camera, Edit2, Save, Calendar, Mail, Heart, Settings, EyeOff, Loader2, ArrowLeft, Hash, Lock, ShieldAlert, Headphones } from 'lucide-react';
import RecipeCard from './RecipeCard';
import SettingsModal from './SettingsModal';
import { processImage } from '../services/imageOptimizer';
import { StorageService } from '../services/storage';
import { useModal } from './ModalProvider';

interface UserProfileProps {
  user: User;
  favorites?: string[]; 
  onUpdateUser?: (updatedUser: User) => void;
  onRecipeClick: (recipe: Recipe) => void;
  isReadOnly?: boolean; 
  onBack?: () => void;
}

const DIETARY_LABELS: Record<string, string> = {
  'vegetarian': 'Вегетарианец',
  'vegan': 'Веган',
  'gluten_free': 'Без глютена',
  'keto': 'Кето',
  'lactose_free': 'Без лактозы'
};

const UserProfile: React.FC<UserProfileProps> = ({ 
  user, 
  favorites = [], 
  onUpdateUser,
  onRecipeClick,
  isReadOnly = false,
  onBack
}) => {
  const { showAlert } = useModal();
  const [isEditing, setIsEditing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bio, setBio] = useState(user.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar || '');
  const [isUploading, setIsUploading] = useState(false);
  const [favoriteRecipesList, setFavoriteRecipesList] = useState<Recipe[]>([]);
  const [isLoadingFavs, setIsLoadingFavs] = useState(false);

  const showEmail = user.settings?.showEmail ?? false;
  const showFavorites = user.settings?.showFavorites ?? true;
  const dietaryPrefs = user.settings?.dietaryPreferences ?? [];

  useEffect(() => {
    let idsToLoad: string[] = [];
    if (!isReadOnly) {
        idsToLoad = favorites;
    } else {
        if (showFavorites) idsToLoad = user.favorites || [];
        else { setFavoriteRecipesList([]); return; }
    }
    if (!idsToLoad || idsToLoad.length === 0) { setFavoriteRecipesList([]); return; }
    
    const loadFavorites = async () => {
        setIsLoadingFavs(true);
        try {
            const data = await StorageService.getRecipesByIds(idsToLoad);
            setFavoriteRecipesList(data);
        } catch(e) { console.error("Failed to load favorite recipes", e); } 
        finally { setIsLoadingFavs(false); }
    };
    loadFavorites();
  }, [favorites, isReadOnly, user.favorites, showFavorites]); 

  const handleSave = () => {
    if (onUpdateUser) { onUpdateUser({ ...user, bio, avatar: avatarUrl }); }
    setIsEditing(false);
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      try {
        setIsUploading(true);
        const base64 = await processImage(e.target.files[0]);
        setAvatarUrl(base64);
        if (onUpdateUser) { onUpdateUser({ ...user, avatar: base64 }); }
      } catch (err) { showAlert("Ошибка", "Не удалось обработать изображение.", "error"); } 
      finally { setIsUploading(false); }
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pb-20 animate-fade-in">
      {isReadOnly && onBack && (
          <button onClick={onBack} className="mb-6 flex items-center px-4 py-2 rounded-full bg-white/50 dark:bg-black/50 hover:bg-emerald-100 text-gray-600 dark:text-gray-300 transition-all">
            <ArrowLeft className="w-4 h-4 mr-2" /> Назад
        </button>
      )}

      <div className={`grid grid-cols-1 ${!isReadOnly ? 'md:grid-cols-3' : 'md:grid-cols-1'} gap-6 md:gap-8`}>
        <div className={`md:col-span-1 ${isReadOnly ? 'max-w-2xl mx-auto w-full' : ''}`}>
           <div className="glass-panel rounded-3xl p-5 sm:p-6 sticky top-24 text-center relative">
              {!isReadOnly && <button onClick={() => setIsSettingsOpen(true)} className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:bg-gray-100"><Settings className="w-5 h-5" /></button>}

              <div className="relative w-28 h-28 sm:w-32 sm:h-32 mx-auto mb-6 group">
                 <div className="w-full h-full rounded-full overflow-hidden ring-4 ring-emerald-100 shadow-xl relative bg-white">
                    {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white text-4xl font-bold">{user.name.charAt(0)}</div>}
                    {isUploading && <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20"><Loader2 className="w-8 h-8 text-white animate-spin" /></div>}
                 </div>
                 {!isReadOnly && <label className="absolute bottom-0 right-0 bg-white p-2 rounded-full shadow-lg cursor-pointer hover:scale-110 transition-transform text-emerald-600 z-30 border border-gray-100"><Camera className="w-5 h-5" /><input type="file" className="hidden" accept="image/*" onChange={handleAvatarChange} disabled={isUploading} /></label>}
              </div>

              <div className="flex items-center justify-center gap-2 mb-1">
                  <h2 className="font-serif text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{user.name}</h2>
                  {user.role === 'admin' && <span title="Администратор" className="flex items-center"><ShieldAlert className="w-5 h-5 text-red-500 fill-red-100" /></span>}
                  {user.role === 'moderator' && <span title="Модератор" className="flex items-center"><Headphones className="w-5 h-5 text-blue-500 fill-blue-100" /></span>}
              </div>
              
              <div className="flex items-center justify-center gap-1.5 mb-3">
                  <span className="bg-gray-100 dark:bg-gray-800 text-gray-500 text-xs px-2 py-0.5 rounded-md font-mono flex items-center gap-1 select-all"><Hash className="w-3 h-3" />{user.numericId || '000000'}</span>
              </div>

              {(!isReadOnly || (isReadOnly && showEmail)) && (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-4">
                    <Mail className="w-3 h-3" /> <span className={`break-all ${(!showEmail && !isReadOnly) ? "line-through opacity-70" : ""}`}>{user.email}</span>
                    {(!showEmail && !isReadOnly) && <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded"><EyeOff className="w-3 h-3" /> Скрыт</span>}
                </div>
              )}

              {dietaryPrefs.length > 0 && <div className="flex flex-wrap justify-center gap-2 mb-6">{dietaryPrefs.map(pref => <span key={pref} className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-600 text-xs font-bold border border-emerald-100">{DIETARY_LABELS[pref] || pref}</span>)}</div>}

              <div className="text-left space-y-4 mb-6">
                 <div className="flex items-center gap-2 text-xs text-gray-400 uppercase tracking-wider font-bold justify-center"><Calendar className="w-3 h-3" /><span>В клубе с {user.joinedDate}</span></div>
                 <div className="bg-white/40 dark:bg-black/20 rounded-xl p-4 border border-white/20 relative">
                    <div className="flex items-center justify-between mb-2"><span className="text-xs font-bold text-emerald-600 uppercase">О себе</span>{!isEditing && !isReadOnly && <button onClick={() => setIsEditing(true)} className="text-gray-400 hover:text-emerald-500"><Edit2 className="w-3 h-3" /></button>}</div>
                    {isEditing && !isReadOnly ? (
                        <div className="relative">
                          <textarea className="w-full bg-transparent border-b border-emerald-500 focus:outline-none text-sm text-gray-700 dark:text-gray-300 resize-none h-24" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Расскажите о своих вкусах..." maxLength={150} />
                          <span className={`absolute bottom-0 right-0 text-[10px] font-medium ${bio.length >= 150 ? 'text-red-500' : 'text-gray-400'}`}>{bio.length}/150</span>
                        </div>
                    ) : ( <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed break-words">{bio || "Пользователь пока ничего не написал о себе."}</p> )}
                 </div>
              </div>
              {isEditing && !isReadOnly && <button onClick={handleSave} className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center justify-center gap-2 transition-all"><Save className="w-4 h-4" /> Сохранить профиль</button>}
           </div>
        </div>

        {( (!isReadOnly) || (isReadOnly && showFavorites) ) ? (
            <div className={`md:col-span-2 ${isReadOnly ? 'max-w-4xl mx-auto w-full mt-8' : ''}`}>
                <div className="flex items-center gap-3 mb-6 sm:mb-8">
                    <div className="p-2 rounded-lg bg-red-50 text-red-500"><Heart className="w-6 h-6 fill-current" /></div>
                    <h2 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{isReadOnly ? 'Избранные рецепты' : 'Моё Избранное'}</h2>
                    <span className="px-3 py-1 rounded-full bg-gray-100 text-xs sm:text-sm font-bold text-gray-500">{favoriteRecipesList.length}</span>
                </div>
                {isLoadingFavs ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div> : favoriteRecipesList.length === 0 ? <div className="glass-panel rounded-3xl p-12 text-center border-dashed border-2 border-gray-300"><p className="text-gray-500 mb-4">{isReadOnly ? "Список избранного пуст." : "У вас пока нет избранных рецептов."}</p></div> : <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">{favoriteRecipesList.map(recipe => <RecipeCard key={recipe.id} recipe={recipe} onClick={onRecipeClick} />)}</div>}
            </div>
        ) : ( isReadOnly && !showFavorites && <div className="md:col-span-1 max-w-2xl mx-auto w-full mt-8 flex flex-col items-center justify-center p-10 text-center"><div className="p-4 bg-gray-100 rounded-full mb-4"><Lock className="w-8 h-8 text-gray-400" /></div><h3 className="text-xl font-bold text-gray-700">Избранное скрыто</h3></div> )}
      </div>
      {onUpdateUser && <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} currentUser={user} onUpdateUser={onUpdateUser} />}
    </div>
  );
};

export default UserProfile;