const https = require("https");
const http = require("http");

/**
 * Parses and cleans an n8n error message.
 * Specifically detects the common n8n 404 "not registered" error
 * which happens when the workflow is inactive or a test URL was used.
 */
function formatWebhookError(statusCode, parsedResp, rawResp, targetUrl) {
  const rawMsg = parsedResp?.errorMessage || parsedResp?.message || (typeof rawResp === "string" ? rawResp : "");
  const isUnregistered = rawMsg.toLowerCase().includes("not registered") || statusCode === 404;

  if (isUnregistered) {
    const isTestUrl = (targetUrl || "").includes("/webhook-test/");
    if (isTestUrl) {
      return `The requested webhook "bytewire-video-ready" is not registered because it is using a test URL (/webhook-test/). In n8n, test URLs only work temporarily when clicking 'Test step'. Fix: Update your N8N_WEBHOOK_URL to use the production path (/webhook/bytewire-video-ready) and turn the workflow toggle in n8n to 'Active' (ON).`;
    }
    return `The requested webhook "bytewire-video-ready" is not registered in n8n. Fix: 1) Open your workflow in n8n. 2) Switch the workflow toggle at the top-right from 'Inactive' to 'Active' (ON). 3) Ensure the webhook URL path is /webhook/bytewire-video-ready.`;
  }

  return rawMsg || (statusCode >= 400 ? `Webhook returned HTTP ${statusCode}` : "Unknown webhook error");
}

/**
 * Performs a single HTTP/S POST to a given URL with timeout and JSON parsing.
 */
function sendRawRequest(urlStr, payload, timeoutMs = 30000) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(urlStr);
      const transport = parsedUrl.protocol === "https:" ? https : http;
      const dataStr = typeof payload === "string" ? payload : JSON.stringify(payload);

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
        timeout: timeoutMs
      };

      const req = transport.request(options, (res) => {
        let respData = "";
        res.on("data", (chunk) => { respData += chunk; });
        res.on("end", () => {
          let parsedResp = null;
          try { parsedResp = JSON.parse(respData); } catch (_) {}
          const isHttpError = res.statusCode >= 400;
          const hasErrorPayload = !!parsedResp?.errorMessage || parsedResp?.status === "error";

          resolve({
            ok: !isHttpError && !hasErrorPayload,
            statusCode: res.statusCode,
            response: parsedResp || respData,
            rawText: respData,
            error: (isHttpError || hasErrorPayload)
              ? formatWebhookError(res.statusCode, parsedResp, respData, urlStr)
              : null
          });
        });
      });

      req.on("error", (err) => {
        resolve({
          ok: false,
          statusCode: 0,
          error: `Network error reaching webhook: ${err.message}`
        });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({
          ok: false,
          timeout: true,
          statusCode: 408,
          error: `Webhook request timed out after ${timeoutMs / 1000}s.`
        });
      });

      req.write(dataStr);
      req.end();
    } catch (err) {
      resolve({
        ok: false,
        statusCode: 0,
        error: `Invalid webhook URL or execution failure: ${err.message}`
      });
    }
  });
}

/**
 * Smart dispatcher: tries the configured URL. If the user accidentally provided a
 * /webhook-test/ URL and it fails with "not registered", it automatically retries
 * with the production /webhook/ URL.
 */
