import { useEffect, useState, useRef } from "react";
import { mediaCache } from "../store/mediaCache";

interface WaveformOptions {
	sourceIn?: number;
	sourceDuration?: number;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export function useAudioWaveform(src: string, sampleCount: number = 100, options: WaveformOptions = {}): { min: number; max: number }[] {
	const [peaks, setPeaks] = useState<{ min: number; max: number }[]>([]);
	const { sourceIn = 0, sourceDuration } = options;
	const retryCountRef = useRef(0);
	const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (!src) {
			setPeaks([]);
			return;
		}

		if (src.startsWith("blob:")) {
			fetch(src, { method: "HEAD" })
				.then((response) => {
					if (!response.ok) {
						console.warn("[Waveform] Blob URL is invalid:", src);
						setPeaks([]);
					}
				})
				.catch(() => {
					console.warn("[Waveform] Blob URL is not accessible:", src);
					setPeaks([]);
				});
		}

		let isCancelled = false;
		retryCountRef.current = 0;

		const generateWaveform = async () => {
			try {
				let cachedData = mediaCache.getAudio(src);

				if (!cachedData) {
					const pending = mediaCache.getPendingAudio(src);
					if (pending) {
						cachedData = await pending;
					} else {
						const fetchPromise = (async () => {
							const audioContext = new AudioContext();
							const response = await fetch(src);
							
							if (!response.ok) {
								throw new Error(`HTTP ${response.status}: ${response.statusText}`);
							}
							
							const arrayBuffer = await response.arrayBuffer();
							const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

							const rawData = audioBuffer.getChannelData(0);

							let globalMax = 0;
							for (let i = 0; i < rawData.length; i++) {
								const absValue = Math.abs(rawData[i]);
								if (absValue > globalMax) globalMax = absValue;
							}

							const newData = {
								rawData,
								sampleRate: audioBuffer.sampleRate,
								duration: audioBuffer.duration,
								globalMax,
							};
							mediaCache.setAudio(src, newData);
							audioContext.close();
							return newData;
						})();

						mediaCache.setPendingAudio(src, fetchPromise);
						cachedData = await fetchPromise;
					}
				}

				if (isCancelled) return;

				const { rawData, sampleRate, duration: totalDuration, globalMax } = cachedData;

				const startSample = Math.floor(sourceIn * sampleRate);
				const effectiveDuration = sourceDuration !== undefined ? sourceDuration : totalDuration - sourceIn;
				const endSample = Math.min(Math.floor((sourceIn + effectiveDuration) * sampleRate), rawData.length);
				const totalSamples = endSample - startSample;

				if (totalSamples <= 0) {
					setPeaks([]);
					return;
				}

				const samples = sampleCount;
				const blockSize = Math.floor(totalSamples / samples);
				const bipolarPeaks: { min: number; max: number }[] = [];

				for (let i = 0; i < samples; i++) {
					const start = startSample + blockSize * i;
					let min = 0;
					let max = 0;

					for (let j = 0; j < blockSize && start + j < endSample; j++) {
						const sample = rawData[start + j];
						if (sample < min) min = sample;
						if (sample > max) max = sample;
					}

					bipolarPeaks.push({ min, max });
				}

				// normalize peaks to -1 to 1 range
				const normalizedPeaks = bipolarPeaks.map((peak) => ({
					min: globalMax > 0 ? peak.min / globalMax : 0,
					max: globalMax > 0 ? peak.max / globalMax : 0,
				}));

				if (!isCancelled) {
					setPeaks(normalizedPeaks);
					retryCountRef.current = 0;
				}
			} catch (error) {
				if (isCancelled) return;
				
				console.warn("[Waveform] Error generating waveform:", error);
				
				if (retryCountRef.current < MAX_RETRIES && !src.startsWith("blob:")) {
					retryCountRef.current++;
					console.log(`[Waveform] Retrying in ${RETRY_DELAY_MS}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})`);
					retryTimeoutRef.current = setTimeout(() => {
						if (!isCancelled) {
							generateWaveform();
						}
					}, RETRY_DELAY_MS);
				} else {
					setPeaks([]);
				}
			}
		};

		generateWaveform();

		return () => {
			isCancelled = true;
			if (retryTimeoutRef.current) {
				clearTimeout(retryTimeoutRef.current);
				retryTimeoutRef.current = null;
			}
		};
	}, [src, sampleCount, sourceIn, sourceDuration]);

	return peaks;
}
