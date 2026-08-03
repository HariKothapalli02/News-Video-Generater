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
    enum: ["tech_news", "trending_news", "specific_content"],
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
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Video", VideoSchema);
