/** Returns the specified 0..1 weighted priority for vocabulary or grammar selection. */
export function curriculumPriority(weakness: number, overdue: number, lowCoverage: number): number {
	const clamp = (value: number) => Math.min(1, Math.max(0, value));
	return 0.55 * clamp(weakness) + 0.25 * clamp(overdue) + 0.20 * clamp(lowCoverage);
}
