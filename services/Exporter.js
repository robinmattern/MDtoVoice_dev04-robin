
export class ExporterService {
  static async exportAll(markdown, audioUrl, blocks) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseName = `sync-speak-${timestamp}`;
    
    // 1. Markdown Source
    this._download(new Blob([markdown], {type: 'text/markdown'}), `${baseName}.md`);

    // 2. JSON Manifest (for reconstruction)
    const manifest = {
        version: "1.0",
        blocks: blocks,
        exportedAt: timestamp,
        source: "SyncSpeak No-Build"
    };
    this._download(new Blob([JSON.stringify(manifest, null, 2)], {type: 'application/json'}), `${baseName}.json`);

    // 3. Audio File
    if (audioUrl) {
        try {
            const response = await fetch(audioUrl);
            const audioBlob = await response.blob();
            this._download(audioBlob, `${baseName}.wav`);
        } catch (e) {
            console.error("Audio export failed", e);
        }
    }

    console.log("Triple-export complete.");
  }

  static _download(blob, filename) {
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
