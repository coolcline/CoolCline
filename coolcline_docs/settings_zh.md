## 所有设置

1. 在 `ExtensionMessage.ts` 中添加设置：

   - 将设置添加到 `ExtensionState` 接口中
   - 如果它有默认值，则设置为必填项；如果可以为 `undefined`，则设置为可选
   - 示例：`preferredLanguage: string`

2. 添加测试覆盖：
   - 在 `CoolClineProvider.test.ts` 的 `mockState` 中添加设置
   - 添加设置持久化和状态更新的测试用例
   - 确保所有测试通过后再提交更改

## 复选框设置

1. 在 `WebviewMessage.ts` 中添加消息类型：

   - 将设置名称添加到 `WebviewMessage` 类型的类型联合中
   - 示例：`| "multisearchDiffEnabled"`

2. 在 `ExtensionStateContext.tsx` 中添加设置：

   - 将设置添加到 `ExtensionStateContextType` 接口中
   - 将设置函数添加到接口中
   - 将设置添加到 `useState` 的初始状态中
   - 将设置添加到 `contextValue` 对象中
   - 示例：
     ```typescript
     interface ExtensionStateContextType {
       multisearchDiffEnabled: boolean;
       setMultisearchDiffEnabled: (value: boolean) => void;
     }
     ```

3. 在 `CoolClineProvider.ts` 中添加设置：

   - 将设置名称添加到 `GlobalStateKey` 类型联合中
   - 将设置添加到 `getState` 中的 `Promise.all` 数组中
   - 将设置添加到 `getState` 的返回值中，并设置默认值
   - 将设置添加到 `getStateToPostToWebview` 中的解构变量中
   - 将设置添加到 `getStateToPostToWebview` 的返回值中
   - 在 `setWebviewMessageListener` 中添加一个 case 来处理设置的消息类型
   - 示例：
     ```typescript
     case "multisearchDiffEnabled":
       await this.updateGlobalState("multisearchDiffEnabled", message.bool)
       await this.postStateToWebview()
       break
     ```

4. 在 `SettingsView.tsx` 中添加复选框 UI：

   - 从 `ExtensionStateContext` 导入设置及其设置函数
   - 添加 `VSCodeCheckbox` 组件，并设置其状态和 `onChange` 处理程序
   - 添加适当的标签和描述文本
   - 示例：
     ```typescript
     <VSCodeCheckbox
       checked={multisearchDiffEnabled}
       onChange={(e: any) => setMultisearchDiffEnabled(e.target.checked)}
     >
       <span style={{ fontWeight: "500" }}>启用多搜索差异匹配</span>
     </VSCodeCheckbox>
     ```

5. 在 `SettingsView.tsx` 的 `handleSubmit` 中添加设置：
   - 添加 `vscode.postMessage` 调用，在点击“完成”时发送设置的值
   - 示例：
     ```typescript
     vscode.postMessage({
       type: 'multisearchDiffEnabled',
       bool: multisearchDiffEnabled,
     });
     ```

## 选择/下拉菜单设置

1. 在 `WebviewMessage.ts` 中添加消息类型：

   - 将设置名称添加到 `WebviewMessage` 类型的类型联合中
   - 示例：`| "preferredLanguage"`

2. 在 `ExtensionStateContext.tsx` 中添加设置：

   - 将设置添加到 `ExtensionStateContextType` 接口中
   - 将设置函数添加到接口中
   - 将设置添加到 `useState` 的初始状态中，并设置默认值
   - 将设置添加到 `contextValue` 对象中
   - 示例：
     ```typescript
     interface ExtensionStateContextType {
       preferredLanguage: string;
       setPreferredLanguage: (value: string) => void;
     }
     ```

3. 在 `CoolClineProvider.ts` 中添加设置：

   - 将设置名称添加到 `GlobalStateKey` 类型联合中
   - 将设置添加到 `getState` 中的 `Promise.all` 数组中
   - 将设置添加到 `getState` 的返回值中，并设置默认值
   - 将设置添加到 `getStateToPostToWebview` 中的解构变量中
   - 将设置添加到 `getStateToPostToWebview` 的返回值中
   - 在 `setWebviewMessageListener` 中添加一个 case 来处理设置的消息类型
   - 示例：
     ```typescript
     case "preferredLanguage":
       await this.updateGlobalState("preferredLanguage", message.text)
       await this.postStateToWebview()
       break
     ```

4. 在 `SettingsView.tsx` 中添加选择 UI：

   - 从 `ExtensionStateContext` 导入设置及其设置函数
   - 添加 `select` 元素，并设置适当的样式以匹配 VSCode 的主题
   - 为下拉菜单添加选项
   - 添加适当的标签和描述文本
   - 示例：
     ```typescript
     <select
       value={preferredLanguage}
       onChange={(e) => setPreferredLanguage(e.target.value)}
       style={{
         width: "100%",
         padding: "4px 8px",
         backgroundColor: "var(--vscode-input-background)",
         color: "var(--vscode-input-foreground)",
         border: "1px solid var(--vscode-input-border)",
         borderRadius: "2px"
       }}>
       <option value="English">英语</option>
       <option value="Spanish">西班牙语</option>
       ...
     </select>
     ```

5. 在 `SettingsView.tsx` 的 `handleSubmit` 中添加设置：
   - 添加 `vscode.postMessage` 调用，在点击“完成”时发送设置的值
   - 示例：
     ```typescript
     vscode.postMessage({ type: 'preferredLanguage', text: preferredLanguage });
     ```

这些步骤确保：

- 设置的状态在整个应用程序中正确类型化
- 设置在会话之间持久化
- 设置的值在 webview 和扩展之间正确同步
- 设置在设置视图中具有适当的 UI 表示
- 新设置的测试覆盖得到维护
