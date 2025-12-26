import React, { useState } from 'react';
import { X, Eye, EyeOff, Bell, Leaf, Save, Heart, ShieldCheck, QrCode, Lock, CheckCircle, Loader2 } from 'lucide-react';
import { User } from '../types';
import { StorageService } from '../services/storage';

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
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  
  // Profile Settings
  const [showEmail, setShowEmail] = useState(currentUser.settings?.showEmail ?? false);
  const [showFavorites, setShowFavorites] = useState(currentUser.settings?.showFavorites ?? true);
  const [newsletter, setNewsletter] = useState(currentUser.settings?.newsletter ?? true);
  const [selectedDiet, setSelectedDiet] = useState<string[]>(currentUser.settings?.dietaryPreferences ?? []);

  // Security Settings
  const [is2FAEnabled, setIs2FAEnabled] = useState(currentUser.is2FAEnabled || false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [securityStatus, setSecurityStatus] = useState<{msg: string, type: 'success'|'error'}|null>(null);
  const [isProcessingSec, setIsProcessingSec] = useState(false);

  if (!isOpen) return null;

  const toggleDiet = (id: string) => {
    if (selectedDiet.includes(id)) {
      setSelectedDiet(selectedDiet.filter(d => d !== id));
    } else {
      setSelectedDiet([...selectedDiet, id]);
    }
  };

  const handleSaveProfile = () => {
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

  const handleSetup2FA = async () => {
      setIsProcessingSec(true);
      setSecurityStatus(null);
      try {
          const res = await StorageService.generate2FA(currentUser.email);
          if (res.success && res.qrCode) {
              setQrCodeUrl(res.qrCode);
          } else {
              setSecurityStatus({ msg: "Ошибка генерации кода", type: 'error' });
          }
      } catch (e) { setSecurityStatus({ msg: "Ошибка сети", type: 'error' }); }
      finally { setIsProcessingSec(false); }
  };

  const handleConfirm2FA = async () => {
      if (!verifyCode || verifyCode.length !== 6) return;
      setIsProcessingSec(true);
      try {
          const res = await StorageService.enable2FA(currentUser.email, verifyCode);
          if (res.success && res.user) {
              setIs2FAEnabled(true);
              setQrCodeUrl(null);
              setVerifyCode('');
              setSecurityStatus({ msg: "2FA успешно включена!", type: 'success' });
              onUpdateUser(res.user);
          } else {
              setSecurityStatus({ msg: "Неверный код", type: 'error' });
          }
      } catch (e) { setSecurityStatus({ msg: "Ошибка", type: 'error' }); }
      finally { setIsProcessingSec(false); }
  };

  const handleDisable2FA = async () => {
      setIsProcessingSec(true);
      try {
          const res = await StorageService.disable2FA(currentUser.email);
          if (res.success && res.user) {
              setIs2FAEnabled(false);
              setSecurityStatus({ msg: "2FA отключена", type: 'success' });
              onUpdateUser(res.user);
          }
      } catch(e) { setSecurityStatus({ msg: "Ошибка", type: 'error' }); }
      finally { setIsProcessingSec(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-white/10">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="font-serif text-xl font-bold text-gray-900 dark:text-white">Настройки</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-gray-800">
            <button onClick={() => setActiveTab('profile')} className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'profile' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>Профиль</button>
            <button onClick={() => setActiveTab('security')} className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'security' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>Безопасность</button>
        </div>

        <div className="p-6 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
          
          {activeTab === 'profile' && (
              <>
                 <section>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Приватность</h3>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700">
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-lg"><Eye className="w-5 h-5" /></div>
                              <div><p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">Показывать Email</p></div>
                           </div>
                           <button onClick={() => setShowEmail(!showEmail)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showEmail ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showEmail ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                        </div>
                        <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700">
                           <div className="flex items-center gap-3">
                              <div className="p-2 bg-rose-100 dark:bg-rose-900/30 text-rose-600 rounded-lg"><Heart className="w-5 h-5" /></div>
                              <div><p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">Показывать избранное</p></div>
                           </div>
                           <button onClick={() => setShowFavorites(!showFavorites)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showFavorites ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}><span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showFavorites ? 'translate-x-6' : 'translate-x-1'}`} /></button>
                        </div>
                    </div>
                  </section>
                  <section>
                    <div className="flex items-center gap-2 mb-4"><Leaf className="w-4 h-4 text-emerald-500" /><h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Диета</h3></div>
                    <div className="flex flex-wrap gap-2">
                       {DIETARY_OPTIONS.map(option => (
                           <button key={option.id} onClick={() => toggleDiet(option.id)} className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-all ${selectedDiet.includes(option.id) ? option.color + ' ring-2 ring-emerald-500' : 'bg-transparent border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}>{option.label}</button>
                       ))}
                    </div>
                  </section>
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Уведомления</h3>
                     <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-lg"><Bell className="w-5 h-5" /></div>
                          <div><p className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">Рассылка новостей</p></div>
                       </div>
                       <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500" />
                    </div>
                  </section>
              </>
          )}

          {activeTab === 'security' && (
              <section className="animate-fade-in">
                  <div className="text-center mb-6">
                      <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${is2FAEnabled ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
                          {is2FAEnabled ? <ShieldCheck className="w-8 h-8" /> : <Lock className="w-8 h-8" />}
                      </div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">Двухфакторная аутентификация</h3>
                      <p className="text-sm text-gray-500 mt-1 max-w-xs mx-auto">
                          {is2FAEnabled ? "Ваш аккаунт защищен дополнительным кодом безопасности." : "Защитите аккаунт, включив проверку кода при входе."}
                      </p>
                  </div>

                  {securityStatus && (
                      <div className={`p-3 rounded-lg mb-4 text-center text-sm font-medium ${securityStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                          {securityStatus.msg}
                      </div>
                  )}

                  {!is2FAEnabled && !qrCodeUrl && (
                      <button 
                          onClick={handleSetup2FA} 
                          disabled={isProcessingSec}
                          className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center justify-center gap-2"
                      >
                          {isProcessingSec ? <Loader2 className="animate-spin" /> : <QrCode className="w-5 h-5" />} Включить 2FA
                      </button>
                  )}

                  {!is2FAEnabled && qrCodeUrl && (
                      <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-xl border border-gray-200 dark:border-gray-700 text-center animate-slide-up">
                           <p className="text-sm font-bold mb-4 dark:text-white">1. Сканируйте код в Google Authenticator</p>
                           <div className="bg-white p-2 rounded-lg inline-block shadow-sm mb-4">
                               <img src={qrCodeUrl} className="w-40 h-40" alt="QR Code" />
                           </div>
                           <p className="text-sm font-bold mb-2 dark:text-white">2. Введите код из приложения</p>
                           <div className="flex gap-2">
                               <input 
                                    type="text" 
                                    maxLength={6} 
                                    value={verifyCode} 
                                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g,''))} 
                                    placeholder="000 000" 
                                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-center font-mono tracking-widest text-lg" 
                               />
                               <button onClick={handleConfirm2FA} disabled={!verifyCode || isProcessingSec} className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold disabled:opacity-50">
                                   OK
                               </button>
                           </div>
                           <button onClick={() => setQrCodeUrl(null)} className="text-xs text-gray-500 mt-4 hover:underline">Отмена</button>
                      </div>
                  )}

                  {is2FAEnabled && (
                      <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800 p-4 rounded-xl">
                          <div className="flex items-center gap-3 mb-4">
                              <CheckCircle className="w-5 h-5 text-emerald-600" />
                              <span className="font-bold text-emerald-800 dark:text-emerald-300 text-sm">Активно</span>
                          </div>
                          <button 
                             onClick={handleDisable2FA}
                             disabled={isProcessingSec}
                             className="w-full py-2 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 font-bold rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                             {isProcessingSec ? '...' : 'Отключить защиту'}
                          </button>
                      </div>
                  )}
              </section>
          )}

        </div>

        {activeTab === 'profile' && (
            <div className="p-6 pt-0">
               <button onClick={handleSaveProfile} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> Сохранить
               </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default SettingsModal;

