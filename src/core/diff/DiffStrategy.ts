import type { DiffStrategy } from "./types"
import { UnifiedDiffStrategy } from "./strategies/unified" // Keep import if needed elsewhere or for fallback
import { SearchReplaceDiffStrategy } from "./strategies/search-replace" // Keep import for fallback/tests
import { NewUnifiedDiffStrategy } from "./strategies/new-unified" // Keep import for fallback/tests
import { MultiBlockSearchReplaceStrategy } from "./strategies/multi-block-search-replace" // Import the new strategy

/**
 * Get the appropriate diff strategy based on configuration.
 * @param model The name of the model being used (currently unused, but kept for potential future logic)
 * @param fuzzyMatchThreshold Optional threshold for fuzzy matching (0.0 to 1.0)
 * @param experimentalDiffStrategy Flag to potentially use an alternative strategy (currently defaults to the main strategy)
 * @returns The selected DiffStrategy instance
 */
export function getDiffStrategy(
	model: string, // Parameter kept for potential future model-specific logic
	fuzzyMatchThreshold?: number,
	experimentalDiffStrategy: boolean = false, // Flag remains, but behavior changed
): DiffStrategy {
	// Default to the new MultiBlockSearchReplaceStrategy
	const mainStrategy = new MultiBlockSearchReplaceStrategy(fuzzyMatchThreshold)

	if (experimentalDiffStrategy) {
		// Currently, experimental also points to the new strategy.
		// Optionally, point this to an older strategy for comparison/fallback:
		// return new SearchReplaceDiffStrategy(fuzzyMatchThreshold);
		console.warn(
			"Experimental diff strategy flag is set, but currently defaults to MultiBlockSearchReplaceStrategy.",
		)
		return mainStrategy
	}

	// Return the main (new) strategy by default
	return mainStrategy
}

// Export the type and potentially the strategies if they are used elsewhere directly
export type { DiffStrategy }
export { UnifiedDiffStrategy, SearchReplaceDiffStrategy, NewUnifiedDiffStrategy, MultiBlockSearchReplaceStrategy }
