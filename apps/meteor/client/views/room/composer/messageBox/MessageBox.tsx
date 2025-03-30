/* eslint-disable complexity */
import type { IMessage, ISubscription } from '@rocket.chat/core-typings';
import { useContentBoxSize, useEffectEvent } from '@rocket.chat/fuselage-hooks';
import {
	MessageComposerAction,
	MessageComposerToolbarActions,
	MessageComposer,
	MessageComposerToolbar,
	MessageComposerActionsDivider,
	MessageComposerToolbarSubmit,
	MessageComposerButton,
} from '@rocket.chat/ui-composer';
import { useTranslation, useUserPreference, useLayout, useSetting } from '@rocket.chat/ui-contexts';
import { useMutation } from '@tanstack/react-query';
import type { ReactElement, FormEvent, MouseEvent, ClipboardEvent } from 'react';
import { memo, useRef, useReducer, useCallback, useSyncExternalStore, useState } from 'react';

import MessageBoxActionsToolbar from './MessageBoxActionsToolbar';
import MessageBoxFormattingToolbar from './MessageBoxFormattingToolbar';
import MessageBoxHint from './MessageBoxHint';
import MessageBoxReplies from './MessageBoxReplies';
import { createComposerAPI } from '../../../../../app/ui-message/client/messageBox/createComposerAPI';
import type { FormattingButton } from '../../../../../app/ui-message/client/messageBox/messageBoxFormatting';
import { formattingButtons } from '../../../../../app/ui-message/client/messageBox/messageBoxFormatting';
import { getImageExtensionFromMime } from '../../../../../lib/getImageExtensionFromMime';
import { useFormatDateAndTime } from '../../../../hooks/useFormatDateAndTime';
import { useReactiveValue } from '../../../../hooks/useReactiveValue';
import type { ComposerAPI } from '../../../../lib/chats/ChatAPI';
import { roomCoordinator } from '../../../../lib/rooms/roomCoordinator';
import { keyCodes } from '../../../../lib/utils/keyCodes';
import AudioMessageRecorder from '../../../composer/AudioMessageRecorder';
import VideoMessageRecorder from '../../../composer/VideoMessageRecorder';
import { useChat } from '../../contexts/ChatContext';
import { useComposerPopupOptions } from '../../contexts/ComposerPopupContext';
import { useRoom } from '../../contexts/RoomContext';
import ComposerBoxPopup from '../ComposerBoxPopup';
import ComposerBoxPopupPreview from '../ComposerBoxPopupPreview';
import ComposerUserActionIndicator from '../ComposerUserActionIndicator';
import { useAutoGrow } from '../RoomComposer/hooks/useAutoGrow';
import { useComposerBoxPopup } from '../hooks/useComposerBoxPopup';
import { useEnablePopupPreview } from '../hooks/useEnablePopupPreview';
import { useMessageComposerMergedRefs } from '../hooks/useMessageComposerMergedRefs';
import { useMessageBoxAutoFocus } from './hooks/useMessageBoxAutoFocus';
import { useMessageBoxPlaceholder } from './hooks/useMessageBoxPlaceholder';
import { useSafeRefCallback } from '../../../../hooks/useSafeRefCallback';
import ContentEditableMessageComposerInput from '../ContentEditableMessageComposerInput';
import { createContentEditableComposerAPI } from '../ContentEditableComposerAPI';

const reducer = (_: unknown, event: FormEvent<HTMLElement>): boolean => {
	const target = event.target as HTMLElement;
	// For contentEditable, we get the innerText
	return Boolean((target.innerText || '').trim());
};

const handleFormattingShortcut = (event: KeyboardEvent, formattingButtons: FormattingButton[], composer: ComposerAPI) => {
	const isMacOS = navigator.platform.indexOf('Mac') !== -1;
	const isCmdOrCtrlPressed = (isMacOS && event.metaKey) || (!isMacOS && event.ctrlKey);

	if (!isCmdOrCtrlPressed) {
		return false;
	}

	const key = event.key.toLowerCase();

	const formatter = formattingButtons.find((formatter) => 'command' in formatter && formatter.command === key);

	if (!formatter || !('pattern' in formatter)) {
		return false;
	}

	composer.wrapSelection(formatter.pattern);
	return true;
};

const emptySubscribe = () => () => undefined;
const getEmptyFalse = () => false;
const a: any[] = [];
const getEmptyArray = () => a;

