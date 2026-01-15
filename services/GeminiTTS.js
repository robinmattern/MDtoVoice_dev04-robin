
import { GoogleGenAI, Modality } from "@google/genai";

export class GeminiTTSService {
  constructor() {
    this.ai = null;
  }

  async init() {
    if (!this.ai) {
      this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
  }

  async generateConversation(markdown, speakers) {
    await this.init();

    // Clean text for TTS - remove HTML tags used for collapsibles
    const cleanText = markdown.replace(/<[^>]*>/g, '').trim();
    if (!cleanText) throw new Error("No text provided for audio generation.");

    // Map detected names to available voices
    const speakerConfigs = [
        { speaker: speakers[0] || 'Speaker A', voice: 'Kore' },
        { speaker: speakers[1] || 'Speaker B', voice: 'Puck' }
    ];

    const prompt = `Convert the following conversation into audio. Ensure the voices for ${speakerConfigs.map(s => s.speaker).join(' and ')} are distinct and high quality. \n\nScript:\n${cleanText}`;

    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: speakerConfigs.map(s => ({
                speaker: s.speaker,
                voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice } }
            }))
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("The Gemini API did not return any audio data.");

    const audioBytes = this._base64ToUint8Array(base64Audio);
    const wavBlob = this._createWavBlob(audioBytes, 24000);

    return { 
        audioBlob: wavBlob,
        manifest: { version: "1.0", generatedAt: new Date().toISOString() }
    };
  }

  _base64ToUint8Array(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Wraps raw PCM data into a standard WAV container
  _createWavBlob(pcmData, sampleRate) {
    const buffer = new ArrayBuffer(44 + pcmData.length);
    const view = new DataView(buffer);

    // RIFF identifier
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + pcmData.length, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    
    // Format chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, 1, true); // NumChannels (1 = Mono)
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    
    // Data chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, pcmData.length, true);

    // Copy PCM data
    const pcmView = new Uint8Array(buffer, 44);
    pcmView.set(pcmData);

    return new Blob([buffer], { type: 'audio/wav' });
  }
}
