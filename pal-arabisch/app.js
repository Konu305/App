(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let levels = [];
  let allItems = [];
  let voices = [];
  let favorites = new Set();
  let flashIndex = 0;
  let quizScore = 0;
  let currentAudio = null;
  let audioManifest = {};

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>\"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
    })[char]);
  }

  function normalizePron(value = '') {
    const rules = [
      [/\bUeen\b/g, 'Ween'],
      [/\bueen\b/g, 'ween'],
      [/\bKiif\b/g, 'Keef'],
      [/\bkiif\b/g, 'keef'],
      [/\bAhue\b/g, 'Ahwe'],
      [/\bahue\b/g, 'ahwe'],
      [/\bUaahad\b/g, 'Waahad'],
      [/\buaahad\b/g, 'waahad'],
      [/\bUahde\b/g, 'Wahde'],
      [/\buahde\b/g, 'wahde'],
      [/\bUallah\b/g, 'Wallah'],
      [/\buallah\b/g, 'wallah'],
      [/\bUala\b/g, 'Wala'],
      [/\buala\b/g, 'wala'],
      [/\bU inta\b/g, 'W inta'],
      [/\bU inti\b/g, 'W inti'],
      [/\bU baadein\b/g, 'W baadein'],
      [/\bU kaaset\b/g, 'W kaaset'],
      [/\bAuual\b/g, 'Awwal'],
      [/\bauual\b/g, 'awwal'],
      [/\bDschiit\b/g, 'Dschiit']
    ];
    let out = String(value);
    rules.forEach(([pattern, replacement]) => { out = out.replace(pattern, replacement); });
    return out;
  }

  async function decodePayload() {
    if (!window.__PAL_B64) throw new Error('Die Kursdaten fehlen.');
    if (!('DecompressionStream' in window)) {
      throw new Error('Diese Safari Version unterstützt die benötigte Dekomprimierung nicht. Bitte Safari aktualisieren.');
    }
    const binary = atob(window.__PAL_B64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }

  async function loadAudioManifest() {
    try {
      const response = await fetch(`audio/manifest.json?v=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) audioManifest = await response.json();
    } catch {
      audioManifest = {};
    }
  }

  function flattenItems() {
    allItems = [];
    levels.forEach((level) => {
      level.lessons.forEach((lesson) => {
        lesson.items.forEach((item) => {
          allItems.push({ ...item, pron: normalizePron(item.pron), level: level.id, lessonTitle: lesson.title });
        });
        if (lesson.dialogue) {
          lesson.dialogue = lesson.dialogue.map((line) => ({ ...line, pron: normalizePron(line.pron) }));
        }
      });
    });
  }

  function audioEntry(id) {
    return id && audioManifest[id] ? audioManifest[id] : null;
  }

  function audioBadge(item) {
    const entry = audioEntry(item.id);
    return entry?.normal ? '<span class="audioSource real">PAL Audio</span>' : '<span class="audioSource fallback">Systemstimme</span>';
  }

  function renderPhrase(item) {
    const pron = normalizePron(item.pron);
    const search = escapeHtml(`${item.arabic} ${pron} ${item.de} ${item.tag || ''}`.toLowerCase());
    const isFav = favorites.has(item.id);
    return `<article class="phrase" data-search="${search}" data-id="${escapeHtml(item.id)}">
      <div class="phraseText">
        <div class="arabic">${escapeHtml(item.arabic)}</div>
        <div class="pron">${escapeHtml(pron)}</div>
        <div class="translation">${escapeHtml(item.de)}</div>
        <div class="tag">${escapeHtml(item.tag || '')} ${audioBadge(item)}</div>
      </div>
      <div class="phraseActions">
        <button type="button" class="say" data-id="${escapeHtml(item.id)}" data-text="${escapeHtml(item.arabic)}" aria-label="Anhören">🔊</button>
        <button type="button" class="slow" data-id="${escapeHtml(item.id)}" data-text="${escapeHtml(item.arabic)}" aria-label="Langsam anhören">🐢</button>
        <button type="button" class="fav ${isFav ? 'active' : ''}" data-id="${escapeHtml(item.id)}" aria-label="Favorit">${isFav ? '★' : '☆'}</button>
      </div>
    </article>`;
  }

  function renderDialogue(dialogue = []) {
    if (!dialogue.length) return '';
    return `<div class="dialogueBox"><h4>Mini Gespräch</h4>${dialogue.map((line) => `
      <div class="bubble ${line.role === 'you' ? 'you' : ''}">
        <div class="arabic">${escapeHtml(line.arabic)}</div>
        <div class="pron">${escapeHtml(normalizePron(line.pron))}</div>
        <div>${escapeHtml(line.de)}</div>
        <button type="button" class="say miniAudio" data-text="${escapeHtml(line.arabic)}">🔊 Anhören</button>
      </div>`).join('')}</div>`;
  }

  function renderLesson(lesson) {
    const grammar = lesson.grammar
      ? `<div class="grammarBox"><strong>Grammatik verstehen</strong><p>${escapeHtml(lesson.grammar)}</p></div>`
      : '';
    return `<details class="lesson" id="${escapeHtml(lesson.id)}">
      <summary>
        <span class="lessonIcon">${escapeHtml(lesson.icon || '📘')}</span>
        <span class="lessonHead"><strong>${escapeHtml(lesson.title)}</strong><small>${escapeHtml(lesson.goal)}</small></span>
        <span class="lessonCount">${lesson.items.length}</span>
      </summary>
      <div class="lessonBody">
        ${grammar}
        ${renderDialogue(lesson.dialogue)}
        <div class="phraseList">${lesson.items.map(renderPhrase).join('')}</div>
      </div>
    </details>`;
  }

  function renderLevels() {
    $('levels').innerHTML = levels.map((level) => {
      const itemCount = level.lessons.reduce((sum, lesson) => sum + lesson.items.length, 0);
      return `<section class="level" id="level-${escapeHtml(level.id)}">
        <div class="levelHero">
          <div>
            <span class="levelLabel">${escapeHtml(level.name)}</span>
            <h2>${escapeHtml(level.subtitle)}</h2>
            <p>${escapeHtml(level.description)}</p>
          </div>
          <div class="levelStats"><b>${level.lessons.length}</b><span>Teilbereiche</span><b>${itemCount}</b><span>Einträge</span></div>
        </div>
        ${level.lessons.map(renderLesson).join('')}
      </section>`;
    }).join('');
  }

  function showLevel(id) {
    document.querySelectorAll('.level').forEach((section) => section.classList.toggle('active', section.id === `level-${id}`));
    document.querySelectorAll('.tool').forEach((section) => section.classList.add('hidden'));
    document.querySelectorAll('.nav button').forEach((button) => button.classList.toggle('active', button.dataset.level === id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showTool(id) {
    document.querySelectorAll('.level').forEach((section) => section.classList.remove('active'));
    document.querySelectorAll('.tool').forEach((section) => section.classList.toggle('hidden', section.id !== id));
    document.querySelectorAll('.nav button').forEach((button) => button.classList.toggle('active', button.dataset.tool === id));
    if (id === 'favs') renderFavorites();
    if (id === 'cards') renderFlash();
    if (id === 'quiz') newQuiz();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function loadFavorites() {
    try { favorites = new Set(JSON.parse(localStorage.getItem('pal_favs_v5') || '[]')); }
    catch { favorites = new Set(); }
  }

  function saveFavorites() {
    try { localStorage.setItem('pal_favs_v5', JSON.stringify([...favorites])); } catch {}
  }

  function toggleFavorite(id) {
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    saveFavorites();
    document.querySelectorAll(`.fav[data-id="${CSS.escape(id)}"]`).forEach((button) => {
      const on = favorites.has(id);
      button.classList.toggle('active', on);
      button.textContent = on ? '★' : '☆';
    });
  }

  function renderFavorites() {
    const items = allItems.filter((item) => favorites.has(item.id));
    $('favList').innerHTML = items.length ? items.map(renderPhrase).join('') : '<div class="status">Noch keine Favoriten gespeichert.</div>';
  }

  function filterSearch() {
    const q = $('search').value.trim().toLowerCase();
    let hits = 0;
    document.querySelectorAll('.phrase').forEach((phrase) => {
      const match = !q || (phrase.dataset.search || '').includes(q);
      phrase.classList.toggle('hidden', !match);
      if (match) hits++;
    });
    document.querySelectorAll('.lesson').forEach((lesson) => {
      const visible = lesson.querySelectorAll('.phrase:not(.hidden)').length;
      lesson.classList.toggle('hidden', Boolean(q) && visible === 0);
      if (q && visible > 0) lesson.open = true;
    });
    $('searchInfo').textContent = q ? `${hits} Treffer` : `${allItems.length} Wörter und Sätze`;
  }

  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    voices = window.speechSynthesis.getVoices() || [];
    const arabic = voices.filter((voice) => /^ar(?:-|$)/i.test(voice.lang));
    const list = arabic.length ? arabic : voices;
    const select = $('voice');
    const previous = select.value;
    select.innerHTML = list.map((voice) => `<option value="${voices.indexOf(voice)}">${escapeHtml(voice.name)} (${escapeHtml(voice.lang)})</option>`).join('');
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
    else {
      const preferred = arabic.find((voice) => /ar[-_](PS|JO|IL)/i.test(voice.lang)) || arabic[0];
      if (preferred) select.value = String(voices.indexOf(preferred));
    }
    updateAudioStatus();
  }

  function selectedVoice() {
    const index = Number($('voice').value);
    return voices[index] || voices.find((voice) => /^ar(?:-|$)/i.test(voice.lang)) || null;
  }

  function countRealAudio() {
    return Object.values(audioManifest).filter((entry) => entry && entry.normal).length;
  }

  function updateAudioStatus(message = '') {
    const status = $('audioStatus');
    const realCount = countRealAudio();
    const voice = selectedVoice();
    const arabic = voices.filter((v) => /^ar(?:-|$)/i.test(v.lang));
    status.className = `status ${realCount || arabic.length ? 'good' : ''}`;
    status.innerHTML = `<b>Audio.</b> ${realCount} echte palästinensische Aufnahmen hinterlegt. ${arabic.length} arabische Systemstimme${arabic.length === 1 ? '' : 'n'} als Fallback.${voice ? ` Fallback: ${escapeHtml(voice.name)} (${escapeHtml(voice.lang)}).` : ''}${message ? ` ${escapeHtml(message)}` : ''}`;
  }

  function stopSpeech() {
    if (currentAudio) {
      try { currentAudio.pause(); currentAudio.currentTime = 0; } catch {}
      currentAudio = null;
    }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch {}
    }
  }

  function playFile(path, slow = false) {
    stopSpeech();
    const audio = new Audio(path);
    currentAudio = audio;
    if (slow) audio.playbackRate = 0.82;
    audio.onplay = () => updateAudioStatus(slow ? 'Palästinensische Aufnahme langsam.' : 'Palästinensische Aufnahme läuft.');
    audio.onended = () => { currentAudio = null; updateAudioStatus('Wiedergabe beendet.'); };
    audio.onerror = () => { currentAudio = null; updateAudioStatus('Audiodatei konnte nicht geladen werden.'); };
    audio.play().catch(() => updateAudioStatus('Safari hat die Wiedergabe blockiert. Bitte erneut tippen.'));
  }

  function speakSystem(text, slow = false) {
    if (!('speechSynthesis' in window)) {
      updateAudioStatus('Für diesen Satz ist noch keine echte Aufnahme vorhanden und die Systemstimme ist nicht verfügbar.');
      return;
    }
    stopSpeech();
    const voice = selectedVoice();
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else utterance.lang = 'ar-SA';
    const baseRate = Number($('rate').value || 0.78);
    utterance.rate = slow ? Math.max(0.5, baseRate - 0.18) : baseRate;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => updateAudioStatus('Systemstimme als Fallback.');
    utterance.onend = () => updateAudioStatus('Wiedergabe beendet.');
    utterance.onerror = (event) => updateAudioStatus(`Audiofehler: ${event.error || 'unbekannt'}.`);
    try { window.speechSynthesis.speak(utterance); }
    catch (error) { updateAudioStatus(`Audiofehler: ${error.message}.`); }
  }

  function speak(text, slow = false, id = '') {
    const entry = audioEntry(id);
    const file = slow ? (entry?.slow || entry?.normal) : entry?.normal;
    if (file) {
      playFile(`audio/${file}`, slow && !entry?.slow);
      return;
    }
    speakSystem(text, slow);
  }

  function renderFlash() {
    if (!allItems.length) return;
    const item = allItems[flashIndex % allItems.length];
    $('cardAr').textContent = item.arabic;
    $('cardPr').textContent = normalizePron(item.pron);
    $('cardDe').textContent = item.de;
    $('cardDe').style.display = 'none';
    $('cardCount').textContent = `${flashIndex % allItems.length + 1} von ${allItems.length}`;
  }

  function newQuiz() {
    if (!allItems.length) return;
    const correct = allItems[Math.floor(Math.random() * allItems.length)];
    const distractors = allItems.filter((item) => item.id !== correct.id).sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
    $('quizPrompt').innerHTML = `<div class="arabic">${escapeHtml(correct.arabic)}</div><div class="pron">${escapeHtml(normalizePron(correct.pron))}</div><b>Was bedeutet das?</b>`;
    $('quizOptions').innerHTML = '';
    $('quizFeedback').textContent = '';
    options.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn';
      button.textContent = item.de;
      button.addEventListener('click', () => {
        [...$('quizOptions').children].forEach((child) => { child.disabled = true; });
        if (item.id === correct.id) {
          button.classList.add('correct');
          quizScore++;
          $('quizFeedback').textContent = `Richtig. Gesamt ${quizScore}.`;
        } else {
          button.classList.add('wrong');
          [...$('quizOptions').children].find((child) => child.textContent === correct.de)?.classList.add('correct');
          $('quizFeedback').textContent = `Richtig ist: ${correct.de}`;
        }
      });
      $('quizOptions').appendChild(button);
    });
  }

  function bindEvents() {
    document.querySelectorAll('[data-level]').forEach((button) => button.addEventListener('click', () => showLevel(button.dataset.level)));
    document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => showTool(button.dataset.tool)));
    $('search').addEventListener('input', filterSearch);
    $('voice').addEventListener('change', () => updateAudioStatus());
    $('test').addEventListener('click', () => speakSystem('مرحبا، كيفك؟ أنا بحكي عربي شوي', false));
    $('slowTest').addEventListener('click', () => speakSystem('مرحبا، كيفك؟ أنا بحكي عربي شوي', true));
    $('stop').addEventListener('click', stopSpeech);
    $('cardReveal').addEventListener('click', () => { $('cardDe').style.display = $('cardDe').style.display === 'none' ? 'block' : 'none'; });
    $('cardNext').addEventListener('click', () => { flashIndex = (flashIndex + 1) % allItems.length; renderFlash(); });
    $('cardSpeak').addEventListener('click', () => {
      const item = allItems[flashIndex % allItems.length];
      speak(item.arabic, false, item.id);
    });
    $('quizNext').addEventListener('click', newQuiz);

    document.addEventListener('click', (event) => {
      const say = event.target.closest('.say');
      if (say) speak(say.dataset.text, false, say.dataset.id || '');
      const slow = event.target.closest('.slow');
      if (slow) speak(slow.dataset.text, true, slow.dataset.id || '');
      const fav = event.target.closest('.fav');
      if (fav) toggleFavorite(fav.dataset.id);
    });
  }

  async function boot() {
    try {
      $('loadStatus').textContent = 'Kurs und Audio werden geladen.';
      await loadAudioManifest();
      levels = await decodePayload();
      flattenItems();
      loadFavorites();
      renderLevels();
      bindEvents();
      showLevel('beginner');
      $('searchInfo').textContent = `${allItems.length} Wörter und Sätze`;
      $('loadStatus').classList.add('hidden');
      renderFlash();
      newQuiz();

      if ('speechSynthesis' in window) {
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        setTimeout(loadVoices, 250);
        setTimeout(loadVoices, 1000);
      } else updateAudioStatus();
    } catch (error) {
      $('loadStatus').className = 'status';
      $('loadStatus').innerHTML = `<b>Die App konnte nicht geladen werden.</b> ${escapeHtml(error.message)}`;
      console.error(error);
    }
  }

  boot();
})();
