#!/bin/bash
set -e

echo "=========================================="
echo "  CanTrack CRM - Deploy Script"
echo "=========================================="

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Verificar argumentos
if [ -z "$1" ]; then
    echo -e "${RED}Usage: $0 <domain>${NC}"
    echo "Example: $0 cantrack.example.com"
    exit 1
fi

DOMAIN=$1
USER=$(whoami)
APP_DIR="/var/www/cantrack"

echo -e "${YELLOW}[1/7] Updating system...${NC}"
sudo apt update && sudo apt upgrade -y

echo -e "${YELLOW}[2/7] Installing dependencies...${NC}"
sudo apt install -y docker.io docker-compose curl certbot python3-certbot-nginx

echo -e "${YELLOW}[3/7] Creating app directory...${NC}"
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

echo -e "${YELLOW}[4/7] Cloning repository...${NC}"
cd $APP_DIR
if [ -d ".git" ]; then
    echo "Repository already exists, pulling latest..."
    git pull origin main
else
    git clone https://github.com/Wizar-Cyber/CanTrack-CRM.git .
fi

echo -e "${YELLOW}[5/7] Creating environment file...${NC}"
if [ ! -f .env ]; then
    echo "Creating .env from template..."
    cp .env.example .env
    echo -e "${RED}⚠️  EDIT .env WITH YOUR ACTUAL VALUES BEFORE CONTINUING${NC}"
    echo -e " Required:"
    echo "   - JWT_SECRET"
    echo "   - DATABASE_URL"
    echo "   - GROQ_API_KEY"
    echo "   - WEBHOOK_SECRET"
    echo ""
    read -p "Press Enter after editing .env..."
fi

echo -e "${YELLOW}[6/7] Building and starting containers...${NC}"
docker-compose build
docker-compose up -d

echo -e "${YELLOW}[7/7] Getting SSL certificate...${NC}"
sudo certbot --nginx -d $DOMAIN --register-unsafely-without-email --agree-tos --dry-run || true

echo ""
echo -e "${GREEN}=========================================="
echo "  Deploy Complete!"
echo "==========================================${NC}"
echo ""
echo "App URL: https://$DOMAIN"
echo "Logs: docker-compose logs -f app"
echo "Restart: docker-compose restart app"
echo ""