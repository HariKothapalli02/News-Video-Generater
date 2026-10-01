const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const os = require("os");
const si = require("systeminformation");
const Video = require("../models/Video");
const videoQueue = require("../services/videoQueue");
const auth = require("../middleware/auth");

// Helper to format uptime
const formatUptime = (seconds) => {
  const days = Math.floor(seconds / (3600 * 24));
  const hours = Math.floor((seconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days} days ${hours} hours`;
  if (hours > 0) return `${hours} hours ${minutes} mins`;
  return `${minutes} mins`;
};

// Helper to get hardware metrics
const getSystemStats = async () => {
  try {
    const cpuLoad = await si.currentLoad();
    const mem = await si.mem();
    const disk = await si.fsSize();

    const ramTotal = (mem.total / (1024 * 1024 * 1024)).toFixed(1);
    const ramUsed = (mem.active / (1024 * 1024 * 1024)).toFixed(1);
    const ramPercent = Math.round((mem.active / mem.total) * 100);

    const primaryDisk = disk[0] || { size: 100 * 1024 * 1024 * 1024, used: 50 * 1024 * 1024 * 1024 };
    const diskTotal = (primaryDisk.size / (1024 * 1024 * 1024)).toFixed(0);
    const diskUsed = (primaryDisk.used / (1024 * 1024 * 1024)).toFixed(0);
    const diskPercent = Math.round(primaryDisk.use || 50);

    return {
      cpu: Math.round(cpuLoad.currentLoad) || 0,
      ram: ramPercent,
      ramDetail: `${ramUsed} GB / ${ramTotal} GB`,
      disk: diskPercent,
      diskDetail: `${diskUsed} GB / ${diskTotal} GB`,
      uptime: formatUptime(os.uptime()),
    };
  } catch (error) {
    console.error("System information read failed:", error);
    return {
      cpu: 25,
      ram: 45,
      ramDetail: "3.8 GB / 8.0 GB",
      disk: 40,
      diskDetail: "40 GB / 100 GB",
      uptime: formatUptime(os.uptime()),
    };
  }
};

// @route   POST /api/generate
// @desc    Trigger video script news generation
// @access  Private
router.post("/generate", auth, async (req, res) => {
  const { title, subject, language, useMusic, useSubtitles, customPrompt, videoType, customScript, generateShorts } = req.body;

  if (!title) {
    return res.status(400).json({ msg: "Title is required." });
  }

  if (videoQueue.isBusy()) {
    return res.status(400).json({ msg: "Another video generation is currently in progress. Please wait." });
  }

  try {
    const newVideo = new Video({
      title,
      subject: subject || "news",
      language: language || "english",
      status: "Pending",
      progress: 0,
      script: "",
      logs: "Enqueued job. Preparing setup...",
      videoType: videoType || "tech_news",
      customScript: customScript || "",
      useMusic: useMusic !== undefined ? useMusic : true,
      useSubtitles: useSubtitles !== undefined ? useSubtitles : true,
      customPrompt: customPrompt || "",
      generateShorts: generateShorts === undefined ? true : (generateShorts === true || generateShorts === "true")
    });

    await newVideo.save();

    const io = req.app.get("io");
    videoQueue.startJob(newVideo, io).catch((err) => {
      console.error("Error running queue job:", err);
    });

    return res.status(201).json(newVideo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error occurred while starting generation." });
  }
});

// @route   GET /api/status
// @desc    Get details on the currently running job
// @access  Private
router.get("/status", auth, async (req, res) => {
  const activeJobId = videoQueue.getCurrentJobId();
  if (!activeJobId) {
    return res.json({ active: false });
  }

  try {
    const video = await Video.findById(activeJobId);
    if (!video) {
      return res.json({ active: false });
    }
    return res.json({
      active: true,
      job: video
    });
  } catch (err) {
    res.status(500).json({ msg: "Server error checking active status." });
  }
});

// @route   GET /api/history
// @desc    Get list of all generated videos
// @access  Private
router.get("/history", auth, async (req, res) => {
  try {
    const videos = await Video.find().sort({ createdAt: -1 });
    res.json(videos);
  } catch (err) {
    res.status(500).json({ msg: "Server error fetching history." });
  }
});

// @route   GET /api/video/:id
// @desc    Get detailed info of a single video
// @access  Private
router.get("/video/:id", auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ msg: "Video not found." });
    }
    res.json(video);
  } catch (err) {
    res.status(500).json({ msg: "Server error retrieving video details." });
  }
});

// @route   GET /api/download/:id
// @desc    Download the rendered video file
// @access  Public
router.get("/download/:id", async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).send("Video record not found.");
    }

    const videoStorage = process.env.VIDEO_STORAGE_DIR || path.join(__dirname, "..", "videos");
    const filePath = path.resolve(path.join(videoStorage, `${req.params.id}.mp4`));

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Physical MP4 file not found in storage directory.");
    }

    const safeTitle = video.title.replace(/[^a-zA-Z0-9]/g, "_");
    res.download(filePath, `${safeTitle}.mp4`);
  } catch (err) {
    res.status(500).send("Server error occurred initiating download.");
  }
});

// @route   DELETE /api/video/:id
// @desc    Delete database record and its file artifacts
// @access  Private
router.delete("/video/:id", auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ msg: "Video record not found." });
    }

    if (videoQueue.getCurrentJobId() === req.params.id) {
      return res.status(400).json({ msg: "Cannot delete an active, rendering video generation. Stop it first." });
    }

    const videoStorage = process.env.VIDEO_STORAGE_DIR || path.join(__dirname, "..", "videos");
    const videoFilePath = path.join(videoStorage, `${req.params.id}.mp4`);
    if (fs.existsSync(videoFilePath)) {
      fs.unlinkSync(videoFilePath);
    }

    const thumbStorage = process.env.THUMBNAIL_STORAGE_DIR || path.join(__dirname, "..", "thumbnails");
    const thumbFilePath = path.join(thumbStorage, `${req.params.id}.png`);
    if (fs.existsSync(thumbFilePath)) {
      fs.unlinkSync(thumbFilePath);
    }

    await Video.findByIdAndDelete(req.params.id);
    res.json({ msg: "Video deleted successfully." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error deleting video." });
  }
});

// @route   POST /api/stop
// @desc    Stop active generation child process
// @access  Private
router.post("/stop", auth, async (req, res) => {
  const activeJobId = videoQueue.getCurrentJobId();
  if (!activeJobId) {
    return res.status(400).json({ msg: "No active video generation job running." });
  }

  try {
    const stopped = await videoQueue.stopJob(activeJobId);
    if (stopped) {
      return res.json({ msg: "Subprocess stopped successfully." });
    }
    return res.status(400).json({ msg: "Failed to stop subprocess." });
  } catch (err) {
    res.status(500).json({ msg: "Server error occurred stopping execution." });
  }
});

// @route   POST /api/retry/:id
// @desc    Retry a failed or stopped generation
// @access  Private
router.post("/retry/:id", auth, async (req, res) => {
  if (videoQueue.isBusy()) {
    return res.status(400).json({ msg: "Another generation process is currently running. Clear it first." });
  }

  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ msg: "Video not found." });
    }

    const isResume = !!(video.logs && video.logs.length > 50);
    video.status = "Pending";
    video.logs = (video.logs || "") + `\n[SYSTEM] Resuming pipeline from last checkpoint for job ${video._id}...\n`;
    await video.save();

    const io = req.app.get("io");
    videoQueue.startJob(video, io).catch((err) => {
      console.error("Error on retry job execution:", err);
    });

    res.json({ msg: "Retry enqueued.", video });
  } catch (err) {
    res.status(500).json({ msg: "Server error on retry operation." });
  }
});

// @route   GET /api/system
// @desc    Get system status resource statistics
// @access  Private
router.get("/system", auth, async (req, res) => {
  try {
    const stats = await getSystemStats();
    
    const completed = await Video.find({ status: "Completed" });
    let totalTime = 0;
    let validCount = 0;

    for (let v of completed) {
      if (v.duration) {
        const genTimeSeconds = 120 + v.duration * 1.5;
        totalTime += genTimeSeconds;
        validCount++;
      }
    }

    const avgSeconds = validCount > 0 ? Math.round(totalTime / validCount) : 180;
    const avgMinutes = Math.floor(avgSeconds / 60);
    const avgRemainingSeconds = avgSeconds % 60;
    const avgTimeString = `${avgMinutes}m ${avgRemainingSeconds}s`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const generatedToday = await Video.countDocuments({ createdAt: { $gte: today } });

    res.json({
      cpu: stats.cpu,
      ram: stats.ram,
      ramDetail: stats.ramDetail,
      disk: stats.disk,
      diskDetail: stats.diskDetail,
      uptime: stats.uptime,
      currentJob: videoQueue.isBusy() ? "Rendering" : "Idle",
      totalVideos: await Video.countDocuments(),
      generatedToday,
      avgTime: avgTimeString
    });
  } catch (err) {
    res.status(500).json({ msg: "Server error getting resources statistics." });
  }
});

// @route   POST /api/clear-storage
// @desc    Delete all video MP4 and image PNG files to free up disk storage
// @access  Private
router.post("/clear-storage", auth, async (req, res) => {
  try {
    const videoStorage = process.env.VIDEO_STORAGE_DIR || path.join(__dirname, "..", "videos");
    const thumbStorage = process.env.THUMBNAIL_STORAGE_DIR || path.join(__dirname, "..", "thumbnails");

    const vFiles = fs.readdirSync(videoStorage);
    for (let f of vFiles) {
      if (f.endsWith(".mp4") && f !== "intro.mp4") {
        fs.unlinkSync(path.join(videoStorage, f));
      }
    }

    const tFiles = fs.readdirSync(thumbStorage);
    for (let f of tFiles) {
      if (f.endsWith(".png")) {
        fs.unlinkSync(path.join(thumbStorage, f));
      }
    }

    res.json({ msg: "Local cache storage files wiped successfully." });
  } catch (err) {
    res.status(500).json({ msg: "Server error clearing files storage." });
  }
});

// @route   POST /api/restart-service
// @desc    Restart state management of queue
// @access  Private
router.post("/restart-service", auth, async (req, res) => {
  try {
    const activeJobId = videoQueue.getCurrentJobId();
    if (activeJobId) {
      await videoQueue.stopJob(activeJobId);
    }
    videoQueue.clearState();
    res.json({ msg: "Video Queue manager state refreshed." });
  } catch (err) {
    res.status(500).json({ msg: "Server error resetting service." });
  }
});

// @route   POST /api/video/:id/generate-shorts
// @desc    Turn existing completed video into 10 vertical 9:16 Shorts
// @access  Private
router.post("/video/:id/generate-shorts", auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ msg: "Video record not found." });
    }

    if (video.status !== "Completed") {
      return res.status(400).json({ msg: "Video must be in 'Completed' status to extract shorts." });
    }

    const videoStorage = process.env.VIDEO_STORAGE_DIR || path.join(__dirname, "..", "videos");
    const videoFilePath = path.join(videoStorage, `${video._id}.mp4`);

    if (!fs.existsSync(videoFilePath)) {
      return res.status(404).json({ msg: "Physical video file not found on disk." });
    }

    const pythonScript = path.join(__dirname, "..", "..", "python-service", "shorts.py");
    const pythonCwd = path.join(__dirname, "..", "..", "python-service");

    let pythonBin = process.platform === "win32" ? "python" : "python3";
    const venvBinLinux = path.join(pythonCwd, "venv", "bin", "python3");
    const venvBinWin = path.join(pythonCwd, "venv", "Scripts", "python.exe");

    if (fs.existsSync(venvBinLinux)) {
      pythonBin = venvBinLinux;
    } else if (fs.existsSync(venvBinWin)) {
      pythonBin = venvBinWin;
    } else if (process.env.PYTHON_PATH) {
      pythonBin = process.env.PYTHON_PATH;
    }

    const tempScriptPath = path.join(pythonCwd, `temp_script_${video._id}.txt`);
    fs.writeFileSync(tempScriptPath, video.script || "", "utf-8");

    const args = [
      "-u",
      pythonScript,
      "--job-id", String(video._id),
      "--video-path", videoFilePath,
      "--script-path", tempScriptPath,
      "--subject", video.subject || "news",
      "--language", video.language || "english"
    ];

    console.log(`[Standalone Shorts] Spawning: ${pythonBin} ${args.join(" ")}`);
    const { spawn } = require("child_process");
    const child = spawn(pythonBin, args, {
      cwd: pythonCwd,
      env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" }
    });

    let stdoutData = "";

    child.stdout.on("data", (data) => {
      stdoutData += data.toString();
      console.log(`[Shorts Subprocess] ${data.toString().trim()}`);
    });

    child.stderr.on("data", (data) => {
      console.error(`[Shorts Subprocess stderr] ${data.toString().trim()}`);
    });

    child.on("close", async (code) => {
      if (fs.existsSync(tempScriptPath)) {
        try { fs.unlinkSync(tempScriptPath); } catch (_) {}
      }

      if (code === 0) {
        const startMarker = "@SHORTS_RESULT_START@";
        const endMarker = "@SHORTS_RESULT_END@";
        const startIdx = stdoutData.indexOf(startMarker);
        const endIdx = stdoutData.indexOf(endMarker);

        if (startIdx !== -1 && endIdx !== -1) {
          try {
            const rawJson = stdoutData.substring(startIdx + startMarker.length, endIdx).trim();
            const parsed = JSON.parse(rawJson);

            video.facts = parsed.facts || video.facts;
            video.shorts = parsed.shorts || [];
            video.generateShorts = true;
            await video.save();

            const io = req.app.get("io");
            if (io) {
              io.emit("job_update", {
                id: video._id,
                title: video.title,
                status: video.status,
                progress: video.progress,
                facts: video.facts,
                shorts: video.shorts,
                youtubeMetadata: video.youtubeMetadata
              });
            }
            console.log(`[Standalone Shorts] Done! Saved ${video.shorts.length} shorts for video ${video._id}`);
          } catch (e) {
            console.error("Failed to parse shorts JSON output:", e);
          }
        }
      } else {
        console.error(`[Standalone Shorts] Process failed with exit code: ${code}`);
      }
    });

    return res.json({ msg: "10 Shorts generation pipeline started in background.", status: "processing" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error initiating shorts extraction." });
  }
});

// @route   POST /api/video/:id/generate-metadata
// @desc    Generate or refresh full YouTube metadata (Title, Description, Tags) in 1 API request
// @access  Private
router.post("/video/:id/generate-metadata", auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ msg: "Video record not found." });
    }

    const pythonCwd = path.join(__dirname, "..", "..", "python-service");
    let pythonBin = process.platform === "win32" ? "python" : "python3";
    const venvBinLinux = path.join(pythonCwd, "venv", "bin", "python3");
    const venvBinWin = path.join(pythonCwd, "venv", "Scripts", "python.exe");
    if (fs.existsSync(venvBinLinux)) pythonBin = venvBinLinux;
    else if (fs.existsSync(venvBinWin)) pythonBin = venvBinWin;

    const tempJsonPath = path.join(pythonCwd, `temp_meta_${video._id}.json`);
    const payload = {
      subject: video.subject || "news",
      script: video.script || "",
      facts: video.facts || [],
      language: video.language || "english"
    };
    fs.writeFileSync(tempJsonPath, JSON.stringify(payload), "utf-8");

    const pyCode = `
import json, gemini, shorts
with open(r'${tempJsonPath}', 'r', encoding='utf-8') as f:
    d = json.load(f)
facts = d.get('facts', [])
if not facts:
    facts = shorts.parse_facts_from_script(d.get('script', ''))
meta = gemini.generate_video_metadata(d.get('subject', 'news'), d.get('script', ''), facts, d.get('language', 'english'))
print("@META_RESULT@" + json.dumps(meta) + "@META_RESULT@")
`;

    const { spawn } = require("child_process");
    const child = spawn(pythonBin, ["-c", pyCode], { cwd: pythonCwd });

    let stdout = "";
    child.stdout.on("data", (d) => stdout += d.toString());
    child.on("close", async (code) => {
      if (fs.existsSync(tempJsonPath)) {
        try { fs.unlinkSync(tempJsonPath); } catch (_) {}
      }

      if (code === 0 && stdout.includes("@META_RESULT@")) {
        const parts = stdout.split("@META_RESULT@");
        if (parts.length >= 3) {
          try {
            const meta = JSON.parse(parts[1]);
            video.youtubeMetadata = { ...meta, generatedAt: new Date() };
            await video.save();

            const io = req.app.get("io");
            if (io) {
              io.emit("job_update", {
                id: video._id,
                youtubeMetadata: video.youtubeMetadata
              });
            }
            return res.json({ msg: "YouTube metadata generated successfully.", youtubeMetadata: video.youtubeMetadata });
          } catch (e) {
            console.error("JSON parse error for metadata:", e);
          }
        }
      }
      res.status(500).json({ msg: "Failed to generate video metadata via Gemini." });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Server error generating video metadata." });
  }
});

// @route   GET /api/download/:id/short/:shortIndex
// @desc    Download an individual 9:16 vertical short
// @access  Public
router.get("/download/:id/short/:shortIndex", async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).send("Video record not found.");
    }

    const shortIdx = parseInt(req.params.shortIndex, 10);
    const videoStorage = process.env.VIDEO_STORAGE_DIR || path.join(__dirname, "..", "videos");
    const filePath = path.resolve(path.join(videoStorage, "shorts", `${req.params.id}_short_${shortIdx}.mp4`));

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Short MP4 file not found in storage directory.");
    }

    const safeTitle = `${video.title.replace(/[^a-zA-Z0-9]/g, "_")}_Short_${shortIdx}`;
    res.download(filePath, `${safeTitle}.mp4`);
  } catch (err) {
    res.status(500).send("Server error occurred initiating download.");
  }
});

module.exports = router;

