#!/usr/bin/env bash
# ==============================================================================
# ByteWire AI News Video Generator - Comprehensive EC2 Deployment Script
# Target OS: Ubuntu 22.04 LTS / Debian
# Description: Automates system dependencies (FFmpeg, Node 20, Python 3, MongoDB,
#              Nginx, PM2), virtual environment setup, Piper voice models, 
#              frontend build, and systemd/Nginx reverse proxy configuration.
# ==============================================================================

set -eo pipefail

# Visual log helper
LOG_PREFIX="[BYTEWIRE-DEPLOY]"
info() { echo -e "\e[34m${LOG_PREFIX} [INFO]\e[0m $1"; }
success() { echo -e "\e[32m${LOG_PREFIX} [SUCCESS]\e[0m $1"; }
warn() { echo -e "\e[33m${LOG_PREFIX} [WARN]\e[0m $1"; }
err() { echo -e "\e[31m${LOG_PREFIX} [ERROR]\e[0m $1"; exit 1; }

# Detect script root directory
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR" || err "Failed to switch to application directory: $APP_DIR"

info "Starting ByteWire automated deployment on directory: $APP_DIR"

# ------------------------------------------------------------------------------
# 1. System Package Updates & Essential Tools
# ------------------------------------------------------------------------------
info "Updating apt packages and installing system dependencies..."
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
    curl \
    git \
    wget \
    build-essential \
    ffmpeg \
    imagemagick \
    python3 \
    python3-pip \
    python3-venv \
    python3-dev \
    nginx \
    gnupg \
    software-properties-common

# Fix ImageMagick security policy for MoviePy text handling if required
if [ -f /etc/ImageMagick-6/policy.xml ]; then
    info "Configuring ImageMagick policy..."
    sudo sed -i 's/<policy domain="path" rights="none" pattern="@\*"/<!-- <policy domain="path" rights="none" pattern="@\*" -->/' /etc/ImageMagick-6/policy.xml || true
fi

# ------------------------------------------------------------------------------
# 2. Swapfile Setup (Ensures stability during 1080p video rendering on < 8GB RAM)
# ------------------------------------------------------------------------------
if ! swapon --show | grep -q "/swapfile"; then
    info "Setting up 4GB swapfile for video rendering memory buffer..."
    sudo fallocate -l 4G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    if ! grep -q "/swapfile" /etc/fstab; then
        echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    fi
    success "4GB swapfile enabled."
else
    info "Swap space already active."
fi

# ------------------------------------------------------------------------------
# 3. Install Node.js 20 LTS & PM2
# ------------------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1 || [[ $(node -v | cut -d'.' -f1) != "v20" ]]; then
    info "Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

info "Node version: $(node -v), NPM version: $(npm -v)"

if ! command -v pm2 >/dev/null 2>&1; then
    info "Installing PM2 globally..."
    sudo npm install -g pm2
fi

# ------------------------------------------------------------------------------
# 4. Install & Start MongoDB (Community Edition)
# ------------------------------------------------------------------------------
if ! command -v mongod >/dev/null 2>&1; then
    info "Installing MongoDB Community Edition..."
    curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
        sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor --yes
    
    echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
        sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

    sudo apt-get update -y
    sudo apt-get install -y mongodb-org || {
        warn "Direct MongoDB 7.0 package installation had an issue; attempting fallback system mongodb..."
        sudo apt-get install -y mongodb || true
    }
fi

info "Starting and enabling MongoDB service..."
sudo systemctl daemon-reload || true
sudo systemctl start mongod 2>/dev/null || sudo systemctl start mongodb 2>/dev/null || true
sudo systemctl enable mongod 2>/dev/null || sudo systemctl enable mongodb 2>/dev/null || true

# ------------------------------------------------------------------------------
# 5. Media & Storage Directory Structure
# ------------------------------------------------------------------------------
info "Creating storage directories..."
mkdir -p "$APP_DIR/videos"
mkdir -p "$APP_DIR/thumbnails"
mkdir -p "$APP_DIR/logs"
mkdir -p "$APP_DIR/python-service/voices"
mkdir -p "$APP_DIR/python-service/temp"

# ------------------------------------------------------------------------------
# 6. Python Virtual Environment & Video Engine Setup
# ------------------------------------------------------------------------------
info "Configuring Python virtual environment in $APP_DIR/python-service/venv..."
cd "$APP_DIR/python-service"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate
pip install --upgrade pip

