const uploadForm = document.getElementById("upload-form");
const uploadStatus = document.getElementById("upload-status");
const libraryDropdown = document.getElementById("library-dropdown");
const libraryToggle = document.getElementById("library-toggle");
const libraryMenu = document.getElementById("library-menu");
const librarySelected = document.getElementById("library-selected");
const videoWrapper = document.getElementById("video-wrapper");
const videoPlayer = document.getElementById("video-player");
const timestampLabel = document.getElementById("timestamp");
const questionForm = document.getElementById("question-form");
const questionBox = document.getElementById("question");
const chatLog = document.getElementById("chat-log");
const subtitleOverlay = document.getElementById("subtitle-overlay");
const toggleUploadBtn = document.getElementById("toggle-upload");
const cancelUploadBtn = document.getElementById("cancel-upload");
const uploadPanel = document.getElementById("upload-panel");
const fullscreenToggle = document.getElementById("fullscreen-toggle");
const fullscreenExit = document.getElementById("fullscreen-exit");
const assistantToggle = document.getElementById("assistant-toggle");
const playerControls = document.getElementById("player-controls");
const viewer = document.getElementById("viewer");
const contextEl = document.getElementById("context");
const uploadOverlay = document.getElementById("upload-overlay");
const overlayMessage = document.getElementById("overlay-message");
const assistantToggleLabel = assistantToggle ? assistantToggle.querySelector(".sr-only") : null;
const fullscreenToggleLabel = fullscreenToggle ? fullscreenToggle.querySelector(".sr-only") : null;

let currentVideoId = "";
let debounceTimer = null;
let subtitleCache = new Map();
let activeSubtitleCues = [];
let lastSubtitleText = "";
let assistantCollapsed = false;
let acknowledgeAutoplay = false;
let libraryItems = [];
let libraryFocusIndex = -1;
let lastLibraryCount = 0;
let controlsHideTimer = null;

function toggleUploadPanel(forceState) {
  const shouldShow =
    typeof forceState === "boolean"
      ? forceState
      : uploadPanel.classList.contains("hidden");

  if (shouldShow) {
    uploadPanel.classList.remove("hidden");
    uploadPanel.classList.add("visible");
  } else {
    uploadPanel.classList.remove("visible");
    uploadPanel.classList.add("hidden");
    uploadForm.reset();
    uploadStatus.textContent = "";
  }
}

function setAssistantCollapsed(collapsed) {
  assistantCollapsed = collapsed;
  document.body.classList.toggle("assistant-collapsed", collapsed);
  if (assistantToggle) {
    const label = collapsed ? "Show Assistant" : "Hide Assistant";
    assistantToggle.setAttribute("aria-pressed", collapsed ? "true" : "false");
    assistantToggle.classList.toggle("is-collapsed", collapsed);
    assistantToggle.setAttribute("aria-label", label);
    assistantToggle.setAttribute("title", label);
    if (assistantToggleLabel) {
      assistantToggleLabel.textContent = label;
    }
  }
}

function renderRichText(target, text) {
  if (!target) return;
  target.replaceChildren();
  if (!text) {
    target.textContent = "";
    return;
  }
  const fragment = document.createDocumentFragment();
  const lines = String(text).split(/\n/);
  lines.forEach((line, index) => {
    fragment.appendChild(document.createTextNode(line));
    if (index < lines.length - 1) {
      fragment.appendChild(document.createElement("br"));
    }
  });
  target.appendChild(fragment);
}

function scrollChatToBottom() {
  if (!chatLog) return;
  chatLog.scrollTo({
    top: chatLog.scrollHeight,
    behavior: "smooth",
  });
}

