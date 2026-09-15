const PREP_SECONDS = 15 * 60;
const SPEECH_SECONDS = 5 * 60;
const ACTIVE_KEY = "speaking-practice.active";
const TOPICS_KEY = "speaking-practice.topic-order";
const topics = [
    "A habit that changed my life", "The best way to spend a free day", "What makes a good friend", "A place everyone should visit once", "The value of learning to cook", "How music affects our mood", "Why hobbies matter", "The role of humour in daily life", "What home means to me", "A useful lesson from failure",
    "The perfect morning routine", "Why reading still matters", "A skill I want to master", "Small acts of kindness", "The importance of sleep", "How travel changes perspective", "Living with less", "The benefits of walking", "What makes a memorable teacher", "A tradition worth keeping",
    "Is comfort the enemy of growth?", "What does success mean?", "Freedom and responsibility", "The power of silence", "Can time be wasted?", "Is curiosity more important than knowledge?", "The difference between confidence and arrogance", "When is change necessary?", "Does competition make us better?", "The meaning of courage",
    "Can money buy happiness?", "Why uncertainty is useful", "Is perfection worth pursuing?", "The value of patience", "Are first impressions reliable?", "What makes an idea powerful?", "Is being busy the same as being productive?", "The cost of convenience", "Do limits increase creativity?", "What should progress look like?",
    "Social media does more harm than good", "Should school uniforms be required?", "Remote work is better than office work", "Exams are not the best measure of ability", "Public transport should be free", "Four-day workweeks should become standard", "College education is worth the cost", "Advertising aimed at children should be banned", "Zoos should no longer exist", "Voting should be compulsory",
    "Technology makes us less patient", "Homework should be optional", "Cashless societies are a good idea", "Competitive sports belong in schools", "Cities should limit private cars", "Influencers should be accountable for recommendations", "Online learning can replace classrooms", "Everyone should take a gap year", "Fast fashion should be regulated", "Space exploration deserves public funding",
    "Artificial intelligence and the future of work", "The digital divide", "Privacy in a connected world", "Climate responsibility: individuals or governments?", "The pressure to be constantly available", "Misinformation and public trust", "Mental health at work", "The future of public libraries", "Food waste in modern cities", "Equal access to education",
    "The rise of the creator economy", "Should anonymity exist online?", "Balancing development and the environment", "The changing meaning of community", "Ageing populations and social responsibility", "Should companies disclose salary ranges?", "The ethics of planned obsolescence", "Can cities be both smart and humane?", "The impact of short-form video", "Should internet access be a basic right?",
    "Leaders are made, not born", "Teamwork matters more than individual talent", "Rules are meant to be challenged", "Failure teaches more than success", "Actions speak louder than words", "Young people should enter politics", "Debate is better than agreement", "Tradition can slow progress", "Privacy matters more than convenience", "Economic growth should not be the main goal",
    "Should robots care for older people?", "Local products are better than global brands", "News should be free to access", "Public figures deserve private lives", "Parents should limit children's screen time", "Libraries are more important than ever", "Schools should teach personal finance", "Governments should regulate addictive app design", "Work experience matters more than qualifications", "Every citizen should do community service"
];
const practice = document.querySelector("#practice");
const historyList = document.querySelector("#history-list");
const historyCount = document.querySelector("#history-count");
const toast = document.querySelector("#toast");
let state = loadState();
let tickId = 0;
let recorder = null;
let stream = null;
let chunks = [];
let currentAudio = null;
let saveFailed = false;
let chunkIndex = 0;
let currentObjectUrls = [];
let historyObjectUrls = [];
function newId() { return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`; }
function loadState() {
    try {
        const raw = localStorage.getItem(ACTIVE_KEY);
        if (raw)
            return JSON.parse(raw);
    }
    catch { /* Start clean when local state is unavailable. */ }
    return { stage: "topic", topic: nextTopic(), notes: "" };
}
function saveState() {
    try {
        localStorage.setItem(ACTIVE_KEY, JSON.stringify(state));
    }
    catch {
        showToast("Progress could not be saved on this device.");
    }
}
function nextTopic() {
    try {
        let remaining = JSON.parse(localStorage.getItem(TOPICS_KEY) || "[]");
        if (!remaining.length) {
            remaining = topics.map((_, index) => index);
            for (let i = remaining.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
            }
        }
        const index = remaining.pop();
        localStorage.setItem(TOPICS_KEY, JSON.stringify(remaining));
        return topics[index];
    }
    catch {
        return topics[Math.floor(Math.random() * topics.length)];
    }
}
function formatTime(seconds) {
    const safe = Math.max(0, Math.ceil(seconds));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
function escapeHtml(value) {
    return value.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}
function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 3200);
}
function flow(active) {
    return `<div><p class="flow-label">Your session</p><ol class="flow">${["Choose a topic", "Prepare · 15 min", "Speak · 5 min", "Replay"].map((label, i) => `<li class="${i === active ? "active" : ""}"><span class="flow-number">${i + 1}</span><span>${label}</span></li>`).join("")}</ol></div><p class="shortcut"><kbd>Alt</kbd> + <kbd>Enter</kbd> primary action<br><kbd>Esc</kbd> stop timer early</p>`;
}
function clearTick() { if (tickId)
    window.clearInterval(tickId); tickId = 0; }
function bindNotes() {
    const notes = document.querySelector("#notes");
    notes?.addEventListener("input", () => { state.notes = notes.value; saveState(); });
}
function render() {
    clearTick();
    currentObjectUrls.forEach(URL.revokeObjectURL);
    currentObjectUrls = [];
    if (state.stage === "topic")
        renderTopic();
    if (state.stage === "prep" || state.stage === "ready")
        renderPrep();
    if (state.stage === "speech")
        renderSpeech();
    if (state.stage === "result")
        renderResult();
}
function renderTopic() {
    practice.innerHTML = `<div class="stage-card"><div class="topic-panel"><p class="eyebrow">Your topic</p><h1 class="topic-title">${escapeHtml(state.topic)}</h1><p class="topic-meta">Take a moment. Change it if it does not spark an idea.</p><div class="action-row"><button class="button" id="another" aria-label="Choose another random topic">↻ Another topic</button><button class="button primary" id="start-prep">Start preparation →</button></div></div><aside class="side-panel">${flow(0)}</aside></div>`;
    document.querySelector("#another")?.addEventListener("click", () => { state = { stage: "topic", topic: nextTopic(), notes: "" }; saveState(); render(); });
    document.querySelector("#start-prep")?.addEventListener("click", startPreparation);
}
function startPreparation() {
    state.stage = "prep";
    state.prepEndsAt = Date.now() + PREP_SECONDS * 1000;
    saveState();
    render();
}
function renderPrep() {
    const ready = state.stage === "ready";
    practice.innerHTML = `<div class="workspace"><section class="work-card"><p class="eyebrow">${ready ? "Preparation complete" : "Prepare your response"}</p><h1 class="compact-topic">${escapeHtml(state.topic)}</h1><div class="timer-wrap"><div class="timer" id="timer">${ready ? "00:00" : formatTime(((state.prepEndsAt || Date.now()) - Date.now()) / 1000)}</div><div class="timer-label">${ready ? "You can start when ready" : "Preparation remaining"}</div></div><div class="action-row"><a class="button" target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?q=${encodeURIComponent(state.topic)}" aria-label="Search the web for this topic">Search topic ↗</a>${ready ? `<button class="button accent" id="start-speech">Start speech</button>` : `<button class="button primary" id="end-prep">End preparation early</button>`}</div><div id="mic-notice"></div></section><aside class="notes-card"><label for="notes">Preparation notes</label><textarea id="notes" placeholder="Outline your opening, key points, examples, and closing…">${escapeHtml(state.notes)}</textarea><p class="helper">Saved on this device as you type.</p></aside></div>`;
    bindNotes();
    document.querySelector("#end-prep")?.addEventListener("click", () => endPreparation());
    document.querySelector("#start-speech")?.addEventListener("click", () => startSpeech(false));
    if (!ready) {
        const update = () => {
            const remaining = ((state.prepEndsAt || Date.now()) - Date.now()) / 1000;
            const timer = document.querySelector("#timer");
            if (timer)
                timer.textContent = formatTime(remaining);
            if (remaining <= 0)
                endPreparation(true);
        };
        update();
        tickId = window.setInterval(update, 250);
    }
}
function endPreparation(alert = false) {
    clearTick();
    state.stage = "ready";
    saveState();
    if (alert)
        playAlert();
    render();
}
function playAlert() {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 740;
        gain.gain.setValueAtTime(.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .45);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + .45);
    }
    catch { /* The visible ready state is the fallback alert. */ }
}
async function startSpeech(timerOnly) {
    let selectedStream = null;
    if (!timerOnly) {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
            showMicError("Recording is unavailable in this browser.");
            return;
        }
        try {
            selectedStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        catch {
            showMicError("Microphone access was denied or is unavailable.");
            return;
        }
    }
    const sessionId = newId();
    const now = Date.now();
    state = { ...state, stage: "speech", speechStartedAt: now, speechEndsAt: now + SPEECH_SECONDS * 1000, sessionId, timerOnly };
    chunks = [];
    chunkIndex = 0;
    saveFailed = false;
    currentAudio = null;
    if (selectedStream) {
        stream = selectedStream;
        const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => MediaRecorder.isTypeSupported(type));
        recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);
        state.mimeType = recorder.mimeType;
        saveState();
        recorder.addEventListener("dataavailable", event => {
            if (!event.data.size)
                return;
            chunks.push(event.data);
            putChunk(sessionId, chunkIndex++, event.data).catch(() => { saveFailed = true; showToast("Local saving failed. Your current recording can still be downloaded."); });
        });
        recorder.addEventListener("stop", finishSpeech);
        recorder.start(1000);
    }
    else {
        saveState();
    }
    render();
}
function showMicError(message) {
    const area = document.querySelector("#mic-notice");
    if (!area)
        return;
    area.innerHTML = `<div class="notice"><strong>${message}</strong><br>Check browser microphone permission, then retry. You can also practise with the timer only.<div class="action-row"><button class="button small" id="retry-mic">Retry microphone</button><button class="button small" id="timer-only">Use timer only</button></div></div>`;
    document.querySelector("#retry-mic")?.addEventListener("click", () => startSpeech(false));
    document.querySelector("#timer-only")?.addEventListener("click", () => startSpeech(true));
}
function renderSpeech() {
    practice.innerHTML = `<div class="workspace"><section class="work-card"><p class="eyebrow">Speech in progress</p><h1 class="compact-topic">${escapeHtml(state.topic)}</h1><div class="timer-wrap"><div class="recording-line">${state.timerOnly ? "Timer-only practice" : `<span class="recording-dot" aria-hidden="true"></span> Recording`}</div><div class="timer" id="timer">${formatTime(((state.speechEndsAt || Date.now()) - Date.now()) / 1000)}</div><div class="timer-label">Speech time remaining</div></div><div class="action-row"><button class="button primary" id="stop-speech">Stop speech</button></div>${saveFailed ? `<div class="notice">Local saving failed. Keep this page open. Your current audio will remain available for download.</div>` : ""}</section><aside class="notes-card"><label for="notes">Your notes</label><textarea id="notes">${escapeHtml(state.notes)}</textarea><p class="helper">Glance at your structure, then return to your audience.</p></aside></div>`;
    bindNotes();
    document.querySelector("#stop-speech")?.addEventListener("click", stopSpeech);
    const update = () => {
        const remaining = ((state.speechEndsAt || Date.now()) - Date.now()) / 1000;
        const timer = document.querySelector("#timer");
        if (timer)
            timer.textContent = formatTime(remaining);
        if (remaining <= 0)
            stopSpeech();
    };
    update();
    tickId = window.setInterval(update, 200);
}
function stopSpeech() {
    clearTick();
    if (recorder?.state === "recording")
        recorder.stop();
    else
        finishSpeech();
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
}
async function finishSpeech() {
    if (state.stage !== "speech")
        return;
    const duration = Math.min(SPEECH_SECONDS, Math.max(0, Math.round((Date.now() - (state.speechStartedAt || Date.now())) / 1000)));
    if (chunks.length)
        currentAudio = new Blob(chunks, { type: state.mimeType || chunks[0].type });
    const record = { id: state.sessionId || newId(), topic: state.topic, date: new Date().toISOString(), notes: state.notes, duration, status: "completed", audio: currentAudio || undefined, mimeType: state.mimeType };
    try {
        await putSession(record);
        await clearChunks(record.id);
    }
    catch {
        saveFailed = true;
        showToast("This session could not be saved. Download the audio before leaving.");
    }
    recorder = null;
    state.stage = "result";
    state.speechDuration = duration;
    saveState();
    render();
    await renderHistory();
}
function renderResult() {
    const duration = state.speechDuration ?? Math.min(SPEECH_SECONDS, Math.max(0, Math.round((Date.now() - (state.speechStartedAt || Date.now())) / 1000)));
    const url = currentAudio ? URL.createObjectURL(currentAudio) : "";
    if (url)
        currentObjectUrls.push(url);
    practice.innerHTML = `<div class="stage-card"><div class="topic-panel"><p class="eyebrow">Session complete</p><h1 class="topic-title">${escapeHtml(state.topic)}</h1><p class="topic-meta">You spoke for ${formatTime(duration)}.</p>${url ? `<audio class="playback" controls src="${url}">Your browser cannot play this recording.</audio>` : `<div class="notice info">${state.timerOnly ? "Timer-only practice completed. No recording was made." : "No playable audio was captured."}</div>`}${saveFailed ? `<div class="notice">Local saving failed. Download this recording now if you want to keep it.</div>` : ""}<div class="action-row">${url ? `<a class="button" download="speaking-practice-${new Date().toISOString().slice(0, 10)}.${extension(currentAudio.type)}" href="${url}">Download audio</a>` : ""}<button class="button primary" id="again">Practice again →</button></div></div><aside class="side-panel">${flow(3)}</aside></div>`;
    document.querySelector("#again")?.addEventListener("click", practiceAgain);
}
function practiceAgain() {
    currentAudio = null;
    chunks = [];
    saveFailed = false;
    state = { stage: "topic", topic: nextTopic(), notes: "" };
    saveState();
    render();
    void renderHistory();
    window.scrollTo({ top: 0, behavior: "smooth" });
}
function extension(type) { return type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm"; }
function openDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("speaking-practice", 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains("sessions"))
                db.createObjectStore("sessions", { keyPath: "id" });
            if (!db.objectStoreNames.contains("chunks"))
                db.createObjectStore("chunks", { keyPath: ["sessionId", "index"] });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
async function tx(store, mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => { const t = db.transaction(store, mode); const req = action(t.objectStore(store)); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); t.oncomplete = () => db.close(); t.onerror = () => reject(t.error); });
}
function putSession(record) { return tx("sessions", "readwrite", s => s.put(record)); }
function getSessions() { return tx("sessions", "readonly", s => s.getAll()); }
function deleteSession(id) { return tx("sessions", "readwrite", s => s.delete(id)); }
function putChunk(sessionId, index, blob) { return tx("chunks", "readwrite", s => s.put({ sessionId, index, blob })); }
async function getChunks(sessionId) { const all = await tx("chunks", "readonly", s => s.getAll()); return all.filter(x => x.sessionId === sessionId).sort((a, b) => a.index - b.index).map(x => x.blob); }
async function clearChunks(sessionId) { const db = await openDb(); await new Promise((resolve, reject) => { const t = db.transaction("chunks", "readwrite"); const s = t.objectStore("chunks"); const req = s.openCursor(); req.onsuccess = () => { const c = req.result; if (!c)
    return; if (c.value.sessionId === sessionId)
    c.delete(); c.continue(); }; t.oncomplete = () => { db.close(); resolve(); }; t.onerror = () => reject(t.error); }); }
