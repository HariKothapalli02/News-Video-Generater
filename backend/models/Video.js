const mongoose = require("mongoose");

const VideoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  language: {
    type: String,
    required: true,
    enum: ["english", "hindi", "telugu"],
    default: "english"
  },
  status: {
    type: String,
    required: true,
    enum: [
      "Pending",
      "Collecting RSS",
      "Selecting News",
      "Generating Script",
      "Generating Voice",
      "Generating Subtitles",
      "Downloading Clips",
      "Rendering",
      "Generating Shorts",
      "Completed",
      "Failed",
      "Stopped"
    ],
    default: "Pending"
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  script: {
    type: String,
    default: ""
  },
  logs: {
    type: String,
    default: ""
  },
  videoPath: {
    type: String,
    default: ""
  },
  thumbnail: {
    type: String,
    default: ""
  },
  duration: {
    type: Number,
    default: 0
  },
  videoType: {
    type: String,
    enum: ["tech_news", "trending_news", "india_general_news", "specific_content"],
    default: "tech_news"
  },
  customScript: {
    type: String,
    default: ""
  },
  useMusic: {
    type: Boolean,
    default: true
  },
  useSubtitles: {
    type: Boolean,
    default: true
  },
  customPrompt: {
    type: String,
    default: ""
  },
  generateShorts: {
    type: Boolean,
    default: false
  },
  factsCount: {
    type: Number,
    default: 10
  },
  facts: [
    {
      factIndex: { type: Number },
      title: { type: String },
      description: { type: String },
      startTime: { type: Number },
      endTime: { type: Number }
    }
  ],
  youtubeMetadata: {
    title: { type: String, default: "" },
    titles: [{ type: String }],
    description: { type: String, default: "" },
    tags: [{ type: String }],
    generatedAt: { type: Date }
  },
  youtubeVideoId: {
    type: String,
    default: ""
  },
  youtubeUrl: {
    type: String,
    default: ""
  },
  isPosted: {
    type: Boolean,
    default: false
  },
  postedAt: {
    type: Date
  },
  isUploading: {
    type: Boolean,
    default: false
  },
  uploadStartedAt: {
    type: Date
  },
  disableAutoUpload: {
    type: Boolean,
    default: false
  },
  isAutomated: {
    type: Boolean,
    default: false
  },
  shorts: [
    {
      factIndex: { type: Number },
      title: { type: String },
      factTitle: { type: String },
      scriptText: { type: String },
      videoPath: { type: String },
      thumbnail: { type: String },
      duration: { type: Number },
      aspectRatio: { type: String, default: "9:16" },
      disableAutoUpload: { type: Boolean, default: false },
      youtubeMetadata: {
        title: { type: String },
        description: { type: String },
        tags: [{ type: String }]
      },
      youtubeShortId: { type: String, default: "" },
      youtubeShortUrl: { type: String, default: "" },
      isPosted: { type: Boolean, default: false },
      postedAt: { type: Date },
      isUploading: { type: Boolean, default: false },
      uploadStartedAt: { type: Date },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Video", VideoSchema);
