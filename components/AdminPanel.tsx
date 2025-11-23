
import React, { useState, useEffect, useRef } from 'react';
import { User, Recipe, RawRecipeImport, Report, RecipeImage } from '../types';
import { StorageService } from '../services/storage';
import { ShieldAlert, Check, X, UserX, UserCheck, Search, Filter, Upload, FileJson, AlertTriangle, MessageSquareWarning, Flag, CheckCircle, ExternalLink, Hash } from 'lucide-react';
import { useModal } from './ModalProvider';

interface AdminPanelProps {
  currentUser: User;
  onBack: () => void;
  onRecipeSelect: (recipe: Recipe) => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onBack, onRecipeSelect }) => {
  const { showAlert } = useModal();
  const [activeTab, setActiveTab] = useState<'photos' | 'users' | 'import' | 'reports'>('photos');
  const [photoFilter, setPhotoFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  
  // Reports State
  const [reportSubTab, setReportSubTab] = useState<'open' | 'resolved'>('open');
  const [reportSearchQuery, setReportSearchQuery] = useState('');

  // Import States
  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadData();

    // Real-time subscription
    const unsubscribe = StorageService.subscribe((type, payload) => {
        if (type === 'RECIPE_UPDATED') {
            const updated = payload as Recipe;
            setRecipes(prev => {
                const idx = prev.findIndex(r => r.id === updated.id);
                if (idx >= 0) {
                    const newArr = [...prev];
                    newArr[idx] = updated;
                    return newArr;
                }
                // Add to top if it's new
                return [updated, ...prev];
            });
        } else if (type === 'USER_UPDATED') {
            const updatedUser = payload as User;
            setUsers(prev => {
                const idx = prev.findIndex(u => u.email === updatedUser.email);
                if (idx >= 0) {
                    const newArr = [...prev];
                    newArr[idx] = updatedUser;
                    return newArr;
                }
                return [...prev, updatedUser];
            });
        } else if (type === 'REPORT_CREATED') {
            setReports(prev => [payload, ...prev]);
        } else if (type === 'REPORT_UPDATED') {
            const updatedReport = payload as Report;
            setReports(prev => prev.map(r => r.id === updatedReport.id ? updatedReport : r));
        }
    });

    return () => unsubscribe();
  }, []);

  const loadData = async () => {
    try {
        // Fetch fresh from server
        const recipeRes = await StorageService.searchRecipes('', 1, 200, 'updated');
        setRecipes(recipeRes.data);
        
        await StorageService.refreshUsers();
        setUsers(StorageService.getAllUsers());

        const fetchedReports = await StorageService.getReports();
        setReports(fetchedReports);

    } catch (e) {
        // Offline fallback
        setRecipes(StorageService.getRecipes());
        setUsers(StorageService.getAllUsers());
    }
  };

  const handlePhotoAction = async (recipeId: string, imageUrl: string, action: 'approve' | 'reject') => {
    const updatedRecipes = recipes.map(recipe => {
        if (recipe.id === recipeId) {
            const updatedImages = (recipe.images || []).map((img: RecipeImage) => {
                if (img.url === imageUrl) {
                    // Set status and rejection timestamp if rejected
                    return { 
                        ...img, 
                        status: action === 'approve' ? 'approved' : 'rejected',
                        rejectedAt: action === 'reject' ? new Date().toISOString() : undefined
                    };
                }
                return img;
            });
            return { ...recipe, images: updatedImages as any };
        }
        return recipe;
    });
    setRecipes(updatedRecipes);
    
    // Persist updates
    const targetRecipe = updatedRecipes.find(r => r.id === recipeId);
    if (targetRecipe) {
        await StorageService.saveRecipe(targetRecipe);

        // Notify User
        const targetImage = (targetRecipe.images || []).find((img: RecipeImage) => img.url === imageUrl);
        if (targetImage && targetImage.author && targetImage.author !== 'official') {
            await StorageService.sendNotification({
                userId: targetImage.author,
                type: action === 'approve' ? 'success' : 'error',
                title: action === 'approve' ? 'Фото одобрено' : 'Фото отклонено',
                message: action === 'approve' 
                    ? `Ваше фото к рецепту "${targetRecipe.parsed_content.dish_name}" было опубликовано.`
                    : `Ваше фото к рецепту "${targetRecipe.parsed_content.dish_name}" не прошло модерацию и будет удалено через 12 часов.`,
            });
        }
    }
  };

  const handleBanUser = async (email: string, isBanned: boolean) => {
      const updatedUsers = users.map(u => {
          if (u.email === email) {
              return { ...u, isBanned: !isBanned };
          }
          return u;
      });
      setUsers(updatedUsers);
      
      const targetUser = updatedUsers.find(u => u.email === email);
      if (targetUser) await StorageService.updateUserInDB(targetUser);
  };

  const handleResolveReport = async (id: string) => {
      // Optimistically update UI
      const updatedReports = reports.map(r => r.id === id ? { ...r, status: 'resolved' as const } : r);
      setReports(updatedReports);
      
      const reportToResolve = reports.find(r => r.id === id);

      try {
          await StorageService.updateReportStatus(id, 'resolved');

           // Notify Reporter
          if (reportToResolve) {
              await StorageService.sendNotification({
                  userId: reportToResolve.reporter,
                  type: 'info',
                  title: 'Жалоба рассмотрена',
                  message: `Ваша жалоба на рецепт "${reportToResolve.recipeName}" была рассмотрена модераторами. Спасибо за бдительность!`,
              });
          }
      } catch (e) {
          console.error("Failed to resolve report", e);
          // Revert if failed
          loadData();
      }
  };

  const handleNavigateToRecipe = (recipeId: string) => {
      const recipe = recipes.find(r => r.id === recipeId);
      if (recipe) {
          onRecipeSelect(recipe);
      } else {
          // Try fetching if not in initial list
          StorageService.searchRecipes(recipeId).then(res => {
              const found = res.data.find(r => r.id === recipeId);
              if (found) onRecipeSelect(found);
              else showAlert("Ошибка", "Рецепт не найден", "error");
          });
      }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsImporting(true);
      setImportStatus(null);

      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const json = e.target?.result as string;
              const rawData = JSON.parse(json) as RawRecipeImport[];
              
              if (!Array.isArray(rawData) || rawData.length === 0) {
                  throw new Error("Неверный формат JSON или пустой массив");
              }
              if (!rawData[0].parsed_content) {
                   throw new Error("JSON не соответствует ожидаемой схеме (нет parsed_content)");
              }

              // Async Import
              const result = await StorageService.importRecipes(rawData);
              
              setImportStatus({ success: result.success || (result.count > 0), message: result.message });
              loadData(); // Refresh UI
          } catch (error: any) {
              console.error(error);
              setImportStatus({ success: false, message: `Ошибка импорта: ${error.message}` });
          } finally {
              setIsImporting(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
          }
      };
      reader.readAsText(file);
  };

  // Helpers
  const getCountByStatus = (status: string) => {
      return recipes.flatMap(r => (r.images || []).filter((i: RecipeImage) => i.status === status)).length;
  };

  const filteredPhotos = recipes.flatMap(r => 
      (r.images || [])
      .filter((img: RecipeImage) => img.status === photoFilter)
      .map((img: RecipeImage) => ({ ...img, recipeId: r.id, recipeName: r.parsed_content.dish_name }))
  );

  const filteredUsers = users.filter(u => 
      u.email.toLowerCase().includes(searchUserQuery.toLowerCase()) || 
      u.name.toLowerCase().includes(searchUserQuery.toLowerCase()) ||
      (u.numericId && u.numericId.includes(searchUserQuery))
  );
  
  // Filter Reports by Tab and ID
  const displayedReports = reports.filter(r => {
      const matchesTab = r.status === reportSubTab;
      // Safeguard against undefined IDs and ensure robust search
      const matchesSearch = reportSearchQuery ? (r.id || '').toLowerCase().includes(reportSearchQuery.toLowerCase()) : true;
      return matchesTab && matchesSearch;
  });

  const openReportsCount = reports.filter(r => r.status === 'open').length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:py-10 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
             <div className="flex items-center gap-3">
                 <div className="p-3 bg-red-600 rounded-xl text-white shadow-lg shadow-red-500/30">
                     <ShieldAlert className="w-6 h-6 sm:w-8 sm:h-8" />
                 </div>
                 <div>
                     <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Панель Модератора</h1>
                     <p className="text-sm sm:text-base text-gray-500">Добро пожаловать, {currentUser.name}</p>
                 </div>
             </div>
             <button onClick={onBack} className="w-full sm:w-auto px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 transition-colors">
                 Выйти
             </button>
        </div>

        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-8 overflow-x-auto scrollbar-hide">
            <button onClick={() => setActiveTab('photos')} className={`px-4 sm:px-6 py-3 font-medium border-b-2 transition-colors whitespace-nowrap text-sm sm:text-base ${activeTab === 'photos' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500'}`}>Модерация Фото</button>
            <button onClick={() => setActiveTab('reports')} className={`px-4 sm:px-6 py-3 font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 text-sm sm:text-base ${activeTab === 'reports' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500'}`}>
                Жалобы {openReportsCount > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{openReportsCount}</span>}
            </button>
            <button onClick={() => setActiveTab('users')} className={`px-4 sm:px-6 py-3 font-medium border-b-2 transition-colors whitespace-nowrap text-sm sm:text-base ${activeTab === 'users' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500'}`}>Пользователи ({users.length})</button>
            <button onClick={() => setActiveTab('import')} className={`px-4 sm:px-6 py-3 font-medium border-b-2 transition-colors whitespace-nowrap text-sm sm:text-base ${activeTab === 'import' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500'}`}>Импорт</button>
        </div>

        {activeTab === 'photos' && (
            <>
                 <div className="flex flex-wrap gap-2 mb-6 items-center overflow-x-auto pb-2">
                    <Filter className="w-4 h-4 text-gray-400 mr-2" />
                    {(['pending', 'approved', 'rejected'] as const).map((status) => (
                        <button
                        key={status}
                        onClick={() => setPhotoFilter(status)}
                        className={`px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                            photoFilter === status 
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30' 
                            : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 border border-gray-200 dark:border-gray-700'
                        }`}
                        >
                            {status === 'pending' && 'Ожидают'}
                            {status === 'approved' && 'Одобренные'}
                            {status === 'rejected' && 'Отклоненные'}
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${photoFilter === status ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                {getCountByStatus(status)}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPhotos.length === 0 ? (
                         <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400 glass-panel rounded-xl border-dashed border-2 border-gray-200 dark:border-gray-700">
                            <Check className="w-12 h-12 mb-4 opacity-20" />
                            <p>
                                {photoFilter === 'pending' && 'Нет фото, ожидающих проверки.'}
                                {photoFilter === 'approved' && 'Нет одобренных фото.'}
                                {photoFilter === 'rejected' && 'Нет отклоненных фото.'}
                            </p>
                        </div>
                    ) : (
                        filteredPhotos.map((photo, idx) => (
                            <div key={idx} className="glass-panel rounded-xl overflow-hidden flex flex-col group shadow-sm hover:shadow-md transition-shadow">
                                <div className="relative h-56 bg-gray-100 dark:bg-gray-800">
                                    <img src={photo.url} alt={photo.status} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
                                    
                                    <div className="absolute bottom-2 left-2 right-2 text-white">
                                        <p className="text-xs opacity-80">Блюдо</p>
                                        <p className="font-bold text-sm truncate">{photo.recipeName}</p>
                                    </div>
                                    <div className={`absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-white shadow-sm ${photo.status === 'approved' ? 'bg-emerald-500' : photo.status === 'rejected' ? 'bg-red-500' : 'bg-amber-500'}`}>
                                        {photo.status === 'pending' ? 'На проверке' : photo.status}
                                    </div>
                                </div>
                                <div className="p-4 flex-grow flex flex-col">
                                    <div className="flex justify-between items-center mb-4">
                                        <span className="text-sm text-gray-500">Автор: <span className="font-bold text-gray-800 dark:text-gray-200">{photo.author}</span></span>
                                    </div>
                                    {photo.status === 'rejected' && photo.rejectedAt && (
                                         <div className="mb-4 text-[10px] text-red-400 bg-red-50 dark:bg-red-900/10 p-1.5 rounded">
                                             Удалится: {new Date(new Date(photo.rejectedAt).getTime() + 12 * 60 * 60 * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                         </div>
                                    )}
                                    <div className="flex gap-2 mt-auto">
                                        {photo.status !== 'approved' && (
                                            <button onClick={() => handlePhotoAction(photo.recipeId, photo.url, 'approve')} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors">
                                                <Check className="w-4 h-4" /> {photo.status === 'rejected' ? 'Восстановить' : 'Одобрить'}
                                            </button>
                                        )}
                                        {photo.status !== 'rejected' && (
                                            <button onClick={() => handlePhotoAction(photo.recipeId, photo.url, 'reject')} className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors">
                                                <X className="w-4 h-4" /> {photo.status === 'approved' ? 'Скрыть' : 'Отклонить'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </>
        )}

        {activeTab === 'reports' && (
            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/50 dark:bg-black/20">
                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 overflow-x-auto">
                        <button 
                            onClick={() => setReportSubTab('open')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${reportSubTab === 'open' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Открытые ({openReportsCount})
                        </button>
                        <button 
                            onClick={() => setReportSubTab('resolved')}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${reportSubTab === 'resolved' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Решенные
                        </button>
                    </div>

                    <div className="flex items-center gap-2 bg-white dark:bg-black/40 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 w-full md:w-64">
                         <Search className="w-4 h-4 text-gray-400" />
                         <input 
                            type="text" 
                            placeholder="Поиск по ID жалобы..." 
                            className="bg-transparent outline-none w-full text-sm text-gray-700 dark:text-gray-200"
                            value={reportSearchQuery}
                            onChange={(e) => setReportSearchQuery(e.target.value)}
                         />
                    </div>
                </div>

                {displayedReports.length === 0 ? (
                     <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                         {reportSubTab === 'open' ? 'Активных жалоб нет.' : 'Архив решенных жалоб пуст.'}
                     </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left min-w-[800px]">
                            <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-6 py-4 font-semibold">Дата</th>
                                    <th className="px-6 py-4 font-semibold">Рецепт</th>
                                    <th className="px-6 py-4 font-semibold">Отправитель</th>
                                    <th className="px-6 py-4 font-semibold">Причина</th>
                                    <th className="px-6 py-4 font-semibold">ID</th>
                                    <th className="px-6 py-4 font-semibold text-right">Действия</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {displayedReports.map(report => (
                                    <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {new Date(report.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                                            {report.recipeName}
                                            <div className="text-xs text-gray-400 font-normal">ID: {report.recipeId}</div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                                            {report.reporter}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="inline-block bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 px-2 py-1 rounded text-xs font-bold mb-1">
                                                {report.reason}
                                            </span>
                                            {report.details && (
                                                <p className="text-xs text-gray-500 mt-1 italic max-w-xs">{report.details}</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-xs font-mono text-gray-400">
                                            {report.id}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button 
                                                    onClick={() => handleNavigateToRecipe(report.recipeId)}
                                                    className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 hover:text-emerald-600 transition-colors"
                                                    title="Перейти к рецепту"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </button>
                                                {report.status === 'open' && (
                                                    <button 
                                                        onClick={() => handleResolveReport(report.id)}
                                                        className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                                                    >
                                                        <CheckCircle className="w-4 h-4" /> Решить
                                                    </button>
                                                )}
                                                {report.status === 'resolved' && (
                                                    <span className="text-xs text-gray-400 italic">
                                                        Удалится через 48ч
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )}

        {activeTab === 'users' && (
            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3 bg-white/50 dark:bg-black/20">
                    <Search className="w-5 h-5 text-gray-400" />
                    <input type="text" placeholder="Поиск пользователя (Имя, Email или ID)..." className="bg-transparent outline-none w-full text-gray-700 dark:text-gray-200 placeholder-gray-400" value={searchUserQuery} onChange={(e) => setSearchUserQuery(e.target.value)} />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                        <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wider">
                            <tr>
                                <th className="px-6 py-4 font-semibold">ID</th>
                                <th className="px-6 py-4 font-semibold">Пользователь</th>
                                <th className="px-6 py-4 font-semibold">Email</th>
                                <th className="px-6 py-4 font-semibold">Роль</th>
                                <th className="px-6 py-4 font-semibold">Статус</th>
                                <th className="px-6 py-4 font-semibold text-right">Действия</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredUsers.map(user => (
                                <tr key={user.email} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 font-mono text-xs text-gray-400 select-all">
                                        {user.numericId || <span className="italic">N/A</span>}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-700 dark:text-emerald-400 text-xs font-bold overflow-hidden">
                                                {user.avatar ? (
                                                    <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    user.name.charAt(0)
                                                )}
                                            </div>
                                            {user.name}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 dark:text-gray-400 text-sm">{user.email}</td>
                                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${user.role === 'admin' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>{user.role}</span></td>
                                    <td className="px-6 py-4">
                                        {user.isBanned ? <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"><UserX className="w-3 h-3"/> Banned</span> : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"><UserCheck className="w-3 h-3"/> Active</span>}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {user.role !== 'admin' && (
                                            <button onClick={() => handleBanUser(user.email, user.isBanned)} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${user.isBanned ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                                                {user.isBanned ? 'Разблокировать' : 'Заблокировать'}
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {activeTab === 'import' && (
             <div className="glass-panel rounded-2xl p-6 sm:p-8 max-w-3xl mx-auto text-center">
                 <div className="mb-6 flex justify-center">
                     <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-full text-blue-600 dark:text-blue-400">
                         <FileJson className="w-12 h-12" />
                     </div>
                 </div>
                 <h2 className="text-2xl font-serif font-bold text-gray-900 dark:text-white mb-2">Импорт базы рецептов</h2>
                 <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-lg mx-auto">
                     Загрузите JSON файл с массивом рецептов. Данные сохраняются в локальную базу данных браузера (IndexedDB) и не имеют строгих лимитов размера.
                 </p>

                 <div className="relative group cursor-pointer">
                     <input 
                        type="file" 
                        ref={fileInputRef}
                        accept=".json"
                        onChange={handleFileUpload}
                        disabled={isImporting}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                     />
                     <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-2xl p-8 sm:p-10 transition-all group-hover:border-emerald-500 group-hover:bg-emerald-50/50 dark:group-hover:bg-emerald-900/10">
                        {isImporting ? (
                            <div className="flex flex-col items-center animate-pulse">
                                <Upload className="w-10 h-10 text-emerald-600 mb-4 animate-bounce" />
                                <span className="text-lg font-bold text-gray-700 dark:text-gray-300">Импорт в базу данных...</span>
                                <span className="text-sm text-gray-500 mt-2">Для больших файлов (100Мб+) это может занять минуту.</span>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center">
                                <Upload className="w-10 h-10 text-gray-400 mb-4 group-hover:text-emerald-500 transition-colors" />
                                <span className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-1">Нажмите или перетащите JSON файл</span>
                                <span className="text-xs text-gray-400">Поддерживается любой размер</span>
                            </div>
                        )}
                     </div>
                 </div>

                 {importStatus && (
                     <div className={`mt-6 p-4 rounded-xl flex items-start gap-3 text-left ${importStatus.success ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200'}`}>
                         {importStatus.success ? <Check className="w-5 h-5 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />}
                         <div>
                             <p className="font-bold mb-1">{importStatus.success ? 'Импорт завершен' : 'Статус импорта'}</p>
                             <p className="text-xs opacity-90">{importStatus.message}</p>
                         </div>
                     </div>
                 )}
             </div>
        )}
    </div>
  );
};

export default AdminPanel;