import { render, screen, act } from '@testing-library/react';
import React from 'react';

import {
  ExtensionStateContextProvider,
  useExtensionState,
} from '../ExtensionStateContext';

// Test component that consumes the context
const TestComponent = () => {
  const { allowedCommands, setAllowedCommands, soundEnabled } =
    useExtensionState();
  return (
    <div>
      <div data-testid="allowed-commands">
        {JSON.stringify(allowedCommands)}
      </div>
      <div data-testid="sound-enabled">{JSON.stringify(soundEnabled)}</div>
      <button
        data-testid="update-button"
        onClick={() => setAllowedCommands(['npm install', 'git status'])}
      >
        Update Commands
      </button>
    </div>
  );
};

describe('ExtensionStateContext', () => {
  it('initializes with empty allowedCommands array', () => {
    render(
      <ExtensionStateContextProvider>
        <TestComponent />
      </ExtensionStateContextProvider>
    );

    expect(
      JSON.parse(screen.getByTestId('allowed-commands').textContent ?? '[]')
    ).toEqual([]);
  });

  it('initializes with soundEnabled set to false', () => {
    render(
      <ExtensionStateContextProvider>
        <TestComponent />
      </ExtensionStateContextProvider>
    );

    expect(
      JSON.parse(screen.getByTestId('sound-enabled').textContent ?? 'false')
    ).toBe(false);
  });

  it('updates allowedCommands through setAllowedCommands', () => {
    render(
      <ExtensionStateContextProvider>
        <TestComponent />
      </ExtensionStateContextProvider>
    );

    act(() => {
      screen.getByTestId('update-button').click();
    });

    expect(
      JSON.parse(screen.getByTestId('allowed-commands').textContent ?? '[]')
    ).toEqual(['npm install', 'git status']);
  });

  it('throws error when used outside provider', () => {
    // Suppress console.error for this test since we expect an error
    const consoleSpy = jest.spyOn(console, 'error');
    // 在测试期间禁止错误输出
    consoleSpy.mockImplementation(() => {
      /* 禁止错误输出 */
    });

    expect(() => {
      render(<TestComponent />);
    }).toThrow(
      'useExtensionState must be used within an ExtensionStateContextProvider'
    );

    consoleSpy.mockRestore();
  });
});
