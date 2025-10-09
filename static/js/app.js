// Offline-first Spanish Verb Trainer App
class SpanishVerbApp {
  constructor() {
    this.currentVerbData = null;
    this.isOnline = navigator.onLine;
    this.initializeApp();
  }

  async initializeApp() {
    try {
      // Initialize database
      await cardDB.init();
      console.log('Database initialized');

      // Initialize sync engine
      syncEngine.startAutoSync();
      syncEngine.addSyncListener(this.handleSyncEvent.bind(this));

      // Initialize UI
      this.initializeUI();
      this.setupEventListeners();
      this.updateUI();

      // Register background sync
      await syncEngine.registerBackgroundSync();

      console.log('App initialized successfully');

    } catch (error) {
      console.error('App initialization failed:', error);
      this.showError('Failed to initialize app: ' + error.message);
    }
  }

  initializeUI() {
    // Cache DOM elements
    this.elements = {
      // Form elements
      verbForm: document.getElementById('verbForm'),
      verbInput: document.getElementById('verbInput'),
      generateBtn: document.getElementById('generateBtn'),

      // Section elements
      loadingSection: document.getElementById('loadingSection'),
      generationSection: document.getElementById('generationSection'),
      resultsSection: document.getElementById('resultsSection'),
      errorSection: document.getElementById('errorSection'),

      // Generation form elements
      tenseMoodSelect: document.getElementById('tenseMoodSelect'),
      generateCardsBtn: document.getElementById('generateCardsBtn'),

      // Action buttons
      saveBtn: document.getElementById('saveBtn'),
      generateAnotherBtn: document.getElementById('generateAnotherBtn'),
      retryBtn: document.getElementById('retryBtn'),
      offlineBtn: document.getElementById('offlineBtn'),

      // Status indicators
      offlineIndicator: document.getElementById('offlineIndicator'),
      syncIndicator: document.getElementById('syncIndicator'),
      cardCount: document.getElementById('cardCount'),
      syncStatus: document.getElementById('syncStatus'),

      // Loading elements
      loadingText: document.getElementById('loadingText'),
      loadingSubtext: document.getElementById('loadingSubtext')
    };
  }

