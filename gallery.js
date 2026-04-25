/**
 * gallery.js
 * Fetches manifest.json from R2, shows album list first,
 * loads photos only when an album is selected.
 */

const MANIFEST_URL = "https://images.toadroad.online/manifest.json";

// ── State ──────────────────────────────────────────────────────────────────

let albums = []; // all album objects from manifest
let filtered = []; // photos in the currently open album
let currentIdx = 0; // lightbox index into `filtered`

// ── DOM refs ───────────────────────────────────────────────────────────────

const grid = document.getElementById("grid");
const loading = document.getElementById("loading");
const emptyMsg = document.getElementById("empty-msg");
const albumStrip = document.getElementById("album-strip");
const lightbox = document.getElementById("lightbox");
const backdrop = document.getElementById("lb-backdrop");
const lbImg = document.getElementById("lb-img");
const lbSpinner = document.getElementById("lb-spinner");
const lbTitle = document.getElementById("lb-title");
const lbDownload = document.getElementById("lb-download");
const lbClose = document.getElementById("lb-close");
const lbPrev = document.getElementById("lb-prev");
const lbNext = document.getElementById("lb-next");

// ── Boot ───────────────────────────────────────────────────────────────────

async function init() {
  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = await res.json();
    albums = manifest.albums;
    loading.remove();
    showAlbumList();
  } catch (err) {
    console.error("Failed to load manifest:", err);
    loading.remove();
    emptyMsg.hidden = false;
    emptyMsg.textContent = "Could not load photos. Please try again later.";
  }
}

// ── Album list view ────────────────────────────────────────────────────────

function showAlbumList() {
  albumStrip.hidden = true;
  grid.querySelectorAll(".album-card, .tile").forEach((el) => el.remove());
  emptyMsg.hidden = true;

  if (albums.length === 0) {
    emptyMsg.hidden = false;
    return;
  }

  albums.forEach((album) => {
    const card = document.createElement("div");
    card.className = "album-card";

    const cover = document.createElement("div");
    cover.className = "album-cover";

    if (album.cover_url) {
      const img = document.createElement("img");
      img.src = album.cover_url;
      img.alt = album.name;
      img.loading = "lazy";
      img.addEventListener("load", () => img.classList.add("loaded"));
      cover.appendChild(img);
    } else {
      cover.classList.add("no-cover");
    }

    const info = document.createElement("div");
    info.className = "album-info";

    const name = document.createElement("span");
    name.className = "album-name";
    name.textContent = album.name;

    const count = document.createElement("span");
    count.className = "album-count";
    count.textContent = `${album.count} photo${album.count !== 1 ? "s" : ""}`;

    info.appendChild(name);
    info.appendChild(count);
    card.appendChild(cover);
    card.appendChild(info);
    card.addEventListener("click", () => openAlbum(album));
    grid.appendChild(card);
  });
}

// ── Album photo view ───────────────────────────────────────────────────────

function openAlbum(album) {
  filtered = album.photos;

  albumStrip.hidden = false;
  albumStrip.innerHTML = "";

  const backBtn = document.createElement("button");
  backBtn.className = "album-tab active";
  backBtn.textContent = "← " + album.name;
  backBtn.addEventListener("click", showAlbumList);
  albumStrip.appendChild(backBtn);

  grid.querySelectorAll(".album-card, .tile").forEach((el) => el.remove());

  filtered.forEach((photo, idx) => {
    const tile = document.createElement("div");
    tile.className = "tile";

    const img = document.createElement("img");
    img.src = photo.thumb_url;
    img.alt = photo.title || "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("load", () => img.classList.add("loaded"));

    const overlay = document.createElement("div");
    overlay.className = "tile-overlay";

    const titleEl = document.createElement("span");
    titleEl.className = "tile-title";
    titleEl.textContent = photo.title || "";

    overlay.appendChild(titleEl);
    tile.appendChild(img);
    tile.appendChild(overlay);
    tile.addEventListener("click", () => openLightbox(idx));
    grid.appendChild(tile);
  });
}

// ── Lightbox ───────────────────────────────────────────────────────────────

function openLightbox(idx) {
  currentIdx = idx;
  lightbox.hidden = false;
  backdrop.hidden = false;
  document.body.style.overflow = "hidden";
  loadLightboxImage(idx);
}

function closeLightbox() {
  lightbox.hidden = true;
  backdrop.hidden = true;
  document.body.style.overflow = "";
  lbImg.classList.remove("loaded");
  lbImg.src = "";
}

function loadLightboxImage(idx) {
  const photo = filtered[idx];
  if (!photo) return;

  lbImg.classList.remove("loaded");
  lbSpinner.hidden = false;

  lbTitle.textContent = photo.title || "";
  lbDownload.href = photo.url;
  lbDownload.setAttribute("download", (photo.title || "photo") + ".jpg");

  lbPrev.style.visibility = idx > 0 ? "visible" : "hidden";
  lbNext.style.visibility = idx < filtered.length - 1 ? "visible" : "hidden";

  const fullImg = new Image();
  fullImg.onload = () => {
    lbImg.src = photo.url;
    lbImg.alt = photo.title || "";
    lbImg.classList.add("loaded");
    lbSpinner.hidden = true;
  };
  fullImg.onerror = () => {
    lbSpinner.hidden = true;
  };
  fullImg.src = photo.url;
}

function navigate(dir) {
  const next = currentIdx + dir;
  if (next < 0 || next >= filtered.length) return;
  currentIdx = next;
  loadLightboxImage(currentIdx);
}

// ── Event listeners ────────────────────────────────────────────────────────

if (lbClose) lbClose.addEventListener("click", closeLightbox);
backdrop.addEventListener("click", closeLightbox);
lbPrev.addEventListener("click", () => navigate(-1));
lbNext.addEventListener("click", () => navigate(1));

document.addEventListener("keydown", (e) => {
  if (lightbox.hidden) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") navigate(-1);
  if (e.key === "ArrowRight") navigate(1);
});

let touchStartX = 0;
lightbox.addEventListener(
  "touchstart",
  (e) => {
    touchStartX = e.changedTouches[0].clientX;
  },
  { passive: true }
);
lightbox.addEventListener(
  "touchend",
  (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) navigate(dx < 0 ? 1 : -1);
  },
  { passive: true }
);

// ── Start ──────────────────────────────────────────────────────────────────

init();
