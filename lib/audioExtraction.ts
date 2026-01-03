export async function videoHasAudio(file: File): Promise<boolean> {
	try {
		const arrayBuffer = await file.arrayBuffer();
		const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

		try {
			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
			await audioContext.close();

			return audioBuffer.numberOfChannels > 0 && audioBuffer.length > 0;
		} catch (error) {
			await audioContext.close();
			return false;
		}
	} catch (error) {
		console.error("Error checking video audio:", error);
		return false;
	}
}

export async function extractAudioFromVideo(file: File): Promise<Blob | null> {
	try {
		const arrayBuffer = await file.arrayBuffer();
		const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

		try {
			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
			await audioContext.close();

			const wavBlob = audioBufferToWav(audioBuffer);
			return wavBlob;
		} catch (error) {
			console.error("Error decoding audio:", error);
			await audioContext.close();
			return null;
		}
	} catch (error) {
		console.error("Error extracting audio from video:", error);
		return null;
	}
}

function audioBufferToWav(audioBuffer: AudioBuffer): Blob {
	const numChannels = audioBuffer.numberOfChannels;
	const sampleRate = audioBuffer.sampleRate;
	const format = 1; // PCM
	const bitDepth = 16;

	const bytesPerSample = bitDepth / 8;
	const blockAlign = numChannels * bytesPerSample;

	const samples = audioBuffer.length;
	const dataSize = samples * blockAlign;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	const writeString = (offset: number, string: string) => {
		for (let i = 0; i < string.length; i++) {
			view.setUint8(offset + i, string.charCodeAt(i));
		}
	};

	writeString(0, "RIFF");
	view.setUint32(4, 36 + dataSize, true);
	writeString(8, "WAVE");
	writeString(12, "fmt ");
	view.setUint32(16, 16, true); // Subchunk1Size (PCM)
	view.setUint16(20, format, true); // AudioFormat (PCM)
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
	view.setUint16(32, blockAlign, true);
	view.setUint16(34, bitDepth, true);
	writeString(36, "data");
	view.setUint32(40, dataSize, true);

	const channels: Float32Array[] = [];
	for (let i = 0; i < numChannels; i++) {
		channels.push(audioBuffer.getChannelData(i));
	}

	let offset = 44;
	for (let i = 0; i < samples; i++) {
		for (let ch = 0; ch < numChannels; ch++) {
			const sample = Math.max(-1, Math.min(1, channels[ch][i]));
			const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
			view.setInt16(offset, intSample, true);
			offset += 2;
		}
	}

	return new Blob([buffer], { type: "audio/wav" });
}
