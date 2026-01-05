/**
 * Moderation service using Outpoot NULLMARK
 * Checks if user-provided names are appropriate
 * If you're self-hosting, you can remove this service or replace it with your own moderation solution.
 * NULLMARK is private to Outpoot and not publicly available.
 */

export async function isNameAppropriate(name: string): Promise<boolean> {
	try {
		const response = await fetch("http://moderation-moderation-service-1:9999", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name }),
		});

		if (!response.ok) {
			console.error("Moderation service error:", response.status, response.statusText);
			return true;
		}

		const result = await response.json();
		console.log("Checked name with moderation service:", name, " result: ", result.appropriate);

		return result.appropriate !== false;
	} catch (error) {
		console.error("Failed to check name with moderation service:", error);
		return true;
	}
}
