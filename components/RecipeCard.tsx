import React from 'react';
import { Clock, Activity, Star, UtensilsCrossed, Hash } from 'lucide-react';
import { Recipe } from '../types';

interface RecipeCardProps {
  recipe: Recipe;
  onClick: (recipe: Recipe) => void;
  onTagClick?: (tag: string) => void;
}

// Palette of foodie-gradients
const GRADIENTS = [
  'from-orange-400 to-rose-500',       // Warm/Spicy
  'from-emerald-400 to-teal-600',      // Fresh/Veggie
  'from-blue-400 to-indigo-600',       // Cool/Seafood
  'from-amber-400 to-orange-600',      // Bakery/Breakfast
  'from-fuchsia-500 to-purple-600',    // Berry/Dessert
  'from-rose-400 to-red-600',          // Meat/Hearty
  'from-lime-400 to-emerald-600',      // Zesty/Green
  'from-violet-400 to-fuchsia-500',    // Rich
];

const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onClick, onTagClick }) => {
  // Safe guard against corrupt data
  if (!recipe || !recipe.parsed_content) return null;

  // Strictly select only approved images. Safe access if images array is missing.
  const approvedImage = (recipe.images || []).find(img => img.status === 'approved');
  const displayImage = approvedImage?.url;

  // Generate a deterministic gradient based on recipe ID
  const getGradient = (id: string) => {
    // Safe guard if ID is missing
    const safeId = id || 'default';
    const hash = safeId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return GRADIENTS[hash % GRADIENTS.length];
  };

  const gradientClass = getGradient(recipe.id);

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
      e.stopPropagation();
      if (onTagClick) onTagClick(tag);
  };

  return (
    <div 
      onClick={() => onClick(recipe)}
      className="group relative overflow-hidden rounded-2xl glass-panel cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:shadow-emerald-500/10 h-full flex flex-col"
    >
      <div className="relative h-48 sm:h-56 overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0">
        {displayImage ? (
          <img 
            src={displayImage} 
            alt={recipe.parsed_content.dish_name} 
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${gradientClass} flex items-center justify-center relative p-6`}>
             {/* Artistic Typography Background */}
             <span className="font-serif text-8xl sm:text-9xl text-white opacity-20 font-bold select-none absolute -bottom-4 -right-4 transform rotate-12 transition-transform duration-700 group-hover:scale-110 group-hover:rotate-6">
                {recipe.parsed_content.dish_name?.charAt(0) || '?'}
             </span>
             
             {/* Center Icon */}
             <div className="relative z-10 flex flex-col items-center text-white/90 group-hover:scale-105 transition-transform duration-300">
                <div className="p-3 sm:p-4 rounded-full bg-white/20 backdrop-blur-md border border-white/30 shadow-lg mb-2">
                    <UtensilsCrossed className="w-6 h-6 sm:w-8 sm:h-8" />
                </div>
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest opacity-80">Gourmet</span>
             </div>

             {/* Noise Texture overlay (optional via CSS, simplified here) */}
             <div className="absolute inset-0 bg-black opacity-[0.03]" />
          </div>
        )}
        
        {/* Gradient Overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />
        
        {/* Rating Badge */}
        <div className="absolute top-3 right-3 bg-white/90 dark:bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm z-20">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-bold text-gray-800 dark:text-white">{recipe.rating.toFixed(1)}</span>
            <span className="text-[10px] text-gray-500">({recipe.ratingCount})</span>
        </div>

        {/* Tags */}
        <div className="absolute bottom-3 left-3 right-3 z-20">
            <div className="flex flex-wrap gap-2 mb-1">
                {(recipe.parsed_content.tags || []).slice(0, 2).map(tag => (
                    <button 
                        key={tag} 
                        onClick={(e) => handleTagClick(e, tag)}
                        className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md bg-white/20 backdrop-blur-md border border-white/20 text-white shadow-lg hover:bg-white/40 transition-colors"
                    >
                        {tag}
                    </button>
                ))}
            </div>
        </div>
      </div>
      
      <div className="p-4 sm:p-5 flex flex-col flex-grow">
        <h3 className="font-serif text-lg sm:text-xl font-bold mb-2 text-gray-900 dark:text-white line-clamp-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
          {recipe.parsed_content.dish_name}
        </h3>
        
        <div className="flex items-center justify-between text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-auto pt-4">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-emerald-500" />
            <span>{recipe.parsed_content.cooking_time}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
            <span>{recipe.parsed_content.complexity}</span>
          </div>
        </div>

         <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex-shrink-0 flex items-center justify-center text-xs text-white font-bold shadow-sm">
                    {recipe.author ? recipe.author.charAt(0) : '?'}
                </div>
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 truncate">
                   {recipe.author || "Неизвестен"}
                </span>
            </div>
             {/* ID Display */}
            <div className="flex-shrink-0 ml-2 flex items-center text-[10px] text-gray-400 font-mono bg-gray-100 dark:bg-white/5 px-1.5 py-0.5 rounded opacity-70 group-hover:opacity-100 transition-opacity" title="ID Рецепта">
                <Hash className="w-3 h-3 mr-0.5" />
                {recipe.id}
            </div>
         </div>
      </div>
    </div>
  );
};

export default RecipeCard;
