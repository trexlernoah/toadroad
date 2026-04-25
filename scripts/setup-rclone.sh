#!/usr/bin/env bash
# setup-rclone.sh — Configure rclone for Cloudflare R2
# Run this once before using upload.sh
#
# You'll need:
#   - Your Cloudflare Account ID
#   - R2 Access Key ID
#   - R2 Secret Access Key
# (All from Cloudflare dashboard → R2 → Manage R2 API Tokens)

set -euo pipefail

echo "Configuring rclone for Cloudflare R2"
echo "────────────────────────────────────"
echo ""

read -rp "Cloudflare Account ID: " ACCOUNT_ID
read -rp "R2 Access Key ID:       " ACCESS_KEY
read -rsp "R2 Secret Access Key:   " SECRET_KEY
echo ""
read -rp "rclone remote name [r2]: " REMOTE_NAME
REMOTE_NAME="${REMOTE_NAME:-r2}"

CONFIG_FILE="$(rclone config file | tail -1)"

# Append the remote config
cat >> "$CONFIG_FILE" <<EOF

[$REMOTE_NAME]
type = s3
provider = Cloudflare
access_key_id = $ACCESS_KEY
secret_access_key = $SECRET_KEY
endpoint = https://$ACCOUNT_ID.r2.cloudflarestorage.com
acl = private
EOF

echo ""
echo "✓ rclone remote '$REMOTE_NAME' configured at $CONFIG_FILE"
echo ""
echo "Test it with:"
echo "  rclone lsd $REMOTE_NAME:"
