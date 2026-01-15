
import { GoogleGenAI } from "@google/genai";

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

    // Clean markdown for TTS
    const script = markdown.replace(/<[^>]*>/g, '');

    // Setup multi-speaker if possible, otherwise high quality single speaker
    // We use gemini-2.5-flash-preview-tts as requested
    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Generate a voice conversation for this script. Ensure the two speakers are distinct: \n\n${script}` }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: speakers[0] || 'Joe', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
              { speaker: speakers[1] || 'Jane', voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
            ]
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio returned from Gemini");

    const audioBytes = this.decodeBase64(base64Audio);
    const wavBlob = this.createWavBlob(audioBytes, 24000);

    // Create sync manifest
    const blocks = markdown.split(/\n\n+/).map((text, i) => {
        const wc = text.split(/\s+/).length;
        return { text, id: i, duration: wc * 0.4 }; // approximate
    });

    return { 
        audioBlob: wavBlob, 
        manifest: { blocks, timestamp: Date.now(), speakers }
    };
  }

  decodeBase64(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Gemini returns raw PCM, we wrap it in WAV for browser playback
  createWavBlob(pcmData, sampleRate) {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    view.setUint32(0, 0x52494646, false); // RIFF
    view.setUint32(4, 36 + pcmData.length, true);
    view.setUint32(8, 0x57415645, false); // WAVE
    view.setUint32(12, 0x666d7420, false); // fmt 
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x64617461, false); // data
    view.setUint32(40, pcmData.length, true);

    return new Blob([header, pcmData], { type: 'audio/wav' });
  }
}
