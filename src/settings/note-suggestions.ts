export function rankMarkdownNotePaths(
	paths: readonly string[],
	query: string,
	limit = 50,
): string[] {
	const normalizedQuery = query.trim().toLocaleLowerCase();
	if (!normalizedQuery) return [...paths].sort(comparePaths).slice(0, limit);

	return paths
		.map((path) => ({ path, score: fuzzyScore(path.toLocaleLowerCase(), normalizedQuery) }))
		.filter((candidate): candidate is { path: string; score: number } => candidate.score !== undefined)
		.sort((left, right) => left.score - right.score || comparePaths(left.path, right.path))
		.slice(0, limit)
		.map(({ path }) => path);
}

function fuzzyScore(candidate: string, query: string): number | undefined {
	const directIndex = candidate.indexOf(query);
	if (directIndex >= 0) return directIndex * 10 + candidate.length - query.length;

	let candidateIndex = 0;
	let previousMatch = -1;
	let gapScore = 0;
	for (const character of query) {
		const matchIndex = candidate.indexOf(character, candidateIndex);
		if (matchIndex < 0) return undefined;
		if (previousMatch >= 0) gapScore += matchIndex - previousMatch - 1;
		previousMatch = matchIndex;
		candidateIndex = matchIndex + 1;
	}
	return 1_000 + gapScore * 10 + candidate.length - query.length;
}

function comparePaths(left: string, right: string): number {
	return left.localeCompare(right);
}
