/**
 * Interface for implementing different diff strategies
 */

/**
 * Details about a specific block that failed to apply in a multi-block diff.
 */
export interface BlockFailureDetail {
	blockIndex: number // Original index of the block in the diff input
	error: string // Reason for failure
	// Optional: Add more details like the specific search/replace content if needed
}

export type DiffResult =
	| {
			success: true
			content: string
			error?: string // Optional error message for partial success
			failParts?: BlockFailureDetail[] // Optional details about blocks that failed
	  }
	| {
			success: false
			error: string // Main error message when no blocks could be applied or a fatal error occurred
			failParts?: BlockFailureDetail[] // Optional details about blocks that failed
			details?: {
				// Keep existing details for single-block or general failures
				similarity?: number
				threshold?: number
				matchedRange?: { start: number; end: number }
				searchContent?: string
				bestMatch?: string
			}
	  }

export interface DiffStrategy {
	/**
	 * Get the name of the diff strategy
	 * @returns The name of the strategy
	 */
	getName?(): string // Optional: Useful for logging/debugging

	/**
	 * Get the tool description for this diff strategy
	 * @param args The tool arguments including cwd and toolOptions
	 * @returns The complete tool description including format requirements and examples
	 */
	getToolDescription(args: { cwd: string; toolOptions?: { [key: string]: string } }): string

	/**
	 * Apply a diff to the original content
	 * @param originalContent The original file content
	 * @param diffContent The diff content in the strategy's format
	 * @param startLine Optional line number hint (might be used differently by strategies)
	 * @param endLine Optional line number hint (might be used differently by strategies)
	 * @returns A DiffResult object containing either the successful result or error details
	 */
	applyDiff(originalContent: string, diffContent: string, startLine?: number, endLine?: number): Promise<DiffResult>

	// Optional: Add getProgressStatus if needed by the new strategy
	// getProgressStatus?(toolUse: any, result?: DiffResult): any;
}
