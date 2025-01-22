import { VSCodeButton, VSCodeLink } from '@vscode/webview-ui-toolkit/react';
import { memo } from 'react';
// import VSCodeButtonLink from "./VSCodeButtonLink"
// import { getOpenRouterAuthUrl } from "./ApiOptions"
// import { vscode } from "../utils/vscode"

interface AnnouncementProps {
  version: string;
  hideAnnouncement: () => void;
}
/*
You must update the latestAnnouncementId in CoolClineProvider for new announcements to show to users. This new id will be compared with whats in state for the 'last announcement shown', and if it's different then the announcement will render. As soon as an announcement is shown, the id will be updated in state. This ensures that announcements are not shown more than once, even if the user doesn't close it themselves.
*/
const Announcement = ({ version, hideAnnouncement }: AnnouncementProps) => {
  const minorVersion = version.split('.').slice(0, 2).join('.'); // 2.0.0 -> 2.0
  return (
    <div
      style={{
        backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)',
        borderRadius: '3px',
        padding: '12px 16px',
        margin: '5px 15px 5px 15px',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <VSCodeButton
        appearance="icon"
        onClick={hideAnnouncement}
        style={{ position: 'absolute', top: '8px', right: '8px' }}
      >
        <span className="codicon codicon-close"></span>
      </VSCodeButton>
      <h2 style={{ margin: '0 0 8px' }}>
        🎉{'  '}CoolCline {minorVersion}
      </h2>

      <p style={{ margin: '5px 0px' }}>
        We have synchronized contributions from the Roo Code Community, and
        CoolCline {version} is released! Thanks to all contributors from the Roo
        Code Community!{' '}
        <span role="img" aria-label="party">
          🎉
        </span>
      </p>

      <h3 style={{ margin: '12px 0 8px' }}>
        Built-in three modes (Code, Architect, Ask), you can switch at the
        bottom of the chat input box according to your needs
      </h3>
      <p style={{ margin: '5px 0px' }}>
        Just click the{' '}
        <span
          className="codicon codicon-notebook"
          style={{ fontSize: '10px' }}
        ></span>{' '}
        icon to start using custom modes!
      </p>
      <p>
        You can also go to the Prompts page in the upper right corner to manage
        the modes
      </p>

      <h3 style={{ margin: '12px 0 8px' }}>Welcome to join our community</h3>
      <p style={{ margin: '5px 0px' }}>
        <VSCodeLink
          href="https://github.com/CoolCline/CoolCline"
          style={{ display: 'inline' }}
        >
          github.com/CoolCline/CoolCline
        </VSCodeLink>{' '}
        or{' '}
        <VSCodeLink
          href="https://gitee.com/coolcline/coolcline"
          style={{ display: 'inline' }}
        >
          gitee.com/CoolCline/CoolCline
        </VSCodeLink>
        .
      </p>
    </div>
  );
};

export default memo(Announcement);
