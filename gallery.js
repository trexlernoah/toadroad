const MANIFEST_URL = "https://images.toadroad.online/manifest.json";

let allPhotos = []; // flat array of all photo objects
let filtered = []; // currently visible photos
let currentIdx = 0; // lightbox index into `filtered`

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

async function init() {
  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = await res.json();

    allPhotos = manifest.albums.flatMap((album) => album.photos);

    buildAlbumTabs(manifest.albums);
    showPhotos(allPhotos);
  } catch (err) {
    console.error("Failed to load manifest:", err);
    loading.remove();
    emptyMsg.hidden = false;
    emptyMsg.textContent = "Could not load photos. Please try again later.";
  }
}

function buildAlbumTabs(albums) {
  albums.forEach((album) => {
    const btn = document.createElement("button");
    btn.className = "album-tab";
    btn.dataset.album = album.slug;
    btn.textContent = album.name;
    albumStrip.appendChild(btn);
  });

  albumStrip.addEventListener("click", (e) => {
    const tab = e.target.closest(".album-tab");
    if (!tab) return;

    albumStrip
      .querySelectorAll(".album-tab")
      .forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    const slug = tab.dataset.album;
    const photos =
      slug === "all"
        ? allPhotos
        : allPhotos.filter((p) => p.album_slug === slug);

    showPhotos(photos);
  });
}

function showPhotos(photos) {
  filtered = photos;

  grid.querySelectorAll(".tile").forEach((t) => t.remove());
  loading.hidden = true;
  emptyMsg.hidden = photos.length > 0;

  if (photos.length === 0) return;

  photos.forEach((photo, idx) => {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.dataset.idx = idx;

    const img = document.createElement("img");
    img.alt = photo.title || "";
    img.loading = "lazy";
    img.decoding = "async";

    if (photo.thumb_width && photo.thumb_height) {
      img.width = photo.thumb_width;
      img.height = photo.thumb_height;
    }

    img.addEventListener("load", () => img.classList.add("loaded"));
    img.src = photo.thumb_url;

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

init();
