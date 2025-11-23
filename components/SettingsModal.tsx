
import React, { useState } from 'react';
import { X, Eye, EyeOff, Bell, Leaf, Save, Heart } from 'lucide-react';
import { User } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUpdateUser: (user: User) => void;
}

const DIETARY_OPTIONS = [
  { id: 'vegetarian', label: 'Вегетарианец', color: 'bg-green-100 text-green-700 border-green-200' },
  { id: 'vegan', label: 'Веган', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  { id: 'gluten_free', label: 'Без глютена', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { id: 'keto', label: 'Кето', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'lactose_free', label: 'Без лактозы', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentUser, onUpdateUser }) => {
  // Initialize state from user settings or defaults
  const [showEmail, setShowEmail] = useState(currentUser.settings?.showEmail ?? false);
  const [showFavorites, setShowFavorites] = useState(currentUser.settings?.showFavorites ?? true);
  const [newsletter, setNewsletter] = useState(currentUser.settings?.newsletter ?? true);
  const [selectedDiet, setSelectedDiet] = useState<string[]>(currentUser.settings?.dietaryPreferences ?? []);

  if (!isOpen) return null;

  const toggleDiet = (id: string) => {
    if (selectedDiet.includes(id)) {
      setSelectedDiet(selectedDiet.filter(d => d !== id));
    } else {
      setSelectedDiet([...selectedDiet, id]);
    }
  };

  const handleSave = () => {
    const updatedUser: User = {
      ...currentUser,
      settings: {
        showEmail,
        showFavorites,
        newsletter,
        dietaryPreferences: selectedDiet
      }
    };
    onUpdateUser(updatedUser);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-white/10">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="font-serif text-xl font-bold text-gray-900 dark:text-white">Настройки профиля</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Privacy Section */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Приватность</h3>
            
            <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700">
                   <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-lg">
                        {showEmail ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                      </div>
                      <div>
                         <p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">Показывать Email</p>
                         <p className="text-xs text-gray-500">Виден другим пользователям в профиле</p>
                      </div>
                   </div>
                   <button 
                     onClick={() => setShowEmail(!showEmail)}
                     className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showEmail ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                   >
                     <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showEmail ? 'translate-x-6' : 'translate-x-1'}`} />
                   </button>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700">
                   <div className="flex items-center gap-3">
                      <div className="p-2 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-lg">
                        <Heart className="w-5 h-5" />
                      </div>
                      <div>
                         <p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">Показывать избранное</p>
                         <p className="text-xs text-gray-500">Ваш список любимых рецептов виден всем</p>
                      </div>
                   </div>
                   <button 
                     onClick={() => setShowFavorites(!showFavorites)}
                     className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showFavorites ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                   >
                     <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showFavorites ? 'translate-x-6' : 'translate-x-1'}`} />
                   </button>
                </div>
            </div>
          </section>

          {/* Preferences Section */}
          <section>
            <div className="flex items-center gap-2 mb-4">
               <Leaf className="w-4 h-4 text-emerald-500" />
               <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Кулинарные предпочтения</h3>
            </div>
            <div className="flex flex-wrap gap-2">
               {DIETARY_OPTIONS.map(option => {
                 const isSelected = selectedDiet.includes(option.id);
                 return (
                   <button
                      key={option.id}
                      onClick={() => toggleDiet(option.id)}
                      className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-all ${
                        isSelected 
                          ? option.color + ' ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 ring-emerald-500' 
                          : 'bg-transparent border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5'
                      }`}
                   >
                      {option.label}
                   </button>
                 );
               })}
            </div>
          </section>

          {/* Notifications Section */}
          <section>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Уведомления</h3>
             <div className="flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-lg">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                     <p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">Рассылка новостей</p>
                     <p className="text-xs text-gray-500">Дайджест лучших рецептов недели</p>
                  </div>
               </div>
               <input 
                 type="checkbox" 
                 checked={newsletter}
                 onChange={(e) => setNewsletter(e.target.checked)}
                 className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
               />
            </div>
          </section>
        </div>

        <div className="p-6 pt-0">
           <button 
              onClick={handleSave}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 transition-all active:scale-95"
           >
              <Save className="w-4 h-4" />
              Сохранить изменения
           </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;

