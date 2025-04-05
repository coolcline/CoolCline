import { DiffStrategy, DiffResult, BlockFailureDetail } from "../types"
import { addLineNumbers, everyLineHasLineNumbers, stripLineNumbers } from "../../../integrations/misc/extract-text"
import { distance } from "fastest-levenshtein"

/**
 * Number of extra context lines for fuzzy search buffer
 */
const BUFFER_LINES = 40

/**
 * Helper functions for string comparison and matching
 */

/**
 * Calculates similarity between two strings using Levenshtein distance
 * @param original - The original string to compare against
 * @param search - The search string to compare
 * @returns Similarity score between 0 (completely different) and 1 (identical)
 */
function getSimilarity(original: string, search: string): number {
	/**
	 * Handle empty search string case:
	 * - If original is also empty: perfect match (1)
	 * - Otherwise: complete mismatch (0)
	 */
	if (search === "") {
		return original === "" ? 1 : 0
	}

	/**
	 * Handle empty original string case:
	 * - If search is not empty: complete mismatch (0)
	 */
	if (original === "") {
		return 0
	}

	// Normalize strings by collapsing whitespace and trimming
	const normalizeStr = (str: string) => str.replace(/\s+/g, " ").trim()
	const normalizedOriginal = normalizeStr(original)
	const normalizedSearch = normalizeStr(search)

	// Exact match after normalization
	if (normalizedOriginal === normalizedSearch) {
		return 1
	}

	// Calculate Levenshtein distance between normalized strings
	const dist = distance(normalizedOriginal, normalizedSearch)
	const maxLength = Math.max(normalizedOriginal.length, normalizedSearch.length)

	// Safeguard against division by zero (shouldn't happen due to earlier checks)
	if (maxLength === 0) return 1
	return 1 - dist / maxLength
}

/**
 * Attempts to match lines while ignoring leading/trailing whitespace
 * @param originalLines - Array of lines to search within
 * @param searchLines - Array of lines to search for
 * @param startLineIdx - Index to start searching from
 * @returns Line index where match starts, or false if no match found
 */
function lineTrimmedFallbackMatch(
	originalLines: string[],
	searchLines: string[],
	startLineIdx: number,
): number | false {
	// Early return if search lines are empty
	if (searchLines.length === 0) return false

	// Clamp start index to valid range [0, originalLines.length]
	startLineIdx = Math.max(0, startLineIdx)
	for (let i = startLineIdx; i <= originalLines.length - searchLines.length; i++) {
		let matches = true
		for (let j = 0; j < searchLines.length; j++) {
			if (originalLines[i + j].trim() !== searchLines[j].trim()) {
				matches = false
				break
			}
		}
		if (matches) return i // Return the 0-based line index
	}
	return false
}

/**
 * Attempts to match blocks using first and last lines as anchors
 * @param originalLines - Array of lines to search within
 * @param searchLines - Array of lines to search for
 * @param startLineIdx - Index to start searching from
 * @returns Line index where match starts, or false if no match found
 */
function blockAnchorFallbackMatch(
	originalLines: string[],
	searchLines: string[],
	startLineIdx: number,
): number | false {
	// This strategy only works for blocks of 3+ lines
	if (searchLines.length < 3) return false

	// Use first and last lines as anchors
	const firstLineSearch = searchLines[0].trim()
	const lastLineSearch = searchLines[searchLines.length - 1].trim()

	// Clamp start index to valid range [0, originalLines.length]
	startLineIdx = Math.max(0, startLineIdx)
	for (let i = startLineIdx; i <= originalLines.length - searchLines.length; i++) {
		if (
			originalLines[i].trim() === firstLineSearch &&
			originalLines[i + searchLines.length - 1].trim() === lastLineSearch
		) {
			return i // Return the 0-based line index
		}
	}
	return false
}

/**
 * Core strategy implementation for multi-block search/replace
 */

/**
 * Represents a parsed diff block with metadata
 */
