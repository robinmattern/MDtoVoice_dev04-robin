
import { LitElement, html, css } from 'lit';
import { marked } from 'marked';
import { GeminiTTSService } from './services/GeminiTTS.js';
import { ExporterService } from './services/Exporter.js';

export class SyncSpeakApp extends LitElement {
  static properties = {
    markdown: { type: String },
    speakers: { type: Array },
    isGenerating: { type: Boolean },
    audioUrl: { type: String },
    currentTime: { type: Number },
    blocks: { type: Array }
  };

  static styles = css`
    :host { display: block; height: 100vh; }
    .layout { display: flex; flex-direction: column; height: 100%; }
    .toolbar { height: 64px; display: flex; align-items: center; padding: 0 1.5rem; border-bottom: 1px solid #e2e8f0; background: #ffffff; gap: 1rem; box-shadow: 0 1px 2px rgba(0,0,0,0.05); z-index: 10; }
    .main-view { flex: 1; display: flex; overflow: hidden; background: #f1f5f9; }
    .editor-section { flex: 1; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; background: #ffffff; }
    .preview-section { flex: 1; overflow-y: auto; padding: 2.5rem; background: #ffffff; scroll-behavior: smooth; }
    textarea { flex: 1; resize: none; border: none; padding: 2rem; font-family: 'ui-monospace', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace; font-size: 15px; line-height: 1.7; outline: none; color: #334155; }
    
    .btn { padding: 0.6rem 1.2rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; border: 1px solid #e2e8f0; background: #fff; transition: all 0.2s; font-size: 0.875rem; color: #475569; display: flex; align-items: center; gap: 0.5rem; }
    .btn:hover:not(:disabled) { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }
    .btn-primary { background: #2563eb; color: #ffffff; border: none; }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .audio-bar { height: 80px; background: #ffffff; border-top: 1px solid #e2e8f0; display: flex; align-items: center; padding: 0 2rem; gap: 2rem; }
    audio { flex: 1; height: 40px; }

    /* Markdown Styles */
    .prose { max-width: 65ch; margin: 0 auto; color: #334155; }
    .speaker-tag { font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.025em; margin-right: 0.25rem; }
    .timestamp-jump { cursor: pointer; transition: all 0.2s; border-radius: 8px; padding: 0.75rem; margin: -0.75rem; margin-bottom: 1rem; border: 1px solid transparent; }
    .timestamp-jump:hover { background: #f0f9ff; border-color: #bae6fd; }
    .timestamp-jump.active { background: #eff6ff; border-color: #bfdbfe; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }

    details { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 1rem; overflow: hidden; }
    summary { padding: 0.75rem 1rem; background: #f8fafc; cursor: pointer; font-weight: 600; list-style: none; display: flex; align-items: center; gap: 0.5rem; user-select: none; }
    summary:hover { background: #f1f5f9; }
    summary::before { content: '▶'; font-size: 0.7rem; transition: transform 0.2s; color: #64748b; }
    details[open] summary::before { transform: rotate(90deg); }
    details > div { padding: 1rem; }

    .speaker-label { font-size: 0.7rem; background: #f1f5f9; padding: 0.2rem 0.5rem; border-radius: 1rem; color: #64748b; font-weight: 700; }
  `;

  constructor() {
    super();
    this.markdown = `Joe: Hello Jane! Did you see the latest update?\n\nJane: Hey Joe! Not yet. Is it about the new sync feature?\n\nJoe: Yes! It tracks our speech perfectly.`;
    this.speakers = [];
    this.isGenerating = false;
    this.audioUrl = '';
    this.currentTime = 0;
    this.blocks = [];
    this.ttsService = new GeminiTTSService();
  }

  firstUpdated() {
    this.detectSpeakers();
    this.processBlocks();
  }

  updated(changedProperties) {
    if (changedProperties.has('markdown')) {
      this.detectSpeakers();
      this.processBlocks();
    }
  }

  detectSpeakers() {
    // Regex: Matches 'Name:' at start of blocks
    const regex = /^([A-Z][a-z0-9_ ]+):/gm;
    const matches = [...this.markdown.matchAll(regex)];
    const unique = [...new Set(matches.map(m => m[1]))].slice(0, 2);
    this.speakers = unique.map(s => s.toUpperCase());
  }

