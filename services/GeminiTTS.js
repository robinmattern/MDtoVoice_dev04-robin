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

    // Remove tags for audio synthesis
    const cleanText = markdown.replace(/<[^>]*>/g, '').trim();
    if (!cleanText) throw new Error("No script content found.");

    const speakerA = speakers[0] || 'Joe';
    const speakerB = speakers[1] || 'Jane';

    const prompt = `Synthesize this conversation. User voices for ${speakerA} and ${speakerB} must be distinct.
    
    Script:
    ${cleanText}`;

    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
                { speaker: speakerA, voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
                { speaker: speakerB, voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
            ]
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Failed to receive audio from Gemini.");

    const audioBytes = this._decode(base64Audio);
    const wavBlob = this._toWav(audioBytes, 24000);

    return { audioBlob: wavBlob };
  }

  _decode(base64) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

  _toWav(pcm, rate) {
    const buf = new ArrayBuffer(44 + pcm.length);
    const view = new DataView(buf);
    view.setUint32(0, 0x52494646, false); 
    view.setUint32(4, 36 + pcm.length, true);
    view.setUint32(8, 0x57415645, false);
    view.setUint32(12, 0x666d7420, false);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x64617461, false);
    view.setUint32(40, pcm.length, true);
    new Uint8Array(buf, 44).set(pcm);
    return new Blob([buf], { type: 'audio/wav' });
  }
}