import delay from 'delay';
import * as vscode from 'vscode';
import { CoolClineProvider } from './core/webview/CoolClineProvider';
import { createCoolClineAPI } from './exports';
import './utils/path'; // necessary to have access to String.prototype.toPosix
import { DIFF_VIEW_URI_SCHEME } from './integrations/editor/DiffViewProvider';
import Web3 from 'web3';

/*
Built using https://github.com/microsoft/vscode-webview-ui-toolkit

Inspired by
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/default/weather-webview
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/tree/main/frameworks/hello-world-react-cra

*/

let outputChannel: vscode.OutputChannel;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('CoolCline');
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine('CoolCline extension activated');

  // Get default commands from configuration
  const defaultCommands =
    vscode.workspace
      .getConfiguration('coolcline')
      .get<string[]>('allowedCommands') || [];

  // Initialize global state if not already set
  if (!context.globalState.get('allowedCommands')) {
    context.globalState.update('allowedCommands', defaultCommands);
  }

  const sidebarProvider = new CoolClineProvider(context, outputChannel);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CoolClineProvider.sideBarId,
      sidebarProvider,
      {
        webviewOptions: { retainContextWhenHidden: true },
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('coolcline.plusButtonClicked', async () => {
      outputChannel.appendLine('Plus button Clicked');
      await sidebarProvider.clearTask();
      await sidebarProvider.postStateToWebview();
      await sidebarProvider.postMessageToWebview({
        type: 'action',
        action: 'chatButtonClicked',
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('coolcline.mcpButtonClicked', () => {
      sidebarProvider.postMessageToWebview({
        type: 'action',
        action: 'mcpButtonClicked',
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('coolcline.promptsButtonClicked', () => {
      sidebarProvider.postMessageToWebview({
        type: 'action',
        action: 'promptsButtonClicked',
      });
    })
  );

  const openCoolClineInNewTab = async () => {
    outputChannel.appendLine('Opening CoolCline in new tab');
    // (this example uses webviewProvider activation event which is necessary to deserialize cached webview, but since we use retainContextWhenHidden, we don't need to use that event)
    // https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
    const tabProvider = new CoolClineProvider(context, outputChannel);
    //const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined
    const lastCol = Math.max(
      ...vscode.window.visibleTextEditors.map(
        (editor) => editor.viewColumn || 0
      )
    );

    // Check if there are any visible text editors, otherwise open a new group to the right
    const hasVisibleEditors = vscode.window.visibleTextEditors.length > 0;
    if (!hasVisibleEditors) {
      await vscode.commands.executeCommand('workbench.action.newGroupRight');
    }
    const targetCol = hasVisibleEditors
      ? Math.max(lastCol + 1, 1)
      : vscode.ViewColumn.Two;

    const panel = vscode.window.createWebviewPanel(
      CoolClineProvider.tabPanelId,
      'CoolCline',
      targetCol,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      }
    );
    // TODO: use better svg icon with light and dark variants (see https://stackoverflow.com/questions/58365687/vscode-extension-iconpath)

    panel.iconPath = {
      light: vscode.Uri.joinPath(
        context.extensionUri,
        'assets',
        'icons',
        'robot_panel_light.png'
      ),
      dark: vscode.Uri.joinPath(
        context.extensionUri,
        'assets',
        'icons',
        'robot_panel_dark.png'
      ),
    };
    tabProvider.resolveWebviewView(panel);

    // Lock the editor group so clicking on files doesn't open them over the panel
    await delay(100);
    await vscode.commands.executeCommand('workbench.action.lockEditorGroup');
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'coolcline.popoutButtonClicked',
      openCoolClineInNewTab
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'coolcline.openInNewTab',
      openCoolClineInNewTab
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('coolcline.settingsButtonClicked', () => {
      //vscode.window.showInformationMessage(message)
      sidebarProvider.postMessageToWebview({
        type: 'action',
        action: 'settingsButtonClicked',
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('coolcline.historyButtonClicked', () => {
      sidebarProvider.postMessageToWebview({
        type: 'action',
        action: 'historyButtonClicked',
      });
    })
  );

  /*
	We use the text document content provider API to show the left side for diff view by creating a virtual document for the original content. This makes it readonly so users know to edit the right side if they want to keep their changes.

	- This API allows you to create readonly documents in VSCode from arbitrary sources, and works by claiming an uri-scheme for which your provider then returns text contents. The scheme must be provided when registering a provider and cannot change afterwards.
	- Note how the provider doesn't create uris for virtual documents - its role is to provide contents given such an uri. In return, content providers are wired into the open document logic so that providers are always considered.
	https://code.visualstudio.com/api/extension-guides/virtual-documents
	*/
  const diffContentProvider = new (class
    implements vscode.TextDocumentContentProvider
  {
    provideTextDocumentContent(uri: vscode.Uri): string {
      return Buffer.from(uri.query, 'base64').toString('utf-8');
    }
  })();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      DIFF_VIEW_URI_SCHEME,
      diffContentProvider
    )
  );

  // URI Handler
  const handleUri = async (uri: vscode.Uri) => {
    const path = uri.path;
    const query = new URLSearchParams(uri.query.replace(/\+/g, '%2B'));
    const visibleProvider = CoolClineProvider.getVisibleInstance();
    if (!visibleProvider) {
      return;
    }
    const code = query.get('code');
    switch (path) {
      case '/glama':
        if (code) {
          await visibleProvider.handleGlamaCallback(code);
        }
        break;

      case '/openrouter':
        if (code) {
          await visibleProvider.handleOpenRouterCallback(code);
        }
        break;
      default:
        break;
    }
  };
  context.subscriptions.push(vscode.window.registerUriHandler({ handleUri }));

  // Web3 Integration
  const web3 = new Web3(Web3.givenProvider || 'http://localhost:8545');
  outputChannel.appendLine('Web3 initialized');

  // Crypto Wallet Access and Creation
  const createWallet = () => {
    const account = web3.eth.accounts.create();
    outputChannel.appendLine(`Wallet created: ${account.address}`);
    return account;
  };

  const getWallet = (privateKey: string) => {
    const account = web3.eth.accounts.privateKeyToAccount(privateKey);
    outputChannel.appendLine(`Wallet accessed: ${account.address}`);
    return account;
  };

  const storeWallet = (account: any) => {
    context.globalState.update('wallet', account);
    outputChannel.appendLine(`Wallet stored: ${account.address}`);
  };

  const retrieveWallet = () => {
    const account = context.globalState.get('wallet');
    if (account) {
      outputChannel.appendLine(`Wallet retrieved: ${account.address}`);
    } else {
      outputChannel.appendLine('No wallet found');
    }
    return account;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('coolcline.createWallet', () => {
      const account = createWallet();
      storeWallet(account);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('coolcline.getWallet', async () => {
      const privateKey = await vscode.window.showInputBox({
        placeHolder: 'Enter your private key',
      });
      if (privateKey) {
        const account = getWallet(privateKey);
        storeWallet(account);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('coolcline.retrieveWallet', () => {
      retrieveWallet();
    })
  );

  return createCoolClineAPI(outputChannel, sidebarProvider);
}

// This method is called when your extension is deactivated
export function deactivate() {
  outputChannel.appendLine('CoolCline extension deactivated');
}