interface ParsedBlock {
	index: number // Original index from the primary parser
	startLine: number // 1-based
	endLine: number // 1-based
	/**
	 * Applies multi-block search/replace diffs with a hybrid strategy.
	 *
	 * --- Strategy Overview ---
	 *
	 * Input Diff -> Validate Sequencing -> Attempt Primary Parse (Regex)
	 *                                      |        |
	 *                                      |        +-> Success (Path A) -> Apply Blocks w/ Line Numbers & Fallbacks -> Aggregate Results
	 *                                      |        |
	 *                                      |        +-> Fail -> Attempt Fallback Parse (Line-based)
	 *                                      |                   |
	 *                                      |                   +-> Success (Path B) -> Apply Blocks w/ Content Search & Fallbacks -> Aggregate Results
	 *                                      |                   |
	 *                                      |                   +-> Fail -> Report Failure (Both Parsers Failed)
	 *                                      |
	 *                                      +-> Invalid Sequencing -> Report Failure
	 *
	 * --- Path A (Primary - Regex Parser with Line Numbers) ---
	 *
	 * For each block parsed by `parseDiffBlocks`:
	 * 1. Adjust Line Numbers: Apply delta from previous blocks.
	 * 2. Validate Lines: Check if adjusted lines are valid within the current file state.
	 * 3. Validate Search Count: Ensure search content line count matches the line range.
	 * 4. Attempt Match:
	 *    a. Exact Match in Range: Try matching exactly within `adjustedStartLine` - `adjustedEndLine`.
	 *    b. Fuzzy Match in Buffer: If (a) fails, search fuzzily +/- `BUFFER_LINES` around the range.
	 *    c. Line Trimmed Fallback: If (b) fails, search ignoring leading/trailing whitespace within buffer.
	 *    d. Block Anchor Fallback: If (c) fails (and block >= 3 lines), search using first/last lines as anchors within buffer.
	 * 5. Apply or Fail: If match found >= threshold, apply replacement & update delta. Otherwise, record block failure.
	 *
	 * --- Path B (Fallback - Line-based Parser without Line Numbers) ---
	 *
	 * For each block parsed by `parseDiffBlocksFallback`:
	 * 1. Attempt Match (starting from `lastProcessedLine`):
	 *    a. Exact Match (indexOf): Use `indexOf` for quick exact string search from `lastProcessedLine`. Verify with lineTrimmed.
	 *    b. Line Trimmed Fallback: If (a) fails, use line-trimmed matching from `lastProcessedLine`.
	 *    c. Block Anchor Fallback: If (b) fails (and block >= 3 lines), use block anchor matching from `lastProcessedLine`.
	 * 2. Apply or Fail: If match found *at or after* `lastProcessedLine`, apply replacement & update `lastProcessedLine`. Otherwise, record block failure.
	 *
	 */

	searchContent: string
	replaceContent: string
	error?: string // Error during parsing this specific block
}

// Structure for storing results of processing each block
/**
 * Represents the result of processing a single diff block
 */
interface BlockProcessingResult {
	blockIndex: number // Index of the block (either from primary or fallback parser)
	success: boolean
	error?: string // Error during applying this specific block
}

/**
 * Implements a hybrid diff application strategy for multi-block search/replace diffs.
 *
 * This strategy attempts to apply diffs using a primary method based on regular expressions
 * and line numbers for precision. If the primary parsing fails due to format inconsistencies,
 * it falls back to a simpler line-based parser and applies changes sequentially using
 * content matching.
 *
 * --- Execution Flow ---
 *
 * 1. Validate Marker Sequencing: Basic check for correct SEARCH/SEP/REPLACE marker order.
 *    -> If invalid: Fail immediately.
 *
 * 2. Attempt Primary Parsing (Regex - `parseDiffBlocks`):
 *    |  - Tries to parse all blocks using a complex regex, extracting line numbers.
 *    |  -> If successful (Path A):
 *    |     - Process blocks sequentially based on their original order in the diff.
 *    |     - For each block:
 *    |        a. Adjust line numbers based on previous changes (delta).
 *    |        b. Validate adjusted line numbers.
 *    |        c. Validate search content line count against line range.
 *    |        d. Attempt Match (using adjusted line numbers):
 *    |           i.   Exact Match in Range: Check if content matches exactly within the specified lines.
 *    |           ii.  Fuzzy Match in Buffer: If not exact, search fuzzily within a buffered area around the specified lines.
 *    |           iii. Line Trimmed Fallback: If still no match, try matching line-by-line ignoring leading/trailing whitespace.
 *    |           iv.  Block Anchor Fallback: If still no match (and block >= 3 lines), try matching based on first/last lines.
 *    |        e. Apply Change: If a match meeting the threshold is found, apply the replacement and update delta.
 *    |        f. Record Result: Log success or failure for the block.
 *    |  -> If parsing fails AND diff content is not empty:
 *    |     - Proceed to Fallback Parsing.
 *
 * 3. Attempt Fallback Parsing (Line-based - `parseDiffBlocksFallback`):
 *    |  - Parses blocks based only on SEARCH/SEP/REPLACE markers, ignoring line numbers.
 *    |  -> If successful (Path B):
 *    |     - Process blocks sequentially in the order they were parsed.
 *    |     - Keep track of `lastProcessedLine` (where the previous block ended).
 *    |     - For each block:
 *    |        a. Attempt Match (starting search from `lastProcessedLine`):
 *    |           i.   Exact Match (indexOf): Quickly find exact string match from the last position.
 *    |           ii.  Line Trimmed Fallback: If not found, try line-trimmed matching from `lastProcessedLine`.
 *    |           iii. Block Anchor Fallback: If still not found, try block anchor matching from `lastProcessedLine`.
 *    |        b. Apply Change: If a match is found *at or after* `lastProcessedLine`, apply replacement and update `lastProcessedLine`.
 *    |        c. Record Result: Log success or failure for the block.
 *    |  -> If parsing fails:
 *    |     - Fail the entire operation (both parsers failed).
 *
 * 4. Final Result Aggregation:
 *    - Combine results from all processed blocks.
 *    - Report overall success/failure, including details of any failed blocks.
 *
 */
export class MultiBlockSearchReplaceStrategy implements DiffStrategy {
	private fuzzyThreshold: number
	private bufferLines: number

	/**
	 * Gets the name of this diff strategy
	 * @returns Strategy name
	 */
	getName(): string {
		return "MultiBlockSearchReplace"
	}

