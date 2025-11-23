
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Activity, Users, Camera, Send, ChevronLeft, ChevronRight, Star, Heart, ThumbsUp, ThumbsDown, Plus, CheckCircle, Clock3, User as UserIcon, Trash2, AlertTriangle, Loader2, Flag, X } from 'lucide-react';
import { Recipe, Comment, User } from '../types';
import { SecurityService } from '../services/security';
import { processImage } from '../services/imageOptimizer';
import { StorageService } from '../services/storage';
import { useModal } from './ModalProvider';

interface RecipeDetailProps {
  recipe: Recipe;
  onBack: () => void;
  currentUser: User | null;
  isFavorite: boolean;
  toggleFavorite: () => void;
  onUpdateRecipe: (recipe: Recipe, userRateScore?: number) => void;
  onUpdateUser: (user: User) => void;
  onUserClick: (userName: string) => void; 
  userMap?: Record<string, User>; // Optional map to look up live user data (avatars)
}

const REPORT_REASONS = [
    "Некорректное фото",
    "Ошибка в рецепте",
    "Лишние ингредиенты",
    "Нецензурная брань в комментарии/отзыве",
    "Другое"
];

const RecipeDetail: React.FC<RecipeDetailProps> = ({ recipe, onBack, currentUser, isFavorite, toggleFavorite, onUpdateRecipe, onUpdateUser, onUserClick, userMap }) => {
  // --- HOOKS MUST BE AT THE TOP LEVEL (Before any returns) ---
  const { showAlert, showConfirm } = useModal();
  
  const [activeTab, setActiveTab] = useState<'instructions' | 'discussion'>('instructions');
  const [newComment, setNewComment] = useState('');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Report State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [customReportDetails, setCustomReportDetails] = useState('');
  const [isReporting, setIsReporting] = useState(false);

  const comments = recipe?.comments || [];
  const hasRated = currentUser && currentUser.ratedRecipeIds && recipe && currentUser.ratedRecipeIds.includes(recipe.id);

  // Filter images safely
  const visibleImages = (recipe?.images || []).filter(img => 
      img.status === 'approved' || 
      (currentUser && img.author === currentUser.name && img.status === 'pending')
  );

  // Safe index adjustment
  useEffect(() => {
    if (visibleImages.length > 0 && currentImageIndex >= visibleImages.length) {
      setCurrentImageIndex(0);
    }
  }, [visibleImages.length, currentImageIndex]);

  // --- EVENT HANDLERS ---

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newComment.trim() || !recipe) return;
    
    const processedText = SecurityService.processContent(newComment);

    const comment: Comment = {
      id: Date.now().toString(),
      user: currentUser.name,
      userAvatar: currentUser.avatar, // Save avatar snapshot (fallback)
      text: processedText,
      date: new Date().toLocaleDateString('ru-RU'),
      likes: 0,
      dislikes: 0
    };
    
    const updatedRecipe = {
        ...recipe,
        comments: [...comments, comment]
    };

    onUpdateRecipe(updatedRecipe);
    setNewComment('');
  };

  const handleDeleteComment = async (commentId: string) => {
      const confirmed = await showConfirm('Удаление', 'Вы уверены, что хотите удалить этот комментарий?');
      if (!confirmed) return;
      
      if (!recipe) return;

      const updatedComments = comments.filter(c => c.id !== commentId);
      const updatedRecipe = {
          ...recipe,
          comments: updatedComments
      };
      onUpdateRecipe(updatedRecipe);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && recipe) {
      try {
          setIsUploading(true);
          const file = e.target.files[0];
          
          // ИСПОЛЬЗУЕМ НОВЫЙ СЕРВИС ДЛЯ КОНВЕРТАЦИИ В BASE64
          const base64String = await processImage(file);
          
          const newImage = {
              url: base64String, // Теперь это строка data:image/..., которая сохранится навсегда
              author: currentUser?.name || 'Anonymous',
              status: 'pending' as const
          };

          const updatedImages = [...(recipe.images || []), newImage];
          const updatedRecipe = { ...recipe, images: updatedImages };
          
          onUpdateRecipe(updatedRecipe);
          
          const newVisibleCount = visibleImages.length + 1; // approximate
          setCurrentImageIndex(updatedImages.length - 1); // jump to new image (logic slightly off due to filter, but okay)
      } catch (error) {
          console.error("Ошибка обработки фото:", error);
          showAlert("Ошибка", "Не удалось загрузить фото. Возможно файл поврежден.", "error");
      } finally {
          setIsUploading(false);
      }
    }
  };

  const handleRate = (score: number) => {
      if (!currentUser || hasRated || !recipe) return;
      
      const totalScore = recipe.rating * recipe.ratingCount + score;
      const newCount = recipe.ratingCount + 1;
      const newAverage = totalScore / newCount;
      
      const updatedRecipe = { 
          ...recipe, 
          rating: parseFloat(newAverage.toFixed(1)), 
          ratingCount: newCount 
      };
      
      onUpdateRecipe(updatedRecipe, score);
  };

  const handleReportSubmit = async () => {
      if (!reportReason || !currentUser) return;

      setIsReporting(true);
      try {
          await StorageService.sendReport({
              recipeId: recipe.id,
              recipeName: recipe.parsed_content.dish_name,
              reporter: currentUser.name,
              reason: reportReason,
              details: reportReason === 'Другое' ? customReportDetails : undefined
          });
          showAlert("Успех", "Жалоба успешно отправлена модераторам.", "success");
          setIsReportModalOpen(false);
          setReportReason(null);
          setCustomReportDetails('');
      } catch (e: any) {
          showAlert("Ошибка", e.message || "Не удалось отправить жалобу.", "error");
      } finally {
          setIsReporting(false);
      }
  };

  const nextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentImageIndex((prev) => (prev + 1) % visibleImages.length);
  };

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentImageIndex((prev) => (prev - 1 + visibleImages.length) % visibleImages.length);
  };

  const updateCommentVote = async (commentId: string, type: 'like' | 'dislike') => {
      if (!currentUser || !recipe) return;

      const votes = currentUser.votedComments || {};
      const currentVote = votes[commentId];
      
      let likesChange = 0;
      let dislikesChange = 0;
      const newVotes = { ...votes };
      
      // Was it an addition or removal?
      let isAddingVote = false;

      if (currentVote === type) {
          delete newVotes[commentId];
          if (type === 'like') likesChange = -1;
          else dislikesChange = -1;
      } else {
          isAddingVote = true;
          newVotes[commentId] = type;
          if (type === 'like') {
              likesChange = 1;
              if (currentVote === 'dislike') dislikesChange = -1;
          } else {
              dislikesChange = 1;
              if (currentVote === 'like') likesChange = -1;
          }
      }

      onUpdateUser({
          ...currentUser,
          votedComments: newVotes
      });
      
      let targetComment: Comment | undefined;

      const updatedComments = comments.map(c => {
          if (c.id === commentId) {
              targetComment = c;
              return {
                  ...c,
                  likes: Math.max(0, c.likes + likesChange),
                  dislikes: Math.max(0, c.dislikes + dislikesChange)
              };
          }
          return c;
      });

      const updatedRecipe = {
          ...recipe,
          comments: updatedComments
      };

      onUpdateRecipe(updatedRecipe);

      // --- NOTIFICATION LOGIC ---
      if (isAddingVote && targetComment && targetComment.user !== currentUser.name) {
          try {
              await StorageService.sendNotification({
                  userId: targetComment.user,
                  type: 'info',
                  title: 'Оценка комментария',
                  message: `${currentUser.name} ${type === 'like' ? 'оценил(а)' : 'не оценил(а)'} ваш комментарий к рецепту "${recipe.parsed_content.dish_name}"`,
              });
          } catch (e) {
              console.error("Failed to send like notification", e);
          }
      }
  };

  // --- EARLY RETURN FOR INVALID DATA ---
  if (!recipe || !recipe.parsed_content) {
      return (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
              <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Ошибка данных</h2>
              <p className="text-gray-500 mb-6">Данные этого рецепта повреждены или отсутствуют.</p>
              <button onClick={onBack} className="px-4 py-2 bg-gray-200 dark:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">
                  Вернуться назад
              </button>
          </div>
      );
  }

  const currentImage = visibleImages[currentImageIndex];

  return (
    <div className="max-w-6xl mx-auto px-4 pb-20 pt-4 animate-fade-in relative">
      {/* Nav Header */}
      <div className="flex items-center justify-between mb-6">
        <button 
            onClick={onBack}
            className="flex items-center px-4 py-2 rounded-full bg-white/50 dark:bg-black/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-gray-600 dark:text-gray-300 transition-all text-sm"
        >
            <ArrowLeft className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Назад к рецептам</span>
            <span className="sm:hidden">Назад</span>
        </button>

        <div className="flex items-center gap-2">
            <button 
                onClick={() => currentUser ? setIsReportModalOpen(true) : showAlert('Внимание', 'Войдите, чтобы пожаловаться')}
                className="p-3 rounded-full transition-all shadow-sm border bg-white/50 dark:bg-black/50 border-transparent text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                title="Пожаловаться на рецепт"
            >
                <Flag className="w-5 h-5" />
            </button>
            <button 
                onClick={toggleFavorite}
                className={`p-3 rounded-full transition-all shadow-sm border ${isFavorite ? 'bg-red-50 border-red-200 text-red-500' : 'bg-white/50 dark:bg-black/50 border-transparent text-gray-400 hover:text-red-400'}`}
                title={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
            >
                <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 mb-12">
        {/* Image Carousel Section */}
        <div className="lg:col-span-7 relative h-72 sm:h-96 lg:h-[500px] rounded-3xl overflow-hidden shadow-2xl group bg-gray-100 dark:bg-gray-800">
            {visibleImages.length > 0 && currentImage ? (
                <>
                    <img 
                        src={currentImage.url} 
                        alt={recipe.parsed_content.dish_name} 
                        className="w-full h-full object-cover transition-all duration-500" 
                    />
                    
                    {/* Image Attribution Badge */}
                    {currentImage.author !== 'official' && (
                        <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full text-white text-xs flex items-center gap-2 max-w-[200px] truncate">
                            <UserIcon className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">Фото от: {currentImage.author}</span>
                        </div>
                    )}
                    
                    {currentImage.status === 'pending' && (
                         <div className="absolute top-4 left-4 bg-yellow-500/90 backdrop-blur-md text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 shadow-lg z-10">
                            <Clock3 className="w-3 h-3" />
                            <span className="hidden sm:inline">На проверке модератором</span>
                            <span className="sm:hidden">На проверке</span>
                         </div>
                    )}
                </>
            ) : (
                <div className="w-full h-full flex items-center justify-center text-center p-4">
                    <span className="text-gray-400 text-sm">Пока что здесь нет фото, но вы можете добавь его первым!</span>
                </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-40 pointer-events-none" />
            
            {/* Carousel Controls - Visible on mobile, hover on desktop */}
            {visibleImages.length > 1 && (
                <>
                    <button onClick={prevImage} className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 backdrop-blur-md text-white hover:bg-black/50 transition-all lg:opacity-0 lg:group-hover:opacity-100 z-10">
                        <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <button onClick={nextImage} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 backdrop-blur-md text-white hover:bg-black/50 transition-all lg:opacity-0 lg:group-hover:opacity-100 z-10">
                        <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                        {visibleImages.map((_, idx) => (
                            <button 
                                key={idx}
                                onClick={() => setCurrentImageIndex(idx)}
                                className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all ${idx === currentImageIndex ? 'bg-white w-3 sm:w-4' : 'bg-white/50'}`}
                            />
                        ))}
                    </div>
                </>
            )}

            {currentUser && (
                 <label className={`absolute top-4 right-4 bg-black/40 backdrop-blur-md hover:bg-emerald-600 text-white px-3 py-2 sm:px-4 rounded-full text-xs font-bold flex items-center gap-2 transition-all border border-white/20 z-10 cursor-pointer ${isUploading ? 'opacity-50 cursor-wait' : 'lg:opacity-0 lg:group-hover:opacity-100'}`}>
                    {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    <span className="hidden sm:inline">{isUploading ? 'Загрузка...' : 'Добавить фото'}</span>
                    <span className="sm:hidden">{isUploading ? '...' : 'Фото'}</span>
                    <input type="file" className="hidden" accept="image/*,.svg" onChange={handlePhotoUpload} disabled={isUploading} />
                 </label>
            )}
        </div>
        
        {/* Info Section */}
        <div className="lg:col-span-5 flex flex-col">
            <div className="flex flex-wrap gap-2 mb-4">
                {(recipe.parsed_content.tags || []).map(tag => (
                    <span key={tag} className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1 rounded-full">
                        {tag}
                    </span>
                ))}
            </div>
            
            <h1 className="font-serif text-2xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white leading-tight mb-4">
                {recipe.parsed_content.dish_name}
            </h1>
            
            {/* Rating Display */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="flex items-center gap-1 text-yellow-400">
                    <Star className="w-5 h-5 fill-current" />
                    <span className="text-xl font-bold text-gray-900 dark:text-white">{recipe.rating}</span>
                </div>
                <div className="hidden sm:block h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
                <span className="text-sm text-gray-500 dark:text-gray-400">{recipe.ratingCount} оценок</span>
                
                {currentUser && (
                    <div className="ml-auto mt-2 sm:mt-0">
                        {hasRated ? (
                            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 px-3 py-1.5 rounded-full">
                                <CheckCircle className="w-3 h-3" />
                                Вы оценили
                            </div>
                        ) : (
                            <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-400 mr-1 hidden sm:inline">Оценить:</span>
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <button
                                        key={star}
                                        onMouseEnter={() => setHoverRating(star)}
                                        onMouseLeave={() => setHoverRating(0)}
                                        onClick={() => handleRate(star)}
                                        className="focus:outline-none transform hover:scale-110 transition-transform p-1"
                                    >
                                        <Star 
                                            className={`w-5 h-5 sm:w-4 sm:h-4 transition-colors ${
                                                star <= (hoverRating) 
                                                ? 'text-yellow-400 fill-yellow-400' 
                                                : 'text-gray-300 dark:text-gray-600'
                                            }`} 
                                        />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Mobile optimized stats grid */}
            <div className="grid grid-cols-3 gap-2 text-gray-600 dark:text-gray-300 mb-8 p-3 sm:p-4 bg-white/40 dark:bg-white/5 rounded-2xl border border-white/20">
                <div className="flex flex-col items-center gap-1 text-center">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
                    <span className="text-[10px] uppercase tracking-wide opacity-70 hidden sm:inline">Время</span>
                    <span className="font-medium text-xs sm:text-base">{recipe.parsed_content.cooking_time}</span>
                </div>
                 <div className="flex flex-col items-center gap-1 text-center border-l border-r border-gray-200 dark:border-gray-700">
                    <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
                    <span className="text-[10px] uppercase tracking-wide opacity-70 hidden sm:inline">Сложность</span>
                    <span className="font-medium text-xs sm:text-base">{recipe.parsed_content.complexity}</span>
                </div>
                <div className="flex flex-col items-center gap-1 text-center">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
                    <span className="text-[10px] uppercase tracking-wide opacity-70 hidden sm:inline">Порции</span>
                    <span className="font-medium text-xs sm:text-base">2 чел.</span>
                </div>
            </div>

            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 italic leading-relaxed mb-6">
                "{recipe.content.substring(0, 150)}..."
            </p>

            <div className="mt-auto">
                 <div className="flex items-center gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-bold shadow-lg">
                        {recipe.author.charAt(0)}
                    </div>
                    <div>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">Автор рецепта</p>
                        <p className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">{recipe.author}</p>
                    </div>
                 </div>
            </div>
        </div>
      </div>

      {/* Content Tabs - Scrollable on mobile */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-8 overflow-x-auto scrollbar-hide">
          <button 
            onClick={() => setActiveTab('instructions')}
            className={`pb-4 px-4 font-medium text-base sm:text-lg transition-colors relative whitespace-nowrap ${activeTab === 'instructions' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}`}
          >
              Рецепт
              {activeTab === 'instructions' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500" />}
          </button>
          <button 
             onClick={() => setActiveTab('discussion')}
             className={`pb-4 px-4 font-medium text-base sm:text-lg transition-colors relative whitespace-nowrap ${activeTab === 'discussion' ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}`}
          >
              Отзывы
               {activeTab === 'discussion' && <span className="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-500" />}
               <span className="ml-2 text-xs bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{comments.length}</span>
          </button>
      </div>

      {activeTab === 'instructions' ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-slide-up">
             {/* Ingredients Sidebar */}
             <div className="md:col-span-4 space-y-8">
                <div className="glass-panel p-6 rounded-2xl">
                    <h3 className="font-serif text-xl font-bold mb-4 dark:text-white">Ингредиенты</h3>
                    <ul className="space-y-3">
                        {(recipe.parsed_content.ingredients || []).map((ing, idx) => (
                            <li key={idx} className="flex items-start gap-3 text-gray-700 dark:text-gray-300 text-sm">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                                <span>{ing}</span>
                            </li>
                        ))}
                    </ul>
                </div>
             </div>

             {/* Steps */}
             <div className="md:col-span-8">
                <div className="space-y-6 sm:space-y-8">
                    {(recipe.parsed_content.steps || []).map((step, idx) => (
                        <div key={idx} className="flex gap-4 group">
                            <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-serif font-bold text-base sm:text-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                {idx + 1}
                            </div>
                            <p className="text-gray-700 dark:text-gray-300 leading-relaxed pt-1 text-sm sm:text-base">
                                {step}
                            </p>
                        </div>
                    ))}
                </div>
             </div>
        </div>
      ) : (
        <div className="animate-slide-up max-w-3xl mx-auto">
            {currentUser ? (
                <form onSubmit={handleCommentSubmit} className="mb-10 relative">
                    <div className="flex gap-3 sm:gap-4">
                         <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex-shrink-0 overflow-hidden">
                            {currentUser.avatar ? (
                                <img src={currentUser.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-white font-bold">
                                    {currentUser.name.charAt(0)}
                                </div>
                            )}
                         </div>
                         <div className="flex-grow relative">
                             <textarea
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Поделитесь впечатлениями..."
                                className="w-full p-3 sm:p-4 pr-12 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-emerald-500 outline-none resize-none min-h-[80px] sm:min-h-[100px] text-sm sm:text-base"
                            />
                            <button 
                                type="submit"
                                disabled={!newComment.trim()}
                                className="absolute bottom-3 right-3 p-2 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                         </div>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2 pl-11 sm:pl-14">Комментарии модерируются.</p>
                </form>
            ) : (
                <div className="mb-10 p-4 sm:p-6 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-center border border-emerald-100 dark:border-emerald-800/50">
                    <p className="text-sm sm:text-base text-emerald-800 dark:text-emerald-200">Войдите, чтобы оставить отзыв.</p>
                </div>
            )}

            <div className="space-y-4 sm:space-y-6">
                {comments.length === 0 ? (
                    <div className="text-center text-gray-400 py-10">Отзывов пока нет.</div>
                ) : (
                    comments.map(comment => {
                        const userVote = currentUser?.votedComments?.[comment.id];
                        // Lookup the live user avatar from the map, or fallback to the snapshot in comment
                        const liveAvatar = userMap ? userMap[comment.user]?.avatar : comment.userAvatar;
                        const displayAvatar = liveAvatar || comment.userAvatar;

                        return (
                            <div key={comment.id} className="flex gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl glass-panel hover:bg-white/80 dark:hover:bg-white/10 transition-colors">
                                 <button 
                                    onClick={() => onUserClick(comment.user)}
                                    className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex-shrink-0 overflow-hidden hover:ring-2 hover:ring-emerald-500 transition-all"
                                    title="Посмотреть профиль"
                                 >
                                    {displayAvatar ? (
                                        <img src={displayAvatar} alt={comment.user} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white font-bold text-sm">
                                            {comment.user.charAt(0)}
                                        </div>
                                    )}
                                 </button>
                                 <div className="flex-grow min-w-0">
                                     <div className="flex items-center justify-between mb-2">
                                         <button 
                                            onClick={() => onUserClick(comment.user)}
                                            className="font-bold text-sm sm:text-base text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate mr-2"
                                         >
                                             {comment.user}
                                         </button>
                                         <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                                            <span className="text-[10px] sm:text-xs text-gray-500">{comment.date}</span>
                                            {currentUser?.role === 'admin' && (
                                                <button 
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteComment(comment.id); }}
                                                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                                                >
                                                    <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                                                </button>
                                            )}
                                         </div>
                                     </div>
                                     <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 mb-3 whitespace-pre-wrap break-words">{comment.text}</p>
                                     
                                     <div className="flex items-center gap-4">
                                         <button 
                                            onClick={() => updateCommentVote(comment.id, 'like')}
                                            disabled={!currentUser}
                                            className={`flex items-center gap-1 transition-colors text-xs sm:text-sm ${userVote === 'like' ? 'text-emerald-600 font-bold' : 'text-gray-500 hover:text-emerald-600'} disabled:opacity-50`}
                                         >
                                             <ThumbsUp className={`w-3 h-3 sm:w-4 sm:h-4 ${userVote === 'like' ? 'fill-current' : ''}`} />
                                             <span>{comment.likes > 0 ? comment.likes : 'Полезно'}</span>
                                         </button>
                                         <button 
                                            onClick={() => updateCommentVote(comment.id, 'dislike')}
                                            disabled={!currentUser}
                                            className={`flex items-center gap-1 transition-colors text-xs sm:text-sm ${userVote === 'dislike' ? 'text-red-500 font-bold' : 'text-gray-500 hover:text-red-500'} disabled:opacity-50`}
                                         >
                                             <ThumbsDown className={`w-3 h-3 sm:w-4 sm:h-4 ${userVote === 'dislike' ? 'fill-current' : ''}`} />
                                             <span>{comment.dislikes > 0 ? comment.dislikes : ''}</span>
                                         </button>
                                     </div>
                                 </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
      )}

        {/* REPORT MODAL */}
        {isReportModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden max-w-md w-full border border-white/10">
                    <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                         <h3 className="font-serif text-lg font-bold text-gray-900 dark:text-white">Пожаловаться</h3>
                         <button onClick={() => setIsReportModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                             <X className="w-5 h-5" />
                         </button>
                    </div>
                    <div className="p-5">
                        <div className="space-y-2 mb-6">
                            {REPORT_REASONS.map(reason => (
                                <label key={reason} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                    <input 
                                        type="radio" 
                                        name="reportReason" 
                                        value={reason}
                                        checked={reportReason === reason}
                                        onChange={(e) => setReportReason(e.target.value)}
                                        className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 border-gray-300"
                                    />
                                    <span className="text-sm text-gray-800 dark:text-gray-200 font-medium">{reason}</span>
                                </label>
                            ))}
                        </div>

                        {reportReason === 'Другое' && (
                            <div className="mb-6 animate-slide-up">
                                <textarea
                                    value={customReportDetails}
                                    onChange={(e) => setCustomReportDetails(e.target.value)}
                                    maxLength={600}
                                    placeholder="Опишите проблему..."
                                    className="w-full p-3 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-emerald-500 outline-none text-sm h-24 resize-none"
                                />
                            </div>
                        )}

                        <button 
                            onClick={handleReportSubmit}
                            disabled={!reportReason || isReporting || (reportReason === 'Другое' && !customReportDetails.trim())}
                            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                            {isReporting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Отправить'}
                        </button>
                    </div>
                </div>
            </div>
        )}

    </div>
  );
};

export default RecipeDetail;