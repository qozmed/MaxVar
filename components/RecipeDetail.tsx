import React, { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Activity, Users, Camera, Send, ChevronLeft, ChevronRight, Star, Heart, ThumbsUp, ThumbsDown, Plus, CheckCircle, Clock3, User as UserIcon, Trash2, AlertTriangle, Loader2, Flag, X, MessageCircle, ShieldAlert, Headphones } from 'lucide-react';
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
  userMap?: Record<string, User>;
  onTagClick?: (tag: string) => void;
}

const REPORT_REASONS = [
    "Некорректное фото",
    "Ошибка в рецепте",
    "Лишние ингредиенты",
    "Нецензурная брань в комментарии/отзыве",
    "Другое"
];

const RoleBadge: React.FC<{ role?: string }> = ({ role }) => {
    if (role === 'admin') {
        return <span title="Администратор" className="flex items-center"><ShieldAlert className="w-3.5 h-3.5 text-red-500 fill-red-100 dark:fill-red-900" /></span>;
    }
    if (role === 'moderator') {
        return <span title="Модератор" className="flex items-center"><Headphones className="w-3.5 h-3.5 text-blue-500 fill-blue-100 dark:fill-blue-900" /></span>;
    }
    return null;
};

const RecipeDetail: React.FC<RecipeDetailProps> = ({ recipe, onBack, currentUser, isFavorite, toggleFavorite, onUpdateRecipe, onUpdateUser, onUserClick, userMap, onTagClick }) => {
  const { showAlert, showConfirm } = useModal();
  
  const [activeTab, setActiveTab] = useState<'instructions' | 'discussion'>('instructions');
  const [newComment, setNewComment] = useState('');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportReason, setReportReason] = useState<string | null>(null);
  const [customReportDetails, setCustomReportDetails] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  
  const [processingVotes, setProcessingVotes] = useState<Set<string>>(new Set());

  const comments = recipe?.comments || [];
  const hasRated = currentUser && currentUser.ratedRecipeIds && recipe && currentUser.ratedRecipeIds.includes(recipe.id);

  const visibleImages = (recipe?.images || []).filter(img => 
      img.status === 'approved' || 
      (currentUser && img.author === currentUser.name && img.status === 'pending')
  );

  useEffect(() => {
    if (visibleImages.length > 0 && currentImageIndex >= visibleImages.length) {
      setCurrentImageIndex(0);
    }
  }, [visibleImages.length, currentImageIndex]);

  const handleCommentSubmit = async (e: React.FormEvent, parentCommentId?: string) => {
    e.preventDefault();
    const textToProcess = parentCommentId ? replyText : newComment;

    if (!currentUser || !textToProcess.trim() || !recipe) return;
    
    const processedText = SecurityService.processContent(textToProcess);

    const commentObj: Comment = {
      id: Date.now().toString(),
      user: currentUser.name,
      userAvatar: currentUser.avatar,
      text: processedText,
      date: new Date().toLocaleDateString('ru-RU'),
      likes: 0,
      dislikes: 0,
      replies: []
    };
    
    let updatedComments = [...comments];

    if (parentCommentId) {
        updatedComments = comments.map(c => {
            if (c.id === parentCommentId) {
                return {
                    ...c,
                    replies: [...(c.replies || []), commentObj]
                };
            }
            return c;
        });

        const parentComment = comments.find(c => c.id === parentCommentId);
        if (parentComment && parentComment.user !== currentUser.name) {
             try {
                 await StorageService.sendNotification({
                     userId: parentComment.user,
                     type: 'info',
                     title: 'Новый ответ',
                     message: `${currentUser.name} ответил на ваш комментарий к рецепту "${recipe.parsed_content.dish_name}"`,
                     link: `/recipe/${recipe.id}`
                 });
             } catch (e) { console.error("Notif error", e); }
        }

        setReplyText('');
        setReplyingToId(null);
    } else {
        updatedComments.push(commentObj);
        setNewComment('');
    }

    const updatedRecipe = {
        ...recipe,
        comments: updatedComments
    };

    onUpdateRecipe(updatedRecipe);
  };

  const handleDeleteComment = async (commentId: string, parentId?: string) => {
      const confirmed = await showConfirm('Удаление', 'Вы уверены, что хотите удалить этот комментарий?');
      if (!confirmed) return;
      if (!recipe) return;

      let updatedComments = [...comments];

      if (parentId) {
          updatedComments = comments.map(c => {
              if (c.id === parentId) {
                  return {
                      ...c,
                      replies: (c.replies || []).filter(r => r.id !== commentId)
                  };
              }
              return c;
          });
      } else {
          updatedComments = comments.filter(c => c.id !== commentId);
      }

      const updatedRecipe = { ...recipe, comments: updatedComments };
      onUpdateRecipe(updatedRecipe);
  };

  const handleVote = async (commentId: string, type: 'like' | 'dislike', parentId?: string, commentAuthor?: string) => {
      if (!currentUser || !recipe) {
          showAlert("Внимание", "Войдите, чтобы голосовать.");
          return;
      }
      
      if (processingVotes.has(commentId)) return;

      setProcessingVotes(prev => { const next = new Set(prev); next.add(commentId); return next; });

      try {
        const userVotes = { ...(currentUser.votedComments || {}) };
        const currentVote = userVotes[commentId];

        if (currentVote === type) {
            delete userVotes[commentId];
        } else {
            userVotes[commentId] = type;
        }

        const updateCommentNode = (node: Comment) => {
            let newLikes = node.likes;
            let newDislikes = node.dislikes;

            if (currentVote === type) {
                if (type === 'like') newLikes--;
                else newDislikes--;
            } else if (currentVote) {
                if (type === 'like') {
                    newLikes++;
                    newDislikes--;
                } else {
                    newDislikes++;
                    newLikes--;
                }
            } else {
                if (type === 'like') newLikes++;
                else newDislikes++;
            }
            return { ...node, likes: Math.max(0, newLikes), dislikes: Math.max(0, newDislikes) };
        };

        let updatedComments = [...comments];
        if (parentId) {
            updatedComments = comments.map(c => {
                if (c.id === parentId) {
                    const updatedReplies = (c.replies || []).map(r => {
                        if (r.id === commentId) return updateCommentNode(r);
                        return r;
                    });
                    return { ...c, replies: updatedReplies };
                }
                return c;
            });
        } else {
            updatedComments = comments.map(c => {
                if (c.id === commentId) return updateCommentNode(c);
                return c;
            });
        }

        onUpdateUser({ ...currentUser, votedComments: userVotes });

        const updatedRecipe = { ...recipe, comments: updatedComments };
        onUpdateRecipe(updatedRecipe);

        if (!currentVote && commentAuthor && commentAuthor !== currentUser.name) {
            try {
                await StorageService.sendNotification({
                    userId: commentAuthor,
                    type: type === 'like' ? 'success' : 'warning',
                    title: type === 'like' ? 'Новый лайк' : 'Новый дизлайк',
                    message: `${currentUser.name} оценил ваш комментарий: ${type === 'like' ? '👍' : '👎'}`,
                    link: `/recipe/${recipe.id}`
                });
            } catch(e) { console.error(e); }
        }
      } finally {
        setTimeout(() => {
            setProcessingVotes(prev => { const next = new Set(prev); next.delete(commentId); return next; });
        }, 800); // 800ms debounce
      }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && recipe) {
      try {
          setIsUploading(true);
          const file = e.target.files[0];
          const base64String = await processImage(file);
          
          const newImage = {
              url: base64String,
              author: currentUser?.name || 'Anonymous',
              status: 'pending' as const
          };

          const updatedImages = [...(recipe.images || []), newImage];
          const updatedRecipe = { ...recipe, images: updatedImages };
          onUpdateRecipe(updatedRecipe);
          setCurrentImageIndex(updatedImages.length - 1);
      } catch (error) {
          console.error("Ошибка обработки фото:", error);
          showAlert("Ошибка", "Не удалось загрузить фото.", "error");
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

  if (!recipe || !recipe.parsed_content) {
      return (
          <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
              <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Ошибка данных</h2>
              <button onClick={onBack} className="px-4 py-2 mt-4 bg-gray-200 dark:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-300">Вернуться назад</button>
          </div>
      );
  }

  const currentImage = visibleImages[currentImageIndex];

  const renderComment = (comment: Comment, isReply = false, parentId?: string) => {
      const userVote = currentUser?.votedComments?.[comment.id];
      const liveUser = userMap ? userMap[comment.user] : undefined;
      const liveAvatar = liveUser?.avatar;
      const userRole = liveUser?.role || 'user';
      const displayAvatar = liveAvatar || comment.userAvatar;
      const isLocked = processingVotes.has(comment.id);

      return (
          <div key={comment.id} className={`flex gap-3 sm:gap-4 ${isReply ? 'ml-8 sm:ml-12 mt-3 border-l-2 border-gray-100 dark:border-gray-800 pl-4' : 'p-4 sm:p-6 rounded-2xl glass-panel dark:bg-gray-800/50 border dark:border-gray-700'}`}>
                <button 
                onClick={() => onUserClick(comment.user)}
                className={`flex-shrink-0 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 overflow-hidden hover:ring-2 hover:ring-emerald-500 transition-all ${isReply ? 'w-6 h-6 sm:w-8 sm:h-8' : 'w-8 h-8 sm:w-10 sm:h-10'}`}
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
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => onUserClick(comment.user)}
                                className="font-bold text-sm sm:text-base text-gray-900 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors truncate"
                            >
                                {comment.user}
                            </button>
                            <RoleBadge role={userRole} />
                            <span className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">{comment.date}</span>
                        </div>
                        {currentUser?.role === 'admin' && (
                            <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeleteComment(comment.id, parentId); }}
                                className="text-gray-400 hover:text-red-500 transition-colors p-1"
                            >
                                <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                            </button>
                        )}
                    </div>
                    <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 mb-3 whitespace-pre-wrap break-words">{comment.text}</p>
                    
                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-3 bg-gray-50 dark:bg-black/20 px-2 py-1 rounded-lg border border-gray-100 dark:border-gray-700 ${isLocked ? 'opacity-50 cursor-wait' : ''}`}>
                            <button 
                                onClick={() => handleVote(comment.id, 'like', parentId, comment.user)}
                                disabled={isLocked}
                                className={`flex items-center gap-1 text-xs font-medium transition-colors p-1 rounded hover:bg-white dark:hover:bg-white/10 ${userVote === 'like' ? 'text-emerald-600' : 'text-gray-500 hover:text-emerald-600'}`}
                            >
                                <ThumbsUp className={`w-3.5 h-3.5 ${userVote === 'like' ? 'fill-current' : ''}`} />
                                <span>{comment.likes || 0}</span>
                            </button>
                            <div className="w-px h-3 bg-gray-300 dark:bg-gray-600"></div>
                            <button 
                                onClick={() => handleVote(comment.id, 'dislike', parentId, comment.user)}
                                disabled={isLocked}
                                className={`flex items-center gap-1 text-xs font-medium transition-colors p-1 rounded hover:bg-white dark:hover:bg-white/10 ${userVote === 'dislike' ? 'text-red-500' : 'text-gray-500 hover:text-red-500'}`}
                            >
                                <ThumbsDown className={`w-3.5 h-3.5 ${userVote === 'dislike' ? 'fill-current' : ''}`} />
                                <span>{comment.dislikes || 0}</span>
                            </button>
                        </div>

                        {!isReply && currentUser && (
                            <button 
                                onClick={() => setReplyingToId(replyingToId === comment.id ? null : comment.id)}
                                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300"
                            >
                                Ответить
                            </button>
                        )}
                    </div>

                    {!isReply && replyingToId === comment.id && (
                        <form onSubmit={(e) => handleCommentSubmit(e, comment.id)} className="mt-3 flex gap-2 animate-fade-in">
                             <input 
                                type="text" 
                                autoFocus
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder={`Ответ пользователю ${comment.user}...`}
                                className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none dark:text-white"
                             />
                             <button 
                                type="submit"
                                disabled={!replyText.trim()}
                                className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
                             >
                                 Отправить
                             </button>
                        </form>
                    )}

                    {comment.replies && comment.replies.length > 0 && (
                        <div className="mt-2">
                            {comment.replies.map(reply => renderComment(reply, true, comment.id))}
                        </div>
                    )}
                </div>
          </div>
      );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pb-20 pt-4 animate-fade-in relative">
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
            >
                <Flag className="w-5 h-5" />
            </button>
            <button 
                onClick={toggleFavorite}
                className={`p-3 rounded-full transition-all shadow-sm border ${isFavorite ? 'bg-red-50 border-red-200 text-red-500' : 'bg-white/50 dark:bg-black/50 border-transparent text-gray-400 hover:text-red-400'}`}
            >
                <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 mb-12">
        <div className="lg:col-span-7 relative h-72 sm:h-96 lg:h-[500px] rounded-3xl overflow-hidden shadow-2xl group bg-gray-100 dark:bg-gray-800">
            {visibleImages.length > 0 && currentImage ? (
                <>
                    <img src={currentImage.url} alt="" className="w-full h-full object-cover" />
                    {currentImage.author !== 'official' && (
                        <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full text-white text-xs flex items-center gap-2">
                            <UserIcon className="w-3 h-3" /> <span>Фото: {currentImage.author}</span>
                        </div>
                    )}
                </>
            ) : (
                <div className="w-full h-full flex items-center justify-center text-center p-4 text-gray-400">Нет фото</div>
            )}
            {visibleImages.length > 1 && (
                <>
                    <button onClick={prevImage} className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 text-white z-10 hover:bg-black/50"><ChevronLeft /></button>
                    <button onClick={nextImage} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 text-white z-10 hover:bg-black/50"><ChevronRight /></button>
                </>
            )}
            {currentUser && (
                 <label className="absolute top-4 right-4 bg-black/40 hover:bg-emerald-600 text-white px-4 py-2 rounded-full text-xs font-bold cursor-pointer transition-all z-10 flex items-center gap-2">
                    {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    <span>{isUploading ? '...' : 'Фото'}</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={isUploading} />
                 </label>
            )}
        </div>
        
        <div className="lg:col-span-5 flex flex-col">
            <div className="flex flex-wrap gap-2 mb-4">
                {(recipe.parsed_content.tags || []).map(tag => (
                    <button 
                        key={tag} 
                        onClick={() => onTagClick && onTagClick(tag)}
                        className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 px-3 py-1 rounded-full transition-colors"
                    >
                        {tag}
                    </button>
                ))}
            </div>
            <h1 className="font-serif text-3xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">{recipe.parsed_content.dish_name}</h1>
            <div className="flex items-center gap-4 mb-6">
                <div className="flex items-center gap-1 text-yellow-400"><Star className="fill-current w-5 h-5"/> <span className="text-xl font-bold text-gray-900 dark:text-white">{recipe.rating}</span></div>
                {currentUser && (
                     <div className="ml-auto">
                        {hasRated ? <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Оценено</span> : 
                        <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                                <button key={star} onMouseEnter={() => setHoverRating(star)} onMouseLeave={() => setHoverRating(0)} onClick={() => handleRate(star)} className="p-1">
                                    <Star className={`w-5 h-5 ${star <= hoverRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 dark:text-gray-600'}`} />
                                </button>
                            ))}
                        </div>}
                     </div>
                )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-gray-600 dark:text-gray-300 mb-8 p-4 bg-white/40 dark:bg-white/5 rounded-2xl border border-white/20 dark:border-white/10">
                <div className="text-center"><Clock className="w-5 h-5 mx-auto text-emerald-500 mb-1" /><span className="text-xs font-bold">{recipe.parsed_content.cooking_time}</span></div>
                <div className="text-center border-x border-gray-200 dark:border-gray-700"><Activity className="w-5 h-5 mx-auto text-emerald-500 mb-1" /><span className="text-xs font-bold">{recipe.parsed_content.complexity}</span></div>
                <div className="text-center"><Users className="w-5 h-5 mx-auto text-emerald-500 mb-1" /><span className="text-xs font-bold">2 чел.</span></div>
            </div>
            <p className="text-gray-600 dark:text-gray-400 italic mb-6">"{recipe.content.substring(0, 150)}..."</p>
            <div className="mt-auto flex items-center gap-3">
                 <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white font-bold">{recipe.author.charAt(0)}</div>
                 <div><p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Автор</p><p className="font-bold text-gray-900 dark:text-white">{recipe.author}</p></div>
            </div>
        </div>
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-8 overflow-x-auto scrollbar-hide">
          <button onClick={() => setActiveTab('instructions')} className={`pb-4 px-4 font-medium transition-colors border-b-2 ${activeTab === 'instructions' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>Рецепт</button>
          <button onClick={() => setActiveTab('discussion')} className={`pb-4 px-4 font-medium transition-colors border-b-2 ${activeTab === 'discussion' ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>Отзывы ({comments.length})</button>
      </div>

      {activeTab === 'instructions' ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 animate-slide-up">
             <div className="md:col-span-4 glass-panel dark:bg-gray-800/50 p-6 rounded-2xl h-fit border dark:border-gray-700">
                <h3 className="font-serif text-xl font-bold mb-4 dark:text-white">Ингредиенты</h3>
                <ul className="space-y-3">
                    {(recipe.parsed_content.ingredients || []).map((ing, idx) => (
                        <li key={idx} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />{ing}</li>
                    ))}
                </ul>
             </div>
             <div className="md:col-span-8 space-y-6">
                {(recipe.parsed_content.steps || []).map((step, idx) => (
                    <div key={idx} className="flex gap-4 group">
                        <div className="shrink-0 w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-serif font-bold group-hover:bg-emerald-600 group-hover:text-white transition-colors">{idx + 1}</div>
                        <p className="text-gray-700 dark:text-gray-300 pt-1 leading-relaxed">{step}</p>
                    </div>
                ))}
             </div>
        </div>
      ) : (
        <div className="animate-slide-up max-w-3xl mx-auto">
            {currentUser ? (
                <form onSubmit={(e) => handleCommentSubmit(e)} className="mb-10 relative">
                    <div className="flex gap-3">
                         <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 shrink-0 overflow-hidden">
                            {currentUser.avatar ? <img src={currentUser.avatar} className="w-full h-full object-cover" /> : <div className="flex h-full items-center justify-center text-white font-bold">{currentUser.name.charAt(0)}</div>}
                         </div>
                         <div className="grow relative">
                             <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Поделитесь впечатлениями..." className="w-full p-4 pr-12 rounded-2xl bg-white/50 dark:bg-black/20 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-emerald-500 outline-none resize-none min-h-[100px] text-gray-900 dark:text-gray-100" />
                            <button type="submit" disabled={!newComment.trim()} className="absolute bottom-3 right-3 p-2 bg-emerald-600 text-white rounded-full hover:bg-emerald-700 disabled:opacity-50"><Send className="w-4 h-4" /></button>
                         </div>
                    </div>
                </form>
            ) : (
                <div className="mb-10 p-4 bg-emerald-50 dark:bg-emerald-900/20 text-center rounded-xl text-emerald-800 dark:text-emerald-200 border border-emerald-100 dark:border-emerald-900/50">Войдите, чтобы оставить отзыв.</div>
            )}
            <div className="space-y-4">
                {comments.length === 0 ? <div className="text-center text-gray-400 py-10">Отзывов пока нет.</div> : comments.map(c => renderComment(c))}
            </div>
        </div>
      )}

      {isReportModalOpen && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border border-white/10">
                    <div className="flex justify-between items-center mb-4">
                         <h3 className="font-serif text-lg font-bold text-gray-900 dark:text-white">Пожаловаться</h3>
                         <button onClick={() => setIsReportModalOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
                    </div>
                    <div className="space-y-2 mb-6">
                        {REPORT_REASONS.map(reason => (
                            <label key={reason} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                                <input type="radio" name="reportReason" value={reason} checked={reportReason === reason} onChange={(e) => setReportReason(e.target.value)} className="text-emerald-600 focus:ring-emerald-500" />
                                <span className="text-sm text-gray-800 dark:text-gray-200">{reason}</span>
                            </label>
                        ))}
                    </div>
                    {reportReason === 'Другое' && <textarea value={customReportDetails} onChange={(e) => setCustomReportDetails(e.target.value)} placeholder="Опишите проблему..." className="w-full p-3 rounded-lg border dark:border-gray-700 dark:bg-black/20 dark:text-white mb-4 text-sm h-24" />}
                    <button onClick={handleReportSubmit} disabled={!reportReason} className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex justify-center disabled:opacity-50">{isReporting ? <Loader2 className="animate-spin" /> : 'Отправить'}</button>
                </div>
            </div>
      )}
    </div>
  );
};

export default RecipeDetail;
