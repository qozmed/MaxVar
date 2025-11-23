
import React, { useState, useEffect, useRef } from 'react';
import { User, Recipe, RawRecipeImport, Report, RecipeImage } from '../types';
import { StorageService } from '../services/storage';
import { ShieldAlert, Check, X, UserX, UserCheck, Search, Filter, Upload, FileJson, AlertTriangle, MessageSquareWarning, Flag, CheckCircle, ExternalLink, Hash, Database, Trash2, Loader2, Headphones } from 'lucide-react';
import { useModal } from './ModalProvider';

interface AdminPanelProps {
  currentUser: User;
  onBack: () => void;
  onRecipeSelect: (recipe: Recipe) => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onBack, onRecipeSelect }) => {
  const { showAlert, showConfirm } = useModal();
  const [activeTab, setActiveTab] = useState<'photos' | 'users' | 'import' | 'reports' | 'database'>('photos');
  const [photoFilter, setPhotoFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [searchUserQuery, setSearchUserQuery] = useState('');
  
  const [reportSubTab, setReportSubTab] = useState<'open' | 'resolved'>('open');
  const [reportSearchQuery, setReportSearchQuery] = useState('');

  const [importStatus, setImportStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Database Tab State
  const [deleteRecipeId, setDeleteRecipeId] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const isModerator = currentUser.role === 'moderator';
  const isAdmin = currentUser.role === 'admin';

  useEffect(() => {
    loadData();
    const unsubscribe = StorageService.subscribe((type, payload) => {
        if (type === 'RECIPE_UPDATED') {
            const updated = payload as Recipe;
            setRecipes(prev => {
                const idx = prev.findIndex(r => r.id === updated.id);
                if (idx >= 0) { const newArr = [...prev]; newArr[idx] = updated; return newArr; }
                return [updated, ...prev];
            });
        } else if (type === 'RECIPE_DELETED') {
             const { id } = payload;
             setRecipes(prev => prev.filter(r => r.id !== id));
        } else if (type === 'USER_UPDATED') {
            const updatedUser = payload as User;
            setUsers(prev => {
                const idx = prev.findIndex(u => u.email === updatedUser.email);
                if (idx >= 0) { const newArr = [...prev]; newArr[idx] = updatedUser; return newArr; }
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
        const recipeRes = await StorageService.searchRecipes('', 1, 200, 'updated');
        setRecipes(recipeRes.data);
        if (isAdmin) {
             await StorageService.refreshUsers();
             setUsers(StorageService.getAllUsers());
        }
        setReports(await StorageService.getReports());
    } catch (e) {
        setRecipes(StorageService.getRecipes());
        if (isAdmin) setUsers(StorageService.getAllUsers());
    }
  };

  const handlePhotoAction = async (recipeId: string, imageUrl: string, action: 'approve' | 'reject') => {
    const updatedRecipes = recipes.map(recipe => {
        if (recipe.id === recipeId) {
            const updatedImages = (recipe.images || []).map((img: RecipeImage) => {
                if (img.url === imageUrl) {
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
    
    const targetRecipe = updatedRecipes.find(r => r.id === recipeId);
    if (targetRecipe) {
        await StorageService.saveRecipe(targetRecipe);
        const targetImage = (targetRecipe.images || []).find((img: RecipeImage) => img.url === imageUrl);
        if (targetImage && targetImage.author && targetImage.author !== 'official') {
            await StorageService.sendNotification({
                userId: targetImage.author,
                type: action === 'approve' ? 'success' : 'error',
                title: action === 'approve' ? 'Фото одобрено' : 'Фото отклонено',
                message: action === 'approve' 
                    ? `Ваше фото к рецепту "${targetRecipe.parsed_content.dish_name}" было опубликовано.`
                    : `Ваше фото к рецепту "${targetRecipe.parsed_content.dish_name}" не прошло модерацию.`,
            });
        }
    }
  };

  const handleBanUser = async (email: string, isBanned: boolean) => {
      const updatedUsers = users.map(u => u.email === email ? { ...u, isBanned: !isBanned } : u);
      setUsers(updatedUsers);
      const targetUser = updatedUsers.find(u => u.email === email);
      if (targetUser) await StorageService.updateUserInDB(targetUser);
  };

  const handleResolveReport = async (id: string) => {
      const updatedReports = reports.map(r => r.id === id ? { ...r, status: 'resolved' as const } : r);
      setReports(updatedReports);
      const reportToResolve = reports.find(r => r.id === id);
      try {
          await StorageService.updateReportStatus(id, 'resolved');
          if (reportToResolve) {
              await StorageService.sendNotification({
                  userId: reportToResolve.reporter,
                  type: 'info',
                  title: 'Жалоба рассмотрена',
                  message: `Ваша жалоба на рецепт "${reportToResolve.recipeName}" была рассмотрена.`,
              });
          }
      } catch (e) { loadData(); }
  };

  const handleDeleteRecipe = async () => {
      if (!deleteRecipeId.trim()) return;
      const confirmed = await showConfirm("Удаление рецепта", `Вы уверены, что хотите безвозвратно удалить рецепт ID: ${deleteRecipeId}?`);
      if (!confirmed) return;

      setIsDeleting(true);
      const success = await StorageService.deleteRecipe(deleteRecipeId.trim());
      setIsDeleting(false);

      if (success) {
          showAlert("Успех", "Рецепт удален из базы данных.", "success");
          setDeleteRecipeId('');
          setRecipes(prev => prev.filter(r => r.id !== deleteRecipeId.trim()));
      } else {
          showAlert("Ошибка", "Не удалось удалить рецепт. Проверьте ID.", "error");
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
              const result = await StorageService.importRecipes(rawData);
              setImportStatus({ success: result.success || (result.count > 0), message: result.message });
              loadData();
          } catch (error: any) {
              setImportStatus({ success: false, message: `Ошибка импорта: ${error.message}` });
          } finally {
              setIsImporting(false);
              if (fileInputRef.current) fileInputRef.current.value = '';
          }
      };
      reader.readAsText(file);
  };

  const getCountByStatus = (status: string) => recipes.flatMap(r => (r.images || []).filter((i: RecipeImage) => i.status === status)).length;
  const filteredPhotos = recipes.flatMap(r => (r.images || []).filter((img: RecipeImage) => img.status === photoFilter).map((img: RecipeImage) => ({ ...img, recipeId: r.id, recipeName: r.parsed_content.dish_name })));
  const filteredUsers = users.filter(u => u.email.toLowerCase().includes(searchUserQuery.toLowerCase()) || u.name.toLowerCase().includes(searchUserQuery.toLowerCase()) || (u.numericId && u.numericId.includes(searchUserQuery)));
  const displayedReports = reports.filter(r => r.status === reportSubTab && (reportSearchQuery ? (r.id || '').toLowerCase().includes(reportSearchQuery.toLowerCase()) : true));
  const openReportsCount = reports.filter(r => r.status === 'open').length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:py-10 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
             <div className="flex items-center gap-3">
                 <div className={`p-3 rounded-xl text-white shadow-lg ${isAdmin ? 'bg-red-600 shadow-red-500/30' : 'bg-blue-600 shadow-blue-500/30'}`}>
                     {isAdmin ? <ShieldAlert className="w-6 h-6 sm:w-8 sm:h-8" /> : <Headphones className="w-6 h-6 sm:w-8 sm:h-8" />}
                 </div>
                 <div>
                     <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">{isAdmin ? 'Администратор' : 'Модератор'}</h1>
                     <p className="text-sm sm:text-base text-gray-500">{currentUser.name}</p>
                 </div>
             </div>
             <button onClick={onBack} className="w-full sm:w-auto px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 transition-colors">Выйти</button>
        </div>

        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-8 overflow-x-auto scrollbar-hide">
            <button onClick={() => setActiveTab('photos')} className={`px-4 sm:px-6 py-3 font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'photos' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500'}`}>Модерация Фото</button>
            <button onClick={() => setActiveTab('reports')} className={`px-4 sm:px-6 py-3 font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'reports' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500'}`}>Жалобы {openReportsCount > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{openReportsCount}</span>}</button>
            {isAdmin && (
                <>
                <button onClick={() => setActiveTab('users')} className={`px-4 sm:px-6 py-3 font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'users' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500'}`}>Пользователи ({users.length})</button>
                <button onClick={() => setActiveTab('database')} className={`px-4 sm:px-6 py-3 font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'database' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500'}`}>Управление БД</button>
                <button onClick={() => setActiveTab('import')} className={`px-4 sm:px-6 py-3 font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'import' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500'}`}>Импорт</button>
                </>
            )}
        </div>

        {activeTab === 'photos' && (
            <>
                 <div className="flex flex-wrap gap-2 mb-6 items-center overflow-x-auto pb-2">
                    <Filter className="w-4 h-4 text-gray-400 mr-2" />
                    {(['pending', 'approved', 'rejected'] as const).map((status) => (
                        <button key={status} onClick={() => setPhotoFilter(status)} className={`px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${photoFilter === status ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-700'}`}>
                            {status === 'pending' && 'Ожидают'} {status === 'approved' && 'Одобренные'} {status === 'rejected' && 'Отклоненные'}
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${photoFilter === status ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'}`}>{getCountByStatus(status)}</span>
                        </button>
                    ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPhotos.length === 0 ? <div className="col-span-full py-20 text-center text-gray-400">Нет фото</div> : filteredPhotos.map((photo, idx) => (
                        <div key={idx} className="glass-panel rounded-xl overflow-hidden flex flex-col group shadow-sm">
                            <div className="relative h-56 bg-gray-100"><img src={photo.url} className="w-full h-full object-cover" /></div>
                            <div className="p-4 flex-grow flex flex-col">
                                <p className="font-bold text-sm mb-2">{photo.recipeName}</p>
                                <p className="text-xs text-gray-500 mb-4">Автор: {photo.author}</p>
                                <div className="flex gap-2 mt-auto">
                                    {photo.status !== 'approved' && <button onClick={() => handlePhotoAction(photo.recipeId, photo.url, 'approve')} className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm flex justify-center items-center gap-1"><Check className="w-4 h-4"/> Одобрить</button>}
                                    {photo.status !== 'rejected' && <button onClick={() => handlePhotoAction(photo.recipeId, photo.url, 'reject')} className="flex-1 py-2 bg-red-500 text-white rounded-lg text-sm flex justify-center items-center gap-1"><X className="w-4 h-4"/> Отклонить</button>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </>
        )}

        {activeTab === 'reports' && (
            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                        <button onClick={() => setReportSubTab('open')} className={`px-4 py-1.5 rounded-md text-sm font-medium ${reportSubTab === 'open' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}>Открытые ({openReportsCount})</button>
                        <button onClick={() => setReportSubTab('resolved')} className={`px-4 py-1.5 rounded-md text-sm font-medium ${reportSubTab === 'resolved' ? 'bg-white dark:bg-gray-700 shadow-sm' : 'text-gray-500'}`}>Решенные</button>
                    </div>
                    <div className="flex items-center gap-2 bg-white dark:bg-black/40 px-3 py-1.5 rounded-lg border w-full md:w-64"><Search className="w-4 h-4 text-gray-400" /><input type="text" placeholder="Поиск ID..." className="bg-transparent outline-none w-full text-sm" value={reportSearchQuery} onChange={(e) => setReportSearchQuery(e.target.value)} /></div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                        <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 text-xs uppercase"><tr><th className="px-6 py-4">Рецепт</th><th className="px-6 py-4">Отправитель</th><th className="px-6 py-4">Причина</th><th className="px-6 py-4 text-right">Действия</th></tr></thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {displayedReports.map(report => (
                                <tr key={report.id}>
                                    <td className="px-6 py-4 font-medium">{report.recipeName}<div className="text-xs text-gray-400">ID: {report.recipeId}</div></td>
                                    <td className="px-6 py-4">{report.reporter}</td>
                                    <td className="px-6 py-4"><span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold">{report.reason}</span><p className="text-xs text-gray-500 mt-1">{report.details}</p></td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                                        <button onClick={() => onRecipeSelect(recipes.find(r => r.id === report.recipeId) as Recipe)} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"><ExternalLink className="w-4 h-4" /></button>
                                        {report.status === 'open' && <button onClick={() => handleResolveReport(report.id)} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200"><CheckCircle className="w-4 h-4" /> Решить</button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {isAdmin && activeTab === 'database' && (
            <div className="glass-panel rounded-2xl p-8 max-w-2xl mx-auto">
                <div className="text-center mb-8">
                    <div className="inline-block p-4 bg-red-100 dark:bg-red-900/20 rounded-full text-red-600 mb-4"><Database className="w-8 h-8" /></div>
                    <h2 className="text-2xl font-bold">Управление Базой Данных</h2>
                    <p className="text-gray-500 mt-2">Осторожно! Удаленные рецепты восстановить невозможно.</p>
                </div>
                
                <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-xl border border-gray-200 dark:border-gray-700">
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Удаление рецепта по ID</label>
                    <div className="flex gap-2">
                        <div className="relative flex-grow">
                             <Hash className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                             <input 
                                type="text" 
                                value={deleteRecipeId}
                                onChange={(e) => setDeleteRecipeId(e.target.value)}
                                placeholder="Введите ID рецепта (например: lq8x9...)"
                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-black/20 focus:ring-2 focus:ring-red-500 outline-none font-mono text-sm"
                             />
                        </div>
                        <button 
                            onClick={handleDeleteRecipe}
                            disabled={!deleteRecipeId || isDeleting}
                            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center gap-2 disabled:opacity-50 transition-all"
                        >
                            {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                            Удалить
                        </button>
                    </div>
                </div>
            </div>
        )}

        {isAdmin && activeTab === 'users' && (
            <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex gap-3"><Search className="w-5 h-5 text-gray-400" /><input type="text" placeholder="Поиск..." className="bg-transparent outline-none w-full" value={searchUserQuery} onChange={(e) => setSearchUserQuery(e.target.value)} /></div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                        <thead className="bg-gray-50 text-gray-500 text-xs uppercase"><tr><th className="px-6 py-4">Пользователь</th><th className="px-6 py-4">Роль</th><th className="px-6 py-4">Статус</th><th className="px-6 py-4 text-right">Действия</th></tr></thead>
                        <tbody>
                            {filteredUsers.map(user => (
                                <tr key={user.email} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                    <td className="px-6 py-4 font-medium">{user.name}<div className="text-xs text-gray-400">{user.email}</div></td>
                                    <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs font-bold uppercase ${user.role === 'admin' ? 'bg-purple-100 text-purple-600' : user.role === 'moderator' ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'}`}>{user.role}</span></td>
                                    <td className="px-6 py-4">{user.isBanned ? <span className="text-red-600 font-bold text-xs">Banned</span> : <span className="text-emerald-600 font-bold text-xs">Active</span>}</td>
                                    <td className="px-6 py-4 text-right">{user.role !== 'admin' && <button onClick={() => handleBanUser(user.email, user.isBanned)} className={`text-xs font-bold px-3 py-1.5 rounded-lg ${user.isBanned ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{user.isBanned ? 'Разблокировать' : 'Заблокировать'}</button>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {isAdmin && activeTab === 'import' && (
             <div className="glass-panel rounded-2xl p-8 text-center">
                 <div className="p-4 bg-blue-50 rounded-full text-blue-600 inline-block mb-4"><FileJson className="w-12 h-12" /></div>
                 <h2 className="text-2xl font-bold mb-2">Импорт</h2>
                 <input type="file" ref={fileInputRef} accept=".json" onChange={handleFileUpload} disabled={isImporting} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100" />
                 {importStatus && <div className={`mt-4 p-3 rounded-lg ${importStatus.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{importStatus.message}</div>}
             </div>
        )}
    </div>
  );
};

export default AdminPanel;