import type { LibraryItem, SubtitleCue, AskRequest, AskResponse, ContextRequest, ContextResponse, MessagePlaceholder } from './types';

// DOM Element References
const uploadForm = document.getElementById("upload-form") as HTMLFormElement | null;
const uploadStatus = document.getElementById("upload-status") as HTMLElement | null;
const libraryDropdown = document.getElementById("library-dropdown") as HTMLElement | null;
const libraryToggle = document.getElementById("library-toggle") as HTMLButtonElement | null;
const libraryMenu = document.getElementById("library-menu") as HTMLUListElement | null;
const librarySelected = document.getElementById("library-selected") as HTMLElement | null;
const videoWrapper = document.getElementById("video-wrapper") as HTMLElement | null;
const videoPlayer = document.getElementById("video-player") as HTMLVideoElement | null;
const timestampLabel = document.getElementById("timestamp") as HTMLElement | null;
const questionForm = document.getElementById("question-form") as HTMLFormElement | null;
const questionBox = document.getElementById("question") as HTMLTextAreaElement | null;
const chatLog = document.getElementById("chat-log") as HTMLElement | null;
const subtitleOverlay = document.getElementById("subtitle-overlay") as HTMLElement | null;
const toggleUploadBtn = document.getElementById("toggle-upload") as HTMLButtonElement | null;
const cancelUploadBtn = document.getElementById("cancel-upload") as HTMLButtonElement | null;
const uploadPanel = document.getElementById("upload-panel") as HTMLElement | null;
const fullscreenToggle = document.getElementById("fullscreen-toggle") as HTMLButtonElement | null;
const fullscreenExit = document.getElementById("fullscreen-exit") as HTMLElement | null;
const assistantToggle = document.getElementById("assistant-toggle") as HTMLButtonElement | null;
const playerControls = document.getElementById("player-controls") as HTMLElement | null;
const viewer = document.getElementById("viewer") as HTMLElement | null;
const contextEl = document.getElementById("context") as HTMLElement | null;
const uploadOverlay = document.getElementById("upload-overlay") as HTMLElement | null;
const overlayMessage = document.getElementById("overlay-message") as HTMLElement | null;
const assistantToggleLabel = assistantToggle ? assistantToggle.querySelector(".sr-only") as HTMLElement | null : null;
const fullscreenToggleLabel = fullscreenToggle ? fullscreenToggle.querySelector(".sr-only") as HTMLElement | null : null;

// State Variables
let currentVideoId: string = "";
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let subtitleCache: Map<string, SubtitleCue[]> = new Map();
let activeSubtitleCues: SubtitleCue[] = [];
let lastSubtitleText: string = "";
let assistantCollapsed: boolean = false;
let acknowledgeAutoplay: boolean = false;
let libraryItems: LibraryItem[] = [];
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let libraryFocusIndex: number = -1; // Track focused library item index
let lastLibraryCount: number = 0;
let controlsHideTimer: ReturnType<typeof setTimeout> | null = null;

function toggleUploadPanel(forceState?: boolean): void {
  if (!uploadPanel) return;
  
  const shouldShow: boolean =
    typeof forceState === "boolean"
      ? forceState
      : uploadPanel.classList.contains("hidden");

  if (shouldShow) {
    uploadPanel.classList.remove("hidden");
    uploadPanel.classList.add("visible");
  } else {
    uploadPanel.classList.remove("visible");
    uploadPanel.classList.add("hidden");
    if (uploadForm) uploadForm.reset();
    if (uploadStatus) uploadStatus.textContent = "";
  }
}

