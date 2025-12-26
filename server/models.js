  import mongoose from 'mongoose';

  const commentSchema = new mongoose.Schema({
    id: String,
    user: String,
    userAvatar: String,
    text: String,
    date: String,
    likes: { type: Number, default: 0 },
    dislikes: { type: Number, default: 0 }
  });

  // Add replies field recursively
  commentSchema.add({
    replies: [commentSchema]
  });

  const recipeSchema = new mongoose.Schema({
    id: { type: String, unique: true, required: true },
    author: String,
    content: String,
    parsed_content: {
      complexity: { type: String, index: true }, // Index for filtering
      cooking_time: String,
      dish_name: { type: String, index: true },
      ingredients: [String],
      steps: [String],
      tags: { type: [String], index: true } // Index for filtering
    },
    images: [{
      url: String,
      author: String,
      status: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'pending' },
      rejectedAt: Date 
    }],
    rating: { type: Number, default: 0, index: true }, // Index for sorting
    ratingCount: { type: Number, default: 0 },
    comments: [commentSchema]
  }, { timestamps: true });

  // COMPOUND INDEXES FOR SORTING OPTIMIZATION
  recipeSchema.index({ rating: -1, ratingCount: -1 });
  recipeSchema.index({ createdAt: -1 });
  recipeSchema.index({ updatedAt: -1 });

  // TEXT INDEX FOR HIGH PERFORMANCE SEARCH
  recipeSchema.index({ 
    'parsed_content.dish_name': 'text', 
    'parsed_content.tags': 'text',
    'parsed_content.ingredients': 'text' 
  }, {
    weights: {
      'parsed_content.dish_name': 10,
      'parsed_content.tags': 5,
      'parsed_content.ingredients': 1
    },
    name: 'RecipeTextIndex'
  });

  const userSchema = new mongoose.Schema({
    numericId: { type: String, unique: true, index: true },
    email: { 
      type: String, 
      unique: true, 
      required: true, 
      lowercase: true,
      trim: true,
      index: true 
    },
    name: { type: String, required: true },
    password: { type: String, select: false, required: true },
    salt: { type: String, select: false }, // For password hashing
    
    // Verification Fields
    // --- TOTP (Google Authenticator) Secret ---
    totpSecret: { type: String, select: false },
    is2FAEnabled: { type: Boolean, default: false }, // New Flag

    // Legacy (Email) - kept for structure but unused in new flow
    verificationCode: { type: String, select: false },
    verificationCodeExpires: { type: Date, select: false },
    
    isVerified: { type: Boolean, default: false },

    avatar: String,
    joinedDate: String,
    bio: String,
    role: { type: String, enum: ['user', 'admin', 'moderator'], default: 'user' },
    isBanned: { type: Boolean, default: false },
    favorites: [String],
    ratedRecipeIds: [String],
    votedComments: { type: Map, of: String },
    settings: {
      showEmail: { type: Boolean, default: false },
      showFavorites: { type: Boolean, default: true },
      newsletter: Boolean,
      dietaryPreferences: [String]
    }
  });

  const reportSchema = new mongoose.Schema({
    id: { type: String, index: true }, // Added ID field to ensure persistence
    recipeId: String,
    recipeName: String,
    reporter: String,
    reason: String,
    details: String,
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
    resolvedAt: Date,
    // Explicitly define createdAt to add TTL index. 
    // 172800 seconds = 48 hours. MongoDB background thread checks this periodically.
    createdAt: { type: Date, default: Date.now, expires: 172800 } 
  }, { timestamps: true });

  reportSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
      ret.id = ret._id;
      delete ret._id;
    }
  });

  const notificationSchema = new mongoose.Schema({
    id: String,
    userId: { type: String, index: true }, 
    type: { type: String, enum: ['info', 'success', 'error', 'warning'], default: 'info' },
    title: String,
    message: String,
    isRead: { type: Boolean, default: false },
    link: String
  }, { timestamps: true });

  notificationSchema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: function (doc, ret) {
      ret.id = ret._id;
      delete ret._id;
    }
  });

  export const RecipeModel = mongoose.model('Recipe', recipeSchema);
  export const UserModel = mongoose.model('User', userSchema);
  export const ReportModel = mongoose.model('Report', reportSchema);
  export const NotificationModel = mongoose.model('Notification', notificationSchema);