	/**
	 * Creates a new MultiBlockSearchReplaceStrategy instance
	 * @param fuzzyThreshold - Minimum similarity threshold for fuzzy matching (0-1)
	 * @param bufferLines - Number of context lines to search around target lines
	 */
	constructor(fuzzyThreshold?: number, bufferLines?: number) {
		this.fuzzyThreshold = fuzzyThreshold ?? 0.95
		this.bufferLines = bufferLines ?? BUFFER_LINES
	}

	/**
	 * Gets the description of this tool for documentation
	 * @param args - Configuration arguments
	 * @param args.cwd - Current working directory
	 * @param args.toolOptions - Additional tool options
	 * @returns Formatted tool description
	 */
	getToolDescription(args: { cwd: string; toolOptions?: { [key: string]: string } }): string {
		// Tool Description remains the same as previously generated
		return `## apply_diff
Description: Request to replace existing code using one or more search and replace blocks.
This tool allows for precise, surgical replaces by specifying exactly what content to search for and what to replace it with.
You can (and should) include multiple SEARCH/REPLACE blocks in a single request to perform multiple edits efficiently.

Parameters:
- path: (required) The path of the file to modify (relative to the current working directory ${args.cwd})
- diff: (required) A string containing one or more search/replace blocks defining the changes.

Block Format (MUST be followed exactly for EACH block):
\`\`\`
<<<<<<< SEARCH
:start_line: [Line number where the search block starts in the current file state]
:end_line: [Line number where the search block ends in the current file state]
-------
[Exact content to find, including all whitespace and indentation]
=======
[New content to replace with, including desired whitespace and indentation]
>>>>>>> REPLACE
\`\`\`

Key Requirements & Best Practices:
1.  **Multiple Blocks**: Include all desired changes for the file in a single \`<diff>\` parameter using multiple blocks.
2.  **Line Numbers**: Provide accurate \`:start_line:\` and \`:end_line:\` for EACH block based on the file's state BEFORE this tool use. The system will adjust line numbers internally for subsequent blocks.
3.  **Exact Search**: The content between \`-------\` and \`=======\` (SEARCH section) should match the existing file content as closely as possible, including indentation and whitespace. Use \`read_file\` first if unsure.
4.  **Complete Replace**: The content between \`=======\` and \`>>>>>>> REPLACE\` (REPLACE section) should be the complete, final content for that block, with the desired indentation.
5.  **Order**: Blocks should generally be ordered as they appear in the file (based on start_line).
6.  **Escaping**: If your SEARCH or REPLACE content contains the exact lines \`<<<<<<< SEARCH\`, \`=======\`, \`>>>>>>> REPLACE\`, \`-------\`, \`:start_line:\`, or \`:end_line:\`, you MUST escape them by adding a backslash (\`\\\`) at the beginning of that line (e.g., \`\\<<<<<<< SEARCH\`).

Example (Multiple Blocks):
\`\`\`diff
<<<<<<< SEARCH
:start_line: 1
:end_line: 2
-------
import { oldFunction } from './utils';
const x = 10;
=======
import { newFunction } from './newUtils';
const x = 20;
>>>>>>> REPLACE

<<<<<<< SEARCH
:start_line: 8
:end_line: 10
-------
function calculate() {
  return oldFunction(x);
}
=======
function calculate() {
  // Use the new function and updated value
  return newFunction(x);
}
>>>>>>> REPLACE
\`\`\`

Usage:
<apply_diff>
<path>path/to/your/file.ext</path>
<diff>
<<<<<<< SEARCH
:start_line: 1
:end_line: 5
-------
[exact content to find]
=======
[new content to replace with]
>>>>>>> REPLACE

<<<<<<< SEARCH
:start_line: 15
:end_line: 20
-------
[another exact content to find]
=======
[another new content to replace with]
>>>>>>> REPLACE
</diff>
</apply_diff>`
	}

	/**
	 * Unescapes diff markers in content
	 * @param content - Content with potentially escaped markers
	 * @returns Content with markers unescaped
	 */
	private unescapeMarkers(content: string): string {
		return content
			.replace(/^\\<<<<<<< SEARCH/gm, "<<<<<<< SEARCH")
			.replace(/^\\=======/gm, "=======")
			.replace(/^\\>>>>>>> REPLACE/gm, ">>>>>>> REPLACE")
			.replace(/^\\-------/gm, "-------")
			.replace(/^\\:start_line:/gm, ":start_line:")
			.replace(/^\\:end_line:/gm, ":end_line:")
	}

