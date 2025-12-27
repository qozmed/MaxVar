import React, { useState, useEffect } from 'react';
import { User, Recipe, Report, RecipeImage } from '../types';
import { StorageService } from '../services/storage';
import { Headphones, Check, X, Search, Filter, CheckCircle, ExternalLink, LogOut } from 'lucide-react';
import { useModal } from './ModalProvider';

interface ModeratorPanelProps {
  currentUser: User;
  onBack: () => void;
  onRecipeSelect: (recipe: Recipe) => void;
}

const ModeratorPanel: React.FC<ModeratorPanelProps> = ({ currentUser, onBack, onRecipeSelect }) => {
  const { showAlert } = useModal();
  
  const [activeTab, setActiveTab] = useState<'photos' | 'reports'>('photos');
  const [photoFilter, setPhotoFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [photoSearchQuery, setPhotoSearchQuery] = useState(''); // New state for photo search
  
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  
  const [reportSubTab, setReportSubTab] = useState<'open' | 'resolved'>('open');
  const [reportSearchQuery, setReportSearchQuery] = useState('');

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
        setReports(await StorageService.getReports());
    } catch (e) {
        setRecipes(StorageService.getRecipes());
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

  const getCountByStatus = (status: string) => recipes.flatMap(r => (r.images || []).filter((i: RecipeImage) => i.status === status)).length;
  
  // Filter photos by status AND search query
  const filteredPhotos = recipes.flatMap(r => 
    (r.images || [])
      .filter((img: RecipeImage) => img.status === photoFilter)
      .map((img: RecipeImage) => ({ ...img, recipeId: r.id, recipeName: r.parsed_content.dish_name }))
  ).filter(photo => {
      if (!photoSearchQuery) return true;
      const q = photoSearchQuery.toLowerCase();
      return (photo.recipeName || '').toLowerCase().includes(q) || (photo.recipeId || '').toLowerCase().includes(q);
  });

  const displayedReports = reports.filter(r => r.status === reportSubTab && (reportSearchQuery ? (r.id || '').toLowerCase().includes(reportSearchQuery.toLowerCase()) : true));
  const openReportsCount = reports.filter(r => r.status === 'open').length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:py-10 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
             <div className="flex items-center gap-3">
                 <div className="p-3 rounded-xl text-white shadow-lg bg-blue-600 shadow-blue-500/30">
                     <Headphones className="w-6 h-6 sm:w-8 sm:h-8" />
                 </div>
                 <div>
                     <h1 className="font-serif text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Панель Модератора</h1>
                     <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400">Добро пожаловать, {currentUser.name}</p>
                 </div>
             </div>
             <button onClick={onBack} className="w-full sm:w-auto px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 transition-colors flex items-center justify-center gap-2">
                <LogOut className="w-4 h-4" /> Выйти
             </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-8 overflow-x-auto scrollbar-hide">
            <button 
                onClick={() => setActiveTab('photos')} 
                className={`px-4 sm:px-6 py-3 font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'photos' ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
            >
                Модерация Фото
            </button>
            <button 
                onClick={() => setActiveTab('reports')} 
                className={`px-4 sm:px-6 py-3 font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'reports' ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
            >
                Жалобы {openReportsCount > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{openReportsCount}</span>}
            </button>
        </div>

        {/* --- PHOTOS TAB --- */}
        {activeTab === 'photos' && (
            <>
                 <div className="flex flex-col md:flex-row gap-4 mb-6 items-start md:items-center">
                    <div className="flex flex-wrap gap-2 items-center overflow-x-auto pb-2 flex-grow">
                        <Filter className="w-4 h-4 text-gray-400 mr-2" />
                        {(['pending', 'approved', 'rejected'] as const).map((status) => (
                            <button key={status} onClick={() => setPhotoFilter(status)} className={`px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${photoFilter === status ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-white/5 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
                                {status === 'pending' && 'Ожидают'} {status === 'approved' && 'Одобренные'} {status === 'rejected' && 'Отклоненные'}
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${photoFilter === status ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700'}`}>{getCountByStatus(status)}</span>
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 w-full md:w-64">
                        <Search className="w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Название рецепта или ID..." 
                            className="bg-transparent outline-none w-full text-sm dark:text-white"
                            value={photoSearchQuery}
                            onChange={(e) => setPhotoSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredPhotos.length === 0 ? <div className="col-span-full py-20 text-center text-gray-400">Нет фото по запросу</div> : filteredPhotos.map((photo, idx) => (
                        <div key={idx} className="glass-panel rounded-xl overflow-hidden flex flex-col group shadow-sm dark:bg-gray-900 border dark:border-gray-800">
                            <div className="relative h-56 bg-gray-100 dark:bg-gray-800"><img src={photo.url} className="w-full h-full object-cover" /></div>
                            <div className="p-4 flex-grow flex flex-col">
                                <p className="font-bold text-sm mb-2 dark:text-white">{photo.recipeName}</p>
                                <div className="text-[10px] bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded inline-block mb-2 font-mono text-gray-500">ID: {photo.recipeId}</div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Автор: {photo.author}</p>
                                <div className="flex gap-2 mt-auto">
                                    {photo.status !== 'approved' && <button onClick={() => handlePhotoAction(photo.recipeId, photo.url, 'approve')} className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm flex justify-center items-center gap-1 transition-colors"><Check className="w-4 h-4"/> Одобрить</button>}
                                    {photo.status !== 'rejected' && <button onClick={() => handlePhotoAction(photo.recipeId, photo.url, 'reject')} className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm flex justify-center items-center gap-1 transition-colors"><X className="w-4 h-4"/> Отклонить</button>}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </>
        )}

        {/* --- REPORTS TAB --- */}
        {activeTab === 'reports' && (
            <div className="glass-panel rounded-2xl overflow-hidden dark:bg-gray-900 dark:border-gray-800">
                <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                        <button onClick={() => setReportSubTab('open')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${reportSubTab === 'open' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500'}`}>Открытые ({openReportsCount})</button>
                        <button onClick={() => setReportSubTab('resolved')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${reportSubTab === 'resolved' ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500'}`}>Решенные</button>
                    </div>
                    <div className="flex items-center gap-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 w-full md:w-64">
                        <Search className="w-4 h-4 text-gray-400" />
                        <input type="text" placeholder="Поиск ID..." className="bg-transparent outline-none w-full text-sm dark:text-white" value={reportSearchQuery} onChange={(e) => setReportSearchQuery(e.target.value)} />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[800px]">
                        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase"><tr><th className="px-6 py-4">Рецепт</th><th className="px-6 py-4">Отправитель</th><th className="px-6 py-4">Причина</th><th className="px-6 py-4 text-right">Действия</th></tr></thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {displayedReports.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">Нет жалоб в этой категории</td></tr>
                            ) : displayedReports.map(report => (
                                <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{report.recipeName}<div className="text-xs text-gray-400">ID: {report.recipeId}</div></td>
                                    <td className="px-6 py-4 text-gray-700 dark:text-gray-300">{report.reporter}</td>
                                    <td className="px-6 py-4"><span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-2 py-1 rounded text-xs font-bold">{report.reason}</span><p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{report.details}</p></td>
                                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                                        <button onClick={() => onRecipeSelect(recipes.find(r => r.id === report.recipeId) as Recipe)} className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"><ExternalLink className="w-4 h-4" /></button>
                                        {report.status === 'open' && <button onClick={() => handleResolveReport(report.id)} className="flex items-center gap-1 text-xs font-bold px-3 py-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/50"><CheckCircle className="w-4 h-4" /> Решить</button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
    </div>
  );
};

export default ModeratorPanel;