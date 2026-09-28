import { topicsForCategory, topicCategories, type TopicCategory } from "./topics.js";
import { ActionGate, completeWriteOrder, setupRecorder, waitForTransaction } from "./lifecycle.js";

const PREP_SECONDS = 15 * 60;
const SPEECH_SECONDS = 5 * 60;
const ACTIVE_KEY = "speaking-practice.active";
const TOPICS_KEY = "speaking-practice.topic-order-v3";

type Stage = "topic" | "prep" | "ready" | "speech" | "result";
type SessionStatus = "completed" | "interrupted";
interface ActiveState { category?: TopicCategory; stage: Stage; topic: string; notes: string; prepEndsAt?: number; speechStartedAt?: number; speechEndsAt?: number; speechDuration?: number; sessionId?: string; timerOnly?: boolean; mimeType?: string; resultStatus?: SessionStatus; chunksRetained?: boolean; }
interface SessionRecord { title?: string; id: string; topic: string; date: string; notes: string; duration: number; status: SessionStatus; audio?: Blob; mimeType?: string; }

const practice = document.querySelector<HTMLElement>("#practice")!;
const historyList = document.querySelector<HTMLElement>("#history-list")!;
const historyCount = document.querySelector<HTMLElement>("#history-count")!;
const toast = document.querySelector<HTMLElement>("#toast")!;
const themeToggle = document.querySelector<HTMLButtonElement>("#theme-toggle")!;
let state: ActiveState = loadState();
let tickId = 0;
let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let currentAudio: Blob | null = null;
let saveFailed = false;
let chunkIndex = 0;
let currentObjectUrls: string[] = [];
let historyObjectUrls: string[] = [];
let topicSelecting = false;
let stopping = false;
let chunkWrites: Promise<unknown>[] = [];
const speechStartGate = new ActionGate();