	/**
	 * Validates the sequencing of diff markers
	 * @param diffContent - Diff content to validate
	 * @returns Validation result with optional error message
	 */
	private validateMarkerSequencing(diffContent: string): { success: boolean; error?: string } {
		// Validation logic remains the same
		const lines = diffContent.split("\n")
		let state = 0 // 0: Expect SEARCH, 1: Expect SEP, 2: Expect REPLACE
		let blockCount = 0
		const markers = ["<<<<<<< SEARCH", "=======", ">>>>>>> REPLACE"]

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim()
			const isMarker = markers.includes(line)
			const isEscaped = lines[i].startsWith("\\")

			if (isMarker && !isEscaped) {
				if (line === markers[0]) {
					// <<<<<<< SEARCH
					if (state !== 0)
						return {
							success: false,
							error: `Unexpected '${markers[0]}' at line ${i + 1}. Expected end of previous block or start of file.`,
						}
					state = 1
					blockCount++
				} else if (line === markers[1]) {
					// =======
					if (state !== 1)
						return {
							success: false,
							error: `Unexpected '${markers[1]}' at line ${i + 1}. Expected content or '${markers[0]}'.`,
						}
					state = 2
				} else if (line === markers[2]) {
					// >>>>>>> REPLACE
					if (state !== 2)
						return {
							success: false,
							error: `Unexpected '${markers[2]}' at line ${i + 1}. Expected content or '${markers[1]}'.`,
						}
					state = 0
				}
			} else if (
				!isEscaped &&
				(line.startsWith("<<<<<<<") || line.startsWith("=======") || line.startsWith(">>>>>>>"))
			) {
				// Check for potentially unescaped markers within content, excluding metadata lines
				if (state === 1 || state === 2) {
					// Only check within SEARCH or REPLACE content
					if (
						!(
							(line.startsWith(":start_line:") || line.startsWith(":end_line:") || line === "-------") &&
							state === 1
						)
					) {
						// Allow metadata in SEARCH
						return {
							success: false,
							error: `Potentially unescaped marker '${line}' found within content near line ${i + 1}. Escape with '\\'.`,
						}
					}
				}
			}
		}

		if (state !== 0)
			return { success: false, error: "Incomplete final block in diff content. Expected '>>>>>>> REPLACE'." }
		// Allow empty diffContent (no blocks found is valid if input is empty)
		if (blockCount === 0 && diffContent.trim() !== "")
			return { success: false, error: "Diff content provided but no valid '<<<<<<< SEARCH' blocks found." }

