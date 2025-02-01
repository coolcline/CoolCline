export interface CoolClineAPI {
  /**
   * Sets the custom instructions in the global storage.
   * @param value The custom instructions to be saved.
   */
  setCustomInstructions(value: string): Promise<void>;

  /**
   * Retrieves the custom instructions from the global storage.
   * @returns The saved custom instructions, or undefined if not set.
   */
  getCustomInstructions(): Promise<string | undefined>;

  /**
   * Starts a new task with an optional initial message and images.
   * @param task Optional initial task message.
   * @param images Optional array of image data URIs (e.g., "data:image/webp;base64,...").
   */
  startNewTask(task?: string, images?: string[]): Promise<void>;

  /**
   * Sends a message to the current task.
   * @param message Optional message to send.
   * @param images Optional array of image data URIs (e.g., "data:image/webp;base64,...").
   */
  sendMessage(message?: string, images?: string[]): Promise<void>;

  /**
   * Simulates pressing the primary button in the chat interface.
   */
  pressPrimaryButton(): Promise<void>;

  /**
   * Simulates pressing the secondary button in the chat interface.
   */
  pressSecondaryButton(): Promise<void>;

  /**
   * The sidebar provider instance.
   */
  sidebarProvider: CoolClineSidebarProvider;

  /**
   * Integrates Web3 capabilities.
   * @param provider The Web3 provider to be used.
   */
  integrateWeb3(provider: any): Promise<void>;

  /**
   * Adds support for smart contracts.
   * @param contract The smart contract to be added.
   */
  addSmartContract(contract: any): Promise<void>;

  /**
   * Adds support for decentralized applications (dApps).
   * @param dApp The dApp to be added.
   */
  addDApp(dApp: any): Promise<void>;

  /**
   * Adds support for decentralized finance (DeFi).
   * @param defi The DeFi application to be added.
   */
  addDeFi(defi: any): Promise<void>;
}
