
import { LitElement, html, css } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { marked } from 'marked';
import { GeminiTTSService } from './services/GeminiTTS.js';
import { ExporterService } from './services/Exporter.js';

@customElement('sync-speak-app')
export class SyncSpeakApp extends LitElement {
  static styles = css`
    :host { display: block; height: 100vh; font-family: system-ui, -apple-system, sans-serif; }
    .layout { display: flex; flex-direction: column; height: 100%; }
    .toolbar { height: 60px; display: flex; align-items: center; padding: 0 1.5rem; border-bottom: 1px solid #e2e8f0; background: #fff; gap: 1rem; }
    .main-view { flex: 1; display: flex; overflow: hidden; }
    .editor-section { flex: 1; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; }
    .preview-section { flex: 1; overflow-y: auto; background: #fff; padding: 2rem; }
    textarea { flex: 1; resize: none; border: none; padding: 1.5rem; font-family: 'Fira Code', monospace; font-size: 14px; line-height: 1.6; outline: none; }
    .btn { padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 500; cursor: pointer; border: 1px solid #cbd5e1; background: #fff; transition: all 0.2s; }
    .btn:hover { background: #f8fafc; border-color: #94a3b8; }
    .btn-primary { background: #2563eb; color: #fff; border: none; }
    .btn-primary:hover { background: #1d4ed8; }
    .audio-bar { height: 80px; background: #fff; border-top: 1px solid #e2e8f0; display: flex; align-items: center; padding: 0 2rem; gap: 2rem; }
  `;

  @state() markdown = `# Conversation Script\n\nJoe: Hey Jane, did you see the new update?\n\nJane: Not yet! Is it worth checking out?\n\nJoe: Absolutely. The synchronization is incredible.`;
  @state() speakers = [];
  @state() isGenerating = false;
  @state() audioUrl = '';
  @state() audioDuration = 0;
  @state() currentTime = 0;
  @state() blocks = [];

  @query('audio') audioEl;
  @query('textarea') textareaEl;

  private ttsService = new GeminiTTSService();

  updated(changedProperties) {
    if (changedProperties.has('markdown')) {
      this.detectSpeakers();
      this.processBlocks();
    }
  }

  detectSpeakers() {
    // Regex to detect "Name:" at start of line
    const regex = /^([A-Z][a-z0-9_ ]+):/gm;
    const matches = [...this.markdown.matchAll(regex)];
    const unique = [...new Set(matches.map(m => m[1]))].slice(0, 2);
    this.speakers = unique;
  }

  processBlocks() {
    const lines = this.markdown.split(/\n\n+/);
    this.blocks = lines.map((text, index) => {
        // Estimated timestamp based on ~150 words per minute
        const wordCount = text.split(/\s+/).length;
        const estimatedSeconds = wordCount * (60 / 180); 
        return { text, id: index, duration: estimatedSeconds };
    });
  }

  handleInput(e) {
    this.markdown = e.target.value;
  }

  wrapSelection(tag) {
    const start = this.textareaEl.selectionStart;
    const end = this.textareaEl.selectionEnd;
    const text = this.markdown;
    const selected = text.substring(start, end);
    
    let replacement = '';
    if (tag === 'details') {
        replacement = `<details>\n<summary>Click to Expand</summary>\n\n${selected}\n\n</details>`;
    }

    this.markdown = text.substring(0, start) + replacement + text.substring(end);
    this.requestUpdate();
  }

  async generateAudio() {
    if (!this.markdown) return;
    this.isGenerating = true;
    try {
      const { audioBlob, manifest } = await this.ttsService.generateConversation(this.markdown, this.speakers);
      this.audioUrl = URL.createObjectURL(audioBlob);
      this.blocks = manifest.blocks;
    } catch (err) {
      alert('Error generating audio: ' + err.message);
    } finally {
      this.isGenerating = false;
    }
  }

  jumpTo(time) {
    if (this.audioEl) {
      this.audioEl.currentTime = time;
      this.audioEl.play();
    }
  }

  handleExport() {
    ExporterService.exportAll(this.markdown, this.audioUrl, this.blocks);
  }

  render() {
    const renderedHtml = marked.parse(this.markdown);
    
    // Post-process HTML for speaker tags and jump clicks
    let processedHtml = renderedHtml;
    this.speakers.forEach(name => {
        const regex = new RegExp(`${name}:`, 'g');
        processedHtml = processedHtml.replace(regex, `<span class="speaker-tag">${name}:</span>`);
    });

    // Wrap blocks in clickable spans for jumping
    // (Simple heuristic for demo: mapping blocks back into HTML is complex, we use index-based jump for text segments)
    
    return html`
      <div class="layout">
        <div class="toolbar glass-panel">
          <div class="flex items-center gap-2">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>
            <h1 class="font-bold text-xl text-slate-800">SyncSpeak</h1>
          </div>
          <div class="flex-1"></div>
          <button class="btn" @click=${() => this.wrapSelection('details')}>+ Collapsible</button>
          <button class="btn btn-primary" ?disabled=${this.isGenerating} @click=${this.generateAudio}>
            ${this.isGenerating ? 'Generating...' : 'Sync Audio'}
          </button>
          <button class="btn" @click=${this.handleExport}>Export Triple-Pack</button>
        </div>

        <div class="main-view">
          <div class="editor-section">
            <textarea .value=${this.markdown} @input=${this.handleInput} placeholder="Type your dialogue here..."></textarea>
          </div>
          <div class="preview-section" id="preview-container">
             <div class="prose prose-slate max-w-none">
                ${html`<div>${this.blocks.map((b, i) => html`
                    <div class="timestamp-jump mb-4" @click=${() => this.jumpTo(this.calculateBlockStart(i))}>
                        ${html([marked.parse(b.text)])}
                    </div>
                `)}</div>`}
             </div>
          </div>
        </div>

        <div class="audio-bar glass-panel">
          <audio controls .src=${this.audioUrl} @timeupdate=${(e) => this.currentTime = e.target.currentTime} class="flex-1"></audio>
          <div class="text-sm font-mono text-slate-500">
            Current: ${this.currentTime.toFixed(1)}s
          </div>
        </div>
      </div>
    `;
  }

  calculateBlockStart(index) {
    let start = 0;
    for (let i = 0; i < index; i++) {
        start += this.blocks[i].duration || 0;
    }
    return start;
  }
}
