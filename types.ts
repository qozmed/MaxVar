export interface RecipeParsedContent {
  complexity: string;
  cooking_time: string;
  dish_name: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
}

export interface Comment {
  id: string;
  user: string;
  userAvatar?: string; // Added avatar URL to comment
  text: string; // Content is sanitized
  date: string;
  likes: number;
  dislikes: number;
}

export interface RecipeImage {
  url: string;
  author: string; // 'official' or username
  status: 'approved' | 'pending' | 'rejected';
  rejectedAt?: string; // Timestamp when the image was rejected
}

export interface Recipe {
  id: string;
  author: string;
  content: string;
  parsed_content: RecipeParsedContent;
  images: RecipeImage[]; // Changed from string[] to object for moderation
  rating: number;
  ratingCount: number;
  comments: Comment[];
}

// Interface for the raw JSON file structure provided by the user
export interface RawRecipeImport {
  author: string;
  content: string;
  parsed_content: RecipeParsedContent;
}

export interface UserSettings {
  showEmail: boolean;
  showFavorites: boolean; // New setting
  newsletter: boolean;
  dietaryPreferences: string[]; // e.g., 'vegetarian', 'vegan', 'keto', 'gluten_free'
}

export interface User {
  numericId: string; // Unique 6-digit ID
  name: string;
  email: string;
  password?: string; // Optional password field
  avatar?: string;
  joinedDate: string;
  bio?: string;
  favorites: string[]; // Moved to user object to share publicly
  ratedRecipeIds: string[];
  votedComments: Record<string, 'like' | 'dislike'>;
  role: 'user' | 'admin';
  isBanned: boolean;
  settings?: UserSettings; // Optional for backward compatibility
}

export interface Report {
  id: string;
  recipeId: string;
  recipeName: string;
  reporter: string;
  reason: string; // "Некорректное фото", "Ошибка в рецепте", etc.
  details?: string; // Description for "Other"
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string; // User name or email (depending on how you identify users, we use name/email mix but let's use name here to match comments/images author)
  type: 'info' | 'success' | 'error' | 'warning';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  link?: string; // Optional link to navigate (e.g., to recipe)
}

export enum AppView {
  HOME = 'HOME',
  RECIPE_DETAIL = 'RECIPE_DETAIL',
  PROFILE = 'PROFILE',
  PUBLIC_PROFILE = 'PUBLIC_PROFILE', // New view for viewing other users
  ADMIN = 'ADMIN',
}