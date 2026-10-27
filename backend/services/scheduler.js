const cron = require("node-cron");
const Video = require("../models/Video");
const videoQueue = require("./videoQueue");
const { dispatchFullVideoToWebhook, dispatchShortToWebhook } = require("./webhookDispatcher");

// Daily Telugu News Focus (NTV, TV9, Andhra Jyothy, V6 Velugu)
// Daily Dual Video Pipeline Configurations: Telugu News followed by English Trending News
const TOPIC_TELUGU = {
  videoType: "telugu_news",
  subject: "telugu news",
  language: "telugu",
  titlePrefix: "ఈరోజు టాప్ 10 తాజా వార్తలు (Telugu News Today)"
};

const TOPIC_ENGLISH = {
  videoType: "trending_news",
  subject: "trending news",
  language: "english",
  titlePrefix: "Top 10 Trending News Stories Today"
};

const TOPIC_ROTATION = [TOPIC_TELUGU, TOPIC_ENGLISH];

let lastGenExecutionTime = null;
let lastPublishExecutionTime = {
  fullVideo: null,
  short1: null,
  short2: null,
  short3: null
};

let activeCronTasks = [];

/**
 * Determine the next topic in the sequence.
 */
async function getNextTopic() {
  try {
    const lastVideo = await Video.findOne({ isAutomated: true }).sort({ createdAt: -1 });
    if (!lastVideo || !lastVideo.videoType) {
      return TOPIC_ROTATION[0];
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
 * Daily Telugu Video & 3 Shorts Generation.
 * Generates full video with top 10 Telugu news (NTV, TV9, Andhra Jyothy & V6 Velugu) without subtitles.
 */
async function triggerDailyTeluguGeneration(io, isManual = false) {
  const dateStr = new Date().toLocaleDateString("te-IN", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const videoTitle = `${TOPIC_TELUGU.titlePrefix} - ${dateStr}`;

  console.log(`[Scheduler] ⏰ Starting Daily Telugu News Generation: "${videoTitle}"`);

  try {
    const newVideo = new Video({
      title: videoTitle,
      subject: TOPIC_TELUGU.subject,
      language: TOPIC_TELUGU.language,
      status: "Pending",
      progress: 0,
      script: "",
      logs: `Auto-scheduled Daily Telugu news generation (NTV, TV9, Andhra Jyothy, V6 Velugu). Initializing pipeline...`,
      videoType: TOPIC_TELUGU.videoType,
      customPrompt: "సెలెక్ట్ చేసిన 4 న్యూస్ ఫీడ్స్ (NTV, TV9, ఆంధ్రజ్యోతి, V6 వెలుగు) నుంచి టాప్ 10 ముఖ్యమైన తాజా వార్తలతో తెలుగులో స్క్రిప్ట్ రాయండి. మొదటి 3 వార్తలు షార్ట్స్ కొరకు ఉపయోగించబడతాయి.",
      useMusic: true,
      useSubtitles: false, // Strict requirement: no subtitles for Telugu video
      generateShorts: true,
      factsCount: 10,
      isAutomated: true
    });

    await newVideo.save();
    lastGenExecutionTime = new Date();

    await videoQueue.startJob(newVideo, io).catch((err) => {
      console.error("[Scheduler] Error running Telugu video job:", err);
    });

    return {
      success: true,
      videoId: newVideo._id,
      title: videoTitle,
      videoType: TOPIC_TELUGU.videoType,
      language: "telugu"
    };
  } catch (err) {
    console.error("[Scheduler] Failed to create Telugu video record:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Daily English Video & 3 Shorts Generation.
 * Generates full video with top 10 global/national trending news with subtitles.
 * Runs automatically after Telugu video finishes.
 */
async function triggerDailyEnglishGeneration(io, isManual = false) {
  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const videoTitle = `${TOPIC_ENGLISH.titlePrefix} - ${dateStr}`;

  console.log(`[Scheduler] 🎬 Starting Daily English News Generation: "${videoTitle}"`);

  try {
    const newVideo = new Video({
      title: videoTitle,
      subject: TOPIC_ENGLISH.subject,
      language: TOPIC_ENGLISH.language,
      status: "Pending",
      progress: 0,
      script: "",
      logs: `Auto-scheduled Daily English trending news generation. Initializing pipeline...`,
      videoType: TOPIC_ENGLISH.videoType,
      customPrompt: "Select the top 10 most trending news stories with maximum viral hook, high curiosity, and massive public interest. The first 3 stories will be converted into dedicated shorts.",
      useMusic: true,
      useSubtitles: true, // Subtitles enabled for English
      generateShorts: true,
      factsCount: 10,
      isAutomated: true
    });

    await newVideo.save();

    await videoQueue.startJob(newVideo, io).catch((err) => {
      console.error("[Scheduler] Error running English video job:", err);
    });

    return {
      success: true,
      videoId: newVideo._id,
      title: videoTitle,
      videoType: TOPIC_ENGLISH.videoType,
      language: "english"
    };
  } catch (err) {
    console.error("[Scheduler] Failed to create English video record:", err);
    return { success: false, error: err.message };
  }
}

/**
 * 04:00 AM Daily Generation Pipeline:
 * Starts the Telugu video generation first.
 * Upon Telugu video completion, VideoQueue automatically starts the English video generation.
 * Both videos upload automatically to YouTube when complete.
 */
async function triggerDailyGeneration(io, isManual = false) {
  console.log(`[Scheduler] 🚀 Auto-triggering Daily News Pipeline (Telugu first, followed by English)...`);
  return await triggerDailyTeluguGeneration(io, isManual);
}


/**
 * 06:00 AM: Publish Today's Full Videos to YouTube.
 * Iterates through all completed videos from today (Telugu & English) and dispatches any unposted full videos.
 */
async function publishDailyFullVideo(io) {
  console.log("[Scheduler] ⏰ 6:00 AM trigger fired! Publishing today's full videos to YouTube...");
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Find all today's completed videos that haven't been posted yet
    let pendingVideos = await Video.find({
      status: "Completed",
      createdAt: { $gte: todayStart },
      disableAutoUpload: { $ne: true },
      isPosted: { $ne: true },
      isUploading: { $ne: true },
      $or: [{ youtubeVideoId: "" }, { youtubeVideoId: null }, { youtubeVideoId: { $exists: false } }],
      $and: [{ $or: [{ youtubeUrl: "" }, { youtubeUrl: null }, { youtubeUrl: { $exists: false } }] }]
    }).sort({ createdAt: 1 });

    if (pendingVideos.length === 0) {
      // Fallback: look for most recent unposted completed video
      const fallback = await Video.findOne({
        status: "Completed",
        disableAutoUpload: { $ne: true },
        isPosted: { $ne: true },
        isUploading: { $ne: true },
        $or: [{ youtubeVideoId: "" }, { youtubeVideoId: null }, { youtubeVideoId: { $exists: false } }],
        $and: [{ $or: [{ youtubeUrl: "" }, { youtubeUrl: null }, { youtubeUrl: { $exists: false } }] }]
      }).sort({ createdAt: -1 });

      if (fallback) {
        pendingVideos = [fallback];
      }
    }

    if (pendingVideos.length === 0) {
      console.log("[Scheduler 6:00 AM] ℹ️ No unposted completed video found for YouTube upload. All videos are posted or currently uploading.");
      return { success: true, skipped: true, reason: "All completed videos are already posted or uploading" };
    }

    const results = [];
    for (const video of pendingVideos) {
      console.log(`[Scheduler 6:00 AM] Found pending video '${video.title}' (${video._id}). Locking and dispatching to YouTube uploader...`);
      video.isUploading = true;
      video.uploadStartedAt = new Date();
      await video.save();

      const dispatchResult = await dispatchFullVideoToWebhook(video);

      if (!dispatchResult.dispatched && !dispatchResult.timeout) {
        video.isUploading = false;
        await video.save();
        const errReason = dispatchResult.error || dispatchResult.reason || "Dispatch failed";
        console.warn(`[Scheduler 6:00 AM] Dispatch failed for video '${video.title}': ${errReason}`);
        results.push({ videoId: video._id, success: false, reason: errReason });
        continue;
      }

      let ytId = "";
      if (dispatchResult.response) {
        const respObj = Array.isArray(dispatchResult.response) ? dispatchResult.response[0] : dispatchResult.response;
        ytId = respObj?.youtubeVideoId || respObj?.uploadId || respObj?.id || "";
      }

      video.isUploading = false;
      if (ytId) {
        video.isPosted = true;
        video.postedAt = new Date();
        video.youtubeVideoId = ytId;
        video.youtubeUrl = `https://www.youtube.com/watch?v=${ytId}`;
      }
      await video.save();

      if (io) {
        io.emit("video_updated", video);
        io.emit("job_update", video);
      }

      results.push({ videoId: video._id, success: true, dispatchResult });
    }

    lastPublishExecutionTime.fullVideo = new Date();
    return { success: true, results };
  } catch (err) {
    console.error("[Scheduler 6:00 AM] Error publishing full video:", err);
    return { success: false, error: err.message };
  }
}

/**
 * 09:00 AM, 02:00 PM (14:00), 06:00 PM (18:00): Publish Individual Short to YouTube.
 * Skips automatically if the short was already manually or previously posted.
 * Supports multiple daily videos (Telugu & English) by checking all candidate videos from today.
 * @param {Object} io - Socket.io instance
 * @param {number} shortIdx - 1, 2, or 3
 */
async function publishDailyShort(io, shortIdx) {
  const slotName = shortIdx === 1 ? "9:00 AM (Short #1)" : (shortIdx === 2 ? "2:00 PM (Short #2)" : "6:00 PM (Short #3)");
  console.log(`[Scheduler] ⏰ ${slotName} trigger fired! Publishing Short #${shortIdx} to YouTube...`);

  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Look for today's completed videos with shorts (Telugu first, then English)
    let candidateVideos = await Video.find({
      status: "Completed",
      createdAt: { $gte: todayStart },
      "shorts.0": { $exists: true }
    }).sort({ createdAt: 1 });

    if (candidateVideos.length === 0) {
      // Fallback: look for most recent completed video with shorts
      const fallback = await Video.findOne({
        status: "Completed",
        "shorts.0": { $exists: true }
      }).sort({ createdAt: -1 });
      if (fallback) candidateVideos = [fallback];
    }

    if (candidateVideos.length === 0) {
      console.log(`[Scheduler ${slotName}] ℹ️ No completed video with shorts found.`);
      return { success: false, reason: "No video found" };
    }

    const results = [];
    for (const video of candidateVideos) {
      const short = (video.shorts || []).find((s, idx) => (s.factIndex === shortIdx || idx + 1 === shortIdx));
      if (!short) {
        continue;
      }

      // Skip if upload disabled on whole video or on this specific short
      if (video.disableAutoUpload || short.disableAutoUpload) {
        console.log(`[Scheduler ${slotName}] 🚫 Auto-upload disabled for video '${video.title}' or Short #${shortIdx}. Skipping.`);
        continue;
      }

      // Skip if already posted or manually uploaded
      if (short.isPosted || short.youtubeShortId || short.youtubeShortUrl) {
        console.log(`[Scheduler ${slotName}] ⏭️ Short #${shortIdx} for video '${video.title}' is ALREADY posted/uploaded. Skipping.`);
        continue;
      }

      // Skip if currently uploading
      const isUploadingStale = short.uploadStartedAt && (Date.now() - new Date(short.uploadStartedAt).getTime() > 15 * 60 * 1000);
      if (short.isUploading && !isUploadingStale) {
        console.log(`[Scheduler ${slotName}] ⏳ Short #${shortIdx} for video '${video.title}' is currently uploading. Skipping.`);
        continue;
      }

      console.log(`[Scheduler ${slotName}] Found Short #${shortIdx} ('${short.title}') for video '${video.title}'. Locking and dispatching to YouTube uploader...`);
      short.isUploading = true;
      short.uploadStartedAt = new Date();
      await video.save();

      const dispatchResult = await dispatchShortToWebhook({ video, short, shortIdx });

      if (!dispatchResult.dispatched && !dispatchResult.timeout) {
        short.isUploading = false;
        await video.save();
        const errReason = dispatchResult.error || dispatchResult.reason || "Dispatch failed";
        console.warn(`[Scheduler ${slotName}] Dispatch failed for Short #${shortIdx} (${video.title}): ${errReason}`);
        results.push({ videoId: video._id, shortIdx, success: false, reason: errReason });
        continue;
      }

      let ytId = "";
      if (dispatchResult.response) {
        const respObj = Array.isArray(dispatchResult.response) ? dispatchResult.response[0] : dispatchResult.response;
        ytId = respObj?.youtubeShortId || respObj?.uploadId || respObj?.id || "";
      }

      short.isUploading = false;
      // Only mark posted if real YouTube ID returned
      if (ytId) {
        short.isPosted = true;
        short.postedAt = new Date();
        short.youtubeShortId = ytId;
        short.youtubeShortUrl = `https://www.youtube.com/shorts/${ytId}`;
      }
      await video.save();

      if (io) {
        io.emit("video_updated", video);
      }

      console.log(`[Scheduler ${slotName}] Short #${shortIdx} for '${video.title}' dispatched successfully. Result:`, dispatchResult.dispatched);
      results.push({ videoId: video._id, shortIdx, success: true, dispatchResult });
    }

    if (shortIdx === 1) lastPublishExecutionTime.short1 = new Date();
    if (shortIdx === 2) lastPublishExecutionTime.short2 = new Date();
    if (shortIdx === 3) lastPublishExecutionTime.short3 = new Date();

    return { success: true, results };
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

  const genCron = process.env.AUTO_GENERATE_CRON || "0 4 * * *"; // 4:00 AM daily
  const fullVideoCron = process.env.AUTO_PUBLISH_FULL_VIDEO_CRON || "30 5 * * *"; // 5:30 AM daily
  const short1Cron = process.env.AUTO_PUBLISH_SHORT_1_CRON || "0 9 * * *"; // 9:00 AM daily
  const short2Cron = process.env.AUTO_PUBLISH_SHORT_2_CRON || "0 14 * * *"; // 2:00 PM daily
  const short3Cron = process.env.AUTO_PUBLISH_SHORT_3_CRON || "0 18 * * *"; // 6:00 PM daily

  console.log(`[Scheduler] 🚀 Automated Daily Telugu Publishing Pipeline initialized! (Timezone: ${timezone})`);
  console.log(`  ▶ 04:00 AM (${genCron}) → Generate Daily Telugu Video & 3 Shorts (No Subtitles)`);
  console.log(`  ▶ 05:30 AM (${fullVideoCron}) → Post Full Telugu Video on YouTube`);
  console.log(`  ▶ 09:00 AM (${short1Cron}) → Post Short #1 on YouTube`);
  console.log(`  ▶ 02:00 PM (${short2Cron}) → Post Short #2 on YouTube`);
  console.log(`  ▶ 06:00 PM (${short3Cron}) → Post Short #3 on YouTube`);

  const io = app.get("io");

  // 1. 04:00 AM Video & Shorts Generation
  if (cron.validate(genCron)) {
    const taskGen = cron.schedule(genCron, async () => {
      console.log(`[Scheduler] 🔔 4:00 AM trigger fired! Generating daily Telugu video & 3 shorts...`);
      await triggerDailyGeneration(io, false);
    }, { timezone });
    activeCronTasks.push(taskGen);
  }

  // 2. 05:30 AM Full Video YouTube Publish
  if (cron.validate(fullVideoCron)) {
    const taskFull = cron.schedule(fullVideoCron, async () => {
      console.log(`[Scheduler] 🔔 5:30 AM trigger fired! Posting full Telugu video to YouTube...`);
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
      generation: { cron: process.env.AUTO_GENERATE_CRON || "0 4 * * *", time: "04:00 AM", lastRun: lastGenExecutionTime },
      fullVideoPublish: { cron: process.env.AUTO_PUBLISH_FULL_VIDEO_CRON || "30 5 * * *", time: "05:30 AM", lastRun: lastPublishExecutionTime.fullVideo },
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
  triggerDailyTeluguGeneration,
  triggerDailyEnglishGeneration,
  publishDailyFullVideo,
  publishDailyShort,
  getNextTopic,
  getSchedulerStatus
};
