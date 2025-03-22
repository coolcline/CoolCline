import { mentionRegex } from "../../../src/shared/context-mentions"
import { ModeConfig } from "../../../src/shared/modes"
import { Fzf } from "fzf"

export function insertMention(
	text: string,
	position: number,
	value: string,
): { newValue: string; mentionIndex: number } {
	// 处理斜杠命令
	if (text.startsWith("/")) {
		const beforeCursor = text.slice(0, position)
		const afterCursor = text.slice(position)
		const commandText = beforeCursor.slice(1) // 去掉斜杠

		// 如果命令文本为空或全是空格，直接替换整个命令
		if (!commandText.trim()) {
			return {
				newValue: value,
				mentionIndex: 0,
			}
		}

		// 否则，替换命令部分
		return {
			newValue: "/" + value + afterCursor,
			mentionIndex: value.length + 1, // +1 是为了包含斜杠
		}
	}

	const beforeCursor = text.slice(0, position)
	const afterCursor = text.slice(position)

	// Find the position of the last '@' symbol before the cursor
	const lastAtIndex = beforeCursor.lastIndexOf("@")

	let newValue: string
	let mentionIndex: number

	if (lastAtIndex !== -1) {
		// If there's an '@' symbol, replace everything after it with the new mention
		const beforeMention = text.slice(0, lastAtIndex)
		newValue = beforeMention + "@" + value + " " + afterCursor.replace(/^[^\s]*/, "")
		mentionIndex = lastAtIndex
	} else {
		// If there's no '@' symbol, insert the mention at the cursor position
		newValue = beforeCursor + "@" + value + " " + afterCursor
		mentionIndex = position
	}

	return { newValue, mentionIndex }
}

export function removeMention(text: string, position: number): { newText: string; newPosition: number } {
	const beforeCursor = text.slice(0, position)
	const afterCursor = text.slice(position)

	// Check if we're at the end of a mention
	const matchEnd = beforeCursor.match(new RegExp(mentionRegex.source + "$"))

	if (matchEnd) {
		// If we're at the end of a mention, remove it
		const newText = text.slice(0, position - matchEnd[0].length) + afterCursor.replace(" ", "") // removes the first space after the mention
		const newPosition = position - matchEnd[0].length
		return { newText, newPosition }
	}

	// If we're not at the end of a mention, just return the original text and position
	return { newText: text, newPosition: position }
}

export enum ContextMenuOptionType {
	OpenedFile = "openedFile",
	File = "file",
	Folder = "folder",
	Problems = "problems",
	URL = "url",
	Git = "git",
	Codebase = "codebase",
	NoResults = "noResults",
	Mode = "mode",
}

export interface ContextMenuQueryItem {
	type: ContextMenuOptionType
	value?: string
	label?: string
	description?: string
	icon?: string
}

