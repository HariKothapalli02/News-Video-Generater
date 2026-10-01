const cron = require("node-cron");
const Video = require("../models/Video");
const videoQueue = require("./videoQueue");

// 3-Day Rotating Topics:
// Day 1: Tech News
// Day 2: Trending News
// Day 3: India General News
const TOPIC_ROTATION = [
  {
    videoType: "tech_news",
    subject: "technology news",
    titlePrefix: "Tech News Daily"
  },
  {
    videoType: "trending_news",
    subject: "trending news",
    titlePrefix: "Trending News Daily"
  },
  {
    videoType: "india_general_news",
    subject: "india general news",
    titlePrefix: "India Top News Daily"
  }
];

let lastExecutionTime = null;
let scheduledTask = null;

/**
 * Determine the next topic in the 3-day sequence by inspecting the most recent automated video.
 */
async function getNextTopic() {
  try {
    const lastVideo = await Video.findOne({ isAutomated: true }).sort({ createdAt: -1 });
    if (!lastVideo || !lastVideo.videoType) {
      return TOPIC_ROTATION[0]; // Default to tech_news
    }

    const currentIdx = TOPIC_ROTATION.findIndex((t) => t.videoType === lastVideo.videoType);
    if (currentIdx === -1) {
      return TOPIC_ROTATION[0];
    }
    const nextIdx = (currentIdx + 1) % TOPIC_ROTATION.length;
    return TOPIC_ROTATION[nextIdx];
  } catch (err) {
    console.error("[Scheduler] Error determining next topic rotation:", err);
    return TOPIC_ROTATION[0];
  }
}

/**
 * Triggers automated daily video generation pipeline.
 */
async function triggerDailyGeneration(io, isManual = false) {
  if (videoQueue.isBusy()) {
    console.warn("[Scheduler] VideoQueue is currently rendering another job. Rescheduling auto-generation in 5 minutes...");
    setTimeout(() => triggerDailyGeneration(io, isManual), 5 * 60 * 1000);
    return { success: false, reason: "Queue busy, delayed by 5 minutes" };
  }

  const topic = await getNextTopic();
  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const videoTitle = `${topic.titlePrefix} - ${dateStr}`;

  console.log(`[Scheduler] ⏰ Auto-triggering 6 AM daily video: "${videoTitle}" (Type: ${topic.videoType})`);

  try {
    const newVideo = new Video({
      title: videoTitle,
      subject: topic.subject,
      language: "english",
      status: "Pending",
      progress: 0,
      script: "",
      logs: `Auto-scheduled 6 AM generation (${topic.videoType}). Initializing pipeline...`,
      videoType: topic.videoType,
      useMusic: true,
      useSubtitles: true,
      generateShorts: true,
      isAutomated: true
    });

    await newVideo.save();
    lastExecutionTime = new Date();

    videoQueue.startJob(newVideo, io).catch((err) => {
      console.error("[Scheduler] Error running automated video job:", err);
    });

    return {
      success: true,
      videoId: newVideo._id,
      title: videoTitle,
      videoType: topic.videoType
    };
  } catch (err) {
    console.error("[Scheduler] Failed to create automated video record:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Initialize node-cron task running at 06:00 AM every morning.
 */
function initScheduler(app) {
  const isEnabled = process.env.AUTO_GENERATE_ENABLED !== "false";
  const cronExpr = process.env.AUTO_GENERATE_CRON || "0 6 * * *"; // 6:00 AM every day
  const timezone = process.env.SCHEDULE_TIMEZONE || "Asia/Kolkata";

  if (!isEnabled) {
    console.log("[Scheduler] ⏸️ Automated 6 AM video generation is DISABLED (AUTO_GENERATE_ENABLED=false)");
    return;
  }

  if (!cron.validate(cronExpr)) {
    console.error(`[Scheduler] ❌ Invalid cron expression: "${cronExpr}"`);
    return;
  }

  console.log(`[Scheduler] 🚀 Automated Daily Video Scheduler initialized!`);
  console.log(`[Scheduler] 🕒 Schedule: "${cronExpr}" | Timezone: ${timezone} (6:00 AM daily)`);
  console.log(`[Scheduler] 🔄 Daily Rotation: Tech News → Trending News → India General News (1 per day)`);

  scheduledTask = cron.schedule(
    cronExpr,
    async () => {
      console.log(`[Scheduler] 🔔 6:00 AM trigger fired! Starting daily news video pipeline...`);
      const io = app.get("io");
      await triggerDailyGeneration(io, false);
    },
    {
      timezone: timezone
    }
  );
}

function getSchedulerStatus() {
  const isEnabled = process.env.AUTO_GENERATE_ENABLED !== "false";
  const cronExpr = process.env.AUTO_GENERATE_CRON || "0 6 * * *";
  const timezone = process.env.SCHEDULE_TIMEZONE || "Asia/Kolkata";

  return {
    enabled: isEnabled,
    cronExpression: cronExpr,
    timezone: timezone,
    lastRun: lastExecutionTime,
    rotation: TOPIC_ROTATION.map((t) => t.videoType)
  };
}

module.exports = {
  initScheduler,
  triggerDailyGeneration,
  getNextTopic,
  getSchedulerStatus
};
