#!/usr/bin/env bash
# upload.sh — Photo gallery uploader for Cloudflare R2
# Requirements: imagemagick, rclone (configured), jq
#
# Usage:
#   ./upload.sh                  # process all albums
#   ./upload.sh "album name"     # process one album only
#
# Directory structure expected:
#   photos/
#     album-one/
#       photo1.jpg
#       photo2.jpg
#     album-two/
#       ...

set -euo pipefail

# ─── Configuration ────────────────────────────────────────────────────────────

PHOTOS_DIR="./assets"          # local root folder containing album subfolders
THUMB_SIZE="600x600"           # max thumbnail dimensions (preserves aspect ratio)
THUMB_QUALITY=82               # JPEG quality for thumbnails (0-100)
ORIG_QUALITY=88                # JPEG quality for re-encoded originals (or use 100 to skip re-encoding)
RCLONE_REMOTE="r2"             # rclone remote name (from rclone config)
BUCKET_NAME="toad-rd"        # your R2 bucket name
PUBLIC_BASE_URL="https://images.toadroad.online"  # your R2 custom domain
MANIFEST_FILE="./manifest.json"
MANIFEST_IN_R2=true            # set false to only write manifest locally

# ─── Derived paths ────────────────────────────────────────────────────────────

WORK_DIR="/tmp/r2-upload-$$"
THUMBS_DIR="$WORK_DIR/thumbs"
ORIGINALS_DIR="$WORK_DIR/originals"

# ─── Helpers ──────────────────────────────────────────────────────────────────

log()  { echo "▸ $*" >&2; }
ok()   { echo "✓ $*" >&2; }
err()  { echo "✗ $*" >&2; }

check_deps() {
  local missing=()
  for cmd in convert identify rclone jq; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    err "Missing dependencies: ${missing[*]}"
    err "Install with: sudo apt install imagemagick jq && curl https://rclone.org/install.sh | sudo bash"
    exit 1
  fi
}

slugify() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-\|-$//g'
}

get_exif_date() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

get_dimensions() {
  identify -format "%wx%h" "$1" 2>/dev/null || echo "0x0"
}

# ─── Process a single album ───────────────────────────────────────────────────