export function getContextMenuOptions(
	query: string,
	selectedType: ContextMenuOptionType | null = null,
	queryItems: ContextMenuQueryItem[],
	modes?: ModeConfig[],
): ContextMenuQueryItem[] {
	// 处理斜杠命令模式切换
	if (query.startsWith("/")) {
		const modeQuery = query.slice(1).trim()
		if (!modes?.length) return [{ type: ContextMenuOptionType.NoResults }]

		// 创建可搜索的字符串数组
		const searchableItems = modes.map((mode) => ({
			original: mode,
			searchStr: `${mode.name} ${mode.roleDefinition} ${mode.slug}`,
		}))

		// 初始化 fzf 实例进行模糊搜索
		const fzf = new Fzf(searchableItems, {
			selector: (item) => item.searchStr,
		})

		// 获取模糊匹配的项目并排序
		const getMatchingModes = (items: typeof searchableItems) => {
			const results = modeQuery ? fzf.find(modeQuery) : items.map((item, idx) => ({ item, score: idx }))

			// 自定义排序逻辑
			return results.sort((a, b) => {
				// 优先匹配名称
				const aNameMatch = a.item.original.name.toLowerCase().includes(modeQuery.toLowerCase())
				const bNameMatch = b.item.original.name.toLowerCase().includes(modeQuery.toLowerCase())
				if (aNameMatch !== bNameMatch) return aNameMatch ? -1 : 1

				// 其次匹配 slug
				const aSlugMatch = a.item.original.slug.toLowerCase().includes(modeQuery.toLowerCase())
				const bSlugMatch = b.item.original.slug.toLowerCase().includes(modeQuery.toLowerCase())
				if (aSlugMatch !== bSlugMatch) return aSlugMatch ? -1 : 1

				return a.score - b.score
			})
		}

		const matchingModes = getMatchingModes(searchableItems).map((result) => ({
			type: ContextMenuOptionType.Mode as const,
			value: result.item.original.slug,
			label: result.item.original.name,
			description: result.item.original.roleDefinition.split("\n")[0],
			icon: "$(symbol-enum)", // 添加图标
		}))

		return matchingModes.length > 0 ? matchingModes : [{ type: ContextMenuOptionType.NoResults }]
	}

	const workingChanges: ContextMenuQueryItem = {
		type: ContextMenuOptionType.Git,
		value: "git-changes",
		label: "Working changes",
		description: "Current uncommitted changes",
		icon: "$(git-commit)",
	}

	if (query === "") {
		if (selectedType === ContextMenuOptionType.File) {
			const files = queryItems
				.filter(
					(item) =>
						item.type === ContextMenuOptionType.File || item.type === ContextMenuOptionType.OpenedFile,
				)
				.map((item) => ({
					type: item.type,
					value: item.value,
				}))
			return files.length > 0 ? files : [{ type: ContextMenuOptionType.NoResults }]
		}

		if (selectedType === ContextMenuOptionType.Folder) {
			const folders = queryItems
				.filter((item) => item.type === ContextMenuOptionType.Folder)
				.map((item) => ({ type: ContextMenuOptionType.Folder, value: item.value }))
			return folders.length > 0 ? folders : [{ type: ContextMenuOptionType.NoResults }]
		}

		if (selectedType === ContextMenuOptionType.Git) {
			const commits = queryItems.filter((item) => item.type === ContextMenuOptionType.Git)
			return commits.length > 0 ? [workingChanges, ...commits] : [workingChanges]
		}

		return [
			{ type: ContextMenuOptionType.Problems },
			{ type: ContextMenuOptionType.URL },
			{ type: ContextMenuOptionType.Folder },
			{ type: ContextMenuOptionType.File },
			{ type: ContextMenuOptionType.Git },
			{ type: ContextMenuOptionType.Codebase },
		]
	}

	const lowerQuery = query.toLowerCase()
	const suggestions: ContextMenuQueryItem[] = []

	// Check for top-level option matches
	if ("git".startsWith(lowerQuery)) {
		suggestions.push({
			type: ContextMenuOptionType.Git,
			label: "Git Commits",
			description: "Search repository history",
			icon: "$(git-commit)",
		})
	} else if ("git-changes".startsWith(lowerQuery)) {
		suggestions.push(workingChanges)
	}
	if ("codebase".startsWith(lowerQuery)) {
		suggestions.push({
			type: ContextMenuOptionType.Codebase,
			label: "Codebase",
			description: "Codebase semantic search",
			icon: "$(search)",
		})
	}
	if ("problems".startsWith(lowerQuery)) {
		suggestions.push({ type: ContextMenuOptionType.Problems })
	}
	if (query.startsWith("http")) {
		suggestions.push({ type: ContextMenuOptionType.URL, value: query })
	}

	// Add exact SHA matches to suggestions
	if (/^[a-f0-9]{7,40}$/i.test(lowerQuery)) {
		const exactMatches = queryItems.filter(
			(item) => item.type === ContextMenuOptionType.Git && item.value?.toLowerCase() === lowerQuery,
		)
		if (exactMatches.length > 0) {
			suggestions.push(...exactMatches)
		} else {
			// If no exact match but valid SHA format, add as option
			suggestions.push({
				type: ContextMenuOptionType.Git,
				value: lowerQuery,
				label: `Commit ${lowerQuery}`,
				description: "Git commit hash",
				icon: "$(git-commit)",
			})
		}
	}

	// Create searchable strings array for fzf
	const searchableItems = queryItems.map((item) => ({
		original: item,
		searchStr: [item.value, item.label, item.description].filter(Boolean).join(" "),
	}))

	// Initialize fzf instance for fuzzy search
	const fzf = new Fzf(searchableItems, {
		selector: (item) => item.searchStr,
	})

	// Get fuzzy matching items
	const matchingItems = query ? fzf.find(query).map((result) => result.item.original) : []

	// Separate matches by type
	const fileMatches = matchingItems.filter(
		(item) =>
			item.type === ContextMenuOptionType.File ||
			item.type === ContextMenuOptionType.OpenedFile ||
			item.type === ContextMenuOptionType.Folder,
	)
	const gitMatches = matchingItems.filter((item) => item.type === ContextMenuOptionType.Git)
	const otherMatches = matchingItems.filter(
		(item) =>
			item.type !== ContextMenuOptionType.File &&
			item.type !== ContextMenuOptionType.OpenedFile &&
			item.type !== ContextMenuOptionType.Folder &&
			item.type !== ContextMenuOptionType.Git,
	)

	// Combine suggestions with matching items in the desired order
	if (suggestions.length > 0 || matchingItems.length > 0) {
		const allItems = [...suggestions, ...fileMatches, ...gitMatches, ...otherMatches]

		// Remove duplicates based on type and value
		const seen = new Set()
		const deduped = allItems.filter((item) => {
			const key = `${item.type}-${item.value}`
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})

		return deduped
	}

	return [{ type: ContextMenuOptionType.NoResults }]
}

export function shouldShowContextMenu(text: string, position: number): boolean {
	// 处理斜杠命令
	if (text.startsWith("/")) {
		return position <= text.length && !text.includes(" ")
	}

	const beforeCursor = text.slice(0, position)
	const atIndex = beforeCursor.lastIndexOf("@")

	if (atIndex === -1) return false

	const textAfterAt = beforeCursor.slice(atIndex + 1)

	// Check if there's any whitespace after the '@'
	if (/\s/.test(textAfterAt)) return false

	// Don't show the menu if it's a URL
	if (textAfterAt.toLowerCase().startsWith("http")) return false

	// Don't show the menu if it's a problems
	if (textAfterAt.toLowerCase().startsWith("problems")) return false

	// NOTE: it's okay that menu shows when there's trailing punctuation since user could be inputting a path with marks

	// Show the menu if there's just '@' or '@' followed by some text (but not a URL)
	return true
}