async function sendWebhookWithAutoFallback(webhookUrl, payload, timeoutMs = 30000) {
  const cleanUrl = (webhookUrl || "").trim();
  if (!cleanUrl) {
    return {
      dispatched: false,
      reason: "N8N_WEBHOOK_URL not configured in .env",
      error: "N8N_WEBHOOK_URL not configured in .env. Configure it in Settings to enable YouTube publishing.",
      payload
    };
  }

  // 1. Initial attempt
  let result = await sendRawRequest(cleanUrl, payload, timeoutMs);

  // 2. If it was a /webhook-test/ URL and failed with "not registered", auto-try production /webhook/
  if (!result.ok && cleanUrl.includes("/webhook-test/") && (result.error || "").toLowerCase().includes("not registered")) {
    const prodUrl = cleanUrl.replace("/webhook-test/", "/webhook/");
    console.log(`[WebhookDispatcher] /webhook-test/ endpoint returned not registered. Auto-retrying production URL: ${prodUrl}`);
    const retryResult = await sendRawRequest(prodUrl, payload, timeoutMs);
    if (retryResult.ok) {
      return {
        dispatched: true,
        statusCode: retryResult.statusCode,
        response: retryResult.response,
        payload
      };
    }
    result = retryResult;
  }

  return {
    dispatched: result.ok,
    timeout: result.timeout,
    statusCode: result.statusCode,
    response: result.response,
    error: result.error,
    payload
  };
}

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
  let rawTitle = meta.title || `${factTitle} 🚨 #Shorts`;
  if (!rawTitle.toLowerCase().includes("#shorts")) {
    rawTitle = `${rawTitle.substring(0, 88)} #Shorts`;
  }
  const uploadTitle = rawTitle.substring(0, 100);

  let uploadDescription = meta.description || short.scriptText || factTitle;
  if (video.youtubeUrl && !uploadDescription.includes("youtube.com")) {
    uploadDescription += `\n\n📺 Full Video & Breakdown: ${video.youtubeUrl}`;
  }
  if (!uploadDescription.includes("Subscribe")) {
    uploadDescription += `\n\n🔔 Subscribe to ByteWire AI News for daily breaking reports!`;
  }
  if (!uploadDescription.includes("#shorts")) {
    uploadDescription += `\n\n#shorts #youtubeshorts #trending #viral #news #breakingnews #bytewire`;
  }
  uploadDescription = uploadDescription.substring(0, 5000);

  const uploadTags = (meta.tags && meta.tags.length > 0)
    ? meta.tags.slice(0, 20)
    : ["shorts", "youtubeshorts", "trending", "viral", "news", "breaking news", "bytewire"];

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
    thumbnailUrl: `${baseUrl}/thumbnails/shorts/${video._id}_short_${shortIdx}.png`,
    thumbnailDownloadUrl: `${baseUrl}/api/download/${video._id}/short/${shortIdx}/thumbnail`,
    parentYoutubeUrl: video.youtubeUrl || "",
    timestamp: new Date().toISOString()
  };

  return sendWebhookWithAutoFallback(webhookUrl, payload, 30000);
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
  const uploadTitle = (meta.title || video.title || "Top 10 Breaking News Stories Today").substring(0, 100);
  let uploadDescription = meta.description || `Top 10 ${video.subject} news stories today. Watch for full verified analysis and breaking updates.\n\n🔔 Subscribe to ByteWire AI News for daily reports!\n\n#news #breakingnews #trending #viral #technews #bytewire`;
  if (!uploadDescription.includes("#news")) {
    uploadDescription += "\n\n#news #breakingnews #trending #viral #bytewire";
  }
  uploadDescription = uploadDescription.substring(0, 5000);

  const uploadTags = (meta.tags && meta.tags.length > 0)
    ? meta.tags.slice(0, 25)
    : ["news", "breaking news", "trending", "top 10", "daily news", "bytewire"];

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
    thumbnailDownloadUrl: `${baseUrl}/api/download/${video._id}/thumbnail`,
    timestamp: new Date().toISOString()
  };

  return sendWebhookWithAutoFallback(webhookUrl, payload, 30000);
}

/**
 * Tests n8n webhook connectivity and whether it is actively registered in n8n.
 */
async function testWebhookConnection(testUrl) {
  const urlToTest = (testUrl || process.env.N8N_WEBHOOK_URL || "").trim();
  if (!urlToTest) {
    return {
      valid: false,
      statusCode: 400,
      msg: "n8n Webhook URL is empty."
    };
  }

  const payload = {
    action: "test_connection",
    event: "ping",
    timestamp: new Date().toISOString()
  };

  const res = await sendWebhookWithAutoFallback(urlToTest, payload, 10000);

  if (res.dispatched) {
    return {
      valid: true,
      statusCode: res.statusCode || 200,
      msg: "n8n Webhook is registered and active! Connection verified (200 OK)."
    };
  }

  return {
    valid: false,
    statusCode: res.statusCode || 500,
    msg: res.error || "Failed to connect to n8n webhook."
  };
}

module.exports = {
  dispatchShortToWebhook,
  dispatchFullVideoToWebhook,
  testWebhookConnection
};
