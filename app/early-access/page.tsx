"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

export default function EarlyAccessPage() {
	const router = useRouter();
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!password.trim() || loading) return;

		setLoading(true);
		setError("");

		try {
			const response = await fetch("/api/early-access", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password: password.trim() }),
			});

			if (response.ok) {
				router.push("/");
				router.refresh();
			} else {
				const data = await response.json();
				setError(data.error || "Invalid password");
			}
		} catch {
			setError("Something went wrong");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="min-h-screen bg-background flex items-center justify-center p-4">
			<form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
				<Input
					type="password"
					placeholder="Password"
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					autoFocus
					disabled={loading}
					className={error ? "border-red-500" : ""}
				/>
				{error && <p className="text-sm text-red-500 text-center">{error}</p>}
			</form>
		</div>
	);
}
