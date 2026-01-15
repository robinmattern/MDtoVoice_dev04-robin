
export class ExporterService {
  static async exportAll(markdown, audioUrl, blocks) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // 1. Download Markdown
    this.downloadBlob(new Blob([markdown], {type: 'text/markdown'}), `script-${timestamp}.md`);

    // 2. Download JSON Manifest
    const manifest = {
        version: "1.0",
        blocks: blocks,
        exportedAt: timestamp
    };
    this.downloadBlob(new Blob([JSON.stringify(manifest, null, 2)], {type: 'application/json'}), `manifest-${timestamp}.json`);

    // 3. Download Audio (MP3/WAV)
    if (audioUrl) {
        const response = await fetch(audioUrl);
        const audioBlob = await response.blob();
        this.downloadBlob(audioBlob, `audio-${timestamp}.wav`);
    }

    alert('Triple-pack export started! Check your downloads for the .md, .json, and .wav files.');
  }

  static downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