process_album() {
  local album_path="$1"
  local album_name
  album_name=$(basename "$album_path")
  local album_slug
  album_slug=$(slugify "$album_name")

  log "Processing album: $album_name"

  local album_thumbs="$THUMBS_DIR/$album_slug"
  local album_originals="$ORIGINALS_DIR/$album_slug"
  mkdir -p "$album_thumbs" "$album_originals"

  local photos_json="[]"
  local count=0

  # Sort files for consistent ordering
  while IFS= read -r -d '' photo_file; do
    local filename
    filename=$(basename "$photo_file")
    local ext="${filename##*.}"
    local base="${filename%.*}"
    local slug
    slug=$(slugify "$base")
    local out_name="${slug}.jpg"

    log "  Processing $filename"

    # Generate optimised original (convert to JPEG if needed, strip metadata)
    convert "$photo_file" \
      -auto-orient \
      -strip \
      -quality "$ORIG_QUALITY" \
      "$album_originals/$out_name" 2>/dev/null

    # Generate thumbnail
    convert "$album_originals/$out_name" \
      -thumbnail "${THUMB_SIZE}>" \
      -quality "$THUMB_QUALITY" \
      "$album_thumbs/$out_name" 2>/dev/null

    # Get metadata — sanitize all values before passing to jq
    local dims
    dims=$(get_dimensions "$album_originals/$out_name")
    local width="${dims%x*}"
    local height="${dims#*x}"
    local thumb_dims
    thumb_dims=$(get_dimensions "$album_thumbs/$out_name")
    local thumb_w="${thumb_dims%x*}"
    local thumb_h="${thumb_dims#*x}"
    local taken_at
    taken_at=$(get_exif_date "$photo_file")
    local size_bytes
    size_bytes=$(stat -c%s "$album_originals/$out_name")

    # Ensure all numeric fields are valid integers (default to 0)
    [[ "$width"      =~ ^[0-9]+$ ]] || width=0
    [[ "$height"     =~ ^[0-9]+$ ]] || height=0
    [[ "$thumb_w"    =~ ^[0-9]+$ ]] || thumb_w=0
    [[ "$thumb_h"    =~ ^[0-9]+$ ]] || thumb_h=0
    [[ "$size_bytes" =~ ^[0-9]+$ ]] || size_bytes=0

    [[ -z "$taken_at" ]] && taken_at="unknown"

    local photo_entry
    photo_entry=$(jq -n \
      --arg url        "$PUBLIC_BASE_URL/originals/$album_slug/$out_name" \
      --arg thumb_url  "$PUBLIC_BASE_URL/thumbs/$album_slug/$out_name" \
      --arg title      "$base" \
      --arg album      "$album_name" \
      --arg album_slug "$album_slug" \
      --arg taken_at   "$taken_at" \
      --arg width      "$width" \
      --arg height     "$height" \
      --arg thumb_w    "$thumb_w" \
      --arg thumb_h    "$thumb_h" \
      --arg size       "$size_bytes" \
      '{
        url:          $url,
        thumb_url:    $thumb_url,
        title:        $title,
        album:        $album,
        album_slug:   $album_slug,
        taken_at:     $taken_at,
        width:        ($width    | tonumber),
        height:       ($height   | tonumber),
        thumb_width:  ($thumb_w  | tonumber),
        thumb_height: ($thumb_h  | tonumber),
        size_bytes:   ($size     | tonumber)
      }')

    photos_json=$(echo "$photos_json" | jq --argjson p "$photo_entry" '. + [$p]')
    (( count++ )) || true

  done < <(find "$album_path" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.webp" \) -print0 | sort -z)

  ok "  $count photos processed in '$album_name'"
  echo "$photos_json"
}

# ─── Upload to R2 via rclone ──────────────────────────────────────────────────

upload_to_r2() {
  log "Uploading originals to R2..."
  rclone copy "$ORIGINALS_DIR" "$RCLONE_REMOTE:$BUCKET_NAME/originals" \
    --transfers 8 \
    --checkers 8 \
    --progress \
    --s3-no-check-bucket

  log "Uploading thumbnails to R2..."
  rclone copy "$THUMBS_DIR" "$RCLONE_REMOTE:$BUCKET_NAME/thumbs" \
    --transfers 8 \
    --checkers 8 \
    --progress \
    --s3-no-check-bucket

  ok "Upload complete."
}

# ─── Main ─────────────────────────────────────────────────────────────────────

main() {
  check_deps

  mkdir -p "$THUMBS_DIR" "$ORIGINALS_DIR"
  trap 'rm -rf "$WORK_DIR"' EXIT

  local filter="${1:-}"
  local manifest_albums="[]"

  # Loop over album folders
  while IFS= read -r -d '' album_dir; do
    local album_name
    album_name=$(basename "$album_dir")

    # If a filter was passed, skip non-matching albums
    if [[ -n "$filter" && "$album_name" != "$filter" ]]; then
      continue
    fi

    local photos_json
    photos_json=$(process_album "$album_dir")

    local album_slug
    album_slug=$(slugify "$album_name")
    local cover_url
    cover_url=$(echo "$photos_json" | jq -r '.[0].thumb_url // ""')
    local photo_count
    photo_count=$(echo "$photos_json" | jq 'length')

    local album_entry
    album_entry=$(jq -n \
      --arg name       "$album_name" \
      --arg slug       "$album_slug" \
      --arg cover_url  "$cover_url" \
      --argjson count  "$photo_count" \
      --argjson photos "$photos_json" \
      '{
        name:      $name,
        slug:      $slug,
        cover_url: $cover_url,
        count:     $count,
        photos:    $photos
      }')

    manifest_albums=$(echo "$manifest_albums" | jq --argjson a "$album_entry" '. + [$a]')

  done < <(find "$PHOTOS_DIR" -mindepth 1 -maxdepth 1 -type d -print0 | sort -z)

  # Write manifest
  local manifest
  manifest=$(jq -n \
    --arg generated_at "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    --arg base_url     "$PUBLIC_BASE_URL" \
    --argjson albums   "$manifest_albums" \
    '{
      generated_at: $generated_at,
      base_url:     $base_url,
      albums:       $albums
    }')

  echo "$manifest" > "$MANIFEST_FILE"
  ok "manifest.json written ($(echo "$manifest_albums" | jq '[.[].count] | add') photos across $(echo "$manifest_albums" | jq 'length') albums)"

  # Upload files
  upload_to_r2

  # Optionally push manifest to R2 too
  if [[ "$MANIFEST_IN_R2" == true ]]; then
    log "Uploading manifest.json to R2..."
    rclone copyto "$MANIFEST_FILE" "$RCLONE_REMOTE:$BUCKET_NAME/manifest.json" \
      --s3-no-check-bucket
    ok "manifest.json available at $PUBLIC_BASE_URL/manifest.json"
  fi

  echo ""
  ok "All done! Your gallery is ready."
}

main "$@"
