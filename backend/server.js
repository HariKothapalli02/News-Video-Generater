const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const connectDB = require("./config/db");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const server = http.createServer(app);

connectDB();

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const videoDir = process.env.VIDEO_STORAGE_DIR || path.join(__dirname, "videos");
const thumbDir = process.env.THUMBNAIL_STORAGE_DIR || path.join(__dirname, "thumbnails");

if (!fs.existsSync(path.join(videoDir, "shorts"))) {
  fs.mkdirSync(path.join(videoDir, "shorts"), { recursive: true });
}
if (!fs.existsSync(path.join(thumbDir, "shorts"))) {
  fs.mkdirSync(path.join(thumbDir, "shorts"), { recursive: true });
}

app.use("/videos", express.static(videoDir));
app.use("/thumbnails", express.static(thumbDir));

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "DELETE"]
  }
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log(`WebSocket client connected: ${socket.id}`);
  
  socket.on("disconnect", () => {
    console.log(`WebSocket client disconnected: ${socket.id}`);
  });
});

const authRoutes = require("./routes/auth");
const videoRoutes = require("./routes/video");

app.use("/api", authRoutes);
app.use("/api", videoRoutes);

app.use((req, res) => {
  res.status(404).json({ msg: "API Endpoint not found" });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`ByteWire API server running on port ${PORT}`);
  console.log(`Videos served at http://localhost:${PORT}/videos`);
  console.log(`Thumbnails served at http://localhost:${PORT}/thumbnails`);
});
