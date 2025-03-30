import { Box } from '@rocket.chat/fuselage';
import { css } from '@rocket.chat/css-in-js';
import type { ReactElement, RefObject } from 'react';
import { forwardRef, useRef, useEffect, useCallback } from 'react';

const contentEditableStyle = css`
  min-height: 36px;
  max-height: 150px;
  width: 100%;
  outline: none;
  padding: 8px 12px;
  margin-bottom: 8px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
  border-bottom: 1px solid var(--color-border-light);
  
  &:empty:before {
    content: attr(data-placeholder);
    color: var(--color-text-hint);
    pointer-events: none;
  }
`;

type ContentEditableDivProps = {
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  'aria-label'?: string;
};

const ContentEditableDiv = forwardRef<HTMLDivElement, ContentEditableDivProps>(
  function ContentEditableDiv({ value = '', placeholder = '', disabled = false, onChange, onKeyDown, ...props }, ref) {
    const internalRef = useRef<HTMLDivElement>(null);
    const divRef = (ref || internalRef) as RefObject<HTMLDivElement>;

    // Handle content changes
    const handleInput = useCallback(() => {
      if (divRef.current && onChange) {
        onChange(divRef.current.innerText);
      }
    }, [divRef, onChange]);

    // Handle keyboard events
    useEffect(() => {
      const div = divRef.current;
      if (!div || !onKeyDown) return;

      const keyDownHandler = (e: KeyboardEvent) => {
        onKeyDown(e);
      };

      div.addEventListener('keydown', keyDownHandler);
      return () => {
        div.removeEventListener('keydown', keyDownHandler);
      };
    }, [divRef, onKeyDown]);

    // Sync content from value prop
    useEffect(() => {
      const div = divRef.current;
      if (!div) return;
      
      // Only update if the displayed value is different from the prop value
      if (div.innerText !== value) {
        div.innerText = value;
      }
    }, [value, divRef]);

    return (
      <Box is="div"
        className={contentEditableStyle}
        contentEditable={!disabled}
        suppressContentEditableWarning={true}
        data-placeholder={placeholder}
        onInput={handleInput}
        ref={divRef}
        aria-label={props['aria-label'] || placeholder}
        role="textbox"
        aria-multiline="true"
        {...props}
      />
    );
  }
);

export default ContentEditableDiv; 