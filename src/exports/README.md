# CoolCline API

The CoolCline extension exposes an API that can be used by other extensions. To use this API in your extension:

1. Copy `src/extension-api/coolcline.d.ts` to your extension's source directory.
2. Include `coolcline.d.ts` in your extension's compilation.
3. Get access to the API with the following code:

   ```ts
   const coolclineExtension = vscode.extensions.getExtension<CoolClineAPI>(
     'coolcline.coolcline'
   );

   if (!coolclineExtension?.isActive) {
     throw new Error('CoolCline extension is not activated');
   }

   const coolcline = coolclineExtension.exports;

   if (coolcline) {
     // Now you can use the API

     // Set custom instructions
     await coolcline.setCustomInstructions('Talk like a pirate');

     // Get custom instructions
     const instructions = await coolcline.getCustomInstructions();
     console.log('Current custom instructions:', instructions);

     // Start a new task with an initial message
     await coolcline.startNewTask(
       "Hello, CoolCline! Let's make a new project..."
     );

     // Start a new task with an initial message and images
     await coolcline.startNewTask('Use this design language', [
       'data:image/webp;base64,...',
     ]);

     // Send a message to the current task
     await coolcline.sendMessage('Can you fix the @problems?');

     // Simulate pressing the primary button in the chat interface (e.g. 'Save' or 'Proceed While Running')
     await coolcline.pressPrimaryButton();

     // Simulate pressing the secondary button in the chat interface (e.g. 'Reject')
     await coolcline.pressSecondaryButton();
   } else {
     console.error('CoolCline API is not available');
   }
   ```

   **Note:** To ensure that the `coolcline.coolcline` extension is activated before your extension, add it to the `extensionDependencies` in your `package.json`:

   ```json
   "extensionDependencies": [
       "coolcline.coolcline"
   ]
   ```

For detailed information on the available methods and their usage, refer to the `coolcline.d.ts` file.