info "Installing Python dependencies (MoviePy 2.x, Faster-Whisper, Piper-TTS, Gemini SDK)..."
pip install -r requirements.txt

# Download default English Piper voice model if missing
cd voices
if [ ! -f "en_US-lessac-medium.onnx" ]; then
    info "Downloading Piper English TTS voice model (en_US-lessac-medium)..."
    curl -L -o en_US-lessac-medium.onnx "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
fi
if [ ! -f "en_US-lessac-medium.onnx.json" ]; then
    curl -L -o en_US-lessac-medium.onnx.json "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json"
fi
cd ..

info "Verifying Python video modules..."
python3 -c "import moviepy, faster_whisper, pexels, gemini; print('✓ Python modules verified')"
deactivate
cd "$APP_DIR"

# ------------------------------------------------------------------------------
# 7. Root & Backend Environment Configuration (.env)
# ------------------------------------------------------------------------------
if [ ! -f "$APP_DIR/.env" ]; then
    info "Generating default $APP_DIR/.env file..."
    cat << EOF > "$APP_DIR/.env"
# ==============================================================
# ByteWire AI YouTube News Video Generator Environment Configuration
# ==============================================================

PORT=5000
NODE_ENV=production

# Database Connection (MongoDB)
MONGODB_URI=mongodb://127.0.0.1:27017/bytewire

# JWT Authentication & Admin Credentials
JWT_SECRET=bytewire_super_secret_jwt_key_$(openssl rand -hex 16 2>/dev/null || echo '2026_prod')
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# External AI & Media API Keys (Fill with your actual keys)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash
PEXELS_API_KEY=your_pexels_api_key_here
HF_TOKEN=

# Local Media Storage Directories (Linux Absolute Paths)
VIDEO_STORAGE_DIR=$APP_DIR/videos
THUMBNAIL_STORAGE_DIR=$APP_DIR/thumbnails
LOG_STORAGE_DIR=$APP_DIR/logs

# Whisper Subtitle Model (tiny, base, small, medium, large-v3)
WHISPER_MODEL=small

# Python Executable Path (Virtual environment python3)
PYTHON_PATH=$APP_DIR/python-service/venv/bin/python3
EOF
    warn ".env file created. Remember to edit $APP_DIR/.env with your real GEMINI_API_KEY and PEXELS_API_KEY."
else
    info ".env file already exists. Updating Linux path definitions..."
    # Ensure linux paths match this deployment directory
    sed -i "s|^VIDEO_STORAGE_DIR=.*|VIDEO_STORAGE_DIR=$APP_DIR/videos|" "$APP_DIR/.env"
    sed -i "s|^THUMBNAIL_STORAGE_DIR=.*|THUMBNAIL_STORAGE_DIR=$APP_DIR/thumbnails|" "$APP_DIR/.env"
    sed -i "s|^LOG_STORAGE_DIR=.*|LOG_STORAGE_DIR=$APP_DIR/logs|" "$APP_DIR/.env"
    sed -i "s|^PYTHON_PATH=.*|PYTHON_PATH=$APP_DIR/python-service/venv/bin/python3|" "$APP_DIR/.env"
fi

# ------------------------------------------------------------------------------
# 8. Install Backend Dependencies & Start with PM2
# ------------------------------------------------------------------------------
info "Installing backend dependencies..."
cd "$APP_DIR/backend"
npm install

info "Starting backend service using PM2..."
pm2 delete bytewire-backend 2>/dev/null || true
pm2 start server.js --name "bytewire-backend"
pm2 save

# Setup PM2 startup on system boot
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME" 2>/dev/null || true
cd "$APP_DIR"

# ------------------------------------------------------------------------------
# 9. Build Frontend (React + Vite + Sharp B&W UI)
# ------------------------------------------------------------------------------
info "Installing frontend dependencies and building production bundle..."
cd "$APP_DIR/frontend"
npm install
npm run build
cd "$APP_DIR"

# ------------------------------------------------------------------------------
# 10. Configure Nginx Reverse Proxy & Domain / SSL
# ------------------------------------------------------------------------------
DOMAIN_NAME="ytvideo.harikothapalli.space"
info "Configuring Nginx reverse proxy for domain: $DOMAIN_NAME..."

NGINX_CONF_PATH="/etc/nginx/sites-available/bytewire"