function showPlayerControls(temp = false) {
  if (!playerControls) return;
  playerControls.classList.remove("controls-hidden");
  if (controlsHideTimer) {
    clearTimeout(controlsHideTimer);
    controlsHideTimer = null;
  }
  if (temp && !videoPlayer.paused) {
    controlsHideTimer = window.setTimeout(() => {
      if (!videoPlayer.paused && !(videoWrapper && videoWrapper.matches(":hover"))) {
        playerControls.classList.add("controls-hidden");
      }
    }, 1200);
  }
}

function hidePlayerControls() {
  if (!playerControls) return;
  if (!videoPlayer.paused) {
    playerControls.classList.add("controls-hidden");
  }
}

function setUploadOverlay(active, message) {
  if (!uploadOverlay) return;
  if (message && overlayMessage) {
    overlayMessage.textContent = message;
  }
  if (active) {
    uploadOverlay.classList.remove("hidden");
  } else {
    uploadOverlay.classList.add("hidden");
  }
}

function autoResizeTextarea(element, maxHeight = 220) {
  if (!element) return;
  element.style.height = "auto";
  const nextHeight = Math.min(element.scrollHeight, maxHeight);
  element.style.height = `${nextHeight}px`;
}

function appendMessage(role, text) {
  if (!chatLog) {
    return { element: null, bubble: null, content: null, time: null };
  }

  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${role}`;
  const delay = role === "assistant" ? 0.08 : 0.02;
  wrapper.style.animationDelay = `${delay}s`;

  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";
  avatar.textContent = role === "assistant" ? "Stevie" : "You";
  avatar.setAttribute("aria-hidden", "true");

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";

  const body = document.createElement("div");
  body.className = "chat-content";
  renderRichText(body, text);

  const meta = document.createElement("div");
  meta.className = "chat-meta";
  const time = document.createElement("time");
  time.dateTime = new Date().toISOString();
  time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  meta.appendChild(time);

  bubble.appendChild(body);
  bubble.appendChild(meta);

  if (role === "assistant") {
    wrapper.appendChild(avatar);
    wrapper.appendChild(bubble);
  } else {
    wrapper.appendChild(bubble);
    wrapper.appendChild(avatar);
  }

  chatLog.appendChild(wrapper);
  scrollChatToBottom();
  return { element: wrapper, bubble, content: body, time };
}

function formatTime(seconds) {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return [hrs, mins, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

function updateSubtitleOverlay(text) {
  if (!subtitleOverlay) return;
  if (!text) {
    subtitleOverlay.textContent = "";
    subtitleOverlay.classList.remove("visible");
    return;
  }
  subtitleOverlay.textContent = text;
  subtitleOverlay.classList.add("visible");
}

async function handleUpload(event) {
  event.preventDefault();
  if (!uploadForm) return;
  const formData = new FormData(uploadForm);
  const submitButton = uploadForm.querySelector('button[type="submit"]');
  uploadStatus.textContent = "Evaluating video and subtitles...";
  if (submitButton) submitButton.disabled = true;
  if (cancelUploadBtn) cancelUploadBtn.disabled = true;
  setUploadOverlay(true, "Checking your video and subtitle files...");

  try {
    const response = await fetch("/videos", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Upload failed");
    }
    uploadStatus.textContent = "Upload complete. Refreshing library...";
    await fetchVideos();
    toggleUploadPanel(false);
  } catch (error) {
    uploadStatus.textContent = `Error: ${error.message}`;
  } finally {
    setUploadOverlay(false);
    if (submitButton) submitButton.disabled = false;
    if (cancelUploadBtn) cancelUploadBtn.disabled = false;
  }
}

async function fetchVideos() {
  const response = await fetch("/videos");
  const items = await response.json();

  const previous = currentVideoId;
  const hadSelection = Boolean(previous);
  const previousCount = lastLibraryCount;
  libraryItems = items;
  renderLibraryMenu(items);

  const hasPrevious = hadSelection && items.some((item) => item.video_id === previous);
  if (hasPrevious) {
    updateLibrarySelection();
  } else if (!items.length) {
    await selectVideo("");
  } else if (previousCount === 0 && items.length > 0 && !hadSelection) {
    await selectVideo(items[0].video_id);
  } else {
    updateLibrarySelection();
  }

  lastLibraryCount = items.length;
}

function renderLibraryMenu(items) {
  if (!libraryMenu || !libraryToggle || !libraryDropdown) return;

  closeLibraryMenu();
  libraryMenu.innerHTML = "";
  libraryFocusIndex = -1;

  const hasItems = items.length > 0;
  libraryDropdown.classList.toggle("is-empty", !hasItems);

  if (!hasItems) {
    librarySelected.textContent = "No videos uploaded yet";
    libraryToggle.disabled = true;
    libraryToggle.setAttribute("aria-expanded", "false");
    return;
  }

  libraryToggle.disabled = false;
  libraryToggle.removeAttribute("disabled");

  items.forEach((item, index) => {
    const entry = document.createElement("li");
    entry.className = "library-item";
    entry.dataset.id = item.video_id;
    entry.setAttribute("role", "option");
    entry.setAttribute("aria-selected", "false");
    entry.tabIndex = -1;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "library-remove";
    removeBtn.title = "Remove";
    removeBtn.setAttribute("aria-label", `Remove ${item.title}`);
    removeBtn.textContent = "\u2716";
    removeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      handleDeleteRequest(item.video_id, item.title);
    });

    const title = document.createElement("span");
    title.className = "library-title";
    title.textContent = item.title;
    title.title = item.title;

    entry.appendChild(title);
    entry.appendChild(removeBtn);

    entry.addEventListener("click", () => {
      closeLibraryMenu();
      if (item.video_id !== currentVideoId) {
        selectVideo(item.video_id);
      }
    });

    entry.addEventListener("keydown", (event) => {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          focusLibraryItem(index + 1);
          break;
        case "ArrowUp":
          event.preventDefault();
          focusLibraryItem(index - 1);
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          closeLibraryMenu();
          if (item.video_id !== currentVideoId) {
            selectVideo(item.video_id);
          }
          break;
        case "Escape":
          event.preventDefault();
          closeLibraryMenu();
          libraryToggle.focus();
          break;
        case "Delete":
        case "Backspace":
          event.preventDefault();
          handleDeleteRequest(item.video_id, item.title);
          break;
        default:
          break;
      }
    });

    libraryMenu.appendChild(entry);
  });

  updateLibrarySelection();
}

function updateLibrarySelection() {
  if (!librarySelected) return;
  const selectedEntry = libraryItems.find((item) => item.video_id === currentVideoId);
  let displayText;
  if (selectedEntry) {
    displayText = selectedEntry.title;
  } else if (libraryItems.length) {
    displayText = "Select a video\u2026";
  } else {
    displayText = "No videos uploaded yet";
  }
  librarySelected.textContent = displayText;
  librarySelected.title = displayText;

  if (!libraryMenu) return;
  const nodes = libraryMenu.querySelectorAll(".library-item");
  nodes.forEach((node) => {
    const isActive = node.dataset.id === currentVideoId;
    node.classList.toggle("active", isActive);
    node.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function openLibraryMenu() {
  if (!libraryDropdown || !libraryToggle || !libraryItems.length) return;
  if (libraryDropdown.classList.contains("open")) return;
  libraryDropdown.classList.add("open");
  libraryToggle.setAttribute("aria-expanded", "true");
  positionLibraryMenu();

  const selectedIndex = libraryItems.findIndex((item) => item.video_id === currentVideoId);
  const defaultIndex = selectedIndex >= 0 ? selectedIndex : 0;
  focusLibraryItem(defaultIndex);
}

function closeLibraryMenu() {
  if (!libraryDropdown || !libraryToggle) return;
  if (!libraryDropdown.classList.contains("open")) {
    libraryToggle.setAttribute("aria-expanded", "false");
    return;
  }
  libraryDropdown.classList.remove("open");
  libraryToggle.setAttribute("aria-expanded", "false");
  libraryFocusIndex = -1;
  if (libraryMenu) {
    libraryMenu.style.position = "";
    libraryMenu.style.left = "";
    libraryMenu.style.top = "";
    libraryMenu.style.width = "";
  }
}

function focusLibraryItem(index) {
  if (!libraryMenu) return;
  const items = [...libraryMenu.querySelectorAll(".library-item")];
  if (!items.length) return;
  let targetIndex = index;
  if (index < 0) targetIndex = items.length - 1;
  if (index >= items.length) targetIndex = 0;
  const target = items[targetIndex];
  if (target) {
    libraryFocusIndex = targetIndex;
    target.focus();
    target.scrollIntoView({ block: "nearest" });
  }
}

function positionLibraryMenu() {
  if (!libraryMenu || !libraryToggle) return;
  if (!libraryDropdown || !libraryDropdown.classList.contains("open")) return;
  const rect = libraryToggle.getBoundingClientRect();
  libraryMenu.style.position = "fixed";
  libraryMenu.style.left = `${rect.left + window.scrollX}px`;
  libraryMenu.style.top = `${rect.bottom + window.scrollY + 10}px`;
  libraryMenu.style.width = `${rect.width}px`;
}

async function handleDeleteRequest(videoId, title) {
  if (!videoId) return;
  const confirmed = confirm(
    `Remove "${title}" from the library? This will delete the uploaded files.`
  );
  if (!confirmed) return;

  try {
    const response = await fetch(`/videos/${videoId}`, { method: "DELETE" });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Failed to remove video.");
    }
    subtitleCache.delete(videoId);
    if (currentVideoId === videoId) {
      await selectVideo("");
    }
    await fetchVideos();
  } catch (error) {
    alert(`Could not remove video: ${error.message}`);
  }
}

function attachSubtitles(videoId) {
  const existing = document.getElementById("subtitle-track");
  if (existing) existing.remove();

  const entry = libraryItems.find((item) => item.video_id === videoId);
  if (!entry) return;
  const subtitlePath = entry.subtitle_path;
  if (!subtitlePath) return;

  const track = document.createElement("track");
  track.id = "subtitle-track";
  track.kind = "subtitles";
  track.label = "Subtitles";
  track.srclang = "en";
  track.src = `/videos/${videoId}/subtitles`;
  videoPlayer.appendChild(track);
}

function scheduleContextUpdate() {
  if (!currentVideoId) return;
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(async () => {
    const seconds = videoPlayer.currentTime;
    timestampLabel.textContent = formatTime(seconds);

    try {
      const params = new URLSearchParams({
        video_id: currentVideoId,
        timestamp: Math.floor(seconds).toString(),
      });
      const response = await fetch(`/context?${params.toString()}`);
      if (!response.ok) return;
      const data = await response.json();
      contextEl.textContent = data.context || "(No dialogue yet.)";
    } catch (error) {
      console.error(error);
    }
  }, 250);
}

function parseSRT(text) {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n\s*\n/);
  const timePattern = /(\d{2}):(\d{2}):(\d{2}),(\d{3})/;
  const cues = [];

  const toSeconds = (fragment) => {
    const match = timePattern.exec(fragment);
    if (!match) return null;
    const [, hh, mm, ss, ms] = match.map(Number);
    return hh * 3600 + mm * 60 + ss + ms / 1000;
  };

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 2) continue;

    let timingIndex = lines[0].includes("-->") ? 0 : 1;
    if (!lines[timingIndex] || !lines[timingIndex].includes("-->")) continue;

    const [startRaw, endRaw] = lines[timingIndex].split("-->").map((part) => part.trim());
    const start = toSeconds(startRaw);
    const end = toSeconds(endRaw);
    if (start == null || end == null) continue;

    const textContent = lines
      .slice(timingIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!textContent) continue;
    cues.push({ start, end, text: textContent });
  }

  return cues;
}

async function loadSubtitleCues(videoId) {
  if (subtitleCache.has(videoId)) {
    return subtitleCache.get(videoId);
  }
  const entry = libraryItems.find((item) => item.video_id === videoId);
  if (!entry || !entry.subtitle_path) {
    subtitleCache.set(videoId, []);
    return [];
  }
  try {
    const response = await fetch(`/videos/${videoId}/subtitles`);
    if (!response.ok) throw new Error("Failed to fetch subtitles");
    const text = await response.text();
    const cues = parseSRT(text);
    subtitleCache.set(videoId, cues);
    return cues;
  } catch (error) {
    console.error(error);
    subtitleCache.set(videoId, []);
    return [];
  }
}

function syncSubtitleOverlay(seconds) {
  if (!activeSubtitleCues.length) {
    updateSubtitleOverlay("");
    return;
  }
  const cue = activeSubtitleCues.find(
    (entry) => seconds >= entry.start && seconds <= entry.end
  );
  const text = cue ? cue.text : "";
  if (text === lastSubtitleText) return;
  lastSubtitleText = text;
  updateSubtitleOverlay(text);
}

async function selectVideo(videoId) {
  closeLibraryMenu();
  currentVideoId = videoId;
  updateLibrarySelection();
  chatLog.innerHTML = "";
  questionBox.value = "";
  autoResizeTextarea(questionBox);
  contextEl.textContent = "(No dialogue yet.)";
  lastSubtitleText = "";
  updateSubtitleOverlay("");

  if (!videoId) {
    videoPlayer.pause();
    videoPlayer.removeAttribute("src");
    videoPlayer.load();
    return;
  }

  videoPlayer.src = `/videos/${videoId}/stream`;
  attachSubtitles(videoId);
  activeSubtitleCues = await loadSubtitleCues(videoId);

  await videoPlayer.play().catch(() => {
    if (!acknowledgeAutoplay) {
      appendMessage(
        "assistant",
        "Hey, it's StevieTheTV - autoplay was blocked. Give the play button a tap to keep going."
      );
      acknowledgeAutoplay = true;
    }
  });
}

async function askQuestion() {
  if (!currentVideoId) {
    alert("Select or upload a video first.");
    return;
  }
  const question = questionBox.value.trim();
  if (!question) return;

  const submitButton = questionForm.querySelector("button");
  submitButton.disabled = true;

  appendMessage("user", question);
  questionBox.value = "";
  autoResizeTextarea(questionBox);
  const placeholder = appendMessage("assistant", "Thinking...");

  const maxAttempts = 3;
  let attempt = 0;
  let lastError = "I'm having trouble answering right now.";

  while (attempt < maxAttempts) {
    try {
      const response = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: currentVideoId,
          timestamp: Math.floor(videoPlayer.currentTime),
          question,
          provider: "ollama",
          model: "llama3",
        }),
      });
      if (!response.ok) {
        let message = "I'm having trouble answering right now.";
        const raw = await response.text();
        if (raw) {
          try {
            const data = JSON.parse(raw);
            if (data?.detail) {
              message = data.detail;
            } else if (data?.message) {
              message = data.message;
            } else {
              message = raw;
            }
          } catch {
            message = raw;
          }
        }
        throw new Error(message);
      }
      const data = await response.json();
      if (placeholder.content) {
        renderRichText(placeholder.content, data.answer);
      }
      if (placeholder.time) {
        placeholder.time.dateTime = new Date().toISOString();
        placeholder.time.textContent = new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      scrollChatToBottom();
      submitButton.disabled = false;
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      attempt += 1;
      if (attempt < maxAttempts) {
        if (placeholder.content) {
          renderRichText(placeholder.content, `Still thinking... re-trying (${attempt + 1}/${maxAttempts})`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
      } else {
        break;
      }
    }
  }

  if (placeholder.content) {
    renderRichText(placeholder.content, `${lastError} Please try again in a moment.`);
  }
  if (placeholder.time) {
    placeholder.time.dateTime = new Date().toISOString();
    placeholder.time.textContent = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (placeholder.bubble) {
    placeholder.bubble.classList.add("error");
  }
  submitButton.disabled = false;
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    viewer.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

document.addEventListener("fullscreenchange", () => {
  const active = Boolean(document.fullscreenElement);
  if (fullscreenExit) {
    fullscreenExit.classList.toggle("hidden", !active);
  }
  if (fullscreenToggle) {
    const label = active ? "Exit Fullscreen" : "Enter Fullscreen";
    fullscreenToggle.classList.toggle("is-active", active);
    fullscreenToggle.setAttribute("aria-label", label);
    fullscreenToggle.setAttribute("title", label);
    if (fullscreenToggleLabel) {
      fullscreenToggleLabel.textContent = label;
    }
  }
});

toggleUploadPanel(false);
setAssistantCollapsed(false);

uploadForm.addEventListener("submit", handleUpload);
videoPlayer.addEventListener("timeupdate", scheduleContextUpdate);
videoPlayer.addEventListener("timeupdate", () => syncSubtitleOverlay(videoPlayer.currentTime));
videoPlayer.addEventListener("seeked", () => syncSubtitleOverlay(videoPlayer.currentTime));
questionBox.addEventListener("input", () => autoResizeTextarea(questionBox));
autoResizeTextarea(questionBox);
questionBox.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    questionForm.requestSubmit();
  }
});
questionForm.addEventListener("submit", (event) => {
  event.preventDefault();
  askQuestion();
});
toggleUploadBtn.addEventListener("click", () => toggleUploadPanel());
cancelUploadBtn.addEventListener("click", () => toggleUploadPanel(false));
fullscreenToggle.addEventListener("click", toggleFullscreen);
if (assistantToggle) {
  assistantToggle.addEventListener("click", () =>
    setAssistantCollapsed(!assistantCollapsed)
  );
}

if (libraryToggle) {
  libraryToggle.addEventListener("click", () => {
    if (libraryDropdown.classList.contains("open")) {
      closeLibraryMenu();
    } else {
      openLibraryMenu();
    }
  });

  libraryToggle.addEventListener("keydown", (event) => {
    if (!libraryItems.length) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openLibraryMenu();
    }
  });
}

if (videoWrapper) {
  videoWrapper.addEventListener("mouseenter", () => {
    showPlayerControls(true);
  });
  videoWrapper.addEventListener("mousemove", () => {
    if (!videoPlayer || videoPlayer.paused) return;
    showPlayerControls(true);
  });
  videoWrapper.addEventListener("mouseleave", () => {
    hidePlayerControls();
  });
}

if (playerControls) {
  playerControls.addEventListener("mouseenter", () => showPlayerControls(true));
  playerControls.addEventListener("mousemove", () => showPlayerControls(true));
}

if (videoPlayer) {
  videoPlayer.addEventListener("play", () => {
    showPlayerControls(true);
  });
  videoPlayer.addEventListener("pause", () => {
    if (controlsHideTimer) {
      clearTimeout(controlsHideTimer);
      controlsHideTimer = null;
    }
    showPlayerControls(false);
  });
}

window.addEventListener("resize", positionLibraryMenu);
window.addEventListener("scroll", positionLibraryMenu, true);

document.addEventListener("click", (event) => {
  if (libraryDropdown && !libraryDropdown.contains(event.target)) {
    closeLibraryMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const wasOpen = libraryDropdown?.classList.contains("open");
    closeLibraryMenu();
    if (wasOpen) {
      libraryToggle?.focus();
    }
  }
});

showPlayerControls(false);

fetchVideos();