function setAssistantCollapsed(collapsed: boolean): void {
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

function renderRichText(target: HTMLElement | null, text: string | null | undefined): void {
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

function scrollChatToBottom(): void {
  if (!chatLog) return;
  chatLog.scrollTo({
    top: chatLog.scrollHeight,
    behavior: "smooth",
  });
}

function showPlayerControls(temp: boolean = false): void {
  if (!playerControls || !videoPlayer) return;
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

function hidePlayerControls(): void {
  if (!playerControls || !videoPlayer) return;
  if (!videoPlayer.paused) {
    playerControls.classList.add("controls-hidden");
  }
}

function setUploadOverlay(active: boolean, message?: string): void {
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

function autoResizeTextarea(element: HTMLTextAreaElement | null, maxHeight: number = 220): void {
  if (!element) return;
  element.style.height = "auto";
  const nextHeight = Math.min(element.scrollHeight, maxHeight);
  element.style.height = `${nextHeight}px`;
}

function appendMessage(role: "user" | "assistant", text: string): MessagePlaceholder {
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

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return [hrs, mins, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

function updateSubtitleOverlay(text: string): void {
  if (!subtitleOverlay) return;
  if (!text) {
    subtitleOverlay.textContent = "";
    subtitleOverlay.classList.remove("visible");
    return;
  }
  subtitleOverlay.textContent = text;
  subtitleOverlay.classList.add("visible");
}

async function handleUpload(event: Event): Promise<void> {
  event.preventDefault();
  if (!uploadForm || !uploadStatus) return;
  const formData = new FormData(uploadForm);
  const submitButton = uploadForm.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  uploadStatus.textContent = "Evaluating video and subtitles...";
  if (submitButton) submitButton.disabled = true;
  if (cancelUploadBtn) cancelUploadBtn.disabled = true;
  setUploadOverlay(true, "Checking your video and subtitle files...");

  try {
    const response = await fetch("/api/videos", {
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    uploadStatus.textContent = `Error: ${errorMessage}`;
  } finally {
    setUploadOverlay(false);
    if (submitButton) submitButton.disabled = false;
    if (cancelUploadBtn) cancelUploadBtn.disabled = false;
  }
}

async function fetchVideos(): Promise<void> {
  const response = await fetch("/api/videos");
  const items: LibraryItem[] = await response.json();

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

function renderLibraryMenu(items: LibraryItem[]): void {
  if (!libraryMenu || !libraryToggle || !libraryDropdown || !librarySelected) return;

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
    removeBtn.addEventListener("click", (event: MouseEvent) => {
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

    entry.addEventListener("keydown", (event: KeyboardEvent) => {
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
          if (libraryToggle) libraryToggle.focus();
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

function updateLibrarySelection(): void {
  if (!librarySelected) return;
  const selectedEntry = libraryItems.find((item) => item.video_id === currentVideoId);
  let displayText: string;
  if (selectedEntry) {
    displayText = selectedEntry.title;
  } else if (libraryItems.length) {
    displayText = "Select a video…";
  } else {
    displayText = "No videos uploaded yet";
  }
  librarySelected.textContent = displayText;
  librarySelected.title = displayText;

  if (!libraryMenu) return;
  const nodes = libraryMenu.querySelectorAll(".library-item");
  nodes.forEach((node) => {
    const isActive = (node as HTMLElement).dataset.id === currentVideoId;
    node.classList.toggle("active", isActive);
    node.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function openLibraryMenu(): void {
  if (!libraryDropdown || !libraryToggle || !libraryItems.length) return;
  if (libraryDropdown.classList.contains("open")) return;
  libraryDropdown.classList.add("open");
  libraryToggle.setAttribute("aria-expanded", "true");
  positionLibraryMenu();

  const selectedIndex = libraryItems.findIndex((item) => item.video_id === currentVideoId);
  const defaultIndex = selectedIndex >= 0 ? selectedIndex : 0;
  focusLibraryItem(defaultIndex);
}

function closeLibraryMenu(): void {
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

function focusLibraryItem(index: number): void {
  if (!libraryMenu) return;
  const items = [...libraryMenu.querySelectorAll(".library-item")] as HTMLElement[];
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

function positionLibraryMenu(): void {
  if (!libraryMenu || !libraryToggle || !libraryDropdown) return;
  if (!libraryDropdown.classList.contains("open")) return;
  const rect = libraryToggle.getBoundingClientRect();
  libraryMenu.style.position = "fixed";
  libraryMenu.style.left = `${rect.left + window.scrollX}px`;
  libraryMenu.style.top = `${rect.bottom + window.scrollY + 10}px`;
  libraryMenu.style.width = `${rect.width}px`;
}

async function handleDeleteRequest(videoId: string, title: string): Promise<void> {
  if (!videoId) return;
  const confirmed = confirm(
    `Remove "${title}" from the library? This will delete the uploaded files.`
  );
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/videos/${videoId}`, { method: "DELETE" });
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    alert(`Could not remove video: ${errorMessage}`);
  }
}

function attachSubtitles(videoId: string): void {
  if (!videoPlayer) return;
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
  track.src = `/api/videos/${videoId}/subtitles`;
  videoPlayer.appendChild(track);
}

function scheduleContextUpdate(): void {
  if (!currentVideoId || !videoPlayer || !timestampLabel || !contextEl) return;
  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(async () => {
    const seconds = videoPlayer.currentTime;
    if (timestampLabel) timestampLabel.textContent = formatTime(seconds);

    try {
      const entry = libraryItems.find((item) => item.video_id === currentVideoId);
      if (!entry) return;
      
      // Fetch raw subtitle text for context endpoint
      const subtitleResponse = await fetch(`/api/videos/${currentVideoId}/subtitles`);
      if (!subtitleResponse.ok) {
        if (contextEl) contextEl.textContent = "(No dialogue yet.)";
        return;
      }
      const subtitlesText = await subtitleResponse.text();
      
      if (!subtitlesText) {
        if (contextEl) contextEl.textContent = "(No dialogue yet.)";
        return;
      }
      
      const requestBody: ContextRequest = {
        title: entry.title || "Unknown",
        timestamp: Math.floor(seconds),
        subtitles_text: subtitlesText,
        question: "",
      };
      
      const response = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) return;
      const data: ContextResponse = await response.json();
      if (contextEl) contextEl.textContent = data.context || "(No dialogue yet.)";
    } catch (error) {
      console.error(error);
    }
  }, 250);
}

function parseSRT(text: string): SubtitleCue[] {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n\s*\n/);
  const timePattern = /(\d{2}):(\d{2}):(\d{2}),(\d{3})/;
  const cues: SubtitleCue[] = [];

  const toSeconds = (fragment: string): number | null => {
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

async function loadSubtitleCues(videoId: string): Promise<SubtitleCue[]> {
  if (subtitleCache.has(videoId)) {
    return subtitleCache.get(videoId)!;
  }
  const entry = libraryItems.find((item) => item.video_id === videoId);
  if (!entry || !entry.subtitle_path) {
    subtitleCache.set(videoId, []);
    return [];
  }
  try {
    const response = await fetch(`/api/videos/${videoId}/subtitles`);
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

function syncSubtitleOverlay(seconds: number): void {
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

async function selectVideo(videoId: string): Promise<void> {
  closeLibraryMenu();
  currentVideoId = videoId;
  updateLibrarySelection();
  if (chatLog) chatLog.innerHTML = "";
  if (questionBox) questionBox.value = "";
  if (questionBox) autoResizeTextarea(questionBox);
  if (contextEl) contextEl.textContent = "(No dialogue yet.)";
  lastSubtitleText = "";
  updateSubtitleOverlay("");

  if (!videoId) {
    if (videoPlayer) {
      videoPlayer.pause();
      videoPlayer.removeAttribute("src");
      videoPlayer.load();
    }
    return;
  }

  if (!videoPlayer) return;
  videoPlayer.src = `/api/videos/${videoId}/stream`;
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

async function askQuestion(): Promise<void> {
  if (!currentVideoId) {
    alert("Select or upload a video first.");
    return;
  }
  if (!questionBox || !questionForm) return;
  const question = questionBox.value.trim();
  if (!question) return;

  const submitButton = questionForm.querySelector("button") as HTMLButtonElement | null;
  if (!submitButton) return;
  submitButton.disabled = true;

  appendMessage("user", question);
  questionBox.value = "";
  autoResizeTextarea(questionBox);
  const placeholder = appendMessage("assistant", "Thinking...");

  const maxAttempts = 3;
  let attempt = 0;
  let lastError = "I'm having trouble answering right now.";

  // Get video entry and subtitles
  const entry = libraryItems.find((item) => item.video_id === currentVideoId);
  if (!entry) {
    if (placeholder.content) {
      renderRichText(placeholder.content, "Error: Video not found in library.");
    }
    submitButton.disabled = false;
    return;
  }

  // Fetch raw subtitle text
  let subtitlesText = "";
  try {
    const subtitleResponse = await fetch(`/api/videos/${currentVideoId}/subtitles`);
    if (subtitleResponse.ok) {
      subtitlesText = await subtitleResponse.text();
    } else {
      throw new Error("Failed to fetch subtitles");
    }
  } catch (error) {
    if (placeholder.content) {
      renderRichText(placeholder.content, "Error: Could not load subtitles. Please try again.");
    }
    submitButton.disabled = false;
    return;
  }

  while (attempt < maxAttempts) {
    try {
      const requestBody: AskRequest = {
        title: entry.title || "Unknown",
        timestamp: Math.floor(videoPlayer?.currentTime || 0),
        subtitles_text: subtitlesText,
        question,
        provider: "ollama",
        model: "llama3",
      };
      
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        let message = "I'm having trouble answering right now.";
        const raw = await response.text();
        if (raw) {
          try {
            const data = JSON.parse(raw) as { detail?: string; message?: string };
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
      const data: AskResponse = await response.json();
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

function toggleFullscreen(): void {
  if (!viewer) return;
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

if (uploadForm) {
  uploadForm.addEventListener("submit", handleUpload);
}
if (videoPlayer) {
  videoPlayer.addEventListener("timeupdate", scheduleContextUpdate);
  videoPlayer.addEventListener("timeupdate", () => syncSubtitleOverlay(videoPlayer.currentTime));
  videoPlayer.addEventListener("seeked", () => syncSubtitleOverlay(videoPlayer.currentTime));
}
if (questionBox) {
  questionBox.addEventListener("input", () => autoResizeTextarea(questionBox));
  autoResizeTextarea(questionBox);
  questionBox.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (questionForm) questionForm.requestSubmit();
    }
  });
}
if (questionForm) {
  questionForm.addEventListener("submit", (event: Event) => {
    event.preventDefault();
    askQuestion();
  });
}
if (toggleUploadBtn) {
  toggleUploadBtn.addEventListener("click", () => toggleUploadPanel());
}
if (cancelUploadBtn) {
  cancelUploadBtn.addEventListener("click", () => toggleUploadPanel(false));
}
if (fullscreenToggle) {
  fullscreenToggle.addEventListener("click", toggleFullscreen);
}
if (assistantToggle) {
  assistantToggle.addEventListener("click", () =>
    setAssistantCollapsed(!assistantCollapsed)
  );
}

if (libraryToggle) {
  libraryToggle.addEventListener("click", () => {
    if (libraryDropdown && libraryDropdown.classList.contains("open")) {
      closeLibraryMenu();
    } else {
      openLibraryMenu();
    }
  });

  libraryToggle.addEventListener("keydown", (event: KeyboardEvent) => {
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

document.addEventListener("click", (event: MouseEvent) => {
  if (libraryDropdown && event.target && !libraryDropdown.contains(event.target as Node)) {
    closeLibraryMenu();
  }
});

document.addEventListener("keydown", (event: KeyboardEvent) => {
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

