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

// Add replies field recursively (simplified for mongoose: just use the same schema structure)
commentSchema.add({
  replies: [commentSchema]
});

const recipeSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  author: String,
  content: String,
  parsed_content: {
    complexity: String,
    cooking_time: String,
    dish_name: { type: String, index: true },
    ingredients: [String],
    steps: [String],
    tags: [String]
  },
  images: [{
    url: String,
    author: String,
    status: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'pending' },
    rejectedAt: Date 
  }],
  rating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  comments: [commentSchema]
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  numericId: { type: String, unique: true },
  email: { 
    type: String, 
    unique: true, 
    required: true, 
    lowercase: true,
    trim: true
  },
  name: { type: String, required: true },
  password: { type: String, select: false, required: true },
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
  recipeId: String,
  recipeName: String,
  reporter: String,
  reason: String,
  details: String,
  status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  resolvedAt: Date
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
  userId: String,
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

