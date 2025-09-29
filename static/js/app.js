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
      assessmentSection: document.getElementById('assessmentSection'),
      resultsSection: document.getElementById('resultsSection'),
      errorSection: document.getElementById('errorSection'),

      // Generation option elements
      meaningOnlyBtn: document.getElementById('meaningOnlyBtn'),
      fullBtn: document.getElementById('fullBtn'),

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

    // Generation options
    this.elements.meaningOnlyBtn.addEventListener('click', () =>
      this.generateVerb(this.currentVerbData?.verb, 'meaning_only'));
    this.elements.fullBtn.addEventListener('click', () =>
      this.generateVerb(this.currentVerbData?.verb, 'full'));

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
    this.elements.assessmentSection.style.display = 'block';
  }


  async generateVerb(verb, depth) {
    const depthLabels = {
      'meaning_only': 'meaning card',
      'core': 'core conjugations',
      'full': 'complete conjugations'
    };

    this.showLoading(`Generating ${depthLabels[depth]}...`);

    try {
      let generatedData;

      if (this.isOnline && depth !== 'meaning_only') {
        // Try online generation for conjugations
        generatedData = await this.generateVerbOnline(verb, depth);
      } else {
        // Use offline generation
        generatedData = await this.generateVerbOffline(verb, depth);
      }

      // Merge cached assessment data with generated conjugations
      this.currentVerbData = {
        ...this.currentVerbData, // Keep cached assessment data
        ...generatedData,
        generationType: depth
      };
      this.displayResults(this.currentVerbData, depth);

    } catch (error) {
      console.error('Generation error:', error);
      this.showError('Failed to generate verb content: ' + error.message);
    }
  }

  async generateVerbOnline(verb, depth) {
    let prompt;

    if (depth === 'core') {
      prompt = `Generate CORE Spanish verb conjugations for '${verb}'. Return JSON format:
{
  "verb": "${verb}",
  "conjugations": [
    {"pronoun": "yo", "tense": "present", "mood": "indicative", "form": "conjugated_form"}
  ]
}

Generate these CORE tenses for ALL pronouns (yo, tú, él/ella/usted, nosotros, vosotros, ellos/ellas/ustedes):
- present indicative
- preterite
- imperfect
- future
- present subjunctive
- imperfect subjunctive
- simple conditional
- imperative (tú and usted forms only)

This should generate approximately 20-25 conjugations. Only return valid JSON, no other text.`;
    } else { // full
      prompt = `Generate COMPLETE Spanish verb conjugations for '${verb}'.

CRITICAL REQUIREMENT: Generate exactly 94 conjugations. Count them as you go.

Return ONLY this JSON format:
{
  "verb": "${verb}",
  "conjugations": [
    {"pronoun": "yo", "tense": "present", "mood": "indicative", "form": "conjugated_form"}
  ]
}

REQUIRED BREAKDOWN (MUST total 94):

**INDICATIVE MOOD (42 cards - 7 tenses × 6 pronouns):**
1. present (6 cards: yo, tú, él/ella/usted, nosotros, vosotros, ellos/ellas/ustedes)
2. preterite (6 cards)
3. imperfect (6 cards)
4. future (6 cards)
5. present_perfect (6 cards)
6. past_perfect (6 cards)
7. future_perfect (6 cards)

**SUBJUNCTIVE MOOD (30 cards - 5 tenses × 6 pronouns):**
8. present (6 cards)
9. imperfect (6 cards)
10. future_subjunctive (6 cards)
11. present_perfect (6 cards)
12. past_perfect (6 cards)

**CONDITIONAL MOOD (12 cards - 2 tenses × 6 pronouns):**
13. simple_conditional (6 cards)
14. conditional_perfect (6 cards)

**IMPERATIVE MOOD (10 cards - only tú, usted, nosotros, vosotros, ustedes):**
15. affirmative_imperative (5 cards - NO yo)
16. negative_imperative (5 cards - NO yo)

TOTAL: 42 + 30 + 12 + 10 = 94 cards exactly.

Only return valid JSON with all 94 conjugations. Do not truncate.`;
    }

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gemma3n:latest',
        prompt: prompt,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const generatedText = data.response || '';

    // Parse JSON response
    const jsonStart = generatedText.indexOf('{');
    const jsonEnd = generatedText.lastIndexOf('}') + 1;
    const jsonText = generatedText.slice(jsonStart, jsonEnd);

    const parsedData = JSON.parse(jsonText);

    // Add context from the initial assessment (stored from assessVerb)
    return {
      ...parsedData,
      overview: this.currentVerbData?.overview || 'Generated conjugations',
      related_verbs: this.currentVerbData?.related_verbs || [],
      notes: this.currentVerbData?.notes || 'Conjugation set complete'
    };
  }

  async generateVerbOffline(verb, depth) {
    // Basic offline conjugation patterns (simplified)
    const basicConjugations = this.getBasicConjugations(verb, depth);

    return {
      verb: verb,
      overview: `Offline generation for ${verb}`,
      related_verbs: [],
      notes: 'Generated offline with basic patterns',
      conjugations: basicConjugations,
      english_meaning: 'Translation not available offline'
    };
  }

  getBasicConjugations(verb, depth) {
    const root = verb.slice(0, -2); // Remove -ar, -er, -ir
    const ending = verb.slice(-2);
    const pronouns = ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'];

    let conjugations = [];

    if (depth === 'meaning_only') {
      return []; // No conjugations for meaning-only
    }

    // Basic present indicative patterns
    let presentEndings;
    if (ending === 'ar') {
      presentEndings = ['o', 'as', 'a', 'amos', 'áis', 'an'];
    } else if (ending === 'er') {
      presentEndings = ['o', 'es', 'e', 'emos', 'éis', 'en'];
    } else { // ir
      presentEndings = ['o', 'es', 'e', 'imos', 'ís', 'en'];
    }

    pronouns.forEach((pronoun, i) => {
      conjugations.push({
        pronoun: pronoun,
        tense: 'present',
        mood: 'indicative',
        form: root + presentEndings[i]
      });
    });

    if (depth === 'full') {
      // Add more tenses for full generation (simplified patterns)
      // This is a basic implementation - in a real app you'd want more sophisticated patterns

      // Simple preterite
      let preteriteEndings;
      if (ending === 'ar') {
        preteriteEndings = ['é', 'aste', 'ó', 'amos', 'asteis', 'aron'];
      } else {
        preteriteEndings = ['í', 'iste', 'ió', 'imos', 'isteis', 'ieron'];
      }

      pronouns.forEach((pronoun, i) => {
        conjugations.push({
          pronoun: pronoun,
          tense: 'preterite',
          mood: 'indicative',
          form: root + preteriteEndings[i]
        });
      });
    }

    return conjugations;
  }

  displayResults(data, generationType) {
    this.hideAllSections();

    const previewGrid = document.getElementById('previewGrid');
    const cardCount = document.getElementById('generatedCount');

    if (generationType === 'meaning_only') {
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
        const typeLabel = generationType === 'core' ? 'core' : 'complete';
        cardCount.textContent = `${data.conjugations.length} ${typeLabel} cards generated`;
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

      if (this.currentVerbData.generationType === 'meaning_only') {
        // Save as sentence card
        const sentenceData = [{
          spanish_sentence: this.currentVerbData.verb,
          english_translation: this.currentVerbData.english_meaning || 'Translation not available',
          grammar_notes: `Meaning card generated ${this.isOnline ? 'online' : 'offline'}`
        }];
        savedCards = await cardDB.saveSentenceCards(sentenceData);
      } else {
        // Save as verb cards
        savedCards = await cardDB.saveVerbCards(this.currentVerbData);
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
    this.elements.assessmentSection.style.display = 'none';
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
        if (data && data.uploaded > 0) {
          console.log(`Sync completed: ${data.uploaded} cards uploaded`);
        }
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