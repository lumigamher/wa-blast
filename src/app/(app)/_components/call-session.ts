export type CallState = "connecting" | "connected" | "ended";

export class CallSession {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  remoteStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private recordDest: MediaStreamAudioDestinationNode | null = null;

  constructor(
    private iceServers: RTCIceServer[],
    private onState: (s: CallState) => void,
  ) {}

  /** Prepara la PeerConnection: mic, tracks, grabación, callbacks. Común a offer/answer. */
  private async setupPc(): Promise<RTCPeerConnection> {
    this.onState("connecting");
    this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.pc = pc;
    for (const track of this.localStream.getTracks()) pc.addTrack(track, this.localStream);

    let recordCtx: AudioContext | null = null;
    let recordDest: MediaStreamAudioDestinationNode | null = null;
    try {
      recordCtx = new AudioContext();
      recordDest = recordCtx.createMediaStreamDestination();
      recordCtx.createMediaStreamSource(this.localStream).connect(recordDest);
    } catch {
      recordCtx = null;
      recordDest = null;
    }

    pc.ontrack = (e) => {
      this.remoteStream = e.streams[0];
      if (recordCtx && recordDest) {
        try {
          recordCtx.createMediaStreamSource(e.streams[0]).connect(recordDest);
        } catch {
          /* grabación remota no disponible */
        }
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") this.onState("connected");
      if (pc.connectionState === "failed" || pc.connectionState === "closed") this.onState("ended");
    };

    this.recordDest = recordDest;
    return pc;
  }

  private startRecording(): void {
    if (!this.recordDest) return;
    try {
      this.recorder = new MediaRecorder(this.recordDest.stream, { mimeType: "audio/webm;codecs=opus" });
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.start();
    } catch {
      this.recorder = null;
    }
  }

  /** Entrante: crea la answer (ICE no-trickle) a partir del offer remoto. */
  async answer(offerSdp: string): Promise<string> {
    const pc = await this.setupPc();
    await pc.setRemoteDescription({ type: "offer", sdp: offerSdp });
    const a = await pc.createAnswer();
    await pc.setLocalDescription(a);
    await this.waitIceComplete(pc);
    if (!pc.localDescription) throw new Error("No se generó la descripción local (answer)");
    this.startRecording();
    return pc.localDescription.sdp;
  }

  /** Saliente: crea el offer (ICE no-trickle) para enviarlo a Meta. */
  async offer(): Promise<string> {
    const pc = await this.setupPc();
    const o = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(o);
    await this.waitIceComplete(pc);
    if (!pc.localDescription) throw new Error("No se generó la descripción local (offer)");
    this.startRecording();
    return pc.localDescription.sdp;
  }

  /** Saliente: aplica el answer remoto que llegó por webhook. */
  async applyAnswer(answerSdp: string): Promise<void> {
    if (!this.pc) throw new Error("Sin conexión activa");
    await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
  }

  private waitIceComplete(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      pc.addEventListener("icegatheringstatechange", check);
      // Tope de seguridad: no esperar para siempre.
      setTimeout(() => {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }, 3000);
    });
  }

  toggleMute(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return !track.enabled; // true = muteado
  }

  stopRecording(): Promise<Blob | null> {
    const rec = this.recorder;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: "audio/webm" }));
      rec.stop();
    });
  }

  hangup(): void {
    for (const t of this.localStream?.getTracks() ?? []) t.stop();
    this.pc?.close();
    this.pc = null;
    this.onState("ended");
  }
}