async function recoverInterrupted() {
    if (state.stage !== "speech" || !state.sessionId)
        return;
    let audio;
    try {
        const saved = await getChunks(state.sessionId);
        if (saved.length)
            audio = new Blob(saved, { type: state.mimeType || saved[0].type });
    }
    catch { /* Record the interruption without audio when storage failed. */ }
    const duration = Math.min(SPEECH_SECONDS, Math.max(0, Math.round((Date.now() - (state.speechStartedAt || Date.now())) / 1000)));
    const record = { id: state.sessionId, topic: state.topic, date: new Date().toISOString(), notes: state.notes, duration, status: "interrupted", audio, mimeType: state.mimeType };
    try {
        await putSession(record);
        await clearChunks(record.id);
    }
    catch {
        showToast("The interrupted session could not be saved.");
    }
    state = { stage: "topic", topic: state.topic, notes: state.notes };
    saveState();
    showToast("The reloaded speech was marked as interrupted.");
}
async function renderHistory() {
    try {
        historyObjectUrls.forEach(URL.revokeObjectURL);
        historyObjectUrls = [];
        const sessions = (await getSessions()).sort((a, b) => b.date.localeCompare(a.date));
        historyCount.textContent = String(sessions.length);
        if (!sessions.length) {
            historyList.innerHTML = `<div class="empty">Your completed and interrupted sessions will appear here.</div>`;
            return;
        }
        historyList.innerHTML = `<div class="history-grid">${sessions.map(record => {
            const url = record.audio ? URL.createObjectURL(record.audio) : "";
            if (url)
                historyObjectUrls.push(url);
            return `<article class="history-item"><div><h3>${escapeHtml(record.topic)}</h3><div class="history-meta"><span>${new Date(record.date).toLocaleString()}</span><span>${formatTime(record.duration)}</span><span>${record.status === "interrupted" ? "Interrupted" : "Completed"}</span></div></div><div class="history-actions">${url ? `<button class="button small play-history" data-url="${url}" data-topic="${escapeHtml(record.topic)}">Replay</button><a class="button small" href="${url}" download="speaking-practice-${record.date.slice(0, 10)}.${extension(record.audio.type)}">Download</a>` : ""}<button class="button small danger delete-history" data-id="${record.id}" aria-label="Delete session: ${escapeHtml(record.topic)}">Delete</button></div></article>`;
        }).join("")}</div>`;
        document.querySelectorAll(".play-history").forEach(button => button.addEventListener("click", () => {
            const existing = button.closest("article")?.querySelector("audio");
            if (existing) {
                existing.remove();
                button.textContent = "Replay";
                return;
            }
            const audio = document.createElement("audio");
            audio.controls = true;
            audio.autoplay = true;
            audio.src = button.dataset.url;
            audio.className = "playback";
            button.closest("article")?.append(audio);
            button.textContent = "Hide player";
        }));
        document.querySelectorAll(".delete-history").forEach(button => button.addEventListener("click", async () => {
            if (!confirm("Delete this practice session? This cannot be undone."))
                return;
            try {
                await deleteSession(button.dataset.id);
                await renderHistory();
                showToast("Session deleted.");
            }
            catch {
                showToast("The session could not be deleted.");
            }
        }));
    }
    catch {
        historyList.innerHTML = `<div class="notice">Practice history is unavailable because local storage could not be opened.</div>`;
        historyCount.textContent = "—";
    }
}
document.addEventListener("keydown", event => {
    if (event.altKey && event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        (document.querySelector("#start-prep, #end-prep, #start-speech, #stop-speech, #again"))?.click();
    }
    if (event.key === "Escape") {
        if (state.stage === "prep")
            endPreparation();
        else if (state.stage === "speech")
            stopSpeech();
    }
});
await recoverInterrupted();
render();
await renderHistory();
export {};