type MessageBoxProps = {
	tmid?: IMessage['_id'];
	onSend?: (params: { value: string; tshow?: boolean; previewUrls?: string[]; isSlashCommandAllowed?: boolean }) => Promise<void>;
	onJoin?: () => Promise<void>;
	onResize?: () => void;
	onTyping?: () => void;
	onEscape?: () => void;
	onNavigateToPreviousMessage?: () => void;
	onNavigateToNextMessage?: () => void;
	onUploadFiles?: (files: readonly File[]) => void;
	tshow?: IMessage['tshow'];
	previewUrls?: string[];
	subscription?: ISubscription;
	showFormattingTips: boolean;
	isEmbedded?: boolean;
};

const MessageBox = ({
	tmid,
	onSend,
	onJoin,
	onNavigateToNextMessage,
	onNavigateToPreviousMessage,
	onUploadFiles,
	onEscape,
	onTyping,
	tshow,
	previewUrls,
}: MessageBoxProps): ReactElement => {
	const chat = useChat();
	const room = useRoom();
	const t = useTranslation();
	const e2eEnabled = useSetting('E2E_Enable', false);
	const unencryptedMessagesAllowed = useSetting('E2E_Allow_Unencrypted_Messages', false);
	const isSlashCommandAllowed = !e2eEnabled || !room.encrypted || unencryptedMessagesAllowed;
	const composerPlaceholder = useMessageBoxPlaceholder(t('Message'), room);

	const [typing, setTyping] = useReducer(reducer, false);
	const [composerValue, setComposerValue] = useState('');
	
	const { isMobile } = useLayout();
	const sendOnEnterBehavior = useUserPreference<'normal' | 'alternative' | 'desktop'>('sendOnEnter') || isMobile;
	const sendOnEnter = sendOnEnterBehavior == null || sendOnEnterBehavior === 'normal' || (sendOnEnterBehavior === 'desktop' && !isMobile);

	if (!chat) {
		throw new Error('Chat context not found');
	}

	const composerRef = useRef<HTMLDivElement>(null);
	const messageComposerRef = useRef<HTMLElement>(null);
	const shadowRef = useRef<HTMLDivElement>(null);

	const storageID = `messagebox_${room._id}${tmid ? `-${tmid}` : ''}`;

	const callbackRef = useCallback(
		(node: HTMLDivElement) => {
			if (node === null && chat.composer) {
				return chat.setComposerAPI();
			}

			if (chat.composer) {
				return;
			}
			chat.setComposerAPI(createContentEditableComposerAPI(node, storageID));
		},
		[chat, storageID],
	);

	const autofocusRef = useMessageBoxAutoFocus(!isMobile);

	const useEmojis = useUserPreference<boolean>('useEmojis');

	const handleOpenEmojiPicker = useEffectEvent((e: MouseEvent<HTMLElement>) => {
		e.stopPropagation();
		e.preventDefault();

		if (!useEmojis) {
			return;
		}

		const ref = messageComposerRef.current as HTMLElement;
		chat.emojiPicker.open(ref, (emoji: string) => chat.composer?.insertText(` :${emoji}: `));
	});

	const handleSendMessage = useEffectEvent(() => {
		const text = chat.composer?.text ?? '';
		chat.composer?.clear();
		popup.clear();
		
		setComposerValue('');

		onSend?.({
			value: text,
			tshow,
			previewUrls,
			isSlashCommandAllowed,
		});
	});

	// Handle input change
	const handleComposerChange = useCallback((event: FormEvent<HTMLDivElement>) => {
		const element = event.target as HTMLDivElement;
		setComposerValue(element.innerText || '');
		setTyping(event);
	}, []);

	// Handle key down events directly on the content-editable div
	const handleComposerKeyDown = useCallback((event: KeyboardEvent) => {
		const { which: keyCode } = event;

		const isSubmitKey = keyCode === keyCodes.CARRIAGE_RETURN || keyCode === keyCodes.NEW_LINE;

		if (isSubmitKey) {
			const withModifier = event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;
			const isSending = (sendOnEnter && !withModifier) || (!sendOnEnter && withModifier);

			if (isSending && composerValue.trim()) {
				event.preventDefault();
				handleSendMessage();
				return;
			}
			
			if (!isSending) {
				// Insert a new line
				chat.composer?.insertNewLine();
				return;
			}
		}
		
		if (chat.composer && handleFormattingShortcut(event, [...formattingButtons], chat.composer)) {
			return;
		}
		
		if (event.shiftKey || event.ctrlKey || event.metaKey) {
			return;
		}
		
		switch (event.key) {
			case 'Escape': {
				const target = event.target as HTMLElement;
				if (chat.currentEditing) {
					event.preventDefault();
					event.stopPropagation();
					
					chat.currentEditing.reset().then((reset) => {
						if (!reset) {
							chat.currentEditing?.cancel();
						}
					});
				}
				if (!target.innerText.trim()) onEscape?.();
				return;
			}
			
			case 'ArrowUp': {
				const target = event.target as HTMLElement;
				if (target.innerText.length === 0 || window.getSelection()?.anchorOffset === 0) {
					event.preventDefault();
					event.stopPropagation();
					
					onNavigateToPreviousMessage?.();
					
					if (event.altKey) {
						chat.composer?.setCursorToStart();
					}
				}
				return;
			}
			
			case 'ArrowDown': {
				const target = event.target as HTMLElement;
				const textLength = target.innerText.length;
				if (textLength === 0 || window.getSelection()?.anchorOffset === textLength) {
					event.preventDefault();
					event.stopPropagation();
					
					onNavigateToNextMessage?.();
					
					if (event.altKey) {
						chat.composer?.setCursorToEnd();
					}
				}
				return;
			}
		}
		
		onTyping?.();
	}, [composerValue, sendOnEnter, chat?.composer, chat?.currentEditing, chat?.messageEditing, handleSendMessage, onEscape, onNavigateToNextMessage, onNavigateToPreviousMessage, onTyping]);

	const closeEditing = (event: KeyboardEvent | MouseEvent<HTMLElement>) => {
		if (chat.currentEditing) {
			event.preventDefault();
			event.stopPropagation();

			chat.currentEditing.reset().then((reset) => {
				if (!reset) {
					chat.currentEditing?.cancel();
				}
			});
		}
	};

	const keyboardEventHandler = useEffectEvent((event: KeyboardEvent) => {
		handleComposerKeyDown(event);
	});

	const isEditing = useSyncExternalStore(chat.composer?.editing.subscribe ?? emptySubscribe, chat.composer?.editing.get ?? getEmptyFalse);

	const isRecordingAudio = useSyncExternalStore(
		chat.composer?.recording.subscribe ?? emptySubscribe,
		chat.composer?.recording.get ?? getEmptyFalse,
	);

	const isMicrophoneDenied = useSyncExternalStore(
		chat.composer?.isMicrophoneDenied.subscribe ?? emptySubscribe,
		chat.composer?.isMicrophoneDenied.get ?? getEmptyFalse,
	);

	const isRecordingVideo = useSyncExternalStore(
		chat.composer?.recordingVideo.subscribe ?? emptySubscribe,
		chat.composer?.recordingVideo.get ?? getEmptyFalse,
	);

	const formatters = useSyncExternalStore(
		chat.composer?.formatters.subscribe ?? emptySubscribe,
		chat.composer?.formatters.get ?? getEmptyArray,
	);

	const isRecording = isRecordingAudio || isRecordingVideo;

	// Not using useAutoGrow for contentEditable
	const textAreaStyle = {};

	const canSend = useReactiveValue(useCallback(() => roomCoordinator.verifyCanSendMessage(room._id), [room._id]));

	const sizes = useContentBoxSize(composerRef);

	const format = useFormatDateAndTime();

	const joinMutation = useMutation({
		mutationFn: async () => onJoin?.(),
	});

	const handlePaste = useEffectEvent((event: ClipboardEvent<HTMLDivElement>) => {
		const { clipboardData } = event;

		if (!clipboardData) {
			return;
		}

		const items = Array.from(clipboardData.items);

		if (items.some(({ kind, type }) => kind === 'string' && type === 'text/plain')) {
			return;
		}

		const files = items
			.filter((item) => item.kind === 'file' && item.type.indexOf('image/') !== -1)
			.map((item) => {
				const fileItem = item.getAsFile();

				if (!fileItem) {
					return;
				}

				const imageExtension = fileItem ? getImageExtensionFromMime(fileItem.type) : undefined;

				const extension = imageExtension ? `.${imageExtension}` : '';

				Object.defineProperty(fileItem, 'name', {
					writable: true,
					value: `Clipboard - ${format(new Date())}${extension}`,
				});
				return fileItem;
			})
			.filter((file): file is File => !!file);

		if (files.length) {
			event.preventDefault();
			onUploadFiles?.(files);
		}
	});

	const popupOptions = useComposerPopupOptions();
	const popup = useComposerBoxPopup(popupOptions);

	const keyDownHandlerCallbackRef = useSafeRefCallback(
		useCallback(
			(node: HTMLDivElement) => {
				if (node === null) {
					return;
				}
				const eventHandler = (e: KeyboardEvent) => keyboardEventHandler(e);
				node.addEventListener('keydown', eventHandler);

				return () => {
					node.removeEventListener('keydown', eventHandler);
				};
			},
			[keyboardEventHandler],
		),
	);

	const mergedRefs = useMessageComposerMergedRefs(popup.callbackRef, composerRef, callbackRef, autofocusRef, keyDownHandlerCallbackRef);

	const shouldPopupPreview = useEnablePopupPreview(popup.filter, popup.option);

	return (
		<>
			{chat.composer?.quotedMessages && <MessageBoxReplies />}
			{shouldPopupPreview && popup.option && (
				<ComposerBoxPopup
					select={popup.select}
					items={popup.items}
					focused={popup.focused}
					title={popup.option.title}
					renderItem={popup.option.renderItem}
				/>
			)}
			{popup.option?.preview && (
				<ComposerBoxPopupPreview
					select={popup.select}
					items={popup.items as any}
					focused={popup.focused as any}
					title={popup.option.title}
					renderItem={popup.option.renderItem}
					ref={popup.commandsRef}
					rid={room._id}
					tmid={tmid}
					suspended={popup.suspended}
				/>
			)}
			<MessageBoxHint
				isEditing={isEditing}
				e2eEnabled={e2eEnabled}
				unencryptedMessagesAllowed={unencryptedMessagesAllowed}
				isMobile={isMobile}
			/>
			{isRecordingVideo && <VideoMessageRecorder reference={messageComposerRef} rid={room._id} tmid={tmid} />}
			<MessageComposer ref={messageComposerRef} variant={isEditing ? 'editing' : undefined}>
				{isRecordingAudio && <AudioMessageRecorder rid={room._id} isMicrophoneDenied={isMicrophoneDenied} />}
				<ContentEditableMessageComposerInput
					ref={mergedRefs}
					aria-label={composerPlaceholder}
					value={composerValue}
					placeholder={composerPlaceholder}
					disabled={isRecording || !canSend}
					onChange={handleComposerChange}
					onKeyDown={handleComposerKeyDown}
					onPaste={handlePaste}
					aria-activedescendant={popup.focused ? `popup-item-${popup.focused._id}` : undefined}
					style={textAreaStyle}
				/>
				<div ref={shadowRef} style={{}} />
				<MessageComposerToolbar>
					<MessageComposerToolbarActions aria-label={t('Message_composer_toolbox_primary_actions')}>
						<MessageComposerAction
							icon='emoji'
							disabled={!useEmojis || isRecording || !canSend}
							onClick={handleOpenEmojiPicker}
							title={t('Emoji')}
						/>
						<MessageComposerActionsDivider />
						{chat.composer && formatters.length > 0 && (
							<MessageBoxFormattingToolbar
								composer={chat.composer}
								variant={sizes.inlineSize < 480 ? 'small' : 'large'}
								items={formatters}
								disabled={isRecording || !canSend}
							/>
						)}
						<MessageBoxActionsToolbar
							canSend={canSend}
							typing={typing}
							isMicrophoneDenied={isMicrophoneDenied}
							rid={room._id}
							tmid={tmid}
							isRecording={isRecording}
							variant={sizes.inlineSize < 480 ? 'small' : 'large'}
						/>
					</MessageComposerToolbarActions>
					<MessageComposerToolbarSubmit>
						{!canSend && (
							<MessageComposerButton primary onClick={onJoin} loading={joinMutation.isPending}>
								{t('Join')}
							</MessageComposerButton>
						)}
						{canSend && (
							<>
								{isEditing && <MessageComposerButton onClick={closeEditing}>{t('Cancel')}</MessageComposerButton>}
								<MessageComposerAction
									aria-label={t('Send')}
									icon='send'
									disabled={!canSend || (!typing && !isEditing)}
									onClick={handleSendMessage}
									secondary={typing || isEditing}
									info={typing || isEditing}
								/>
							</>
						)}
					</MessageComposerToolbarSubmit>
				</MessageComposerToolbar>
			</MessageComposer>
			<ComposerUserActionIndicator rid={room._id} tmid={tmid} />
		</>
	);
};

export default memo(MessageBox);