function newId(): string { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
function loadState(): ActiveState {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);
    if (raw) return JSON.parse(raw) as ActiveState;
  } catch { /* Start clean when local state is unavailable. */ }
  return { stage: "topic", topic: nextTopic(), notes: "" };
}
function saveState(): void {
  try { localStorage.setItem(ACTIVE_KEY, JSON.stringify(state)); }
  catch { showToast("Progress could not be saved on this device."); }
}
function nextTopic(category: TopicCategory = "Any category"): string {
  const topics = topicsForCategory(category);
  const key = `${TOPICS_KEY}.${category}`;
  try {
    let remaining = JSON.parse(localStorage.getItem(key) || "[]") as number[];
    if (!remaining.length) {
      remaining = topics.map((_, index) => index);
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
    }
    const index = remaining.pop()!;
    localStorage.setItem(key, JSON.stringify(remaining));
    return topics[index];
  } catch { return topics[Math.floor(Math.random() * topics.length)]; }
}
function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]!));
}
function showToast(message: string): void {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3200);
}
function flow(active: number): string {
  return `<div><p class="flow-label">Your session</p><ol class="flow">${["Choose a topic","Prepare · 15 min","Speak · 5 min","Replay"].map((label, i) => `<li class="${i === active ? "active" : ""}"><span class="flow-number">${i + 1}</span><span>${label}</span></li>`).join("")}</ol></div><p class="shortcut"><kbd>Alt</kbd> + <kbd>Enter</kbd> primary action<br><kbd>Esc</kbd> stop timer early</p>`;
}
function clearTick(): void { if (tickId) window.clearInterval(tickId); tickId = 0; }
function bindNotes(): void {
  const notes = document.querySelector<HTMLTextAreaElement>("#notes");
  notes?.addEventListener("input", () => { state.notes = notes.value; saveState(); });
}
function render(): void {
  clearTick();
  currentObjectUrls.forEach(URL.revokeObjectURL); currentObjectUrls = [];
  if (state.stage === "topic") renderTopic();
  if (state.stage === "prep" || state.stage === "ready") renderPrep();
  if (state.stage === "speech") renderSpeech();
  if (state.stage === "result") renderResult();
}
function stageSteps(active: number): string {
  return `<ol class="session-steps" aria-label="Session progress">${["Topic", "Prepare", "Speak", "Replay"].map((label, index) => `<li class="${index === active ? "active" : index < active ? "done" : ""}"${index === active ? ` aria-current="step"` : ""}><span>${index + 1}</span>${label}</li>`).join("")}</ol>`;
}
function focusStage(message: string): void {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>("[data-stage-heading]")?.focus({ preventScroll: true });
    const status = document.querySelector<HTMLElement>("#stage-status");
    if (status) status.textContent = message;
  });
}
function renderTopic(): void {
  practice.innerHTML = `<div class="stage-card topic-picker"><div class="topic-panel"><label class="category-label" for="topic-category">Category</label><select id="topic-category">${["Any category", ...topicCategories].map(category => `<option${category === (state.category || "Any category") ? " selected" : ""}>${category}</option>`).join("")}</select><p class="eyebrow">Your topic</p><h1 class="topic-title" tabindex="-1" data-stage-heading>${escapeHtml(state.topic)}</h1><p class="topic-meta">Take a moment. Change it if it does not spark an idea.</p><div class="action-row"><button class="button" id="another" aria-label="Choose another random topic">↻ Another topic</button><button class="button primary" id="start-prep">Start preparation →</button></div></div><aside class="side-panel">${flow(0)}</aside></div>`;
  document.querySelector("#another")?.addEventListener("click", () => void spinTopic());
  document.querySelector<HTMLSelectElement>("#topic-category")?.addEventListener("change", event => {
    state.category = (event.target as HTMLSelectElement).value as TopicCategory;
    void spinTopic();
  });
  document.querySelector("#start-prep")?.addEventListener("click", startPreparation);
}
async function spinTopic(): Promise<void> {
  const heading = document.querySelector<HTMLElement>(".topic-title");
  if (!heading || topicSelecting) return;
  topicSelecting = true;
  const controls = practice.querySelectorAll<HTMLButtonElement | HTMLSelectElement>("button, select");
  controls.forEach(control => control.disabled = true);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fade = async (from: number, to: number) => {
    if (!reducedMotion) await heading.animate([{ opacity: from }, { opacity: to }], { duration: 100, easing: "ease-out", fill: "forwards" }).finished;
  };
  await fade(1, 0);
  state = { stage: "topic", category: state.category, topic: nextTopic(state.category), notes: "" };
  heading.textContent = state.topic;
  saveState();
  await fade(0, 1);
  heading.getAnimations().forEach(animation => animation.cancel());
  controls.forEach(control => control.disabled = false);
  topicSelecting = false;
  document.querySelector("#stage-status")!.textContent = state.topic;
}
function startPreparation(): void {
  if (topicSelecting) return;
  state.stage = "prep";
  state.prepEndsAt = Date.now() + PREP_SECONDS * 1000;
  saveState(); render(); focusStage("Preparation started. 15 minutes remaining.");
}
function renderPrep(): void {
  const ready = state.stage === "ready";
  practice.innerHTML = `${stageSteps(ready ? 2 : 1)}<div class="workspace"><section class="work-card"><p class="eyebrow">${ready ? "Preparation complete" : "Prepare your response"}</p><h1 class="compact-topic" tabindex="-1" data-stage-heading>${escapeHtml(state.topic)}</h1><div class="timer-wrap"><div class="timer" id="timer" aria-hidden="true">${ready ? "00:00" : formatTime(((state.prepEndsAt || Date.now()) - Date.now()) / 1000)}</div><div class="timer-label">${ready ? "Ready to speak · 5 minutes" : "Preparation remaining"}</div></div><div class="action-row"><a class="button" target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?q=${encodeURIComponent(state.topic)}" aria-label="Search the web for this topic">Search topic ↗</a>${ready ? `<button class="button primary" id="record-speech">Start speaking</button><button class="button" id="timer-only">Use timer only</button>` : `<button class="button primary" id="end-prep">Finish preparation</button>`}</div><div id="mic-notice" aria-live="polite"></div></section><aside class="notes-card"><label for="notes">Preparation notes</label><textarea id="notes" placeholder="Outline your opening, key points, examples, and closing…">${escapeHtml(state.notes)}</textarea><p class="helper">Saved on this device as you type.</p></aside></div>`;
  bindNotes();
  document.querySelector("#end-prep")?.addEventListener("click", () => endPreparation());
  document.querySelector("#record-speech")?.addEventListener("click", () => void startSpeech(false));
  document.querySelector("#timer-only")?.addEventListener("click", () => void startSpeech(true));
  if (!ready) {
    const update = () => {
      const remaining = ((state.prepEndsAt || Date.now()) - Date.now()) / 1000;
      const timer = document.querySelector("#timer");
      if (timer) timer.textContent = formatTime(remaining);
      if (remaining <= 0) endPreparation(true);
    };
    update(); tickId = window.setInterval(update, 250);
  }
}
function endPreparation(alert = false): void {
  clearTick(); state.stage = "ready"; saveState();
  if (alert) playAlert();
  render(); focusStage("Preparation complete. Choose recording or timer-only practice.");
}
function playAlert(): void {
  try {
    const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.frequency.value = 740; gain.gain.setValueAtTime(.12, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .45);
    osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .45);
  } catch { /* The visible ready state is the fallback alert. */ }
}
async function startSpeech(timerOnly: boolean): Promise<void> {
  await speechStartGate.run(async () => {
    let selectedStream: MediaStream | null = null;
    let selectedRecorder: MediaRecorder | null = null;
    if (!timerOnly) {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        showMicError("Recording is unavailable in this browser."); return;
      }
      showMicStarting();
      try {
        const setup = await setupRecorder(
          () => navigator.mediaDevices.getUserMedia({ audio: true }),
          candidate => {
            const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
            return preferred ? new MediaRecorder(candidate, { mimeType: preferred }) : new MediaRecorder(candidate);
          },
        );
        selectedStream = setup.stream; selectedRecorder = setup.recorder;
      } catch {
        showMicError("The microphone could not be started."); return;
      }
    }
    const sessionId = newId(); const now = Date.now();
    state = { ...state, stage: "speech", speechStartedAt: now, speechEndsAt: now + SPEECH_SECONDS * 1000, sessionId, timerOnly, mimeType: selectedRecorder?.mimeType };
    chunks = []; chunkIndex = 0; saveFailed = false; currentAudio = null; chunkWrites = []; stopping = false;
    if (selectedRecorder && selectedStream) {
      stream = selectedStream; recorder = selectedRecorder;
      recorder.addEventListener("dataavailable", event => {
        if (!event.data.size) return;
        chunks.push(event.data);
        const write = putChunk(sessionId, chunkIndex++, event.data);
        chunkWrites.push(write);
        void write.catch(() => { saveFailed = true; showToast("Local saving failed. Your current recording can still be downloaded."); });
      });
      recorder.addEventListener("stop", () => void finishSpeech());
      try { recorder.start(1000); }
      catch {
        stream.getTracks().forEach(track => track.stop()); stream = null; recorder = null;
        state.stage = "ready"; saveState(); showMicError("The microphone could not be started."); return;
      }
    }
    saveState(); render(); focusStage(timerOnly ? "Timer-only speech started. 5 minutes remaining." : "Recording started. 5 minutes remaining.");
  });
}
function showMicStarting(): void {
  const area = document.querySelector<HTMLElement>("#mic-notice");
  if (area) area.innerHTML = `<div class="notice info">Starting microphone…</div>`;
  document.querySelectorAll<HTMLButtonElement>("#record-speech, #timer-only").forEach(button => button.disabled = true);
}
function showMicError(message: string): void {
  const area = document.querySelector<HTMLElement>("#mic-notice");
  if (!area) return;
  area.innerHTML = `<div class="notice"><strong>${message}</strong><br>Check browser microphone permission, then retry. You can also practise with the timer only.<div class="action-row"><button class="button small" id="retry-mic">Retry microphone</button><button class="button small" id="fallback-timer-only">Use timer only</button></div></div>`;
  area.querySelector("#retry-mic")?.addEventListener("click", () => void startSpeech(false));
  area.querySelector("#fallback-timer-only")?.addEventListener("click", () => void startSpeech(true));
}
function renderSpeech(): void {
  practice.innerHTML = `${stageSteps(2)}<div class="workspace"><section class="work-card"><p class="eyebrow">${stopping ? "Saving recording" : "Speech in progress"}</p><h1 class="compact-topic" tabindex="-1" data-stage-heading>${escapeHtml(state.topic)}</h1><div class="timer-wrap"><div class="recording-line">${stopping ? "Saving your session…" : state.timerOnly ? "Timer-only practice" : `<span class="recording-dot" aria-hidden="true"></span> Recording`}</div><div class="timer" id="timer" aria-hidden="true">${formatTime(((state.speechEndsAt || Date.now()) - Date.now()) / 1000)}</div><div class="timer-label">Speech time remaining</div></div><div class="action-row"><button class="button primary" id="stop-speech"${stopping ? " disabled" : ""}>${stopping ? "Saving…" : "Finish speech"}</button></div>${saveFailed ? `<div class="notice">Local saving failed. Keep this page open. Your current audio will remain available for download.</div>` : ""}</section><aside class="notes-card"><label for="notes">Your notes</label><textarea id="notes"${stopping ? " disabled" : ""}>${escapeHtml(state.notes)}</textarea><p class="helper">Glance at your structure, then return to your audience.</p></aside></div>`;
  bindNotes(); document.querySelector("#stop-speech")?.addEventListener("click", stopSpeech);
  const update = () => {
    const remaining = ((state.speechEndsAt || Date.now()) - Date.now()) / 1000;
    const timer = document.querySelector("#timer"); if (timer) timer.textContent = formatTime(remaining);
    if (remaining <= 0) stopSpeech();
  };
  update(); tickId = window.setInterval(update, 200);
}
function stopSpeech(): void {
  if (stopping || state.stage !== "speech") return;
  clearTick();
  stopping = true; renderSpeech();
  if (recorder?.state === "recording") recorder.stop(); else finishSpeech();
  stream?.getTracks().forEach(track => track.stop()); stream = null;
}
async function finishSpeech(): Promise<void> {
  if (state.stage !== "speech") return;
  const duration = Math.min(SPEECH_SECONDS, Math.max(0, Math.round((Date.now() - (state.speechStartedAt || Date.now())) / 1000)));
  if (chunks.length) currentAudio = new Blob(chunks, { type: state.mimeType || chunks[0].type });
  const record: SessionRecord = { id: state.sessionId || newId(), topic: state.topic, date: new Date().toISOString(), notes: state.notes, duration, status: "completed", audio: currentAudio || undefined, mimeType: state.mimeType };
  try { await completeWriteOrder(chunkWrites, () => putSession(record), () => clearChunks(record.id)); }
  catch { saveFailed = true; state.chunksRetained = true; showToast("This session could not be saved. Download the audio before leaving."); }
  recorder = null; state.stage = "result"; state.speechDuration = duration; state.resultStatus = "completed"; saveState(); render(); focusStage("Session complete."); await renderHistory();
}
function renderResult(): void {
  const duration = state.speechDuration ?? Math.min(SPEECH_SECONDS, Math.max(0, Math.round((Date.now() - (state.speechStartedAt || Date.now())) / 1000)));
  const url = currentAudio ? URL.createObjectURL(currentAudio) : ""; if (url) currentObjectUrls.push(url);
  const interrupted = state.resultStatus === "interrupted";
  practice.innerHTML = `<div class="stage-card"><div class="topic-panel"><p class="eyebrow">${interrupted ? "Interrupted session recovered" : "Session complete"}</p><h1 class="topic-title" tabindex="-1" data-stage-heading>${escapeHtml(state.topic)}</h1><p class="topic-meta">You spoke for ${formatTime(duration)}.</p>${url ? `<audio class="playback" controls src="${url}">Your browser cannot play this recording.</audio>` : `<div class="notice info">${state.timerOnly ? "Timer-only practice completed. No recording was made." : "No playable audio was captured."}</div>`}${saveFailed ? `<div class="notice">Local saving failed. Download this recording now if you want to keep it.</div>` : ""}<div class="action-row">${url ? `<a class="button" download="speaking-practice-${new Date().toISOString().slice(0,10)}.${extension(currentAudio!.type)}" href="${url}">Download audio</a>` : ""}<button class="button primary" id="again">Practice again →</button></div></div><aside class="side-panel">${flow(3)}</aside></div>`;
  document.querySelector("#again")?.addEventListener("click", practiceAgain);
}
function practiceAgain(): void {
  currentAudio = null; chunks = []; saveFailed = false;
  state = { stage: "topic", category: state.category, topic: nextTopic(state.category), notes: "" }; saveState(); render(); void renderHistory();
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
}
function extension(type: string): string { return type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"; }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("speaking-practice", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("sessions")) db.createObjectStore("sessions", { keyPath: "id" });
      if (!db.objectStoreNames.contains("chunks")) db.createObjectStore("chunks", { keyPath: ["sessionId", "index"] });
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function tx<T>(store: "sessions" | "chunks", mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  const transaction = db.transaction(store, mode);
  const request = action(transaction.objectStore(store));
  try { return await waitForTransaction(transaction, request); }
  finally { db.close(); }
}
function putSession(record: SessionRecord): Promise<IDBValidKey> { return tx("sessions", "readwrite", s => s.put(record)); }
function getSessions(): Promise<SessionRecord[]> { return tx("sessions", "readonly", s => s.getAll()); }
function getSession(id: string): Promise<SessionRecord | undefined> { return tx("sessions", "readonly", s => s.get(id)); }
function deleteSession(id: string): Promise<undefined> { return tx("sessions", "readwrite", s => s.delete(id)); }
function putChunk(sessionId: string, index: number, blob: Blob): Promise<IDBValidKey> { return tx("chunks", "readwrite", s => s.put({ sessionId, index, blob })); }
async function getChunks(sessionId: string): Promise<Blob[]> { const all = await tx<any[]>("chunks", "readonly", s => s.getAll()); return all.filter(x => x.sessionId === sessionId).sort((a,b) => a.index - b.index).map(x => x.blob); }
async function clearChunks(sessionId: string): Promise<void> { const db = await openDb(); await new Promise<void>((resolve, reject) => { const t = db.transaction("chunks", "readwrite"); const s = t.objectStore("chunks"); const req = s.openCursor(); req.onsuccess = () => { const c = req.result; if (!c) return; if (c.value.sessionId === sessionId) c.delete(); c.continue(); }; t.oncomplete = () => { db.close(); resolve(); }; t.onerror = () => reject(t.error); }); }

async function recoverInterrupted(): Promise<void> {
  if (state.stage !== "speech" || !state.sessionId) return;
  let audio: Blob | undefined;
  try { const saved = await getChunks(state.sessionId); if (saved.length) audio = new Blob(saved, { type: state.mimeType || saved[0].type }); } catch { /* Record the interruption without audio when storage failed. */ }
  const duration = Math.min(SPEECH_SECONDS, Math.max(0, Math.round((Date.now() - (state.speechStartedAt || Date.now())) / 1000)));
  const record: SessionRecord = { id: state.sessionId, topic: state.topic, date: new Date().toISOString(), notes: state.notes, duration, status: "interrupted", audio, mimeType: state.mimeType };
  currentAudio = audio || null;
  try {
    await putSession(record); await clearChunks(record.id);
    state = { ...state, stage: "result", speechDuration: duration, resultStatus: "interrupted", chunksRetained: false };
    showToast("The reloaded speech was marked as interrupted.");
  } catch {
    saveFailed = true;
    state = { ...state, stage: "result", speechDuration: duration, resultStatus: "interrupted", chunksRetained: true };
    showToast("The interrupted session could not be saved. Download the recovered audio.");
  }
  saveState();
}
async function restoreResultAudio(): Promise<void> {
  if (state.stage !== "result" || !state.sessionId || state.timerOnly || currentAudio) return;
  try {
    const record = await getSession(state.sessionId);
    if (record?.audio) currentAudio = record.audio;
    else if (state.chunksRetained) {
      const saved = await getChunks(state.sessionId);
      if (saved.length) currentAudio = new Blob(saved, { type: state.mimeType || saved[0].type });
    }
  } catch {
    if (state.chunksRetained) saveFailed = true;
  }
}
async function renderHistory(): Promise<void> {
  try {
    historyObjectUrls.forEach(URL.revokeObjectURL); historyObjectUrls = [];
    const sessions = (await getSessions()).sort((a,b) => b.date.localeCompare(a.date));
    historyCount.textContent = String(sessions.length);
    if (!sessions.length) { historyList.innerHTML = `<div class="empty">Your completed and interrupted sessions will appear here.</div>`; return; }
    historyList.innerHTML = `<div class="history-grid">${sessions.map(record => {
      const url = record.audio ? URL.createObjectURL(record.audio) : ""; if (url) historyObjectUrls.push(url);
      return `<article class="history-item"><div><h3>${escapeHtml(record.title || record.topic)}</h3>${record.title ? `<p class="history-topic">${escapeHtml(record.topic)}</p>` : ""}<div class="history-meta"><time datetime="${record.date}">${new Date(record.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time><span>Length: ${formatTime(record.duration)}</span><span>${record.status === "interrupted" ? "Interrupted" : "Completed"}</span></div></div><div class="history-actions">${url ? `<button class="button small play-history" data-url="${url}" data-topic="${escapeHtml(record.topic)}">Replay</button><a class="button small" href="${url}" download="speaking-practice-${record.date.slice(0,10)}.${extension(record.audio!.type)}">Download</a>` : ""}<button class="button small rename-history" data-id="${record.id}">Edit title</button><button class="button small danger delete-history" data-id="${record.id}" aria-label="Delete session: ${escapeHtml(record.topic)}">Delete</button></div></article>`;
    }).join("")}</div>`;
    document.querySelectorAll<HTMLButtonElement>(".play-history").forEach(button => button.addEventListener("click", () => {
      const existing = button.closest("article")?.querySelector("audio"); if (existing) { existing.remove(); button.textContent = "Replay"; return; }
      const audio = document.createElement("audio"); audio.controls = true; audio.autoplay = true; audio.src = button.dataset.url!; audio.className = "playback"; button.closest("article")?.append(audio); button.textContent = "Hide player";
    }));
    document.querySelectorAll<HTMLButtonElement>(".rename-history").forEach(button => button.addEventListener("click", () => {
      const record = sessions.find(session => session.id === button.dataset.id)!;
      const article = button.closest("article")!;
      if (article.querySelector("form")) return;
      const form = document.createElement("form");
      form.className = "title-form";
      form.innerHTML = `<label for="title-${record.id}">Session title</label><input id="title-${record.id}" name="title" maxlength="120" value="${escapeHtml(record.title || "")}" placeholder="Add a title"><div class="title-actions"><button class="button small primary" type="submit">Save title</button><button class="button small cancel-title" type="button">Cancel</button></div>`;
      article.append(form);
      form.querySelector("input")!.focus();
      form.querySelector(".cancel-title")!.addEventListener("click", () => { form.remove(); button.focus(); });
      form.addEventListener("submit", async event => {
        event.preventDefault();
        const title = form.querySelector("input")!.value.trim();
        form.querySelectorAll<HTMLButtonElement>("button").forEach(control => control.disabled = true);
        try { await putSession({ ...record, title: title || undefined }); await renderHistory(); showToast("Title saved."); }
        catch { showToast("The title could not be saved."); form.querySelectorAll<HTMLButtonElement>("button").forEach(control => control.disabled = false); }
      });
    }));
    document.querySelectorAll<HTMLButtonElement>(".delete-history").forEach(button => button.addEventListener("click", async () => {
      if (!confirm("Delete this practice session? This cannot be undone.")) return;
      try { await deleteSession(button.dataset.id!); await renderHistory(); showToast("Session deleted."); } catch { showToast("The session could not be deleted."); }
    }));
  } catch { historyList.innerHTML = `<div class="notice">Practice history is unavailable because local storage could not be opened.</div>`; historyCount.textContent = "—"; }
}

document.addEventListener("keydown", event => {
  if (event.altKey && event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement)) {
    event.preventDefault(); (document.querySelector<HTMLElement>("#start-prep, #end-prep, #record-speech, #stop-speech, #again"))?.click();
  }
  if (event.key === "Escape") {
    if (state.stage === "prep") endPreparation();
    else if (state.stage === "speech") stopSpeech();
  }
});

function applyTheme(theme: "light" | "dark"): void {
  document.documentElement.dataset.theme = theme;
  themeToggle.innerHTML = `<span aria-hidden="true">${theme === "dark" ? "☀" : "☾"}</span>`;
  const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  themeToggle.setAttribute("aria-label", label); themeToggle.title = label;
  try { localStorage.setItem("speaking-practice.theme", theme); } catch { /* Theme still applies for this visit. */ }
}
themeToggle.addEventListener("click", () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

await recoverInterrupted();
await restoreResultAudio();
render();
await renderHistory();

export {};
