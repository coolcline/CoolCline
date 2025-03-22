const vscode = {
	window: {
		showInformationMessage: jest.fn(),
		showErrorMessage: jest.fn(),
		createTextEditorDecorationType: jest.fn().mockReturnValue({
			dispose: jest.fn(),
		}),
		tabGroups: {
			onDidChangeTabs: jest.fn(() => {
				return {
					dispose: jest.fn(),
				}
			}),
			all: [],
		},
		createOutputChannel: jest.fn().mockReturnValue({
			appendLine: jest.fn(),
			clear: jest.fn(),
			dispose: jest.fn(),
			show: jest.fn(),
		}),
	},
	workspace: {
		onDidSaveTextDocument: jest.fn(),
		createFileSystemWatcher: jest.fn().mockReturnValue({
			onDidCreate: jest.fn().mockReturnValue({ dispose: jest.fn() }),
			onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
			onDidDelete: jest.fn().mockReturnValue({ dispose: jest.fn() }),
			dispose: jest.fn(),
		}),
		fs: {
			stat: jest.fn().mockImplementation(() =>
				Promise.resolve({
					type: 1,
					ctime: 0,
					mtime: 0,
					size: 0,
				}),
			),
		},
		workspaceFolders: [
			{
				uri: {
					fsPath: "/test/workspace",
					scheme: "file",
					path: "/test/workspace",
					toString: () => "/test/workspace",
					authority: "",
					query: "",
					fragment: "",
					with: jest.fn(),
					toJSON: jest.fn(),
				},
				name: "test",
				index: 0,
			},
		],
		findFiles: jest.fn().mockResolvedValue([]),
		getConfiguration: jest.fn().mockReturnValue({
			get: (key) => (key === "enableCheckpoints" ? true : undefined),
		}),
	},
	Disposable: class {
		dispose() {}
	},
	Uri: {
		file: (path) => ({
			fsPath: path,
			scheme: "file",
			authority: "",
			path: path,
			query: "",
			fragment: "",
			with: jest.fn(),
			toJSON: jest.fn(),
		}),
	},
	EventEmitter: class {
		constructor() {
			this.event = jest.fn()
			this.fire = jest.fn()
		}
	},
	ConfigurationTarget: {
		Global: 1,
		Workspace: 2,
		WorkspaceFolder: 3,
	},
	Position: class {
		constructor(line, character) {
			this.line = line
			this.character = character
		}
	},
	Range: class {
		constructor(startLine, startCharacter, endLine, endCharacter) {
			this.start = new vscode.Position(startLine, startCharacter)
			this.end = new vscode.Position(endLine, endCharacter)
		}
	},
	ThemeColor: class {
		constructor(id) {
			this.id = id
		}
	},
	ExtensionMode: {
		Production: 1,
		Development: 2,
		Test: 3,
	},
	FileType: {
		Unknown: 0,
		File: 1,
		Directory: 2,
		SymbolicLink: 64,
	},
	TabInputText: class {
		constructor(uri) {
			this.uri = uri
		}
	},
	version: "1.84.0",
	Selection: jest.fn(),
	Location: jest.fn(),
	SymbolKind: {},
	CompletionItemKind: {},
	DiagnosticSeverity: {},
	StatusBarAlignment: {},
	TreeItemCollapsibleState: {},
	ProgressLocation: {},
	ViewColumn: {},
	TextEditorRevealType: {},
	TextEditorSelectionChangeKind: {},
	TextDocumentSaveReason: {},
	TextEditorCursorStyle: {},
	TextEditorLineNumbersStyle: {},
	EndOfLine: {},
	IndentAction: {},
	CompletionTriggerKind: {},
	SignatureHelpTriggerKind: {},
	DocumentHighlightKind: {},
	FileChangeType: {},
	QuickPickItemKind: {},
	CommentMode: {},
	CommentThreadCollapsibleState: {},
	OverviewRulerLane: {},
	RelativePattern: jest.fn(),
	CancellationTokenSource: jest.fn(),
	Disposable: {
		from: jest.fn(),
	},
	EventEmitter: class {
		constructor() {
			this.event = jest.fn()
			this.fire = jest.fn()
		}
	},
	CancellationError: jest.fn(),
	CodeAction: jest.fn(),
	CodeLens: jest.fn(),
	DebugAdapterExecutable: jest.fn(),
	DebugAdapterServer: jest.fn(),
	DebugAdapterInlineImplementation: jest.fn(),
	EvaluatableExpression: jest.fn(),
	InlineCompletionItem: jest.fn(),
	InlineCompletionList: jest.fn(),
	InlayHint: jest.fn(),
	MarkdownString: jest.fn(),
	ThemeColor: jest.fn(),
	SemanticTokens: jest.fn(),
	SemanticTokensBuilder: jest.fn(),
	SemanticTokensEdit: jest.fn(),
	SemanticTokensEdits: jest.fn(),
	SnippetString: jest.fn(),
	TreeItem: jest.fn(),
	WebviewPanel: jest.fn(),
	WebviewView: jest.fn(),
	WebviewViewProvider: jest.fn(),
	WorkspaceEdit: jest.fn(),
	DebugConfiguration: jest.fn(),
	DebugSession: jest.fn(),
	SourceBreakpoint: jest.fn(),
	FunctionBreakpoint: jest.fn(),
	SourceControlResourceState: jest.fn(),
	Task: jest.fn(),
	TaskGroup: jest.fn(),
	ProcessExecution: jest.fn(),
	ShellExecution: jest.fn(),
	CustomExecution: jest.fn(),
	TaskScope: jest.fn(),
	UIKind: jest.fn(),
	env: {
		appName: "Visual Studio Code",
		appRoot: "/test/app/root",
		language: "en",
		machineId: "test-machine-id",
		sessionId: "test-session-id",
		shell: "/bin/bash",
	},
	commands: {
		registerCommand: jest.fn(),
		executeCommand: jest.fn(),
	},
	languages: {
		createDiagnosticCollection: jest.fn(),
		registerCompletionItemProvider: jest.fn(),
		registerDefinitionProvider: jest.fn(),
		registerHoverProvider: jest.fn(),
		registerSignatureHelpProvider: jest.fn(),
		registerTypeDefinitionProvider: jest.fn(),
		registerImplementationProvider: jest.fn(),
		registerReferenceProvider: jest.fn(),
		registerDocumentHighlightProvider: jest.fn(),
		registerDocumentSymbolProvider: jest.fn(),
		registerWorkspaceSymbolProvider: jest.fn(),
		registerCodeActionsProvider: jest.fn(),
		registerCodeLensProvider: jest.fn(),
		registerDocumentFormattingEditProvider: jest.fn(),
		registerDocumentRangeFormattingEditProvider: jest.fn(),
		registerOnTypeFormattingEditProvider: jest.fn(),
		registerRenameProvider: jest.fn(),
		registerDocumentSemanticTokensProvider: jest.fn(),
		registerDocumentRangeSemanticTokensProvider: jest.fn(),
		registerInlineCompletionItemProvider: jest.fn(),
		registerInlayHintsProvider: jest.fn(),
		registerColorProvider: jest.fn(),
		registerFoldingRangeProvider: jest.fn(),
		registerSelectionRangeProvider: jest.fn(),
		registerCallHierarchyProvider: jest.fn(),
		registerTypeHierarchyProvider: jest.fn(),
		registerLinkedEditingRangeProvider: jest.fn(),
		registerDocumentLinkProvider: jest.fn(),
		registerEvaluatableExpressionProvider: jest.fn(),
		registerInlineValuesProvider: jest.fn(),
		registerDocumentDropEditProvider: jest.fn(),
		setTextDocumentLanguage: jest.fn(),
		match: jest.fn(),
		getLanguages: jest.fn(),
		getDiagnostics: jest.fn(),
	},
}

module.exports = vscode