  processBlocks() {
    const lines = this.markdown.split(/\n\n+/).filter(l => l.trim());
    let cumulativeTime = 0;
    this.blocks = lines.map((text, index) => {
        const wordCount = text.split(/\s+/).length;
        const duration = wordCount * 0.45; // Heuristic for TTS speed
        const block = { text, id: index, startTime: cumulativeTime, duration };
        cumulativeTime += duration;
        return block;
    });
  }

  handleInput(e) {
    this.markdown = e.target.value;
  }

  wrapSelection(type) {
    const textarea = this.renderRoot.querySelector('textarea');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = this.markdown.substring(start, end);
    
    let replacement = '';
    if (type === 'details') {
      replacement = `<details>\n<summary>Click to reveal</summary>\n\n${selected || 'Content goes here...'}\n\n</details>`;
    }

    this.markdown = this.markdown.substring(0, start) + replacement + this.markdown.substring(end);
    // Focus back and restore state
    setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = start + replacement.length;
        textarea.selectionEnd = start + replacement.length;
    }, 0);
  }

  async generateAudio() {
    if (!this.markdown) return;
    this.isGenerating = true;
    try {
      const { audioBlob, manifest } = await this.ttsService.generateConversation(this.markdown, this.speakers);
      if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = URL.createObjectURL(audioBlob);
      // Sync actual timings if returned by service (here we keep heuristic for simplicity)
    } catch (err) {
      console.error(err);
      alert('Error: ' + err.message);
    } finally {
      this.isGenerating = false;
    }
  }

  jumpTo(time) {
    const audio = this.renderRoot.querySelector('audio');
    if (audio) {
      audio.currentTime = time;
      audio.play();
    }
  }

  handleExport() {
    ExporterService.exportAll(this.markdown, this.audioUrl, this.blocks);
  }

  render() {
    return html`
      <div class="layout">
        <header class="toolbar">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
            </div>
            <div>
                <h1 class="font-bold text-lg text-slate-800 leading-none">SyncSpeak</h1>
                <p class="text-xs text-slate-400 mt-1">AI-Powered Conversation Editor</p>
            </div>
          </div>
          <div class="flex-1"></div>
          <div class="flex gap-2">
              <button class="btn" @click=${() => this.wrapSelection('details')}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                Collapsible
              </button>
              <button class="btn btn-primary" ?disabled=${this.isGenerating} @click=${this.generateAudio}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                ${this.isGenerating ? 'Synthesizing...' : 'Generate Sync Audio'}
              </button>
              <div class="w-px h-8 bg-slate-200 mx-2"></div>
              <button class="btn" @click=${this.handleExport}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Export
              </button>
          </div>
        </header>

        <main class="main-view">
          <section class="editor-section">
            <textarea .value=${this.markdown} @input=${this.handleInput} placeholder="Start writing dialogue... e.g. 'Joe: Hello Jane!'"></textarea>
            <div class="p-3 border-t text-[10px] text-slate-400 flex gap-4 bg-slate-50">
                <span>DETECTED SPEAKERS: ${this.speakers.length ? this.speakers.join(', ') : 'NONE'}</span>
                <span>BLOCKS: ${this.blocks.length}</span>
            </div>
          </section>

          <section class="preview-section" id="preview-container">
            <div class="prose">
              ${this.blocks.map((block) => {
                const isActive = this.currentTime >= block.startTime && this.currentTime < (block.startTime + block.duration);
                let htmlContent = marked.parse(block.text);
                
                // Capitalize detected speakers in the output
                this.speakers.forEach(name => {
                    const regex = new RegExp(`(${name}):`, 'gi');
                    htmlContent = htmlContent.replace(regex, `<span class="speaker-tag">$1:</span>`);
                });

                return html`
                  <div class="timestamp-jump ${isActive ? 'active' : ''}" @click=${() => this.jumpTo(block.startTime)}>
                    <div class="flex justify-between items-start mb-1">
                        <span class="speaker-label">${(block.startTime).toFixed(1)}s</span>
                    </div>
                    <div class="rendered-markdown">${html([htmlContent])}</div>
                  </div>
                `;
              })}
            </div>
          </section>
        </main>

        <footer class="audio-bar">
          <audio controls .src=${this.audioUrl} @timeupdate=${(e) => this.currentTime = e.target.currentTime}></audio>
          <div class="text-xs font-mono text-slate-400 min-w-[60px]">
            ${this.currentTime.toFixed(1)}s
          </div>
        </footer>
      </div>
    `;
  }
}

customElements.define('sync-speak-app', SyncSpeakApp);