		return { success: true }
	}

	// Primary parser using Regex (attempts to extract line numbers)
	/**
	 * Parses diff content into blocks using regex (primary parser)
	 * @param diffContent - Diff content to parse
	 * @returns Array of parsed blocks
	 */
	private parseDiffBlocks(diffContent: string): ParsedBlock[] {
		// Parsing logic remains the same
		const blockRegex =
			/(?:^|\n)(?<!\\)<<<<<<< SEARCH\s*\n(?:^\s*:start_line:\s*(\d+)\s*\n)(?:^\s*:end_line:\s*(\d+)\s*\n)(?:(?<!\\)-------\s*\n)?([\s\S]*?)(?:\n)?(?:(?<=\n)(?<!\\)=======\s*\n)([\s\S]*?)(?:\n)?(?:(?<=\n)(?<!\\)>>>>>>> REPLACE)(?=\n|$)/g
		let matches = [...diffContent.matchAll(blockRegex)]
		const blocks: ParsedBlock[] = []

		matches.forEach((match, index) => {
			const startLineStr = match[1]
			const endLineStr = match[2]
			const searchContentRaw = match[3]
			const replaceContentRaw = match[4]

			const startLine = parseInt(startLineStr, 10)
			const endLine = parseInt(endLineStr, 10)

			let error: string | undefined = undefined
			if (isNaN(startLine) || isNaN(endLine)) {
				error = `Invalid line numbers in block ${index + 1}. Found start='${startLineStr}', end='${endLineStr}'`
			} else if (startLine <= 0 || endLine < startLine - 1) {
				// Allow endLine = startLine - 1 for insertion
				error = `Invalid line range in block ${index + 1}: start=${startLine}, end=${endLine}`
			}

			blocks.push({
				index,
				startLine,
				endLine,
				searchContent: this.unescapeMarkers(searchContentRaw ?? ""),
				replaceContent: this.unescapeMarkers(replaceContentRaw ?? ""),
				error,
			})
		})
		// Do not sort here, process in the order they appear in the diff for delta calculation
		// blocks.sort((a, b) => a.startLine - b.startLine);
		return blocks
	}

	// Fallback parser using line iteration (ignores line numbers)
	/**
	 * Parses diff content into blocks using line iteration (fallback parser)
	 * @param diffContent - Diff content to parse
	 * @returns Array of parsed blocks without line numbers
	 */
	private parseDiffBlocksFallback(diffContent: string): { searchContent: string; replaceContent: string }[] {
		const blocks: { searchContent: string; replaceContent: string }[] = []
		let currentSearchContent = ""
		let currentReplaceContent = ""
		let inSearch = false
		let inReplace = false
		const lines = diffContent.split("\n")

		for (const line of lines) {
			const trimmedLine = line.trim() // Trim for marker checking
			const isEscaped = line.startsWith("\\") // Check for escaped markers

			if (!isEscaped && trimmedLine === "<<<<<<< SEARCH") {
				if (inReplace) {
					// Finish previous block if any
					// Remove trailing newline potentially added by the loop before pushing
					if (currentReplaceContent.endsWith("\n")) {
						currentReplaceContent = currentReplaceContent.slice(0, -1)
					}
					blocks.push({
						searchContent: this.unescapeMarkers(currentSearchContent),
						replaceContent: this.unescapeMarkers(currentReplaceContent),
					})
				}
				inSearch = true
				inReplace = false
				currentSearchContent = ""
				currentReplaceContent = ""
				continue
			}

			if (!isEscaped && trimmedLine === "=======") {
				if (inSearch) {
					inSearch = false
					inReplace = true
					// Remove trailing newline potentially added by the loop before switching
					if (currentSearchContent.endsWith("\n")) {
						currentSearchContent = currentSearchContent.slice(0, -1)
					}
					continue
				}
			}

			if (!isEscaped && trimmedLine === ">>>>>>> REPLACE") {
				if (inReplace) {
					inSearch = false
					inReplace = false
					// Remove trailing newline potentially added by the loop before pushing
					if (currentReplaceContent.endsWith("\n")) {
						currentReplaceContent = currentReplaceContent.slice(0, -1)
					}
					blocks.push({
						searchContent: this.unescapeMarkers(currentSearchContent),
						replaceContent: this.unescapeMarkers(currentReplaceContent),
					})
					currentSearchContent = "" // Reset for safety
					currentReplaceContent = "" // Reset for safety
					continue
				}
			}

			// Accumulate content, ignoring metadata lines for this simple parser
			if (
				inSearch &&
				!line.startsWith(":start_line:") &&
				!line.startsWith(":end_line:") &&
				line.trim() !== "-------"
			) {
				currentSearchContent += line + "\n"
			} else if (inReplace) {
				currentReplaceContent += line + "\n"
			}
		}

		// Add the last block if the diff ended while inReplace state (shouldn't happen if validateMarkerSequencing passed)
		// if (inReplace) {
		//     // Remove trailing newline potentially added by the loop
		//     if (currentReplaceContent.endsWith('\n')) {
		//         currentReplaceContent = currentReplaceContent.slice(0, -1);
		//     }
		// 	blocks.push({ searchContent: this.unescapeMarkers(currentSearchContent), replaceContent: this.unescapeMarkers(currentReplaceContent) });
		// }

		return blocks
	}

	/**
	 * Applies the diff to the original content using this strategy
	 * @param originalContent - Original content to modify
	 * @param diffContent - Diff content specifying changes
	 * @param _paramStartLine - Unused parameter (reserved for future use)
	 * @param _paramEndLine - Unused parameter (reserved for future use)
	 * @returns Promise resolving to the diff application result
	 */
	async applyDiff(
		originalContent: string,
		diffContent: string,
		_paramStartLine?: number, // These params are not used by this strategy
		_paramEndLine?: number, // These params are not used by this strategy
	): Promise<DiffResult> {
		// --- Log received diff content ---
		// console.log("--- Received diffContent ---");
		// console.log(diffContent);
		// console.log("---------------------------");

		// --- Validate marker sequencing first ---
		const seqValidation = this.validateMarkerSequencing(diffContent)
		if (!seqValidation.success) {
			return { success: false, error: `Diff format validation failed: ${seqValidation.error}` }
		}

		// --- Try primary parsing (Regex with line numbers) ---
		let blocks = this.parseDiffBlocks(diffContent)
		let usingFallbackParser = false
		let fallbackBlocks: { searchContent: string; replaceContent: string }[] = [] // Store fallback blocks if needed

		// --- If primary parsing fails, try fallback parsing (line-based) ---
		if (blocks.length === 0 && diffContent.trim() !== "") {
			// console.log("Primary diff parsing failed, attempting fallback...")
			fallbackBlocks = this.parseDiffBlocksFallback(diffContent) // Use the fallback parser
			if (fallbackBlocks.length > 0) {
				usingFallbackParser = true
				// console.log(`Fallback parser found ${fallbackBlocks.length} blocks.`)
			} else {
				// Both parsers failed
				return {
					success: false,
					// Use a more specific error message indicating both parsers failed
					error: `Invalid diff format - no valid SEARCH/REPLACE blocks parsed by primary (Regex) or fallback (Line-based) parser.\n\nDebug Info:\n- Ensure each block starts with '<<<<<<< SEARCH', includes '=======', and ends with '>>>>>>> REPLACE' on separate lines.\n- Check for missing or misplaced markers. Check escaping if markers are part of content.`,
				}
			}
		}

		// --- Prepare for applying changes ---
		const lineEnding = originalContent.includes("\r\n") ? "\r\n" : "\n"
		let resultLines = originalContent.split(/\r?\n/)
		let delta = 0 // Tracks line number changes for Path A (Regex with line numbers)
		let lastProcessedLine = 0 // Tracks progress for Path B (Fallback without line numbers), 0-based index
		let blockProcessingResults: BlockProcessingResult[] = [] // Stores success/failure for each block attempt
		let appliedCount = 0

		// --- Apply changes based on which parser succeeded ---

		if (!usingFallbackParser) {
			// --- Path A: Process blocks parsed by Regex (with line numbers) ---
			console.log("Using primary parser results (Regex with line numbers).")
			for (const block of blocks) {
				// 'blocks' here are ParsedBlock with line numbers
				const blockIndexForReporting = block.index // Use original index from regex parser

				if (block.error) {
					blockProcessingResults.push({
						blockIndex: blockIndexForReporting,
						success: false,
						error: block.error,
					})
					continue
				}

				let { startLine, endLine, searchContent, replaceContent } = block
				const adjustedStartLine = startLine + delta // 1-based
				const adjustedEndLine = endLine + delta // 1-based
				const currentFileLength = resultLines.length
				const maxValidStartLine = currentFileLength + 1 // Can insert after the last line (1-based)
				const maxValidEndLine = currentFileLength // Last valid line index is length - 1 (0-based), so max valid 1-based line is length

				// --- Validate adjusted line numbers ---
				if (adjustedStartLine <= 0 || adjustedStartLine > maxValidStartLine) {
					blockProcessingResults.push({
						blockIndex: blockIndexForReporting,
						success: false,
						error: `Adjusted start line ${adjustedStartLine} is invalid (current file lines: ${currentFileLength}). Original: ${startLine}.`,
					})
					continue
				}
				// Allow end line to be equal to start line for single line replace.
				// Allow end line to be start line - 1 for insertion before start line.
				if (adjustedEndLine < adjustedStartLine - 1 || adjustedEndLine > maxValidEndLine) {
					blockProcessingResults.push({
						blockIndex: blockIndexForReporting,
						success: false,
						error: `Adjusted end line ${adjustedEndLine} is invalid (start ${adjustedStartLine}, current file lines: ${currentFileLength}). Original: ${endLine}.`,
					})
					continue
				}

				// --- Prepare search/replace content ---
				if (everyLineHasLineNumbers(searchContent)) searchContent = stripLineNumbers(searchContent)
				if (everyLineHasLineNumbers(replaceContent)) replaceContent = stripLineNumbers(replaceContent)

				const searchLines = searchContent === "" ? [] : searchContent.split(/\r?\n/)
				const replaceLines = replaceContent === "" ? [] : replaceContent.split(/\r?\n/)

				// Calculate expected original line count based on adjusted lines (1-based)
				// If start=end+1, it's an insertion (0 lines expected).
				// If start=end, it's replacing 1 line.
				// Corrected calculation:
				const expectedOriginalLineCount =
					adjustedStartLine > adjustedEndLine + 1 // Should not happen based on validation
						? -1 // Invalid state
						: adjustedStartLine === adjustedEndLine + 1 // Insertion case
							? 0
							: adjustedEndLine - adjustedStartLine + 1 // Normal replace/delete

				if (expectedOriginalLineCount === -1) {
					blockProcessingResults.push({
						blockIndex: blockIndexForReporting,
						success: false,
						error: `Internal Error: Invalid adjusted line range ${adjustedStartLine}-${adjustedEndLine}.`,
					})
					continue
				}

				// Validate search line count against expected line count from metadata
				if (searchLines.length !== expectedOriginalLineCount) {
					blockProcessingResults.push({
						blockIndex: blockIndexForReporting,
						success: false,
						error: `Search content line count (${searchLines.length}) != expected from line range ${adjustedStartLine}-${adjustedEndLine} (${expectedOriginalLineCount} lines). Original: ${startLine}-${endLine}.`,
					})
					continue
				}

				// --- Matching Logic (Path A - based on line numbers) ---
				let matchIndex = -1 // 0-based index in resultLines
				let bestMatchScore = -1
				let foundUsing = "None"
				const searchStartIdx = Math.max(0, adjustedStartLine - 1 - this.bufferLines) // 0-based
				// Calculate end index for buffer search (exclusive)
				const bufferSearchEndLine = expectedOriginalLineCount === 0 ? adjustedStartLine - 1 : adjustedEndLine // Use start line index for insertion, end line index otherwise (0-based)
				const searchEndIdx = Math.min(currentFileLength, bufferSearchEndLine + this.bufferLines) // Exclusive upper bound for slice
				const searchChunk = searchLines.join("\n")
				const exactMatchStartIndex = adjustedStartLine - 1 // 0-based
				// Calculate end index for exact match slice (exclusive)
				const exactMatchSliceEndIndex = exactMatchStartIndex + expectedOriginalLineCount

				// 1. Try exact match within the specified line range
				if (
					exactMatchStartIndex >= 0 &&
					exactMatchSliceEndIndex >= exactMatchStartIndex &&
					exactMatchSliceEndIndex <= currentFileLength
				) {
					// Handle insertion case: original chunk should be empty, match index is insertion point
					if (expectedOriginalLineCount === 0) {
						// Insertion
						matchIndex = exactMatchStartIndex
						bestMatchScore = 1.0 // Insertion always "matches" the location
						foundUsing = "Exact Range (Insertion)"
					} else {
						// Replace/Delete
						const exactOriginalChunk = resultLines
							.slice(exactMatchStartIndex, exactMatchSliceEndIndex)
							.join("\n")
						const similarity = getSimilarity(exactOriginalChunk, searchChunk)
						if (similarity >= this.fuzzyThreshold) {
							matchIndex = exactMatchStartIndex
							bestMatchScore = similarity
							foundUsing = "Exact Range"
						}
					}
				}

				// 2. If no exact range match, try fuzzy search within buffer (only if search content is not empty)
				if (matchIndex === -1 && searchLines.length > 0) {
					for (
						let i = searchStartIdx;
						i <= Math.min(searchEndIdx, currentFileLength) - searchLines.length;
						i++
					) {
						const originalChunk = resultLines.slice(i, i + searchLines.length).join("\n")
						const similarity = getSimilarity(originalChunk, searchChunk)
						if (similarity > bestMatchScore) {
							bestMatchScore = similarity
							matchIndex = i
							foundUsing = "Fuzzy Search"
						}
						if (bestMatchScore === 1) break // Found exact match via fuzzy
					}
				}

				// 3. If still no match, try fallback strategies (only if search content is not empty)
				if (matchIndex === -1 && searchLines.length > 0) {
					const lineTrimmedMatchIdx = lineTrimmedFallbackMatch(resultLines, searchLines, searchStartIdx)
					// Ensure fallback match is within reasonable bounds of original estimate
					if (
						lineTrimmedMatchIdx !== false &&
						Math.abs(lineTrimmedMatchIdx - exactMatchStartIndex) <= this.bufferLines * 2
					) {
						matchIndex = lineTrimmedMatchIdx
						bestMatchScore = 1.0 // Assume high confidence for fallback
						foundUsing = "Line Trimmed Fallback"
					} else {
						const blockAnchorMatchIdx = blockAnchorFallbackMatch(resultLines, searchLines, searchStartIdx)
						if (
							blockAnchorMatchIdx !== false &&
							Math.abs(blockAnchorMatchIdx - exactMatchStartIndex) <= this.bufferLines * 2
						) {
							matchIndex = blockAnchorMatchIdx
							bestMatchScore = 1.0 // Assume high confidence for fallback
							foundUsing = "Block Anchor Fallback"
						}
					}
				}

				// --- Apply Change (Path A) ---
				if (matchIndex !== -1 && (bestMatchScore >= this.fuzzyThreshold || expectedOriginalLineCount === 0)) {
					// Allow insertion even if score is low/irrelevant
					const deleteCount = expectedOriginalLineCount // Number of lines to remove (0 for insertion)
					const spliceIndex = matchIndex // Index to start modification

					resultLines.splice(spliceIndex, deleteCount, ...replaceLines)
					delta += replaceLines.length - deleteCount // Update delta based on actual lines changed
					appliedCount++
					console.log(`[调试] 主路径匹配成功 - 使用方式: ${foundUsing}`)
					blockProcessingResults.push({ blockIndex: blockIndexForReporting, success: true })
				} else {
					// Record failure for this block
					const errorMsg = `Block ${blockIndexForReporting + 1} (Original lines ${startLine}-${endLine}): No match found (Best score: ${Math.floor(bestMatchScore * 100)}% via ${foundUsing}, Threshold: ${Math.floor(this.fuzzyThreshold * 100)}%).`
					blockProcessingResults.push({ blockIndex: blockIndexForReporting, success: false, error: errorMsg })
				}
			}
		} else {
			// --- Path B: Process blocks parsed by Fallback (no line numbers) ---
			// console.log("Using fallback parser results (Line-based).")
			let fallbackBlockIndex = 0 // Use a separate index for fallback blocks

			for (const block of fallbackBlocks) {
				// 'fallbackBlocks' here are simple {search, replace}
				let { searchContent, replaceContent } = block
				const blockIndexForReporting = fallbackBlockIndex++ // Use simple index for reporting

				// --- Prepare search/replace content ---
				if (everyLineHasLineNumbers(searchContent)) searchContent = stripLineNumbers(searchContent)
				if (everyLineHasLineNumbers(replaceContent)) replaceContent = stripLineNumbers(replaceContent)

				const searchLines = searchContent === "" ? [] : searchContent.split(/\r?\n/)
				const replaceLines = replaceContent === "" ? [] : replaceContent.split(/\r?\n/)

				// Cannot perform insertion with fallback parser as there's no line number
				if (searchLines.length === 0) {
					blockProcessingResults.push({
						blockIndex: blockIndexForReporting,
						success: false,
						error: `Fallback Block ${blockIndexForReporting + 1}: Cannot perform insertion without line numbers.`,
					})
					continue
				}

				// --- Matching Logic (Path B - based on content search from lastProcessedLine) ---
				let matchIndex = -1 // 0-based index in resultLines where the match starts
				let foundUsing = "None"
				const currentFileContent = resultLines.join(lineEnding) // Get current content as string
				let searchStartCharIndex = 0 // Character index to start searching from

				// Calculate character index corresponding to lastProcessedLine
				for (let i = 0; i < lastProcessedLine; i++) {
					// Ensure line exists before accessing length
					if (i < resultLines.length) {
						searchStartCharIndex += resultLines[i].length + lineEnding.length
					} else {
						// Should not happen if lastProcessedLine is tracked correctly
						console.error(
							`Fallback Error: lastProcessedLine (${lastProcessedLine}) exceeds current file length (${resultLines.length})`,
						)
						searchStartCharIndex = currentFileContent.length // Search from end as failsafe
						break
					}
				}

				// 1. Optimization: Try quick exact match using indexOf from the character index
				const exactCharIndex = currentFileContent.indexOf(searchContent, searchStartCharIndex)

				if (exactCharIndex !== -1) {
					// Convert found character index back to line index
					let currentChars = 0
					let foundLineIndex = -1
					for (let i = 0; i < resultLines.length; i++) {
						const lineLen = resultLines[i].length
						// Check if the start of the match falls exactly at the beginning of this line
						if (currentChars === exactCharIndex) {
							foundLineIndex = i
							break
						}
						currentChars += lineLen + lineEnding.length
						if (currentChars > exactCharIndex) {
							// Passed the index without exact start match
							break
						}
					}

					if (foundLineIndex !== -1 && foundLineIndex >= lastProcessedLine) {
						// Ensure match is not before last processed line
						// Verify the found block matches using lineTrimmed at the found line index
						if (lineTrimmedFallbackMatch(resultLines, searchLines, foundLineIndex) === foundLineIndex) {
							matchIndex = foundLineIndex
							foundUsing = "Exact Match (indexOf verified)"
						} else {
							console.warn(
								`Fallback: indexOf match at char ${exactCharIndex} (line ${foundLineIndex + 1}) not confirmed by lineTrimmed. Continuing search.`,
							)
						}
					}
				}

				// 2. If quick match fails or wasn't confirmed, use line-trimmed fallback starting from lastProcessedLine
				if (matchIndex === -1) {
					const lineTrimmedMatchIdx = lineTrimmedFallbackMatch(resultLines, searchLines, lastProcessedLine)
					if (lineTrimmedMatchIdx !== false) {
						matchIndex = lineTrimmedMatchIdx
						foundUsing = "Line Trimmed Fallback"
					}
				}

				// 3. If still no match, use block anchor fallback starting from lastProcessedLine
				if (matchIndex === -1) {
					const blockAnchorMatchIdx = blockAnchorFallbackMatch(resultLines, searchLines, lastProcessedLine)
					if (blockAnchorMatchIdx !== false) {
						matchIndex = blockAnchorMatchIdx
						foundUsing = "Block Anchor Fallback"
					}
				}

				// --- Apply Change (Path B) ---
				if (matchIndex !== -1) {
					// Ensure matchIndex is not before lastProcessedLine to maintain order
					if (matchIndex < lastProcessedLine) {
						console.warn(
							`Fallback: Found match at line ${matchIndex + 1} which is before last processed line ${lastProcessedLine}. Skipping block ${blockIndexForReporting + 1} to maintain order.`,
						)
						blockProcessingResults.push({
							blockIndex: blockIndexForReporting,
							success: false,
							error: `Match found before last processed line (found at ${matchIndex + 1}, expected >= ${lastProcessedLine + 1}).`,
						})
						// Do not update lastProcessedLine, try next block
						continue
					}

					const matchedLineCount = searchLines.length
					resultLines.splice(matchIndex, matchedLineCount, ...replaceLines)
					// Update lastProcessedLine for the next block's search start
					lastProcessedLine = matchIndex + replaceLines.length
					appliedCount++
					// console.log(`[调试] 备用路径匹配成功 - 使用方式: ${foundUsing}`)
					blockProcessingResults.push({ blockIndex: blockIndexForReporting, success: true })
				} else {
					// Record failure for this block
					const errorMsg = `Fallback Block ${blockIndexForReporting + 1}: No match found (tried Exact, Line Trimmed, Block Anchor starting from line ${lastProcessedLine + 1}).`
					blockProcessingResults.push({ blockIndex: blockIndexForReporting, success: false, error: errorMsg })
					// Attempt to continue processing subsequent blocks even if one fails in fallback mode
					// lastProcessedLine remains unchanged, so next block searches from the same position
				}
			}
		}

		// --- Final Result Processing (Common for both paths) ---
		const finalContent = resultLines.join(lineEnding)
		const failedBlocks = blockProcessingResults.filter((r) => !r.success)
		// Map to BlockFailureDetail format
		const failParts: BlockFailureDetail[] = failedBlocks.map((f) => ({ blockIndex: f.blockIndex, error: f.error! }))

		if (appliedCount === 0 && (blocks.length > 0 || fallbackBlocks.length > 0)) {
			// Check if any blocks were attempted
			const totalBlocksAttempted = usingFallbackParser ? fallbackBlocks.length : blocks.length
			const firstError = failParts[0]?.error || "No valid blocks found or all blocks failed to apply."
			return {
				success: false,
				error: `Failed to apply any of the ${totalBlocksAttempted} diff blocks. First error: ${firstError}`,
				failParts: failParts, // Use the mapped failParts
			}
		} else if (failedBlocks.length > 0) {
			const totalBlocksAttempted = usingFallbackParser ? fallbackBlocks.length : blocks.length
			return {
				success: true,
				content: finalContent,
				error: `Applied ${appliedCount} out of ${totalBlocksAttempted} blocks. ${failedBlocks.length} block(s) failed. See details in failParts.`, // Refer to failParts
				failParts: failParts, // Use the mapped failParts
			}
		} else {
			return {
				success: true,
				content: finalContent,
				// No error or failParts needed if all succeeded
			}
		}
	}
}
