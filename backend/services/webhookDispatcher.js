const https = require("https");
const http = require("http");

/**
 * Dispatches a single YouTube Short upload request to the n8n webhook.
 */
async function dispatchShortToWebhook({ video, short, shortIdx }) {
  if (video?.disableAutoUpload || short?.disableAutoUpload) {
    console.log(`[WebhookDispatcher] 🚫 Upload disabled for Short #${shortIdx} on video "${video?.title || video?._id}". Skipping webhook dispatch.`);
    return { dispatched: false, reason: "Auto upload disabled by user", payload: null };
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const baseUrl = process.env.APP_URL || "https://ytvideo.harikothapalli.space";

  const meta = short.youtubeMetadata || {};
  const factTitle = short.factTitle || short.title || `News Short #${shortIdx}`;
  const rawTitle = meta.title || `${factTitle} #Shorts`;
  const uploadTitle = (rawTitle.includes("#Shorts") || rawTitle.includes("#shorts"))
    ? rawTitle.substring(0, 100)
    : `${rawTitle.substring(0, 90)} #Shorts`;

  let uploadDescription = meta.description || short.scriptText || factTitle;
  if (video.youtubeUrl && !uploadDescription.includes("youtube.com")) {
    uploadDescription += `\n\nFull Video: ${video.youtubeUrl}`;
  }
  if (!uploadDescription.includes("#shorts")) {
    uploadDescription += `\n\n#shorts #youtubeshorts #trending #news #bytewire`;
  }
  uploadDescription = uploadDescription.substring(0, 5000);

  const uploadTags = (meta.tags && meta.tags.length > 0)
    ? meta.tags.slice(0, 15)
    : ["shorts", "youtubeshorts", "news", "trending", "bytewire"];

  const payload = {
    action: "post_reel",
    event: "upload_single_short",
    videoId: video._id.toString(),
    shortIndex: shortIdx,
    factIndex: shortIdx,
    title: uploadTitle,
    description: uploadDescription,
    tags: uploadTags,
    privacyStatus: "public",
    shortDownloadUrl: `${baseUrl}/api/download/${video._id}/short/${shortIdx}`,
    videoDownloadUrl: `${baseUrl}/api/download/${video._id}/short/${shortIdx}`,
    videoUrl: `${baseUrl}/videos/shorts/${video._id}_short_${shortIdx}.mp4`,
    parentYoutubeUrl: video.youtubeUrl || "",
    timestamp: new Date().toISOString()
  };

  if (!webhookUrl) {
    console.warn("[WebhookDispatcher] N8N_WEBHOOK_URL not configured in .env. Skipping short dispatch.");
    return { dispatched: false, reason: "N8N_WEBHOOK_URL not configured in .env", payload };
  }

  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(webhookUrl);
      const transport = parsedUrl.protocol === "https:" ? https : http;
      const dataStr = JSON.stringify(payload);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(dataStr),
          "User-Agent": "ByteWire-AI/1.0"
        },
        timeout: 30000
      };

      const req = transport.request(options, (res) => {
        let respData = "";
        res.on("data", (chunk) => { respData += chunk; });
        res.on("end", () => {
          let parsedResp = null;
          try { parsedResp = JSON.parse(respData); } catch (_) {}
          resolve({
            dispatched: true,
            statusCode: res.statusCode,
            response: parsedResp || respData,
            payload
          });
        });
      });

      req.on("error", (err) => {
        console.error(`[WebhookDispatcher] Error dispatching Short #${shortIdx} to webhook:`, err.message);
        resolve({ dispatched: false, error: err.message, payload });
      });

      req.on("timeout", () => {
        console.warn(`[WebhookDispatcher] Webhook request timed out after 30s for Short #${shortIdx}.`);
        req.destroy();
        resolve({ dispatched: true, timeout: true, payload });
      });

      req.write(dataStr);
      req.end();
    } catch (err) {
      console.error("[WebhookDispatcher] Exception in dispatchShortToWebhook:", err);
      resolve({ dispatched: false, error: err.message, payload });
    }
  });
}

/**
 * Dispatches a full video upload request to the n8n webhook.
 */
async function dispatchFullVideoToWebhook(video) {
  if (video?.disableAutoUpload) {
    console.log(`[WebhookDispatcher] 🚫 Upload disabled for video "${video?.title || video?._id}". Skipping webhook dispatch.`);
    return { dispatched: false, reason: "Auto upload disabled by user", payload: null };
  }

  const webhookUrl = process.env.N8N_WEBHOOK_URL;
  const baseUrl = process.env.APP_URL || "https://ytvideo.harikothapalli.space";

  const meta = video.youtubeMetadata || {};
  const uploadTitle = (meta.title || video.title || "Trending News Daily").substring(0, 100);
  const uploadDescription = (meta.description || `Top 3 ${video.subject} news stories today. Subscribe for daily breaking updates! #news #trending`).substring(0, 5000);
  const uploadTags = (meta.tags && meta.tags.length > 0)
    ? meta.tags.slice(0, 15)
    : ["news", "trending", "breaking news", "bytewire"];

  const payload = {
    action: "post_full_video",
    event: "upload_full_video",
    videoId: video._id.toString(),
    title: uploadTitle,
    description: uploadDescription,
    tags: uploadTags,
    categoryId: "25",
    privacyStatus: "public",
    videoDownloadUrl: `${baseUrl}/api/download/${video._id}`,
    videoUrl: `${baseUrl}/videos/${video._id}.mp4`,
    thumbnailUrl: `${baseUrl}/thumbnails/${video._id}.png`,
    timestamp: new Date().toISOString()
  };

  if (!webhookUrl) {
    console.warn("[WebhookDispatcher] N8N_WEBHOOK_URL not configured in .env. Skipping full video dispatch.");
    return { dispatched: false, reason: "N8N_WEBHOOK_URL not configured in .env", payload };
  }

  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(webhookUrl);
      const transport = parsedUrl.protocol === "https:" ? https : http;
      const dataStr = JSON.stringify(payload);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(dataStr),
          "User-Agent": "ByteWire-AI/1.0"
        },
        timeout: 30000
      };

      const req = transport.request(options, (res) => {
        let respData = "";
        res.on("data", (chunk) => { respData += chunk; });
        res.on("end", () => {
          let parsedResp = null;
          try { parsedResp = JSON.parse(respData); } catch (_) {}
          resolve({
            dispatched: true,
            statusCode: res.statusCode,
            response: parsedResp || respData,
            payload
          });
        });
      });

      req.on("error", (err) => {
        console.error("[WebhookDispatcher] Error dispatching full video to webhook:", err.message);
        resolve({ dispatched: false, error: err.message, payload });
      });

      req.on("timeout", () => {
        console.warn("[WebhookDispatcher] Webhook request timed out after 30s for full video.");
        req.destroy();
        resolve({ dispatched: true, timeout: true, payload });
      });

      req.write(dataStr);
      req.end();
    } catch (err) {
      console.error("[WebhookDispatcher] Exception in dispatchFullVideoToWebhook:", err);
      resolve({ dispatched: false, error: err.message, payload });
    }
  });
}

module.exports = {
  dispatchShortToWebhook,
  dispatchFullVideoToWebhook
};
