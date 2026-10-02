const cron = require("node-cron");
const Video = require("../models/Video");
const videoQueue = require("./videoQueue");
const { dispatchFullVideoToWebhook, dispatchShortToWebhook } = require("./webhookDispatcher");

// 3-Day Rotating Topics with Trending News as primary focus
const TOPIC_ROTATION = [
  {
    videoType: "trending_news",
    subject: "trending news",
    titlePrefix: "Trending News Daily"
  },
  {
    videoType: "tech_news",
    subject: "technology news",
    titlePrefix: "Tech News Daily"
  },
  {
    videoType: "india_general_news",
    subject: "india general news",
    titlePrefix: "India Top News Daily"
  }
];

let lastGenExecutionTime = null;
let lastPublishExecutionTime = {
  fullVideo: null,
  short1: null,
  short2: null,
  short3: null
};

let activeCronTasks = [];

/**
 * Determine the next topic in the 3-day sequence by inspecting the most recent automated video.
 */
async function getNextTopic() {
  try {
    const lastVideo = await Video.findOne({ isAutomated: true }).sort({ createdAt: -1 });
    if (!lastVideo || !lastVideo.videoType) {
      return TOPIC_ROTATION[0]; // Default to trending_news
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
 * 05:00 AM: Daily Video & 3 Shorts Generation Pipeline.
 * Generates the full video with top 10 trending news, and converts top 3 into shorts.
 * DOES NOT post anything to YouTube at this time.
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

  console.log(`[Scheduler] ⏰ Auto-triggering 5:00 AM daily video generation: "${videoTitle}" (Type: ${topic.videoType})`);
  console.log(`[Scheduler] 🔒 Notice: Full video (10 news stories) and 3 Shorts will be generated locally. No uploads will be made until scheduled times (6 AM full, 9 AM short 1, 2 PM short 2, 6 PM short 3).`);

  try {
    const newVideo = new Video({
      title: videoTitle,
      subject: topic.subject,
      language: "english",
      status: "Pending",
      progress: 0,
      script: "",
      logs: `Auto-scheduled 5 AM generation (Top 10 trending news). Initializing pipeline without upload...`,
      videoType: topic.videoType,
      customPrompt: "Select the top 10 most trending news stories with maximum viral hook, high curiosity, and massive public interest. The first 3 stories will be converted into dedicated shorts.",
      useMusic: true,
      useSubtitles: true,
      generateShorts: true,
      factsCount: 10,
      isAutomated: true
    });

    await newVideo.save();
    lastGenExecutionTime = new Date();

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
 * 06:00 AM: Publish Today's Full Video to YouTube.
 * Skips automatically if the video was already manually or previously posted.
 */
async function publishDailyFullVideo(io) {
  console.log("[Scheduler] ⏰ 6:00 AM trigger fired! Publishing today's full video to YouTube...");
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 1. Check if today's completed video was already posted or uploaded
    const alreadyPostedToday = await Video.findOne({
      status: "Completed",
      createdAt: { $gte: todayStart },
      $or: [
        { isPosted: true },
        { youtubeVideoId: { $exists: true, $nin: ["", null] } },
        { youtubeUrl: { $exists: true, $nin: ["", null] } }
      ]
    });

    if (alreadyPostedToday) {
      console.log(`[Scheduler 6:00 AM] ⏭️ Full video '${alreadyPostedToday.title}' (${alreadyPostedToday._id}) is ALREADY posted/uploaded. Skipping automated upload.`);
      return { success: true, skipped: true, reason: "Already posted or uploaded" };
    }

    // 2. Find today's completed video that hasn't been uploaded to YouTube yet and is not marked offline
    let video = await Video.findOne({
      status: "Completed",
      createdAt: { $gte: todayStart },
      disableAutoUpload: { $ne: true },
      isPosted: { $ne: true },
      $or: [{ youtubeVideoId: "" }, { youtubeVideoId: null }, { youtubeVideoId: { $exists: false } }],
      $and: [{ $or: [{ youtubeUrl: "" }, { youtubeUrl: null }, { youtubeUrl: { $exists: false } }] }]
    }).sort({ createdAt: -1 });

    if (!video) {
      // Fallback: look for most recent unposted completed video that is not marked offline
      video = await Video.findOne({
        status: "Completed",
        disableAutoUpload: { $ne: true },
        isPosted: { $ne: true },
        $or: [{ youtubeVideoId: "" }, { youtubeVideoId: null }, { youtubeVideoId: { $exists: false } }],
        $and: [{ $or: [{ youtubeUrl: "" }, { youtubeUrl: null }, { youtubeUrl: { $exists: false } }] }]
      }).sort({ createdAt: -1 });
    }

    if (!video) {
      console.log("[Scheduler 6:00 AM] ℹ️ No unposted completed video found for YouTube upload. All videos are posted.");
      return { success: false, reason: "No pending unposted completed video" };
    }

    console.log(`[Scheduler 6:00 AM] Found pending video '${video.title}' (${video._id}). Dispatching to YouTube uploader...`);
    const dispatchResult = await dispatchFullVideoToWebhook(video);

    let ytId = "";
    if (dispatchResult.response) {
      const respObj = Array.isArray(dispatchResult.response) ? dispatchResult.response[0] : dispatchResult.response;
      ytId = respObj?.youtubeVideoId || respObj?.uploadId || respObj?.id || "";
    }

    video.isPosted = true;
    video.postedAt = new Date();
    if (ytId) {
      video.youtubeVideoId = ytId;
      video.youtubeUrl = `https://www.youtube.com/watch?v=${ytId}`;
    }
    await video.save();

    lastPublishExecutionTime.fullVideo = new Date();

    if (io) {
      io.emit("video_updated", video);
      io.emit("job_update", video);
    }

    console.log(`[Scheduler 6:00 AM] Full video dispatched successfully. Result:`, dispatchResult.dispatched);
    return { success: true, videoId: video._id, dispatchResult };
  } catch (err) {
    console.error("[Scheduler 6:00 AM] Error publishing full video:", err);
    return { success: false, error: err.message };
  }
}

/**
 * 09:00 AM, 02:00 PM (14:00), 06:00 PM (18:00): Publish Individual Short to YouTube.
 * Skips automatically if the short was already manually or previously posted.
 * @param {Object} io - Socket.io instance
 * @param {number} shortIdx - 1, 2, or 3
 */
async function publishDailyShort(io, shortIdx) {
  const slotName = shortIdx === 1 ? "9:00 AM (Short #1)" : (shortIdx === 2 ? "2:00 PM (Short #2)" : "6:00 PM (Short #3)");
  console.log(`[Scheduler] ⏰ ${slotName} trigger fired! Publishing Short #${shortIdx} to YouTube...`);

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Look for today's completed video
    let video = await Video.findOne({
      status: "Completed",
      createdAt: { $gte: todayStart }
    }).sort({ createdAt: -1 });

    if (!video || !video.shorts || video.shorts.length === 0) {
      // Fallback: look for most recent completed video with shorts
      video = await Video.findOne({
        status: "Completed",
        "shorts.0": { $exists: true }
      }).sort({ createdAt: -1 });
    }

    if (!video) {
      console.log(`[Scheduler ${slotName}] ℹ️ No completed video with shorts found.`);
      return { success: false, reason: "No video found" };
    }

    const short = (video.shorts || []).find((s, idx) => (s.factIndex === shortIdx || idx + 1 === shortIdx));
    if (!short) {
      console.log(`[Scheduler ${slotName}] ℹ️ Short #${shortIdx} not found in video '${video.title}'.`);
      return { success: false, reason: "Short not found" };
    }

    // Skip if upload disabled on whole video or on this specific short
    if (video.disableAutoUpload || short.disableAutoUpload) {
      console.log(`[Scheduler ${slotName}] 🚫 Auto-upload disabled for video '${video.title}' or Short #${shortIdx}. Skipping.`);
      return { success: true, skipped: true, reason: "Auto-upload disabled for this video/short" };
    }

    // Skip if already posted or manually uploaded
    if (short.isPosted || short.youtubeShortId || short.youtubeShortUrl) {
      console.log(`[Scheduler ${slotName}] ⏭️ Short #${shortIdx} for video '${video.title}' is ALREADY posted/uploaded. Skipping automatic upload.`);
      return { success: true, skipped: true, reason: "Short already posted or uploaded" };
    }

    console.log(`[Scheduler ${slotName}] Found Short #${shortIdx} ('${short.title}'). Dispatching to YouTube uploader...`);
    const dispatchResult = await dispatchShortToWebhook({ video, short, shortIdx });

    let ytId = "";
    if (dispatchResult.response) {
      const respObj = Array.isArray(dispatchResult.response) ? dispatchResult.response[0] : dispatchResult.response;
      ytId = respObj?.youtubeShortId || respObj?.uploadId || respObj?.id || "";
    }

    short.isPosted = true;
    short.postedAt = new Date();
    if (ytId) {
      short.youtubeShortId = ytId;
      short.youtubeShortUrl = `https://www.youtube.com/shorts/${ytId}`;
    }

    await video.save();

    if (shortIdx === 1) lastPublishExecutionTime.short1 = new Date();
    if (shortIdx === 2) lastPublishExecutionTime.short2 = new Date();
    if (shortIdx === 3) lastPublishExecutionTime.short3 = new Date();

    if (io) {
      io.emit("video_updated", video);
    }

    console.log(`[Scheduler ${slotName}] Short #${shortIdx} dispatched successfully. Result:`, dispatchResult.dispatched);
    return { success: true, videoId: video._id, shortIdx, dispatchResult };
  } catch (err) {
    console.error(`[Scheduler ${slotName}] Error publishing Short #${shortIdx}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Initialize all automated schedule cron tasks:
 * - 05:00 AM: Generate video & 3 shorts (no upload)
 * - 06:00 AM: Post full video to YouTube
 * - 09:00 AM: Post Short #1 to YouTube
 * - 02:00 PM (14:00): Post Short #2 to YouTube
 * - 06:00 PM (18:00): Post Short #3 to YouTube
 */
function initScheduler(app) {
  const isEnabled = process.env.AUTO_GENERATE_ENABLED !== "false";
  const timezone = process.env.SCHEDULE_TIMEZONE || "Asia/Kolkata";

  if (!isEnabled) {
    console.log("[Scheduler] ⏸️ Automated video generation and publishing is DISABLED (AUTO_GENERATE_ENABLED=false)");
    return;
  }

  // Clear any existing active tasks if re-initializing
  activeCronTasks.forEach(task => task.stop());
  activeCronTasks = [];

  const genCron = process.env.AUTO_GENERATE_CRON || "0 5 * * *"; // 5:00 AM daily
  const fullVideoCron = process.env.AUTO_PUBLISH_FULL_VIDEO_CRON || "0 6 * * *"; // 6:00 AM daily
  const short1Cron = process.env.AUTO_PUBLISH_SHORT_1_CRON || "0 9 * * *"; // 9:00 AM daily
  const short2Cron = process.env.AUTO_PUBLISH_SHORT_2_CRON || "0 14 * * *"; // 2:00 PM daily
  const short3Cron = process.env.AUTO_PUBLISH_SHORT_3_CRON || "0 18 * * *"; // 6:00 PM daily

  console.log(`[Scheduler] 🚀 Automated Daily Publishing Pipeline initialized! (Timezone: ${timezone})`);
  console.log(`  ▶ 05:00 AM (${genCron}) → Generate Video & 3 Shorts (No YouTube upload)`);
  console.log(`  ▶ 06:00 AM (${fullVideoCron}) → Post Full Video on YouTube`);
  console.log(`  ▶ 09:00 AM (${short1Cron}) → Post Short #1 on YouTube`);
  console.log(`  ▶ 02:00 PM (${short2Cron}) → Post Short #2 on YouTube`);
  console.log(`  ▶ 06:00 PM (${short3Cron}) → Post Short #3 on YouTube`);

  const io = app.get("io");

  // 1. 05:00 AM Video & Shorts Generation
  if (cron.validate(genCron)) {
    const taskGen = cron.schedule(genCron, async () => {
      console.log(`[Scheduler] 🔔 5:00 AM trigger fired! Generating video & 3 shorts...`);
      await triggerDailyGeneration(io, false);
    }, { timezone });
    activeCronTasks.push(taskGen);
  }

  // 2. 06:00 AM Full Video YouTube Publish
  if (cron.validate(fullVideoCron)) {
    const taskFull = cron.schedule(fullVideoCron, async () => {
      console.log(`[Scheduler] 🔔 6:00 AM trigger fired! Posting full video to YouTube...`);
      await publishDailyFullVideo(io);
    }, { timezone });
    activeCronTasks.push(taskFull);
  }

  // 3. 09:00 AM Short #1 YouTube Publish
  if (cron.validate(short1Cron)) {
    const taskShort1 = cron.schedule(short1Cron, async () => {
      console.log(`[Scheduler] 🔔 9:00 AM trigger fired! Posting Short #1 to YouTube...`);
      await publishDailyShort(io, 1);
    }, { timezone });
    activeCronTasks.push(taskShort1);
  }

  // 4. 02:00 PM (14:00) Short #2 YouTube Publish
  if (cron.validate(short2Cron)) {
    const taskShort2 = cron.schedule(short2Cron, async () => {
      console.log(`[Scheduler] 🔔 2:00 PM trigger fired! Posting Short #2 to YouTube...`);
      await publishDailyShort(io, 2);
    }, { timezone });
    activeCronTasks.push(taskShort2);
  }

  // 5. 06:00 PM (18:00) Short #3 YouTube Publish
  if (cron.validate(short3Cron)) {
    const taskShort3 = cron.schedule(short3Cron, async () => {
      console.log(`[Scheduler] 🔔 6:00 PM trigger fired! Posting Short #3 to YouTube...`);
      await publishDailyShort(io, 3);
    }, { timezone });
    activeCronTasks.push(taskShort3);
  }
}

function getSchedulerStatus() {
  const isEnabled = process.env.AUTO_GENERATE_ENABLED !== "false";
  const timezone = process.env.SCHEDULE_TIMEZONE || "Asia/Kolkata";

  return {
    enabled: isEnabled,
    timezone: timezone,
    schedules: {
      generation: { cron: process.env.AUTO_GENERATE_CRON || "0 5 * * *", time: "05:00 AM", lastRun: lastGenExecutionTime },
      fullVideoPublish: { cron: process.env.AUTO_PUBLISH_FULL_VIDEO_CRON || "0 6 * * *", time: "06:00 AM", lastRun: lastPublishExecutionTime.fullVideo },
      short1Publish: { cron: process.env.AUTO_PUBLISH_SHORT_1_CRON || "0 9 * * *", time: "09:00 AM", lastRun: lastPublishExecutionTime.short1 },
      short2Publish: { cron: process.env.AUTO_PUBLISH_SHORT_2_CRON || "0 14 * * *", time: "02:00 PM", lastRun: lastPublishExecutionTime.short2 },
      short3Publish: { cron: process.env.AUTO_PUBLISH_SHORT_3_CRON || "0 18 * * *", time: "06:00 PM", lastRun: lastPublishExecutionTime.short3 }
    },
    rotation: TOPIC_ROTATION.map((t) => t.videoType)
  };
}

module.exports = {
  initScheduler,
  triggerDailyGeneration,
  publishDailyFullVideo,
  publishDailyShort,
  getNextTopic,
  getSchedulerStatus
};