  setupEventListeners() {
    // Form submission
    this.elements.verbForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleVerbSubmission();
    });

    // Dropdown change handler
    this.elements.tenseMoodSelect.addEventListener('change', () => {
      const isValid = this.elements.tenseMoodSelect.value !== '';
      this.elements.generateCardsBtn.disabled = !isValid;
    });

    // Generate cards button
    this.elements.generateCardsBtn.addEventListener('click', () => {
      const tenseMood = this.elements.tenseMoodSelect.value;
      if (tenseMood && this.currentVerbData?.verb) {
        this.generateVerbCards(this.currentVerbData.verb, tenseMood);
      }
    });

    // Action buttons
    this.elements.saveBtn.addEventListener('click', () => this.saveCards());
    this.elements.generateAnotherBtn.addEventListener('click', () => this.resetForm());
    this.elements.retryBtn.addEventListener('click', () => this.retryGeneration());
    this.elements.offlineBtn.addEventListener('click', () => this.handleOfflineMode());

    // Online/offline events
    window.addEventListener('online', () => this.handleOnlineStatus(true));
    window.addEventListener('offline', () => this.handleOnlineStatus(false));

    // Service worker messages
    navigator.serviceWorker?.addEventListener('message', (event) => {
      if (event.data.type === 'SYNC_REQUESTED') {
        syncEngine.syncCards();
      }
    });
  }

  async handleVerbSubmission() {
    const verb = this.elements.verbInput.value.trim().toLowerCase();

    if (!verb) {
      this.showError('Please enter a verb');
      return;
    }

    // Go straight to generation options
    this.currentVerbData = { verb: verb };
    this.displayGenerationOptions(verb);
  }

  displayGenerationOptions(verb) {
    this.hideAllSections();
    document.getElementById('generationTitle').textContent = `Generate Cards: ${verb}`;

    // Reset dropdown and button
    this.elements.tenseMoodSelect.value = '';
    this.elements.generateCardsBtn.disabled = true;

    this.elements.generationSection.style.display = 'block';
  }

  async generateVerbCards(verb, tenseMood) {
    this.showLoading(`Generating ${tenseMood.replace('_', ' ')} cards...`, 'Creating 6 targeted flashcards');

    try {
      let generatedData;
      const isRegular = await this.checkVerbRegularity(verb);

      // Try online generation first if browser is online
      if (this.isOnline && tenseMood !== 'meaning_only') {
        try {
          generatedData = await this.generateTargetedConjugations(verb, tenseMood);
        } catch (ollamaError) {
          // Ollama not available, fall back to offline mode
          console.warn('Ollama not available, using offline generation:', ollamaError.message);
          generatedData = await this.generateOfflineConjugations(verb, tenseMood);
        }
      } else {
        generatedData = await this.generateOfflineConjugations(verb, tenseMood);
      }

      this.currentVerbData = {
        verb: verb,
        ...generatedData,
        isRegular: isRegular,
        tenseMood: tenseMood
      };

      this.displayResults(this.currentVerbData, 'targeted');

    } catch (error) {
      console.error('Generation error:', error);
      this.showError('Failed to generate verb cards: ' + error.message);
    }
  }

  async checkVerbRegularity(verb) {
    const irregularVerbs = [
      'ser', 'estar', 'ir', 'haber', 'tener', 'hacer', 'poder', 'decir', 'querer', 'venir',
      'dar', 'ver', 'saber', 'salir', 'poner', 'traer', 'conocer', 'parecer', 'seguir',
      'comenzar', 'empezar', 'pensar', 'entender', 'perder', 'mostrar', 'encontrar',
      'recordar', 'volver', 'dormir', 'morir', 'servir', 'pedir', 'repetir', 'sentir',
      'mentir', 'preferir', 'divertir', 'sugerir', 'convertir', 'hervir', 'advertir'
    ];

    return !irregularVerbs.includes(verb.toLowerCase());
  }

  async generateTargetedConjugations(verb, tenseMood) {
    const [tense, mood] = this.parseTenseMood(tenseMood);

    if (tenseMood === 'meaning_only') {
      const prompt = `What is the English translation of the Spanish verb "${verb}"? Reply with ONLY the English meaning, nothing else.`;

      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'aya:8b',
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.1
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const meaning = data.response.trim();

      return {
        verb: verb,
        english_meaning: meaning
      };
    }

    // For conjugations: Get plain text from aya, parse with code
    const conjugationPrompt = `Conjugate the Spanish verb "${verb}" in ${tense} ${mood} tense.

Return ONLY the 6 conjugated forms separated by the pipe character | with NO spaces, in this exact order:
yo|tú|él/ella/usted|nosotros|vosotros|ellos/ellas/ustedes

Example for "decir" in preterite indicative:
dije|dijiste|dijo|dijimos|dijisteis|dijeron

Now conjugate "${verb}" in ${tense} ${mood}. Return ONLY the pipe-separated forms, nothing else.`;

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'aya:8b',
        prompt: conjugationPrompt,
        stream: false,
        options: {
          temperature: 0.1,
          top_p: 0.9
        }
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.response.trim();

    console.log('Aya response:', responseText);

    // Parse the pipe-separated response
    const parts = responseText.split('|').map(f => f.trim());

    // Strip pronouns from the forms
    const pronounPatterns = /^(yo|tú|él\/ella\/usted|nosotros|vosotros|ellos\/ellas\/ustedes)\s+/i;
    const forms = parts.map(part => part.replace(pronounPatterns, '').trim());

    console.log('Parsed forms:', forms);

    // Validate we got 6 forms
    if (forms.length !== 6) {
      console.warn(`Expected 6 forms, got ${forms.length}. Falling back to offline generation.`);
      return await this.generateOfflineConjugations(verb, tenseMood);
    }

    // Structure into JSON manually
    const pronouns = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'];
    const conjugations = pronouns.map((pronoun, i) => ({
      pronoun: pronoun,
      tense: tense,
      mood: mood,
      form: forms[i]
    }));

    return {
      verb: verb,
      conjugations: conjugations
    };
  }

  async generateOfflineConjugations(verb, tenseMood) {
    if (tenseMood === 'meaning_only') {
      return {
        verb: verb,
        english_meaning: 'Translation not available offline'
      };
    }

    const [tense, mood] = this.parseTenseMood(tenseMood);
    const conjugations = this.getBasicTargetedConjugations(verb, tense, mood);

    return {
      verb: verb,
      conjugations: conjugations
    };
  }

  parseTenseMood(tenseMood) {
    const parts = tenseMood.split('_');
    if (parts.length >= 2) {
      const tense = parts.slice(0, -1).join('_');
      const mood = parts[parts.length - 1];
      return [tense, mood];
    }
    return [tenseMood, 'indicative'];
  }

  getBasicTargetedConjugations(verb, tense, mood) {
    const root = verb.slice(0, -2);
    const ending = verb.slice(-2);
    const pronouns = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'];

    let endings = [];

    // Present Indicative
    if (tense === 'present' && mood === 'indicative') {
      if (ending === 'ar') {
        endings = ['o', 'as', 'a', 'amos', 'áis', 'an'];
      } else if (ending === 'er') {
        endings = ['o', 'es', 'e', 'emos', 'éis', 'en'];
      } else if (ending === 'ir') {
        endings = ['o', 'es', 'e', 'imos', 'ís', 'en'];
      }
    }
    // Preterite
    else if (tense === 'preterite' && mood === 'indicative') {
      if (ending === 'ar') {
        endings = ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'];
      } else if (ending === 'er' || ending === 'ir') {
        endings = ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'];
      }
    }
    // Imperfect
    else if (tense === 'imperfect' && mood === 'indicative') {
      if (ending === 'ar') {
        endings = ['aba', 'abas', 'aba', 'ábamos', 'abais', 'aban'];
      } else if (ending === 'er' || ending === 'ir') {
        endings = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'];
      }
    }
    // Future
    else if (tense === 'future' && mood === 'indicative') {
      const futureRoot = verb;
      endings = ['é', 'ás', 'á', 'emos', 'éis', 'án'];
      return pronouns.map((pronoun, i) => ({
        pronoun: pronoun,
        tense: tense,
        mood: mood,
        form: futureRoot + endings[i]
      }));
    }
    // Simple Conditional
    else if (tense === 'simple' && mood === 'conditional') {
      const condRoot = verb;
      endings = ['ía', 'ías', 'ía', 'íamos', 'íais', 'ían'];
      return pronouns.map((pronoun, i) => ({
        pronoun: pronoun,
        tense: tense,
        mood: mood,
        form: condRoot + endings[i]
      }));
    }
    // Present Subjunctive
    else if (tense === 'present' && mood === 'subjunctive') {
      if (ending === 'ar') {
        endings = ['e', 'es', 'e', 'emos', 'éis', 'en'];
      } else if (ending === 'er' || ending === 'ir') {
        endings = ['a', 'as', 'a', 'amos', 'áis', 'an'];
      }
    }
    // Imperfect Subjunctive
    else if (tense === 'imperfect' && mood === 'subjunctive') {
      if (ending === 'ar') {
        endings = ['ara', 'aras', 'ara', 'áramos', 'arais', 'aran'];
      } else if (ending === 'er' || ending === 'ir') {
        endings = ['iera', 'ieras', 'iera', 'iéramos', 'ierais', 'ieran'];
      }
    }
    // Affirmative Imperative
    else if (tense === 'affirmative' && mood === 'imperative') {
      if (ending === 'ar') {
        return [
          { pronoun: 'tú', tense: tense, mood: mood, form: root + 'a' },
          { pronoun: 'usted', tense: tense, mood: mood, form: root + 'e' },
          { pronoun: 'nosotros', tense: tense, mood: mood, form: root + 'emos' },
          { pronoun: 'vosotros', tense: tense, mood: mood, form: root + 'ad' },
          { pronoun: 'ustedes', tense: tense, mood: mood, form: root + 'en' }
        ];
      } else if (ending === 'er' || ending === 'ir') {
        const impEnding = ending === 'er' ? 'e' : 'e';
        return [
          { pronoun: 'tú', tense: tense, mood: mood, form: root + impEnding },
          { pronoun: 'usted', tense: tense, mood: mood, form: root + 'a' },
          { pronoun: 'nosotros', tense: tense, mood: mood, form: root + 'amos' },
          { pronoun: 'vosotros', tense: tense, mood: mood, form: root + (ending === 'er' ? 'ed' : 'id') },
          { pronoun: 'ustedes', tense: tense, mood: mood, form: root + 'an' }
        ];
      }
    }
    // Negative Imperative
    else if (tense === 'negative' && mood === 'imperative') {
      if (ending === 'ar') {
        return [
          { pronoun: 'tú', tense: tense, mood: mood, form: 'no ' + root + 'es' },
          { pronoun: 'usted', tense: tense, mood: mood, form: 'no ' + root + 'e' },
          { pronoun: 'nosotros', tense: tense, mood: mood, form: 'no ' + root + 'emos' },
          { pronoun: 'vosotros', tense: tense, mood: mood, form: 'no ' + root + 'éis' },
          { pronoun: 'ustedes', tense: tense, mood: mood, form: 'no ' + root + 'en' }
        ];
      } else if (ending === 'er' || ending === 'ir') {
        return [
          { pronoun: 'tú', tense: tense, mood: mood, form: 'no ' + root + 'as' },
          { pronoun: 'usted', tense: tense, mood: mood, form: 'no ' + root + 'a' },
          { pronoun: 'nosotros', tense: tense, mood: mood, form: 'no ' + root + 'amos' },
          { pronoun: 'vosotros', tense: tense, mood: mood, form: 'no ' + root + 'áis' },
          { pronoun: 'ustedes', tense: tense, mood: mood, form: 'no ' + root + 'an' }
        ];
      }
    }
    // Fallback
    else {
      endings = ['[offline]', '[offline]', '[offline]', '[offline]', '[offline]', '[offline]'];
    }

    return pronouns.map((pronoun, i) => ({
      pronoun: pronoun,
      tense: tense,
      mood: mood,
      form: root + endings[i]
    }));
  }

  displayResults(data, generationType) {
    this.hideAllSections();

    const previewGrid = document.getElementById('previewGrid');
    const cardCount = document.getElementById('generatedCount');

    if (data.tenseMood === 'meaning_only' || generationType === 'meaning_only') {
      // Handle meaning-only cards
      previewGrid.innerHTML = `
        <div class="card-preview meaning-card">
          <div class="card-front">
            <span class="verb-spanish">${data.verb}</span>
          </div>
          <div class="card-back">
            <span class="verb-english">${data.english_meaning || 'Translation not available'}</span>
          </div>
        </div>
      `;
      cardCount.textContent = '1 meaning card generated';

    } else {
      // Handle conjugation cards
      if (data.conjugations && data.conjugations.length > 0) {
        previewGrid.innerHTML = data.conjugations
          .map(conjugation => this.createCardPreview(conjugation))
          .join('');

        let typeLabel;
        if (generationType === 'targeted') {
          const tenseMoodDisplay = data.tenseMood ? data.tenseMood.replace('_', ' ') : 'targeted';
          typeLabel = `${tenseMoodDisplay} cards`;
        } else {
          typeLabel = generationType === 'core' ? 'core' : 'complete';
        }

        cardCount.textContent = `${data.conjugations.length} ${typeLabel} generated`;
      } else {
        previewGrid.innerHTML = '<p class="no-cards">No conjugations generated</p>';
        cardCount.textContent = '0 cards generated';
      }
    }

    this.elements.resultsSection.style.display = 'block';
  }

  createCardPreview(conjugation) {
    return `
      <div class="card-preview">
        <div class="card-front">
          <div class="card-prompt">
            <span class="pronoun">${conjugation.pronoun}</span>
            <span class="verb">${this.currentVerbData.verb}</span>
            <span class="tense-mood">${conjugation.tense} ${conjugation.mood}</span>
          </div>
        </div>
        <div class="card-back">
          <span class="conjugated-form">${conjugation.form}</span>
        </div>
      </div>
    `;
  }

  async saveCards() {
    if (!this.currentVerbData || (!this.currentVerbData.conjugations && !this.currentVerbData.english_meaning)) {
      this.showError('No cards to save');
      return;
    }

    this.elements.saveBtn.disabled = true;
    this.elements.saveBtn.innerHTML = '💾 Saving...';

    try {
      let savedCards;

      if (this.currentVerbData.tenseMood === 'meaning_only' || this.currentVerbData.generationType === 'meaning_only') {
        // Save as sentence card
        const sentenceData = [{
          spanish_sentence: this.currentVerbData.verb,
          english_translation: this.currentVerbData.english_meaning || 'Translation not available',
          grammar_notes: `Meaning card generated ${this.isOnline ? 'online' : 'offline'}`
        }];
        savedCards = await cardDB.saveSentenceCards(sentenceData);
      } else {
        // Save as verb cards with regularity information
        const isRegular = this.currentVerbData.isRegular !== undefined ? this.currentVerbData.isRegular : true;
        savedCards = await cardDB.saveVerbCards(this.currentVerbData, isRegular);
      }

      // Show success
      this.elements.saveBtn.innerHTML = '✅ Cards Saved!';
      this.elements.saveBtn.classList.add('success');

      // Update UI stats
      await this.updateUI();

      // Trigger sync if online
      if (this.isOnline) {
        syncEngine.syncCards();
      }

      // Reset button after 2 seconds
      setTimeout(() => {
        this.elements.saveBtn.disabled = false;
        this.elements.saveBtn.innerHTML = '💾 Save Cards Locally';
        this.elements.saveBtn.classList.remove('success');
      }, 2000);

    } catch (error) {
      console.error('Save error:', error);
      this.showError('Failed to save cards: ' + error.message);

      this.elements.saveBtn.disabled = false;
      this.elements.saveBtn.innerHTML = '💾 Save Cards Locally';
    }
  }

  resetForm() {
    this.hideAllSections();
    this.elements.verbInput.value = '';
    this.elements.verbInput.focus();
    this.currentVerbData = null;
    this.elements.offlineBtn.style.display = 'none';
  }

  retryGeneration() {
    if (this.currentVerbData?.verb) {
      this.displayGenerationOptions(this.currentVerbData.verb);
    }
  }

  handleOfflineMode() {
    const verb = this.currentVerbData?.verb;
    if (verb) {
      this.generateVerb(verb, 'core');
    }
  }

  showLoading(message = 'Processing...', subtext = 'This may take 10-30 seconds') {
    this.hideAllSections();
    this.elements.loadingText.textContent = message;
    this.elements.loadingSubtext.textContent = subtext;
    this.elements.loadingSection.style.display = 'block';
    this.elements.generateBtn.disabled = true;
  }

  showError(message) {
    this.hideAllSections();
    document.getElementById('errorText').textContent = message;
    this.elements.errorSection.style.display = 'block';
    this.elements.generateBtn.disabled = false;
  }

  hideAllSections() {
    this.elements.loadingSection.style.display = 'none';
    this.elements.generationSection.style.display = 'none';
    this.elements.resultsSection.style.display = 'none';
    this.elements.errorSection.style.display = 'none';
    this.elements.generateBtn.disabled = false;
  }

  handleOnlineStatus(isOnline) {
    this.isOnline = isOnline;

    if (isOnline) {
      this.elements.offlineIndicator.style.display = 'none';
      this.elements.offlineIndicator.textContent = '🌐 Online';
      this.elements.offlineIndicator.classList.add('online');
    } else {
      this.elements.offlineIndicator.style.display = 'block';
      this.elements.offlineIndicator.textContent = '📱 Working Offline';
      this.elements.offlineIndicator.classList.remove('online');
    }

    this.updateUI();
  }

  handleSyncEvent(event, data) {
    switch (event) {
      case 'sync_started':
        this.elements.syncIndicator.style.display = 'block';
        this.elements.syncStatus.textContent = 'Syncing...';
        break;

      case 'sync_completed':
        this.elements.syncIndicator.style.display = 'none';
        this.elements.syncStatus.textContent = 'Synced';
        if (data && (data.uploaded > 0 || data.downloaded > 0)) {
          console.log(`Sync completed: ${data.uploaded} uploaded, ${data.downloaded} downloaded`);
        }
        // Refresh UI to show new cards
        this.updateUI();
        break;

      case 'sync_failed':
        this.elements.syncIndicator.style.display = 'none';
        this.elements.syncStatus.textContent = 'Sync failed';
        console.error('Sync failed:', data);
        break;
    }
  }

  async updateUI() {
    try {
      const stats = await cardDB.getStats();
      this.elements.cardCount.textContent = `${stats.totalCards} cards stored locally`;

      const syncStatus = await syncEngine.getSyncStatus();
      if (syncStatus.unsyncedCount > 0) {
        this.elements.syncStatus.textContent = `${syncStatus.unsyncedCount} unsynced`;
      } else if (syncStatus.lastSync) {
        const timeAgo = this.getTimeAgo(syncStatus.lastSync);
        this.elements.syncStatus.textContent = `Synced ${timeAgo}`;
      } else {
        this.elements.syncStatus.textContent = 'Ready';
      }

    } catch (error) {
      console.error('Failed to update UI:', error);
    }
  }

  getTimeAgo(date) {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new SpanishVerbApp();
});
