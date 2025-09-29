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

      // Assessment elements
      meaningOnlyBtn: document.getElementById('meaningOnlyBtn'),
      coreBtn: document.getElementById('coreBtn'),
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

    // Assessment options
    this.elements.meaningOnlyBtn.addEventListener('click', () =>
      this.generateVerb(this.currentVerbData?.verb, 'meaning_only'));
    this.elements.coreBtn.addEventListener('click', () =>
      this.generateVerb(this.currentVerbData?.verb, 'core'));
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

    // First try online assessment, fallback to offline
    if (this.isOnline) {
      await this.assessVerb(verb);
    } else {
      await this.handleOfflineGeneration(verb);
    }
  }

  async assessVerb(verb) {
    this.showLoading('Analyzing verb complexity...');

    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gemma3n:latest',
          prompt: `Analyze the Spanish verb '${verb}' and return this exact JSON format:
{
  "verb": "${verb}",
  "complexity": "regular" or "irregular",
  "overview": "Brief description of meaning and usage",
  "special_notes": "Any irregularities, stem changes, or special patterns",
  "recommended_practice": "meaning_only", "core", or "full",
  "english_meaning": "Primary English translation",
  "related_verbs": ["similar_verb1", "similar_verb2", "similar_verb3"]
}

For irregular verbs or verbs with complex usage patterns, recommend 'full' practice. For verbs with some irregularities but manageable patterns, recommend 'core'. For completely regular verbs with straightforward meaning, recommend 'meaning_only'. Only return the JSON, no other text.`,
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

      const assessmentData = JSON.parse(jsonText);
      // Store full assessment data for later use in generation
      this.currentVerbData = {
        verb: assessmentData.verb,
        overview: assessmentData.overview,
        special_notes: assessmentData.special_notes,
        notes: assessmentData.special_notes, // alias for consistency
        related_verbs: assessmentData.related_verbs || [],
        english_meaning: assessmentData.english_meaning
      };
      this.displayAssessment(assessmentData);

    } catch (error) {
      console.error('Assessment error:', error);

      // Fallback to offline generation
      if (error.message.includes('fetch') || error.message.includes('network')) {
        await this.handleOfflineGeneration(verb);
      } else {
        this.showError('Failed to analyze verb: ' + error.message);
      }
    }
  }

  async handleOfflineGeneration(verb) {
    this.showLoading('Working offline - creating basic cards...');

    // Create basic offline cards without AI assessment
    const basicData = {
      verb: verb,
      complexity: 'unknown',
      overview: 'Offline mode - basic conjugation practice',
      special_notes: 'Generated offline without AI analysis',
      recommended_practice: 'core',
      english_meaning: 'Translation not available offline'
    };

    this.currentVerbData = { verb: verb };

    // Show offline assessment
    setTimeout(() => {
      this.displayAssessment(basicData);
      this.elements.offlineBtn.style.display = 'inline-block';
    }, 1000);
  }

  displayAssessment(data) {
    this.hideAllSections();

    document.getElementById('assessmentTitle').textContent = `Analysis: ${data.verb}`;

    // Complexity badge
    const complexityBadge = document.getElementById('verbComplexity');
    complexityBadge.textContent = data.complexity;
    complexityBadge.className = `complexity-badge ${data.complexity}`;

    // Assessment details
    document.getElementById('assessmentOverview').textContent = data.overview || 'No overview available';
    document.getElementById('assessmentNotes').textContent = data.special_notes || 'No special notes';

    // Recommended practice badge
    const practiceRecommendation = data.recommended_practice || 'core';
    const practiceBadge = document.getElementById('recommendedPractice');
    practiceBadge.textContent = practiceRecommendation.replace('_', ' ');
    practiceBadge.className = `practice-badge ${practiceRecommendation}`;

    // Highlight recommended option
    document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('recommended'));
    if (practiceRecommendation === 'meaning_only') {
      this.elements.meaningOnlyBtn.classList.add('recommended');
    } else if (practiceRecommendation === 'core') {
      this.elements.coreBtn.classList.add('recommended');
    } else {
      this.elements.fullBtn.classList.add('recommended');
    }

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

      this.currentVerbData = { ...generatedData, generationType: depth };
      this.displayResults(generatedData, depth);

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
      prompt = `Generate COMPLETE Spanish verb conjugations for '${verb}'. Return JSON format:
{
  "verb": "${verb}",
  "conjugations": [
    {"pronoun": "yo", "tense": "present", "mood": "indicative", "form": "hablo"},
    {"pronoun": "yo", "tense": "present", "mood": "subjunctive", "form": "hable"}
  ]
}

MUST generate ALL of these tenses for ALL pronouns (yo, tú, él/ella/usted, nosotros, vosotros, ellos/ellas/ustedes):

**INDICATIVE MOOD:**
- Simple: present, preterite, imperfect, future
- Compound: present_perfect, past_perfect, future_perfect

**SUBJUNCTIVE MOOD:**
- Simple: present, imperfect, imperfect_alt (alternative form)
- Compound: present_perfect, past_perfect

**CONDITIONAL MOOD:**
- Simple: simple_conditional
- Compound: conditional_perfect

**IMPERATIVE MOOD:**
- Simple: affirmative_present (for tú, usted, nosotros, vosotros, ustedes only)

This should generate approximately 70-80 conjugations total. Use exact tense names as listed above. Only return valid JSON, no other text.`;
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

    if (generationType === 'meaning_only') {
      // Handle meaning-only cards
      document.getElementById('verbTitle').textContent = `Verb: ${data.verb}`;
      document.getElementById('verbOverview').textContent = data.english_meaning || 'Translation provided';
      document.getElementById('relatedVerbs').innerHTML = '<span class="no-data">N/A for meaning cards</span>';
      document.getElementById('verbNotes').textContent = 'Basic meaning card generated offline';

      const previewGrid = document.getElementById('previewGrid');
      const cardCount = document.getElementById('cardCount');

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
      document.getElementById('verbTitle').textContent = `Verb: ${data.verb}`;
      document.getElementById('verbOverview').textContent = data.overview || 'No overview available';
      document.getElementById('verbNotes').textContent = data.notes || 'No special notes';

      // Display related verbs
      const relatedVerbsContainer = document.getElementById('relatedVerbs');
      if (data.related_verbs && data.related_verbs.length > 0) {
        relatedVerbsContainer.innerHTML = data.related_verbs
          .map(verb => `<span class="related-verb">${verb}</span>`)
          .join(' ');
      } else {
        relatedVerbsContainer.innerHTML = '<span class="no-data">None provided</span>';
      }

      // Display conjugation cards
      const previewGrid = document.getElementById('previewGrid');
      const cardCount = document.getElementById('cardCount');

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
      this.assessVerb(this.currentVerbData.verb);
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