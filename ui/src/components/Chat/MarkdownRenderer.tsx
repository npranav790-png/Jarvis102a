import React, { useState } from 'react';
import { Copy, Check, Terminal, Play } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onRunCode?: (code: string, language: string) => void;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, onRunCode }) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // Split content by code blocks: ```lang ... ```
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let blockIndex = 0;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text preceding the code block
    if (match.index > lastIndex) {
      const textChunk = content.substring(lastIndex, match.index);
      parts.push(<span key={`text_${lastIndex}`}>{renderInlineFormatting(textChunk)}</span>);
    }

    const language = match[1]?.trim() || 'code';
    const codeContent = match[2]?.replace(/\n$/, '') || '';
    const currentIndex = blockIndex++;

    parts.push(
      <div
        key={`code_${currentIndex}`}
        style={{
          margin: '12px 0',
          background: 'rgba(8, 12, 18, 0.95)',
          border: '1px solid rgba(0, 229, 255, 0.25)',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Code block header bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 12px',
            background: 'rgba(0, 229, 255, 0.05)',
            borderBottom: '1px solid rgba(0, 229, 255, 0.15)',
            fontSize: '11px',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#00e5ff' }}>
            <Terminal size={13} />
            <span style={{ fontWeight: 600, letterSpacing: '0.05em' }}>{language.toUpperCase()}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {onRunCode && (language.toLowerCase() === 'bash' || language.toLowerCase() === 'sh' || language.toLowerCase() === 'powershell') && (
              <button
                type="button"
                onClick={() => onRunCode(codeContent, language)}
                style={{
                  background: 'rgba(0, 245, 160, 0.15)',
                  border: '1px solid rgba(0, 245, 160, 0.4)',
                  color: '#00f5a0',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontWeight: 600,
                }}
              >
                <Play size={10} /> RUN IN TERMINAL
              </button>
            )}

            <button
              type="button"
              onClick={() => handleCopy(codeContent, currentIndex)}
              style={{
                background: copiedIndex === currentIndex ? 'rgba(0, 245, 160, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${copiedIndex === currentIndex ? '#00f5a0' : 'rgba(255, 255, 255, 0.1)'}`,
                color: copiedIndex === currentIndex ? '#00f5a0' : 'var(--text-muted, #888)',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease',
              }}
            >
              {copiedIndex === currentIndex ? (
                <>
                  <Check size={11} /> COPIED
                </>
              ) : (
                <>
                  <Copy size={11} /> COPY
                </>
              )}
            </button>
          </div>
        </div>

        {/* Code Content */}
        <pre
          style={{
            margin: 0,
            padding: '12px 14px',
            overflowX: 'auto',
            fontSize: '12px',
            fontFamily: 'var(--font-mono, Consolas, monospace)',
            lineHeight: 1.5,
            color: '#e6edf3',
            background: 'transparent',
          }}
        >
          <code>{codeContent}</code>
        </pre>
      </div>
    );

    lastIndex = match.index + match[0].length;
  }

  // Add any remaining text after the last code block
  if (lastIndex < content.length) {
    parts.push(
      <span key={`text_end`}>
        {renderInlineFormatting(content.substring(lastIndex))}
      </span>
    );
  }

  return <div style={{ lineHeight: 1.6 }}>{parts}</div>;
};

// Helper: Renders inline markdown elements (headers, bold, lists, inline code, links)
function renderInlineFormatting(text: string): React.ReactNode {
  const lines = text.split('\n');

  return lines.map((line, lineIdx) => {
    // 1. Headers
    if (line.startsWith('### ')) {
      return (
        <h3 key={lineIdx} style={{ fontSize: '1rem', fontWeight: 600, color: '#00e5ff', margin: '10px 0 6px 0' }}>
          {formatSpans(line.replace('### ', ''))}
        </h3>
      );
    }
    if (line.startsWith('## ')) {
      return (
        <h2 key={lineIdx} style={{ fontSize: '1.15rem', fontWeight: 700, color: '#00e5ff', margin: '12px 0 6px 0', borderBottom: '1px solid rgba(0,229,255,0.2)', paddingBottom: '4px' }}>
          {formatSpans(line.replace('## ', ''))}
        </h2>
      );
    }
    if (line.startsWith('# ')) {
      return (
        <h1 key={lineIdx} style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', margin: '14px 0 8px 0' }}>
          {formatSpans(line.replace('# ', ''))}
        </h1>
      );
    }

    // 2. Blockquotes
    if (line.startsWith('> ')) {
      return (
        <blockquote
          key={lineIdx}
          style={{
            margin: '6px 0',
            paddingLeft: '12px',
            borderLeft: '3px solid #00e5ff',
            color: 'var(--text-muted, #aaa)',
            fontStyle: 'italic',
          }}
        >
          {formatSpans(line.replace('> ', ''))}
        </blockquote>
      );
    }

    // 3. Unordered Lists
    if (/^\s*[-*]\s+/.test(line)) {
      const bulletContent = line.replace(/^\s*[-*]\s+/, '');
      return (
        <div key={lineIdx} style={{ display: 'flex', gap: '8px', margin: '4px 0', paddingLeft: '8px' }}>
          <span style={{ color: '#00e5ff' }}>•</span>
          <span>{formatSpans(bulletContent)}</span>
        </div>
      );
    }

    // 4. Numbered Lists
    const numMatch = line.match(/^\s*(\d+)\.\s+(.*)/);
    if (numMatch) {
      return (
        <div key={lineIdx} style={{ display: 'flex', gap: '8px', margin: '4px 0', paddingLeft: '8px' }}>
          <span style={{ color: '#00e5ff', fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem' }}>{numMatch[1]}.</span>
          <span>{formatSpans(numMatch[2])}</span>
        </div>
      );
    }

    // 5. Empty line spacer
    if (!line.trim()) {
      return <div key={lineIdx} style={{ height: '8px' }} />;
    }

    // Regular line
    return (
      <div key={lineIdx} style={{ margin: '2px 0' }}>
        {formatSpans(line)}
      </div>
    );
  });
}

// Parses inline bold (**text**), inline code (`code`), and links ([text](url))
function formatSpans(raw: string): React.ReactNode {
  // Regex splitting by inline code, bold, links
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = raw.split(tokenRegex);

  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      const codeSnippet = part.slice(1, -1);
      return (
        <code
          key={idx}
          style={{
            background: 'rgba(0, 229, 255, 0.1)',
            border: '1px solid rgba(0, 229, 255, 0.25)',
            color: '#00e5ff',
            padding: '1px 6px',
            borderRadius: '4px',
            fontSize: '0.85em',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {codeSnippet}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} style={{ fontWeight: 600, color: '#fff' }}>
          {part.slice(2, -2)}
        </strong>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noreferrer"
          style={{ color: '#00e5ff', textDecoration: 'underline' }}
        >
          {linkMatch[1]}
        </a>
      );
    }

    return part;
  });
}
