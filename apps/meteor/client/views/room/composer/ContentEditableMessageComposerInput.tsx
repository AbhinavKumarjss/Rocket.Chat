import { css } from '@rocket.chat/css-in-js';
import { Box, Palette } from '@rocket.chat/fuselage';
import type { ComponentProps, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { forwardRef, useRef, useEffect, useCallback } from 'react';

const contentEditableMessageComposerStyle = css`
	min-height: 41px;
	max-height: 155px;
	padding: 12px;
	margin-bottom: 16px;
	width: 100%;
	outline: none;
	border-width: 0;
	overflow-y: auto;
	white-space: pre-wrap;
	word-wrap: break-word;
	font-size: 0.875rem;
	line-height: 1.25rem;
	font-weight: 400;
    cursor: text;
	color: ${Palette.text['font-default']};

	&::placeholder {
		color: ${Palette.text['font-annotation']};
	}

	&:empty:before {
		content: attr(data-placeholder);
		color: ${Palette.text['font-annotation']};
		pointer-events: none;
	}
`;

type ContentEditableMessageComposerInputProps = Omit<ComponentProps<typeof Box>, 'onChange'> & {
	value?: string;
	placeholder?: string;
	onChange?: (event: React.FormEvent<HTMLDivElement>) => void;
	onKeyDown?: (event: KeyboardEvent) => void;
};

const ContentEditableMessageComposerInput = forwardRef<HTMLDivElement, ContentEditableMessageComposerInputProps>(
	function ContentEditableMessageComposerInput({ value = '', placeholder = '', onChange, onKeyDown, disabled, ...props }, ref) {
		const internalRef = useRef<HTMLDivElement>(null);
		const divRef = (ref || internalRef) as React.RefObject<HTMLDivElement>;

		// Handle content changes
		const handleInput = useCallback(
			(e: React.FormEvent<HTMLDivElement>) => {
				if (onChange) {
					onChange(e);
				}
			},
			[onChange],
		);

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

		const handleReactKeyDown = useCallback(
			(e: ReactKeyboardEvent<HTMLDivElement>) => {
				// Prevent default behavior for Enter key to stop new lines (handled by KeyboardEvent listener)
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
				}
			},
			[],
		);

		return (
			<Box is='label' width='full' fontSize={0}>
				<Box
					is='div'
					className={[contentEditableMessageComposerStyle, 'rc-message-box__textarea js-input-message']}
					contentEditable={!disabled}
					suppressContentEditableWarning={true}
					data-placeholder={placeholder}
					onInput={handleInput}
					onKeyDown={handleReactKeyDown}
					ref={divRef}
					aria-label={placeholder}
					role='textbox'
					aria-multiline='true'
					{...props}
				/>
			</Box>
		);
	},
);

export default ContentEditableMessageComposerInput; 