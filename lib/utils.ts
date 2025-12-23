import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { useCallback, useEffect, useRef } from "react";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): [(...args: Parameters<T>) => void, () => void] {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	const debouncedFn = (...args: Parameters<T>) => {
		if (timeoutId) clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn(...args), delay);
	};

	const cancel = () => {
		if (timeoutId) clearTimeout(timeoutId);
	};

	return [debouncedFn, cancel];
}

export function useDebouncedCallback<T extends (...args: any[]) => void>(callback: T, delay: number): (...args: Parameters<T>) => void {
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const callbackRef = useRef(callback);

	useEffect(() => {
		callbackRef.current = callback;
	}, [callback]);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, [delay]);

	return useCallback(
		(...args: Parameters<T>) => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
			timeoutRef.current = setTimeout(() => callbackRef.current(...args), delay);
		},
		[delay]
	);
}
