const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const Video = require("../models/Video");

class VideoQueue {
  constructor() {
    this.currentJobId = null;
    this.childProcess = null;
    this.io = null;
    this.logsBuffer = "";
  }

  isBusy() {
    return this.currentJobId !== null;
  }

  getCurrentJobId() {
    return this.currentJobId;
  }

  setIo(io) {
    this.io = io;
  }

  async startJob(videoDoc, io) {
    if (this.isBusy()) {
      throw new Error("Another generation process is currently running.");
    }

    if (io) this.setIo(io);

    const jobId = videoDoc._id.toString();
    this.currentJobId = jobId;
    this.logsBuffer = `[SYSTEM] Starting job: ${videoDoc.title}\n[SYSTEM] Subject: ${videoDoc.subject}\n[SYSTEM] Language: ${videoDoc.language}\n`;

    // Update database status
    videoDoc.status = "Pending";
    videoDoc.progress = 0;
    videoDoc.logs = this.logsBuffer;
    await videoDoc.save();
    this.broadcastUpdate(videoDoc);

    const pythonScript = path.join(__dirname, "..", "..", "python-service", "main.py");
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

    const args = [
      pythonScript,
      "--job-id", jobId,
      "--subject", videoDoc.subject,
      "--language", videoDoc.language,
      "--use-music", videoDoc.useMusic !== undefined ? String(videoDoc.useMusic) : "true",
      "--use-subtitles", videoDoc.useSubtitles !== undefined ? String(videoDoc.useSubtitles) : "true",
      "--custom-prompt", videoDoc.customPrompt || "",
      "--video-type", videoDoc.videoType || "tech_news"
    ];

    if (videoDoc.videoType === "specific_content" && videoDoc.customScript) {
      args.push("--custom-script", videoDoc.customScript);
    }

    console.log(`Spawning Python process: ${pythonBin} ${args.join(" ")} in ${pythonCwd}`);
    this.childProcess = spawn(pythonBin, args, {
      cwd: pythonCwd,
      env: { ...process.env, PYTHONWARNINGS: "ignore" }
    });

    this.childProcess.stdout.on("data", (data) => {
      this.handleProcessOutput(data.toString(), videoDoc);
    });

    this.childProcess.stderr.on("data", (data) => {
      this.handleProcessOutput(data.toString(), videoDoc, true);
    });

    this.childProcess.on("close", async (code) => {
      console.log(`Python process exited with code ${code}`);
      
      const latestDoc = await Video.findById(jobId);
      if (!latestDoc) {
        this.clearState();
        return;
      }

      if (latestDoc.status === "Stopped") {
        latestDoc.progress = 0;
        this.logsBuffer += `\n[SYSTEM] Job was stopped by user.`;
        latestDoc.logs = this.logsBuffer;
        await latestDoc.save();
        this.broadcastUpdate(latestDoc);
      } else if (code === 0 && latestDoc.status === "Completed") {
        latestDoc.progress = 100;
        latestDoc.videoPath = `/videos/${jobId}.mp4`;
        latestDoc.thumbnail = `/thumbnails/${jobId}.png`;
        this.logsBuffer += `\n[SYSTEM] Job completed successfully.`;
        latestDoc.logs = this.logsBuffer;
        await latestDoc.save();
        this.broadcastUpdate(latestDoc);
      } else {
        latestDoc.status = "Failed";
        latestDoc.progress = 0;
        this.logsBuffer += `\n[SYSTEM] Process exited with error code: ${code}`;
        latestDoc.logs = this.logsBuffer;
        await latestDoc.save();
        this.broadcastUpdate(latestDoc);
      }

      this.clearState();
    });
  }

  async handleProcessOutput(data, videoDoc, isStderr = false) {
    const lines = data.split(/\r?\n/);
    let docChanged = false;

    for (let line of lines) {
      if (!line) continue;

      if (isStderr) {
        if (line.includes("FutureWarning") || line.includes("UserWarning") || line.includes("DeprecationWarning") || line.includes("warnings.warn")) {
          continue;
        }
        console.error(`[Python stderr] ${line}`);
        this.logsBuffer += `[PYTHON STDERR] ${line}\n`;
        docChanged = true;
        continue;
      }

      console.log(`[Python stdout] ${line}`);

      if (line.startsWith("@STATUS:")) {
        const newStatus = line.replace("@STATUS:", "").trim();
        videoDoc.status = newStatus;
        docChanged = true;
      } else if (line.startsWith("@PROGRESS:")) {
        const newProgress = parseInt(line.replace("@PROGRESS:", "").trim(), 10);
        if (!isNaN(newProgress)) {
          videoDoc.progress = newProgress;
          docChanged = true;
        }
      } else if (line.startsWith("@SCRIPT:")) {
        const scriptLog = line.replace("@SCRIPT:", "").trim();
        const scriptText = scriptLog.replace(/\\n/g, "\n");
        videoDoc.script = scriptText;
        docChanged = true;
      } else if (line.startsWith("@DURATION:")) {
        const duration = parseFloat(line.replace("@DURATION:", "").trim());
        if (!isNaN(duration)) {
          videoDoc.duration = Math.round(duration);
          docChanged = true;
        }
      } else if (line.startsWith("@ERROR:")) {
        const errorMsg = line.replace("@ERROR:", "").trim();
        this.logsBuffer += `[PYTHON ERROR] ${errorMsg}\n`;
        docChanged = true;
      } else if (line.startsWith("[LOG]")) {
        const cleanLog = line.replace("[LOG]", "").trim();
        this.logsBuffer += `${cleanLog}\n`;
        docChanged = true;
      } else {
        this.logsBuffer += `${line}\n`;
        docChanged = true;
      }
    }

    if (docChanged) {
      videoDoc.logs = this.logsBuffer;
      await Video.updateOne(
        { _id: videoDoc._id },
        {
          status: videoDoc.status,
          progress: videoDoc.progress,
          script: videoDoc.script,
          duration: videoDoc.duration,
          logs: videoDoc.logs
        }
      );
      this.broadcastUpdate(videoDoc);
    }
  }

  broadcastUpdate(videoDoc) {
    if (this.io) {
      this.io.emit("job_update", {
        id: videoDoc._id,
        title: videoDoc.title,
        status: videoDoc.status,
        progress: videoDoc.progress,
        script: videoDoc.script,
        duration: videoDoc.duration,
        logs: videoDoc.logs
      });
    }
  }

  async stopJob(jobId) {
    if (this.currentJobId === jobId && this.childProcess) {
      console.log(`Stopping job ${jobId}...`);
      
      const videoDoc = await Video.findById(jobId);
      if (videoDoc) {
        videoDoc.status = "Stopped";
        await videoDoc.save();
      }

      this.childProcess.kill("SIGTERM");
      this.clearState();
      return true;
    }
    return false;
  }

  clearState() {
    this.currentJobId = null;
    this.childProcess = null;
  }
}

module.exports = new VideoQueue();
