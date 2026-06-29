class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Int16Array(4096);
    this.bufferOffset = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        this.buffer[this.bufferOffset++] = s < 0 ? s * 0x8000 : s * 0x7FFF;

        if (this.bufferOffset >= this.buffer.length) {
          // Send the Int16Array buffer to the main thread
          const out = new Int16Array(this.buffer);
          this.port.postMessage(out.buffer, [out.buffer]);
          this.bufferOffset = 0;
        }
      }
    }
    return true; // Keep the processor alive
  }
}

registerProcessor('pcm-processor', PCMProcessor);
