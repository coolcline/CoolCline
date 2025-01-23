import { memo, useEffect } from 'react';
import { useRemark } from 'react-remark';
import rehypeHighlight, { Options } from 'rehype-highlight';
import styled from 'styled-components';
import { Node, Parent } from 'unist';
import { visit } from 'unist-util-visit';

import { useExtensionState } from '../../context/ExtensionStateContext';

import { CODE_BLOCK_BG_COLOR } from './CodeBlock';

interface MarkdownBlockProps {
  markdown?: string;
}

interface TextNode extends Node {
  type: 'text';
  value: string;
}

interface LinkNode extends Node {
  type: 'link';
  url: string;
  children: TextNode[];
}

interface CodeNode extends Node {
  type: 'code';
  lang?: string;
  value: string;
}

interface ParentNode extends Parent {
  children: (TextNode | LinkNode | CodeNode)[];
}

interface ThemeProps {
  theme: Record<string, string>;
}

interface PreProps {
  node: Node;
  children?: React.ReactNode;
  [key: string]: unknown;
}

/**
 * Custom remark plugin that converts plain URLs in text into clickable links
 *
 * The original bug: We were converting text nodes into paragraph nodes,
 * which broke the markdown structure because text nodes should remain as text nodes
 * within their parent elements (like paragraphs, list items, etc.).
 * This caused the entire content to disappear because the structure became invalid.
 */
const remarkUrlToLink = () => {
  return (tree: Node) => {
    visit(tree, 'text', (node: TextNode, index, parent: ParentNode) => {
      const urlRegex = /https?:\/\/[^\s<>)"]+/g;
      const matches = node.value.match(urlRegex);
      if (!matches) return;

      const parts = node.value.split(urlRegex);
      const children: (TextNode | LinkNode)[] = [];

      parts.forEach((part: string, i: number) => {
        if (part) children.push({ type: 'text', value: part } as TextNode);
        if (matches[i]) {
          children.push({
            type: 'link',
            url: matches[i],
            children: [{ type: 'text', value: matches[i] }],
          } as LinkNode);
        }
      });

      if (parent && Array.isArray(parent.children)) {
        parent.children.splice(index, 1, ...children);
      }
    });
  };
};

const StyledMarkdown = styled.div`
  pre {
    background-color: ${CODE_BLOCK_BG_COLOR};
    border-radius: 3px;
    margin: 13x 0;
    padding: 10px 10px;
    max-width: calc(100vw - 20px);
    overflow-x: auto;
    overflow-y: hidden;
    white-space: pre-wrap;
  }

  pre > code {
    .hljs-deletion {
      background-color: var(--vscode-diffEditor-removedTextBackground);
      display: inline-block;
      width: 100%;
    }
    .hljs-addition {
      background-color: var(--vscode-diffEditor-insertedTextBackground);
      display: inline-block;
      width: 100%;
    }
  }

  code {
    span.line:empty {
      display: none;
    }
    word-wrap: break-word;
    border-radius: 3px;
    background-color: ${CODE_BLOCK_BG_COLOR};
    font-size: var(--vscode-editor-font-size, var(--vscode-font-size, 12px));
    font-family: var(--vscode-editor-font-family);
  }

  code:not(pre > code) {
    font-family: var(--vscode-editor-font-family, monospace);
    color: var(--vscode-textPreformat-foreground, #f78383);
    background-color: var(--vscode-textCodeBlock-background, #1e1e1e);
    padding: 0px 2px;
    border-radius: 3px;
    border: 1px solid var(--vscode-textSeparator-foreground, #424242);
    white-space: pre-line;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  font-family:
    var(--vscode-font-family),
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    Roboto,
    Oxygen,
    Ubuntu,
    Cantarell,
    'Open Sans',
    'Helvetica Neue',
    sans-serif;
  font-size: var(--vscode-font-size, 13px);

  p,
  li,
  ol,
  ul {
    line-height: 1.25;
  }

  ol,
  ul {
    padding-left: 2.5em;
    margin-left: 0;
  }

  p {
    white-space: pre-wrap;
  }

  a {
    text-decoration: none;
  }
  a {
    &:hover {
      text-decoration: underline;
    }
  }
`;

const StyledPre = styled.pre<ThemeProps>`
  & .hljs {
    color: var(--vscode-editor-foreground, #fff);
  }

  ${(props) =>
    Object.keys(props.theme)
      .map((key) => {
        return `
      & ${key} {
        color: ${props.theme[key]};
      }
    `;
      })
      .join('')}
`;

const MarkdownBlock = memo(({ markdown }: MarkdownBlockProps) => {
  const { theme } = useExtensionState();
  const [reactContent, setMarkdown] = useRemark({
    remarkPlugins: [
      remarkUrlToLink,
      () => {
        return (tree: Node) => {
          visit(tree, 'code', (node: CodeNode) => {
            if (!node.lang) {
              node.lang = 'javascript';
            } else if (node.lang.includes('.')) {
              node.lang = node.lang.split('.').slice(-1)[0];
            }
          });
        };
      },
    ],
    rehypePlugins: [
      // @ts-ignore Type incompatibility between rehype-highlight and remark types
      [rehypeHighlight, {}],
    ],
    rehypeReactOptions: {
      components: {
        pre: ({ node, ...preProps }: PreProps) => (
          <StyledPre {...preProps} theme={theme} />
        ),
      },
    },
  });

  useEffect(() => {
    setMarkdown(markdown || '');
  }, [markdown, setMarkdown, theme]);

  return (
    <div style={{}}>
      <StyledMarkdown>{reactContent}</StyledMarkdown>
    </div>
  );
});

export default MarkdownBlock;
