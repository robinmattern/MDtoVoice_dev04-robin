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
    
    .toolbar { 
      height: 64px; 
      display: flex; 
      align-items: center; 
      padding: 0 1.5rem; 
      background: #ffffff; 
      gap: 1rem; 
      border-bottom: 1px solid #e2e8f0;
      z-index: 50; 
    }

    .main-view { 
      flex: 1; 
      display: flex; 
      overflow: hidden; 
      background: #f1f5f9; 
    }

    .editor-section { 
      flex: 1; 
      border-right: 1px solid #e2e8f0; 
      display: flex; 
      flex-direction: column; 
      background: #ffffff; 
    }

    .preview-section { 
      flex: 1; 
      overflow-y: auto; 
      padding: 2.5rem; 
      background: #ffffff; 
      scroll-behavior: smooth; 
    }

    textarea { 
      flex: 1; 
      resize: none; 
      border: none; 
      padding: 2rem; 
      font-family: 'ui-monospace', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace; 
      font-size: 15px; 
      line-height: 1.7; 
      outline: none; 
      color: #334155; 
    }
    
    .btn { 
      padding: 0.6rem 1rem; 
      border-radius: 0.5rem; 
      font-weight: 600; 
      cursor: pointer; 
      border: 1px solid #e2e8f0; 
      background: #fff; 
      transition: all 0.2s; 
      font-size: 0.875rem; 
      color: #475569; 
      display: flex; 
      align-items: center; 
      gap: 0.5rem; 
    }
    .btn:hover:not(:disabled) { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }
    .btn-primary { background: #2563eb; color: #ffffff; border: none; }
    .btn-primary:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .audio-bar { 
      height: 80px; 
      background: #ffffff; 
      border-top: 1px solid #e2e8f0; 
      display: flex; 
      align-items: center; 
      padding: 0 2rem; 
      gap: 2rem; 
    }
    audio { flex: 1; height: 40px; }

    /* Markdown & Speaker Styles */
    .prose { max-width: 65ch; margin: 0 auto; color: #334155; line-height: 1.6; }
    .speaker-tag { font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; background: #f1f5f9; padding: 0.1rem 0.4rem; border-radius: 4px; }
    
    .timestamp-jump { 
      cursor: pointer; 
      transition: all 0.2s; 
      border-radius: 12px; 
      padding: 1rem; 
      margin-bottom: 1rem; 
      border: 2px solid transparent; 
      position: relative;
    }
    .timestamp-jump:hover { background: #f8fafc; border-color: #e2e8f0; }
    .timestamp-jump.active { background: #f0f9ff; border-color: #3b82f6; }

    details { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 1.5rem; background: #fff; }
    summary { padding: 0.75rem 1rem; cursor: pointer; font-weight: 700; color: #475569; display: flex; align-items: center; gap: 0.5rem; border-bottom: 1px solid transparent; }
    details[open] summary { border-bottom-color: #e2e8f0; }
    details > div { padding: 1rem; color: #64748b; }

    .time-badge { font-size: 0.65rem; font-family: monospace; color: #94a3b8; margin-bottom: 0.5rem; display: block; }
  `;

  constructor() {
    super();
    this.markdown = `Joe: Hey Jane, check out this new "no-build" editor!\n\nJane: Wow, it looks incredibly smooth. How does the synchronization work?\n\nJoe: It uses word-count heuristics to estimate timings for each block.\n\n<details>\n<summary>Technical Details</summary>\n\nThis uses Lit from ESM.sh and the Gemini TTS API for high-quality multi-speaker audio.\n\n</details>`;
    this.speakers = [];
    this.isGenerating = false;
    this.audioUrl = '';
    this.currentTime = 0;
    this.blocks = [];
    this.ttsService = new GeminiTTSService();
  }

  firstUpdated() {
    this.syncLogic();
  }

  updated(changedProperties) {
    if (changedProperties.has('markdown')) {
      this.syncLogic();
    }
  }

  syncLogic() {
    this.detectSpeakers();
    this.processBlocks();
  }

  detectSpeakers() {
    // Regex provided: matches "Name:" at start of line
    const regex = /^([A-Z][a-z0-9_ ]+):/gm;
    const matches = [...this.markdown.matchAll(regex)];
    const unique = [...new Set(matches.map(m => m[1]))].slice(0, 2);
    this.speakers = unique.map(s => s.toUpperCase());
  }

  processBlocks() {
    // Split into logical blocks for interactive jumping
    const sections = this.markdown.split(/\n\n+/).filter(s => s.trim());
    let cumulativeTime = 0;
    this.blocks = sections.map((text, index) => {
        const wordCount = text.replace(/<[^>]*>/g, '').split(/\s+/).length;
        const duration = Math.max(2, wordCount * 0.45); 
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
      replacement = `<details>\n<summary>Click to expand</summary>\n\n${selected || 'Content...'}\n\n</details>`;
    }

    this.markdown = this.markdown.substring(0, start) + replacement + this.markdown.substring(end);
    
    setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + replacement.length, start + replacement.length);
    }, 0);
  }

  async generateAudio() {
    if (!this.markdown) return;
    this.isGenerating = true;
    try {
      const { audioBlob } = await this.ttsService.generateConversation(this.markdown, this.speakers);
      if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = URL.createObjectURL(audioBlob);
    } catch (err) {
      console.error(err);
      alert('Generation Failed: ' + err.message);
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
            <div class="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-md">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>
            </div>
            <h1 class="font-black text-xl text-slate-900 tracking-tight">SyncSpeak</h1>
          </div>
          <div class="flex-1"></div>
          <div class="flex gap-2">
              <button class="btn" @click=${() => this.wrapSelection('details')}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                Details Wrap
              </button>
              <button class="btn btn-primary" ?disabled=${this.isGenerating} @click=${this.generateAudio}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path></svg>
                ${this.isGenerating ? 'Synthesizing...' : 'Sync Audio'}
              </button>
              <button class="btn bg-slate-800 text-white border-none hover:bg-slate-900" @click=${this.handleExport}>
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                Triple Export
              </button>
          </div>
        </header>

        <main class="main-view">
          <section class="editor-section">
            <textarea .value=${this.markdown} @input=${this.handleInput} placeholder="Joe: Type dialogue here..."></textarea>
            <div class="px-6 py-2 border-t text-[11px] font-bold text-slate-400 flex gap-6 bg-slate-50">
                <span>SPEAKERS: ${this.speakers.length ? this.speakers.join(' & ') : 'NONE'}</span>
                <span>CHUNKS: ${this.blocks.length}</span>
            </div>
          </section>

          <section class="preview-section" id="preview-container">
            <div class="prose">
              ${this.blocks.map((block) => {
                const isActive = this.currentTime >= block.startTime && this.currentTime < (block.startTime + block.duration);
                let htmlContent = marked.parse(block.text);
                
                // Highlight speakers
                this.speakers.forEach(name => {
                    const regex = new RegExp(`(${name}):`, 'gi');
                    htmlContent = htmlContent.replace(regex, `<span class="speaker-tag">$1:</span>`);
                });

                return html`
                  <div class="timestamp-jump ${isActive ? 'active' : ''}" @click=${() => this.jumpTo(block.startTime)}>
                    <span class="time-badge">${block.startTime.toFixed(1)}s</span>
                    <div class="rendered-markdown">${html([htmlContent])}</div>
                  </div>
                `;
              })}
            </div>
          </section>
        </main>

        <footer class="audio-bar">
          <audio controls .src=${this.audioUrl} @timeupdate=${(e) => this.currentTime = e.target.currentTime}></audio>
          <div class="text-sm font-mono text-slate-500 tabular-nums">
            ${this.currentTime.toFixed(1)} / ${(this.blocks[this.blocks.length-1]?.startTime + this.blocks[this.blocks.length-1]?.duration || 0).toFixed(1)}s
          </div>
        </footer>
      </div>
    `;
  }
}

customElements.define('sync-speak-app', SyncSpeakApp);