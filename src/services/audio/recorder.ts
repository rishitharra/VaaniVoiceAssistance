/**
 * Mic recording via MediaRecorder. Nothing is captured until start() is called
 * from a user click; the mic track is released on stop().
 */
export class Recorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private analyser: AnalyserNode | null = null;
  private ctx: AudioContext | null = null;

  private cancelled = false;
  async start(deviceId?: string, onFailure?: (e: Error) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Use HTTPS or localhost in a browser that supports microphone recording.');
    try {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        // Processing that alters speech sounds is off; the model normalizes level itself.
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    if (this.cancelled) { this.release(); throw new Error('Recording cancelled.'); }
    this.stream.getAudioTracks().forEach(t => t.addEventListener('ended', () => { this.cancel(); onFailure?.(new Error('Microphone disconnected. Reconnect and record again.')); }));
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      .find((t) => MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.onerror = () => { this.cancel(); onFailure?.(new Error('Audio capture failed. Record again.')); };
    this.rec.start(250);

    // Level meter only (no processing of the recording)
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.ctx.createMediaStreamSource(this.stream).connect(this.analyser);
    } catch (e) { this.cancel(); throw e; }
  }

  /** Latest ~64 ms of raw samples, for the waveform view */
  timeDomain(out: Float32Array<ArrayBuffer>): boolean {
    if (!this.analyser) return false;
    this.analyser.getFloatTimeDomainData(out);
    return true;
  }

  /** 0..1 RMS level for a live meter */
  level(): number {
    if (!this.analyser) return 0;
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let s = 0;
    for (const x of buf) s += x * x;
    return Math.min(1, Math.sqrt(s / buf.length) * 4);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.rec || this.rec.state === 'inactive') return reject(new Error('Microphone stopped. Please record again.'));
      this.rec.onerror = () => { this.release(); reject(new Error('Recording failed. Please retry.')); };
      this.rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.rec?.mimeType || 'audio/webm' });
        this.release();
        resolve(blob);
      };
      this.rec.stop();
    });
  }

  cancel() {
    this.cancelled = true;
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    this.release();
  }

  private release() {
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== 'closed') void this.ctx.close().catch(() => {});
    this.stream = null;
    this.analyser = null;
    this.ctx = null;
  }
}
