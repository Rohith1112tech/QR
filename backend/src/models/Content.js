import mongoose from 'mongoose';

const contentSchema = new mongoose.Schema({
  shortId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['text', 'image', 'video'],
    required: true,
  },
  content: {
    type: String,
    required: function() { return this.type === 'text'; }
  },
  mediaUrl: {
    type: String,
    required: function() { return this.type === 'image' || this.type === 'video'; }
  },
  cloudinaryPublicId: {
    type: String,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  }
});

// Create Mongoose model (avoid recompilation errors if defined already)
const Content = mongoose.models.Content || mongoose.model('Content', contentSchema);

export default Content;
