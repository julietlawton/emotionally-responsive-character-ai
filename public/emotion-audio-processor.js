class EmotionAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = [];
    }

    process(inputs) {
        const input = inputs[0];
        if (input.length > 0) {
            let samples;

            // Convert to mono if needed
            if (input.length === 1) {
                samples = input[0];
            }
            else if (input.length === 2) {
                const left = input[0];
                const right = input[1];
                samples = left.map((l, i) => (l + right[i]) / 2);
            }

            this.buffer.push(...samples);
            
            // Send 2s of audio every 2s
            if (this.buffer.length >= 32000) {
                const slice = this.buffer.slice(0, 32000);
                this.port.postMessage(slice);

                // Empty buffer after sending
                this.buffer = [];
            }
        }
        return true;
    }
}

registerProcessor("emotion-audio-processor", EmotionAudioProcessor);