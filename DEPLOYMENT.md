# ByteWire AWS EC2 Deployment Guide

This guide describes how to deploy the ByteWire AI YouTube News Generator platform on an AWS EC2 Instance.

---

## 1. AWS EC2 Setup

### Recommended Instance Specifications
- **Operating System**: Ubuntu Server 22.04 LTS (x86_64)
- **Instance Type**: 
  - **Minimum**: `t3.large` (2 vCPUs, 8GB RAM). 
  - **Recommended**: `c5.large` or `c5.xlarge` (compute-optimized for video encoding).
  - *Note: A standard `t2.micro` or `t3.micro` instance will run out of memory and crash during MoviePy video rendering.*
- **Storage**: Minimum 20GB-30GB gp3 EBS volume (to store downloaded video clips and output MP4 files).

### Security Group (Firewall) Rules
You must configure the Security Group associated with your EC2 instance to allow the following inbound traffic:
| Protocol | Port | Source | Purpose |
| :--- | :--- | :--- | :--- |
| **TCP** | `22` | My IP (or `0.0.0.0/0`) | SSH Access to the server |
| **TCP** | `80` | `0.0.0.0/0` | HTTP Access for the Web App |
| **TCP** | `443` | `0.0.0.0/0` | HTTPS Access (if SSL is configured later) |

---

## 2. Option A: Deployment via Docker Compose (Recommended)

Docker Compose containerizes all system dependencies (FFmpeg, Node.js, Python 3, and ImageMagick) automatically. It is the easiest and most reliable way to run the application.

### Step 1: Install Docker and Docker Compose on Ubuntu
SSH into your EC2 instance and run:
```bash
# Update local packages
sudo apt-get update -y && sudo apt-get upgrade -y

# Install Docker
sudo apt-get install -y docker.io

# Start and enable Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Add your user (ubuntu) to the docker group to run without sudo
sudo usermod -aG docker ubuntu

# Install Docker Compose v2 (if not already installed)
sudo apt-get install -y docker-compose-v2
```
*Note: Log out and back in (or run `newgrp docker`) for the group changes to take effect.*

### Step 2: Transfer Code and Run
1. Transfer your `bytewire` folder to your EC2 home directory (e.g., using `git clone` or SFTP).
2. Navigate into the directory:
   ```bash
   cd ~/bytewire
   ```
3. Your database is already pre-configured to connect to your external MongoDB instance:
   `mongodb://admin:H%40ri_2026_MongoDB%219X7%23@13.49.127.20:27017/ytvideogeneration?authSource=admin`
   
   If you need to update any API keys (such as `GEMINI_API_KEY` or `PEXELS_API_KEY`), open `docker-compose.yml` and modify the environment variables block:
   ```bash
   nano docker-compose.yml
   ```
4. Build and start the containers in detached (background) mode:
   ```bash
   docker compose up --build -d
   ```
5. You can monitor the backend and rendering logs by running:
   ```bash
   docker compose logs -f backend
   ```
6. Access your app by visiting the public IP of your EC2 instance in a web browser:
   `http://<YOUR_EC2_PUBLIC_IP>`

---

## 3. Option B: Native Deployment (Without Docker)

If you prefer to run the application directly on the server without containers, follow these steps:

### Step 1: Install System Dependencies
Install Node.js, Python, FFmpeg, ImageMagick, Nginx, and essential fonts:
```bash
sudo apt-get update -y

# Install Node.js (v18+)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python3, pip, FFmpeg, ImageMagick, and Nginx
sudo apt-get install -y python3 python3-pip python3-venv ffmpeg imagemagick nginx

# Install common fonts for text subtitles
sudo apt-get install -y fonts-liberation fonts-dejavu
```

### Step 2: Fix ImageMagick Security Policy
By default, Ubuntu's ImageMagick policy blocks text rendering operations needed by MoviePy for subtitles. Enable them:
```bash
sudo sed -i 's/rights="none" pattern="@\*"/rights="read|write" pattern="@\*"/g' /etc/ImageMagick-6/policy.xml
```

### Step 3: Setup the Python Virtual Environment
Navigate to the `python-service` folder, create a venv, and install Python dependencies:
```bash
cd ~/bytewire/python-service
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
```

### Step 4: Configure and Run Backend
1. Modify the backend environment variables:
   ```bash
   cd ~/bytewire
   nano .env
   ```
   Ensure storage paths are set to absolute Linux paths:
   ```env
   PORT=5000
   MONGODB_URI=mongodb://admin:H%40ri_2026_MongoDB%219X7%23@13.49.127.20:27017/ytvideogeneration?authSource=admin
   JWT_SECRET=bytewire_super_secret_jwt_key_2026
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=admin123
   GEMINI_API_KEY=your_gemini_key
   PEXELS_API_KEY=your_pexels_key
   VIDEO_STORAGE_DIR=/home/ubuntu/bytewire/videos
   THUMBNAIL_STORAGE_DIR=/home/ubuntu/bytewire/thumbnails
   LOG_STORAGE_DIR=/home/ubuntu/bytewire/logs
   ```
2. Install Node packages and start the server with **PM2** (to keep it running in the background):
   ```bash
   cd ~/bytewire/backend
   npm install
   sudo npm install -g pm2
   pm2 start server.js --name "bytewire-backend"
   pm2 save
   pm2 startup
   ```

### Step 5: Build and Serve Frontend via Nginx
1. Build the Vite React production assets:
   ```bash
   cd ~/bytewire/frontend
   npm install
   npm run build
   ```
   *This generates built static files in `~/bytewire/frontend/dist`.*
   
2. Configure Nginx to serve the frontend and proxy backend API / WebSocket upgrades. Create an Nginx config file:
   ```bash
   sudo nano /etc/nginx/sites-available/bytewire
   ```
   Paste the following:
   ```nginx
   server {
       listen 80;
       server_name _; # Or your domain

       client_max_body_size 100M;

       location / {
           root /home/ubuntu/bytewire/frontend/dist;
           index index.html index.htm;
           try_files $uri $uri/ /index.html;
       }

       location /api {
           proxy_pass http://127.0.0.1:5000/api;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }

       location /socket.io/ {
           proxy_pass http://127.0.0.1:5000/socket.io/;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "Upgrade";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }

       location /videos/ {
           proxy_pass http://127.0.0.1:5000/videos/;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
       }

       location /thumbnails/ {
           proxy_pass http://127.0.0.1:5000/thumbnails/;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
       }
   }
   ```
3. Enable the config, disable default config, and restart Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/bytewire /etc/nginx/sites-enabled/
   sudo rm /etc/nginx/sites-enabled/default
   sudo systemctl restart nginx
   ```
4. Access the web app at `http://<YOUR_EC2_PUBLIC_IP>`.

---

## 4. Verification Check
To ensure the deployment succeeded:
1. Try logging in with the credentials (`admin` / `admin123`).
2. Go to the "Generate" tab, enter a subject, and click start.
3. Observe the logs (`docker compose logs -f backend` or `pm2 logs`).
4. Ensure the video finishes compilation, the subtitles burn in, and the output `.mp4` file is streamable directly from the dashboard or history pages.
