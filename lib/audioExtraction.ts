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
	let audioContext: AudioContext | null = null;

	try {
		const arrayBuffer = await file.arrayBuffer();
		audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

		const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
		const wavBlob = audioBufferToWav(audioBuffer);
		const wavArrayBuffer = await wavBlob.arrayBuffer();
		const wavAudioBuffer = await audioContext.decodeAudioData(wavArrayBuffer);

		const m4aBlob = await encodeAudioBufferToM4a(wavAudioBuffer);
		return m4aBlob;
	} catch (error) {
		console.error("Error extracting audio from video:", error);
		return null;
	} finally {
		if (audioContext && audioContext.state !== "closed") {
			await audioContext.close().catch(() => {});
		}
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

async function encodeAudioBufferToM4a(audioBuffer: AudioBuffer): Promise<Blob> {
	const AudioEncoderConstructor = (window as any).AudioEncoder;
	const AudioDataConstructor = (window as any).AudioData;

	if (!AudioEncoderConstructor || !AudioDataConstructor) {
		throw new Error("WebCodecs is not supported in this browser");
	}

	const selectedConfig = await selectAacConfig(audioBuffer, AudioEncoderConstructor);
	const normalizedBuffer = await normalizeAudioBuffer(audioBuffer, selectedConfig.sampleRate, selectedConfig.numberOfChannels);
	const numberOfChannels = normalizedBuffer.numberOfChannels;
	const sampleRate = normalizedBuffer.sampleRate;
	const config = {
		codec: selectedConfig.codec,
		sampleRate,
		numberOfChannels,
		bitrate: 128000,
	};

	const pendingDurations: number[] = [];
	const chunks: { data: Uint8Array; durationUs: number }[] = [];
	let decoderConfig: any = null;
	let encoderError: any = null;

	const encoder = new AudioEncoderConstructor({
		output: (chunk: any, metadata: any) => {
			const data = new Uint8Array(chunk.byteLength);
			chunk.copyTo(data);
			let durationUs = chunk.duration ?? 0;
			if (!durationUs) {
				durationUs = pendingDurations.shift() ?? 0;
			}
			chunks.push({ data, durationUs });
			if (metadata?.decoderConfig && !decoderConfig) {
				decoderConfig = metadata.decoderConfig;
			}
		},
		error: (error: any) => {
			encoderError = error;
		},
	});

	encoder.configure(config);

	const channelData: Float32Array[] = [];
	for (let i = 0; i < numberOfChannels; i++) {
		channelData.push(normalizedBuffer.getChannelData(i));
	}

	const totalFrames = normalizedBuffer.length;
	const framesPerChunk = 1024;

	for (let offset = 0; offset < totalFrames; offset += framesPerChunk) {
		const frames = Math.min(framesPerChunk, totalFrames - offset);
		const interleaved = new Float32Array(frames * numberOfChannels);
		let writeIndex = 0;

		for (let i = 0; i < frames; i++) {
			for (let ch = 0; ch < numberOfChannels; ch++) {
				interleaved[writeIndex++] = channelData[ch][offset + i];
			}
		}

		const timestamp = Math.round((offset / sampleRate) * 1_000_000);
		const durationUs = Math.round((frames / sampleRate) * 1_000_000);
		pendingDurations.push(durationUs);

		const audioData = new AudioDataConstructor({
			format: "f32",
			sampleRate,
			numberOfFrames: frames,
			numberOfChannels,
			timestamp,
			data: interleaved,
		});

		encoder.encode(audioData);
		audioData.close();
	}

	await encoder.flush();
	encoder.close();

	if (encoderError) {
		throw encoderError;
	}

	if (!chunks.length) {
		throw new Error("AAC encoding produced no output");
	}

	let audioSpecificConfig: Uint8Array | null = null;
	const description = decoderConfig?.description;
	if (description) {
		if (description instanceof ArrayBuffer) {
			audioSpecificConfig = new Uint8Array(description);
		} else if (ArrayBuffer.isView(description)) {
			audioSpecificConfig = new Uint8Array(
				description.buffer.slice(description.byteOffset, description.byteOffset + description.byteLength)
			);
		}
	}

	if (!audioSpecificConfig) {
		audioSpecificConfig = buildAudioSpecificConfig(sampleRate, numberOfChannels);
	}

	const mp4Data = buildM4aFile(chunks, audioSpecificConfig, sampleRate, numberOfChannels);
	return new Blob([mp4Data], { type: "audio/mp4" });
}

async function selectAacConfig(audioBuffer: AudioBuffer, AudioEncoderConstructor: any): Promise<{ codec: string; sampleRate: number; numberOfChannels: number }> {
	const sampleRates = [audioBuffer.sampleRate, 48000, 44100].filter((rate, index, array) => array.indexOf(rate) === index);
	const channelOptions = audioBuffer.numberOfChannels >= 2 ? [2, 1] : [1];
	const codecCandidates = ["mp4a.40.2", "aac"];

	if (!AudioEncoderConstructor.isConfigSupported) {
		return {
			codec: codecCandidates[0],
			sampleRate: sampleRates[0],
			numberOfChannels: Math.min(audioBuffer.numberOfChannels, 2),
		};
	}

	for (const codec of codecCandidates) {
		for (const sampleRate of sampleRates) {
			for (const channels of channelOptions) {
				const config = {
					codec,
					sampleRate,
					numberOfChannels: channels,
					bitrate: 128000,
				};
				const support = await AudioEncoderConstructor.isConfigSupported(config).catch(() => null);
				if (support?.supported) {
					return { codec, sampleRate, numberOfChannels: channels };
				}
			}
		}
	}

	throw new Error("AAC encoder configuration is not supported");
}

async function normalizeAudioBuffer(audioBuffer: AudioBuffer, sampleRate: number, numberOfChannels: number): Promise<AudioBuffer> {
	let normalizedBuffer = audioBuffer;

	if (normalizedBuffer.numberOfChannels !== numberOfChannels) {
		normalizedBuffer = mixAudioBufferChannels(normalizedBuffer, numberOfChannels);
	}

	if (normalizedBuffer.sampleRate !== sampleRate) {
		normalizedBuffer = await resampleAudioBuffer(normalizedBuffer, sampleRate);
	}

	return normalizedBuffer;
}

function mixAudioBufferChannels(audioBuffer: AudioBuffer, numberOfChannels: number): AudioBuffer {
	if (audioBuffer.numberOfChannels === numberOfChannels) {
		return audioBuffer;
	}

	const length = audioBuffer.length;
	const sampleRate = audioBuffer.sampleRate;
	const outputBuffer = new AudioBuffer({ length, numberOfChannels, sampleRate });
	const inputChannelCount = audioBuffer.numberOfChannels;

	if (numberOfChannels === 1) {
		const output = outputBuffer.getChannelData(0);
		const inputs: Float32Array[] = [];
		for (let ch = 0; ch < inputChannelCount; ch++) {
			inputs.push(audioBuffer.getChannelData(ch));
		}

		for (let i = 0; i < length; i++) {
			let sum = 0;
			for (let ch = 0; ch < inputChannelCount; ch++) {
				sum += inputs[ch][i];
			}
			output[i] = sum / inputChannelCount;
		}

		return outputBuffer;
	}

	if (numberOfChannels === 2) {
		const left = outputBuffer.getChannelData(0);
		const right = outputBuffer.getChannelData(1);

		if (inputChannelCount === 1) {
			const input = audioBuffer.getChannelData(0);
			left.set(input);
			right.set(input);
			return outputBuffer;
		}

		if (inputChannelCount === 2) {
			left.set(audioBuffer.getChannelData(0));
			right.set(audioBuffer.getChannelData(1));
			return outputBuffer;
		}

		const inputs: Float32Array[] = [];
		for (let ch = 0; ch < inputChannelCount; ch++) {
			inputs.push(audioBuffer.getChannelData(ch));
		}

		for (let i = 0; i < length; i++) {
			let sum = 0;
			for (let ch = 0; ch < inputChannelCount; ch++) {
				sum += inputs[ch][i];
			}
			const avg = sum / inputChannelCount;
			left[i] = avg;
			right[i] = avg;
		}
	}

	return outputBuffer;
}

async function resampleAudioBuffer(audioBuffer: AudioBuffer, sampleRate: number): Promise<AudioBuffer> {
	if (audioBuffer.sampleRate === sampleRate) {
		return audioBuffer;
	}

	const length = Math.ceil(audioBuffer.duration * sampleRate);
	const offlineContext = new OfflineAudioContext(audioBuffer.numberOfChannels, length, sampleRate);
	const source = offlineContext.createBufferSource();
	source.buffer = audioBuffer;
	source.connect(offlineContext.destination);
	source.start(0);
	return offlineContext.startRendering();
}

function buildM4aFile(
	chunks: { data: Uint8Array; durationUs: number }[],
	audioSpecificConfig: Uint8Array,
	sampleRate: number,
	numberOfChannels: number
): Uint8Array {
	const ftyp = buildFtypBox();
	const sampleSizes = chunks.map((chunk) => chunk.data.byteLength);
	const sampleDurations = chunks.map((chunk) => {
		if (chunk.durationUs > 0) {
			return Math.max(1, Math.round((chunk.durationUs / 1_000_000) * sampleRate));
		}
		return 1024;
	});

	const mdatData = concatUint8Arrays(chunks.map((chunk) => chunk.data));
	const mdat = box("mdat", mdatData);

	const mdatStart = ftyp.length;
	const mdatHeaderSize = 8;
	const chunkOffsets: number[] = [];
	let runningOffset = mdatStart + mdatHeaderSize;
	for (const size of sampleSizes) {
		chunkOffsets.push(runningOffset);
		runningOffset += size;
	}

	const moov = buildMoovBox(sampleRate, numberOfChannels, sampleDurations, sampleSizes, chunkOffsets, audioSpecificConfig);
	return concatUint8Arrays([ftyp, mdat, moov]);
}

function buildFtypBox(): Uint8Array {
	return box("ftyp", concatUint8Arrays([stringToBytes("M4A "), u32(512), stringToBytes("isom"), stringToBytes("M4A "), stringToBytes("mp42")]));
}

function buildMoovBox(
	sampleRate: number,
	numberOfChannels: number,
	sampleDurations: number[],
	sampleSizes: number[],
	chunkOffsets: number[],
	audioSpecificConfig: Uint8Array
): Uint8Array {
	const durationSamples = sampleDurations.reduce((total, duration) => total + duration, 0);
	const movieTimescale = 1000;
	const movieDuration = Math.max(1, Math.round((durationSamples / sampleRate) * movieTimescale));

	const mvhd = box(
		"mvhd",
		fullBox(
			0,
			0,
			u32(0),
			u32(0),
			u32(movieTimescale),
			u32(movieDuration),
			u32(0x00010000),
			u16(0x0100),
			u16(0),
			u32(0),
			u32(0),
			matrixBox(),
			u32(0),
			u32(0),
			u32(0),
			u32(0),
			u32(0),
			u32(0),
			u32(2)
		)
	);

	const tkhd = box(
		"tkhd",
		fullBox(
			0,
			0x000007,
			u32(0),
			u32(0),
			u32(1),
			u32(0),
			u32(movieDuration),
			u32(0),
			u32(0),
			u16(0),
			u16(0),
			u16(0x0100),
			u16(0),
			matrixBox(),
			u32(0),
			u32(0)
		)
	);

	const mdhd = box(
		"mdhd",
		fullBox(0, 0, u32(0), u32(0), u32(sampleRate), u32(durationSamples), u16(0x55c4), u16(0))
	);

	const hdlr = box(
		"hdlr",
		fullBox(0, 0, u32(0), stringToBytes("soun"), u32(0), u32(0), u32(0), u8(0))
	);

	const smhd = box("smhd", fullBox(0, 0, u16(0), u16(0)));
	const dref = box("dref", fullBox(0, 0, u32(1), box("url ", fullBox(0, 1))));
	const dinf = box("dinf", dref);

	const stsd = box(
		"stsd",
		fullBox(0, 0, u32(1), buildMp4aSampleEntry(sampleRate, numberOfChannels, audioSpecificConfig))
	);
	const stts = box("stts", buildStts(sampleDurations));
	const stsc = box("stsc", fullBox(0, 0, u32(1), u32(1), u32(1), u32(1)));
	const stsz = box("stsz", buildStsz(sampleSizes));
	const stco = box("stco", buildStco(chunkOffsets));

	const stbl = box("stbl", stsd, stts, stsc, stsz, stco);
	const minf = box("minf", smhd, dinf, stbl);
	const mdia = box("mdia", mdhd, hdlr, minf);
	const trak = box("trak", tkhd, mdia);
	return box("moov", mvhd, trak);
}

function buildMp4aSampleEntry(sampleRate: number, numberOfChannels: number, audioSpecificConfig: Uint8Array): Uint8Array {
	const esds = buildEsdsBox(audioSpecificConfig);
	return box(
		"mp4a",
		concatUint8Arrays([
			new Uint8Array(6),
			u16(1),
			u32(0),
			u32(0),
			u16(numberOfChannels),
			u16(16),
			u16(0),
			u16(0),
			u32(sampleRate << 16),
			esds,
		])
	);
}

function buildEsdsBox(audioSpecificConfig: Uint8Array): Uint8Array {
	const decoderSpecificInfo = makeDescriptor(0x05, audioSpecificConfig);
	const decoderConfig = concatUint8Arrays([
		u8(0x40),
		u8(0x15),
		u24(0),
		u32(128000),
		u32(128000),
		decoderSpecificInfo,
	]);
	const decoderConfigDescriptor = makeDescriptor(0x04, decoderConfig);
	const slConfigDescriptor = makeDescriptor(0x06, u8(0x02));
	const esDescriptor = makeDescriptor(0x03, concatUint8Arrays([u16(1), u8(0), decoderConfigDescriptor, slConfigDescriptor]));
	return box("esds", fullBox(0, 0, esDescriptor));
}

function buildStts(sampleDurations: number[]): Uint8Array {
	const entries: { count: number; duration: number }[] = [];
	let currentDuration = sampleDurations[0];
	let currentCount = 0;

	for (const duration of sampleDurations) {
		if (duration === currentDuration) {
			currentCount += 1;
		} else {
			entries.push({ count: currentCount, duration: currentDuration });
			currentDuration = duration;
			currentCount = 1;
		}
	}

	if (currentCount > 0) {
		entries.push({ count: currentCount, duration: currentDuration });
	}

	const entryData = entries.map((entry) => concatUint8Arrays([u32(entry.count), u32(entry.duration)]));
	return fullBox(0, 0, u32(entries.length), ...entryData);
}

function buildStsz(sampleSizes: number[]): Uint8Array {
	const sizesData = sampleSizes.map((size) => u32(size));
	return fullBox(0, 0, u32(0), u32(sampleSizes.length), ...sizesData);
}

function buildStco(chunkOffsets: number[]): Uint8Array {
	const offsetData = chunkOffsets.map((offset) => u32(offset));
	return fullBox(0, 0, u32(chunkOffsets.length), ...offsetData);
}

function buildAudioSpecificConfig(sampleRate: number, numberOfChannels: number): Uint8Array {
	const indexMap: Record<number, number> = {
		96000: 0,
		88200: 1,
		64000: 2,
		48000: 3,
		44100: 4,
		32000: 5,
		24000: 6,
		22050: 7,
		16000: 8,
		12000: 9,
		11025: 10,
		8000: 11,
		7350: 12,
	};

	const audioObjectType = 2;
	const samplingIndex = indexMap[sampleRate] ?? 15;

	if (samplingIndex !== 15) {
		const byte1 = (audioObjectType << 3) | (samplingIndex >> 1);
		const byte2 = ((samplingIndex & 1) << 7) | (numberOfChannels << 3);
		return new Uint8Array([byte1, byte2]);
	}

	const bits: number[] = [];
	const pushBits = (value: number, length: number) => {
		for (let i = length - 1; i >= 0; i--) {
			bits.push((value >> i) & 1);
		}
	};

	pushBits(audioObjectType, 5);
	pushBits(samplingIndex, 4);
	pushBits(sampleRate, 24);
	pushBits(numberOfChannels, 4);

	const byteLength = Math.ceil(bits.length / 8);
	const result = new Uint8Array(byteLength);
	for (let i = 0; i < bits.length; i++) {
		result[Math.floor(i / 8)] |= bits[i] << (7 - (i % 8));
	}

	return result;
}

function makeDescriptor(tag: number, data: Uint8Array): Uint8Array {
	const lengthBytes = encodeDescriptorLength(data.length);
	return concatUint8Arrays([u8(tag), lengthBytes, data]);
}

function encodeDescriptorLength(length: number): Uint8Array {
	const bytes: number[] = [];
	let remaining = length;
	do {
		bytes.unshift(remaining & 0x7f);
		remaining >>= 7;
	} while (remaining > 0);

	for (let i = 0; i < bytes.length - 1; i++) {
		bytes[i] |= 0x80;
	}

	return new Uint8Array(bytes);
}

function box(type: string, ...payloads: Uint8Array[]): Uint8Array {
	const size = 8 + payloads.reduce((total, payload) => total + payload.length, 0);
	const result = new Uint8Array(size);
	const view = new DataView(result.buffer);
	view.setUint32(0, size);
	result.set(stringToBytes(type), 4);
	let offset = 8;
	for (const payload of payloads) {
		result.set(payload, offset);
		offset += payload.length;
	}
	return result;
}

function fullBox(version: number, flags: number, ...payloads: Uint8Array[]): Uint8Array {
	return concatUint8Arrays([u8(version), u24(flags), ...payloads]);
}

function matrixBox(): Uint8Array {
	return concatUint8Arrays([
		u32(0x00010000),
		u32(0),
		u32(0),
		u32(0),
		u32(0x00010000),
		u32(0),
		u32(0),
		u32(0),
		u32(0x40000000),
	]);
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
	const length = arrays.reduce((total, array) => total + array.length, 0);
	const result = new Uint8Array(length);
	let offset = 0;
	for (const array of arrays) {
		result.set(array, offset);
		offset += array.length;
	}
	return result;
}

function stringToBytes(value: string): Uint8Array {
	const result = new Uint8Array(value.length);
	for (let i = 0; i < value.length; i++) {
		result[i] = value.charCodeAt(i);
	}
	return result;
}

function u8(value: number): Uint8Array {
	return new Uint8Array([value & 0xff]);
}

function u16(value: number): Uint8Array {
	const result = new Uint8Array(2);
	const view = new DataView(result.buffer);
	view.setUint16(0, value);
	return result;
}

function u24(value: number): Uint8Array {
	return new Uint8Array([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}

function u32(value: number): Uint8Array {
	const result = new Uint8Array(4);
	const view = new DataView(result.buffer);
	view.setUint32(0, value);
	return result;
}
