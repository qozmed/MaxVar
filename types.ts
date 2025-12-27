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
  userAvatar?: string;
  text: string;
  date: string;
  likes: number;
  dislikes: number;
  replies?: Comment[]; // Nested replies
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
  images: RecipeImage[];
  rating: number;
  ratingCount: number;
  comments: Comment[];
}

export interface RawRecipeImport {
  author: string;
  content: string;
  parsed_content: RecipeParsedContent;
}

export interface UserSettings {
  showEmail: boolean;
  showFavorites: boolean;
  newsletter: boolean;
  dietaryPreferences: string[];
}

export interface User {
  numericId: string;
  name: string;
  email: string;
  password?: string;
  avatar?: string;
  joinedDate: string;
  bio?: string;
  favorites: string[];
  ratedRecipeIds: string[];
  votedComments: Record<string, 'like' | 'dislike'>;
  role: 'user' | 'admin' | 'moderator'; // Added moderator
  isBanned: boolean;
  is2FAEnabled: boolean; // NEW: Flag for optional 2FA
  settings?: UserSettings;
  // Activity Tracking
  lastLoginIp?: string;
  lastSeen?: string; // ISO Date string
  isOnline?: boolean; // Computed on server/client
}

export interface Report {
  id: string;
  recipeId: string;
  recipeName: string;
  reporter: string;
  reason: string;
  details?: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'info' | 'success' | 'error' | 'warning';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  link?: string;
}

export enum AppView {
  HOME = 'HOME',
  RECIPE_DETAIL = 'RECIPE_DETAIL',
  PROFILE = 'PROFILE',
  PUBLIC_PROFILE = 'PUBLIC_PROFILE',
  ADMIN = 'ADMIN',
}