sudo tee "$NGINX_CONF_PATH" > /dev/null << EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN_NAME 13.50.251.226 _;

    client_max_body_size 150M;

    # Serve React Frontend Build
    location / {
        root $APP_DIR/frontend/dist;
        index index.html index.htm;
        try_files \$uri \$uri/ /index.html;
    }

    # Proxy API Requests to Node Backend
    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket Proxy for Real-Time Generation Updates
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Direct Video Streaming
    location /videos/ {
        alias $APP_DIR/videos/;
        autoindex off;
        add_header Cache-Control "public, max-age=3600";
        add_header Accept-Ranges bytes;
    }

    # Direct Thumbnail File Serving
    location /thumbnails/ {
        alias $APP_DIR/thumbnails/;
        autoindex off;
        add_header Cache-Control "public, max-age=86400";
    }
}
EOF

# Enable site in Nginx
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf "$NGINX_CONF_PATH" /etc/nginx/sites-enabled/bytewire

# Test Nginx configuration and reload
sudo nginx -t && sudo systemctl restart nginx

# ------------------------------------------------------------------------------
# 11. Optional Automatic Free SSL with Let's Encrypt Certbot
# ------------------------------------------------------------------------------
info "Checking DNS resolution for $DOMAIN_NAME to configure free SSL Certificate..."
RESOLVED_IP=$(dig +short "$DOMAIN_NAME" 2>/dev/null | tail -n1 || ping -c 1 "$DOMAIN_NAME" 2>/dev/null | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' || echo "")
PUBLIC_IP=$(curl -s http://checkip.amazonaws.com || curl -s https://ifconfig.me || echo "<YOUR_EC2_PUBLIC_IP>")

if [[ -n "$RESOLVED_IP" && "$RESOLVED_IP" == "$PUBLIC_IP" ]]; then
    info "DNS match verified ($DOMAIN_NAME -> $PUBLIC_IP). Installing Certbot SSL..."
    sudo apt-get install -y certbot python3-certbot-nginx
    sudo certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos --register-unsafely-without-email || {
        warn "Certbot automated request skipped or encountered an error. You can run 'sudo certbot --nginx -d $DOMAIN_NAME' manually once DNS finishes propagating."
    }
else
    warn "Domain $DOMAIN_NAME resolves to '$RESOLVED_IP', while this server's public IP is '$PUBLIC_IP'."
    warn "Point your DNS A-Record for '$DOMAIN_NAME' to '$PUBLIC_IP', then run:"
    warn "    sudo certbot --nginx -d $DOMAIN_NAME"
fi

# ------------------------------------------------------------------------------
# 12. Completion Summary
# ------------------------------------------------------------------------------
success "=========================================================================="
success " ByteWire AI YouTube News Video Generator is now deployed and running!"
success "=========================================================================="
echo ""
echo -e "  \e[1mDomain URL:\e[0m           http://${DOMAIN_NAME}  (or https://${DOMAIN_NAME} with SSL)"
echo -e "  \e[1mDirect IP URL:\e[0m        http://${PUBLIC_IP}"
echo -e "  \e[1mDefault Login:\e[0m        Username: \e[33madmin\e[0m | Password: \e[33madmin123\e[0m"
echo -e "  \e[1mEnvironment Config:\e[0m   $APP_DIR/.env"
echo ""
echo -e "  \e[1mDNS A-Record Required in Cloudflare/Hostinger/Route53:\e[0m"
echo -e "    Type:  \e[32mA\e[0m"
echo -e "    Name:  \e[32mytvideo\e[0m (or ytvideo.harikothapalli.space)"
echo -e "    Value: \e[33m${PUBLIC_IP}\e[0m"
echo ""
echo -e "  \e[1mSSL Command (run after DNS points to EC2 IP):\e[0m"
echo -e "    \e[36msudo certbot --nginx -d ${DOMAIN_NAME}\e[0m"
echo ""
echo -e "  \e[1mUseful Management Commands:\e[0m"
echo -e "    - View live backend logs:   \e[36mpm2 logs bytewire-backend\e[0m"
echo -e "    - Restart backend:          \e[36mpm2 restart bytewire-backend\e[0m"
echo -e "    - Restart Nginx:            \e[36msudo systemctl restart nginx\e[0m"
echo -e "    - Check MongoDB:            \e[36msudo systemctl status mongod\e[0m"
echo ""
if grep -q "your_gemini_api_key_here" "$APP_DIR/.env" || grep -q "your_pexels_api_key_here" "$APP_DIR/.env"; then
    warn "ACTION REQUIRED: Please edit $APP_DIR/.env and add your valid GEMINI_API_KEY and PEXELS_API_KEY, then run: pm2 restart bytewire-backend"
fi
