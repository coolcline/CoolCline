import { VSCodeButton, VSCodeLink } from '@vscode/webview-ui-toolkit/react';
import { useEffect, useState } from 'react';

import { useExtensionState } from '../../context/ExtensionStateContext';
import { validateApiConfiguration } from '../../utils/validate';
import { vscode } from '../../utils/vscode';
import ApiOptions from '../settings/ApiOptions';

const WelcomeView = () => {
  const { apiConfiguration } = useExtensionState();

  const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(
    undefined
  );

  const disableLetsGoButton = apiErrorMessage != null;

  const handleSubmit = () => {
    vscode.postMessage({ type: 'apiConfiguration', apiConfiguration });
  };

  useEffect(() => {
    setApiErrorMessage(validateApiConfiguration(apiConfiguration));
  }, [apiConfiguration]);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        padding: '0 20px',
      }}
    >
      <h2>Welcome!</h2>
      <p>
        Cool Cline is a proactive programming assistant that enhances your
        development workflow with advanced AI capabilities. It helps you write
        code more efficiently, optimize queries, auto-fix errors, run
        command-line tasks, and perform browser automation tests.
        <VSCodeLink
          href="https://github.com/coolcline/coolcline/blob/main/README.md"
          style={{ display: 'inline' }}
        >
          README
        </VSCodeLink>
      </p>

      <b>To get started, this extension needs an LLM provider.</b>

      <div style={{ marginTop: '10px' }}>
        <ApiOptions />
        <VSCodeButton
          onClick={handleSubmit}
          disabled={disableLetsGoButton}
          style={{ marginTop: '3px' }}
        >
          Let&apos;s go!
        </VSCodeButton>
      </div>
    </div>
  );
};

export default WelcomeView;
