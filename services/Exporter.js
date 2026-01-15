export class ExporterService {
  static async exportAll(md, audioUrl, blocks) {
    const id = Date.now();
    
    // 1. MD
    this.save(new Blob([md], {type: 'text/markdown'}), `script-${id}.md`);

    // 2. JSON Manifest
    const manifest = {
        blocks,
        exportedAt: new Date().toISOString(),
        format: "SyncSpeak-v1"
    };
    this.save(new Blob([JSON.stringify(manifest, null, 2)], {type: 'application/json'}), `manifest-${id}.json`);

    // 3. WAV Audio
    if (audioUrl) {
      const blob = await fetch(audioUrl).then(r => r.blob());
      this.save(blob, `audio-${id}.wav`);
    }

    alert('Triple Export Triggered! You will receive 3 files: .md, .json, and .wav');
  }

  static save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}