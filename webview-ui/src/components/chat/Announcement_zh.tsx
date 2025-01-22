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
        Announcement:
        <VSCodeLink href="./Announcement" style={{ display: 'inline' }}>
          English
        </VSCodeLink>
        <VSCodeLink href="./Announcement_zh" style={{ display: 'inline' }}>
          简体中文
        </VSCodeLink>
        .
      </p>

      <p style={{ margin: '5px 0px' }}>
        我们同步了 Roo Code Community 社区的贡献，在 CoolCline {version} 发布！
        感谢 Roo Code Community 的所有贡献者！{' '}
        <span role="img" aria-label="party">
          🎉
        </span>
      </p>

      <h3 style={{ margin: '12px 0 8px' }}>
        内置三种模式（Code、Architect、Ask），可以根据您的需求在聊天输入框底部进行切换
      </h3>
      <p style={{ margin: '5px 0px' }}>
        只需点击{' '}
        <span
          className="codicon codicon-notebook"
          style={{ fontSize: '10px' }}
        ></span>{' '}
        图标即可开始使用自定义模式！
      </p>
      <p>您也可以进入右上角的 Prompts 页面进行模式的管理</p>

      <h3 style={{ margin: '12px 0 8px' }}>欢迎加入我们的社区</h3>
      <p style={{ margin: '5px 0px' }}>
        <VSCodeLink
          href="https://github.com/CoolCline/CoolCline"
          style={{ display: 'inline' }}
        >
          github.com/CoolCline/CoolCline
        </VSCodeLink>{' '}
        或{' '}
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
