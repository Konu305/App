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

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>\"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
    })[char]);
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

  function flattenItems() {
    allItems = [];
    levels.forEach((level) => {
      level.lessons.forEach((lesson) => {
        lesson.items.forEach((item) => {
          allItems.push({ ...item, level: level.id, lessonTitle: lesson.title });
        });
      });
    });
  }

  function renderPhrase(item) {
    const search = escapeHtml(`${item.arabic} ${item.pron} ${item.de} ${item.tag || ''}`.toLowerCase());
    const isFav = favorites.has(item.id);
    return `<article class="phrase" data-search="${search}" data-id="${escapeHtml(item.id)}">
      <div class="phraseText">
        <div class="arabic">${escapeHtml(item.arabic)}</div>
        <div class="pron">${escapeHtml(item.pron)}</div>
        <div class="translation">${escapeHtml(item.de)}</div>
        <div class="tag">${escapeHtml(item.tag || '')}</div>
      </div>
      <div class="phraseActions">
        <button type="button" class="say" data-text="${escapeHtml(item.arabic)}" aria-label="Anhören">🔊</button>
        <button type="button" class="slow" data-text="${escapeHtml(item.arabic)}" aria-label="Langsam anhören">🐢</button>
        <button type="button" class="fav ${isFav ? 'active' : ''}" data-id="${escapeHtml(item.id)}" aria-label="Favorit">${isFav ? '★' : '☆'}</button>
      </div>
    </article>`;
  }

  function renderDialogue(dialogue = []) {
    if (!dialogue.length) return '';
    return `<div class="dialogueBox"><h4>Mini Gespräch</h4>${dialogue.map((line) => `
      <div class="bubble ${line.role === 'you' ? 'you' : ''}">
        <div class="arabic">${escapeHtml(line.arabic)}</div>
        <div class="pron">${escapeHtml(line.pron)}</div>
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
    try { favorites = new Set(JSON.parse(localStorage.getItem('pal_favs_v4') || '[]')); }
    catch { favorites = new Set(); }
  }

  function saveFavorites() {
    try { localStorage.setItem('pal_favs_v4', JSON.stringify([...favorites])); } catch {}
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

  function updateAudioStatus(message = '') {
    const status = $('audioStatus');
    if (!('speechSynthesis' in window)) {
      status.className = 'status';
      status.innerHTML = '<b>Audio nicht verfügbar.</b> Dieser Browser stellt keine Sprachsynthese bereit.';
      return;
    }
    const arabic = voices.filter((voice) => /^ar(?:-|$)/i.test(voice.lang));
    const voice = selectedVoice();
    status.className = `status ${arabic.length ? 'good' : ''}`;
    status.innerHTML = `<b>Audio bereit.</b> ${arabic.length} arabische Stimme${arabic.length === 1 ? '' : 'n'} gefunden.${voice ? ` Aktiv: ${escapeHtml(voice.name)} (${escapeHtml(voice.lang)}).` : ''}${message ? ` ${escapeHtml(message)}` : ''}`;
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

  function speak(text, slow = false) {
    if (!('speechSynthesis' in window)) {
      updateAudioStatus('Sprachausgabe ist in diesem Browser nicht verfügbar.');
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
    utterance.onstart = () => updateAudioStatus(slow ? 'Langsame Wiedergabe läuft.' : 'Wiedergabe läuft.');
    utterance.onend = () => updateAudioStatus('Wiedergabe beendet.');
    utterance.onerror = (event) => updateAudioStatus(`Audiofehler: ${event.error || 'unbekannt'}.`);
    try { window.speechSynthesis.speak(utterance); }
    catch (error) { updateAudioStatus(`Audiofehler: ${error.message}.`); }
  }

  function renderFlash() {
    if (!allItems.length) return;
    const item = allItems[flashIndex % allItems.length];
    $('cardAr').textContent = item.arabic;
    $('cardPr').textContent = item.pron;
    $('cardDe').textContent = item.de;
    $('cardDe').style.display = 'none';
    $('cardCount').textContent = `${flashIndex % allItems.length + 1} von ${allItems.length}`;
  }

  function newQuiz() {
    if (!allItems.length) return;
    const correct = allItems[Math.floor(Math.random() * allItems.length)];
    const distractors = allItems.filter((item) => item.id !== correct.id).sort(() => Math.random() - 0.5).slice(0, 3);
    const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
    $('quizPrompt').innerHTML = `<div class="arabic">${escapeHtml(correct.arabic)}</div><div class="pron">${escapeHtml(correct.pron)}</div><b>Was bedeutet das?</b>`;
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
    $('test').addEventListener('click', () => speak('مرحبا، كيفك؟ أنا بحكي عربي شوي', false));
    $('slowTest').addEventListener('click', () => speak('مرحبا، كيفك؟ أنا بحكي عربي شوي', true));
    $('stop').addEventListener('click', stopSpeech);
    $('cardReveal').addEventListener('click', () => { $('cardDe').style.display = $('cardDe').style.display === 'none' ? 'block' : 'none'; });
    $('cardNext').addEventListener('click', () => { flashIndex = (flashIndex + 1) % allItems.length; renderFlash(); });
    $('cardSpeak').addEventListener('click', () => speak(allItems[flashIndex % allItems.length].arabic, false));
    $('quizNext').addEventListener('click', newQuiz);

    document.addEventListener('click', (event) => {
      const say = event.target.closest('.say');
      if (say) speak(say.dataset.text, false);
      const slow = event.target.closest('.slow');
      if (slow) speak(slow.dataset.text, true);
      const fav = event.target.closest('.fav');
      if (fav) toggleFavorite(fav.dataset.id);
    });
  }

  async function boot() {
    try {
      $('loadStatus').textContent = 'Kurs wird geladen.';
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
