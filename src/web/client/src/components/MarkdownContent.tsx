import { useRef, useEffect } from 'react';
import { marked } from 'marked';
import hljs from 'highlight.js';

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && content) {
      ref.current.innerHTML = marked.parse(content) as string;
      ref.current.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block as HTMLElement);
      });
    }
  }, [content]);

  return <div ref={ref} className="message-content" />;
}
