import { memo, useMemo } from "react";

interface TimeRulerProps {
	duration: number;
	pixelsPerSecond: number;
	onSeek: (time: number) => void;
}

function TimeRuler({ duration, pixelsPerSecond, onSeek }: TimeRulerProps) {
	const handleMouseDown = (e: React.MouseEvent) => {
		const rect = e.currentTarget.getBoundingClientRect();

		const updateTime = (clientX: number) => {
			const x = clientX - rect.left;
			const time = x / pixelsPerSecond;
			onSeek(Math.max(0, Math.min(time, duration)));
		};

		updateTime(e.clientX);

		const handleMouseMove = (moveEvent: MouseEvent) => {
			updateTime(moveEvent.clientX);
		};

		const handleMouseUp = () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};

		window.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
	};

	const ticks = useMemo(() => {
		const ticksArray: { time: number; label: string; isSecond: boolean }[] = [];

		// determine tick interval based on zoom level
		let secondInterval = 1;
		if (pixelsPerSecond < 12) {
			secondInterval = 5;
		} else if (pixelsPerSecond < 25) {
			secondInterval = 2;
		}

		for (let i = 0; i <= duration; i += secondInterval) {
			const minutes = Math.floor(i / 60);
			const seconds = i % 60;
			ticksArray.push({
				time: i,
				label: `${minutes}:${seconds.toString().padStart(2, "0")}`,
				isSecond: true,
			});
		}

		// add sub-second ticks if zoomed in enough
		if (pixelsPerSecond >= 50) {
			const subTicks: { time: number; label: string; isSecond: boolean }[] = [];
			for (let i = 0; i < duration; i++) {
				for (let j = 0.25; j < 1; j += 0.25) {
					subTicks.push({
						time: i + j,
						label: "",
						isSecond: false,
					});
				}
			}
			ticksArray.push(...subTicks);
			ticksArray.sort((a, b) => a.time - b.time);
		}

		return ticksArray;
	}, [duration, pixelsPerSecond]);

	return (
		<div className="h-8 bg-[#1e1e1e] border-b border-zinc-800 relative cursor-pointer select-none" onMouseDown={handleMouseDown}>
			<div className="h-full relative">
				{ticks.map((tick, idx) => (
					<div key={idx} className="absolute top-0" style={{ left: `${tick.time * pixelsPerSecond}px` }}>
						<div className={`w-px ${tick.isSecond ? "h-4 bg-zinc-500" : "h-2 bg-zinc-700"}`} />
						{tick.label && <span className="absolute top-4 left-0 text-[10px] text-zinc-400 -translate-x-1/2">{tick.label}</span>}
					</div>
				))}
			</div>
		</div>
	);
}

export default memo(TimeRuler);
