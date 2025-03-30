import type { IMessage } from '@rocket.chat/core-typings';
import { Emitter } from '@rocket.chat/emitter';
import { Accounts } from 'meteor/accounts-base';
import { Tracker } from 'meteor/tracker';

import type { FormattingButton } from '../../../../app/ui-message/client/messageBox/messageBoxFormatting';
import { formattingButtons } from '../../../../app/ui-message/client/messageBox/messageBoxFormatting';
import type { ComposerAPI } from '../../../lib/chats/ChatAPI';
import { withDebouncing } from '../../../../lib/utils/highOrderFunctions';

export const createContentEditableComposerAPI = (divElement: HTMLDivElement, storageID: string): ComposerAPI => {
    const triggerEvent = (element: HTMLDivElement, evt: string): void => {
        const event = new Event(evt, { bubbles: true });
        element.dispatchEvent(event);
    };

    const emitter = new Emitter<{
        quotedMessagesUpdate: void;
        editing: void;
        recording: void;
        recordingVideo: void;
        formatting: void;
        mircophoneDenied: void;
    }>();

    let _quotedMessages: IMessage[] = [];

    const persist = withDebouncing({ wait: 300 })(() => {
        if (divElement.innerText) {
            Accounts.storageLocation.setItem(storageID, divElement.innerText);
            return;
        }

        Accounts.storageLocation.removeItem(storageID);
    });

    const notifyQuotedMessagesUpdate = (): void => {
        emitter.emit('quotedMessagesUpdate');
    };

    divElement.addEventListener('input', persist);

    // Helper function to get selection from content-editable div
    const getSelection = (): { start: number; end: number } => {
        const selection = window.getSelection();
        
        if (!selection || !selection.rangeCount) {
            return { start: 0, end: 0 };
        }

        const range = selection.getRangeAt(0);
        
        if (!divElement.contains(range.commonAncestorContainer)) {
            return { start: 0, end: 0 };
        }

        return {
            start: range.startOffset,
            end: range.endOffset
        };
    };

    // Helper function to set selection in content-editable div
    const setSelection = (start: number, end: number): void => {
        const selection = window.getSelection();
        if (!selection) return;

        const range = document.createRange();
        
        try {
            if (divElement.childNodes.length > 0) {
                const textNode = divElement.childNodes[0]; // Assuming text is in the first child node
                const nodeLength = textNode.textContent?.length || 0;
                
                range.setStart(textNode, Math.min(start, nodeLength));
                range.setEnd(textNode, Math.min(end, nodeLength));
            } else {
                range.setStart(divElement, 0);
                range.setEnd(divElement, 0);
            }
            
            selection.removeAllRanges();
            selection.addRange(range);
        } catch (e) {
            console.error('Error setting selection in content-editable div', e);
        }
    };

    const setText = (
        text: string,
        {
            selection,
            skipFocus,
        }: {
            selection?:
                | { readonly start?: number; readonly end?: number }
                | ((previous: { readonly start: number; readonly end: number }) => { readonly start?: number; readonly end?: number });
            skipFocus?: boolean;
        } = {},
    ): void => {
        !skipFocus && focus();

        const currentSelection = getSelection();
        const oldText = divElement.innerText;

        if (typeof selection === 'function') {
            selection = selection({ start: currentSelection.start, end: currentSelection.end });
        }

        if (selection) {
            try {
                const before = oldText.substring(0, currentSelection.start);
                const after = oldText.substring(currentSelection.end);
                divElement.innerText = before + text + after;
                
                !skipFocus && focus();
                setSelection(
                    selection.start ?? currentSelection.start, 
                    selection.end ?? currentSelection.start + text.length
                );
            } catch (e) {
                // Fallback if the above method fails
                divElement.innerText = text;
                !skipFocus && focus();
            }
        } else {
            divElement.innerText = text;
            !skipFocus && focus();
        }

        triggerEvent(divElement, 'input');

        !skipFocus && focus();
    };

    const insertText = (text: string): void => {
        setText(text, {
            selection: ({ start, end }) => ({
                start: start + text.length,
                end: end + text.length,
            }),
        });
    };

    const clear = (): void => {
        setText('');
    };

    const focus = (): void => {
        divElement.focus();
    };

    const blur = (): void => {
        divElement.blur();
    };

    const insertNewLine = (): void => {
        const sel = getSelection();
        const text = divElement.innerText;
        const before = text.substring(0, sel.start);
        const after = text.substring(sel.end);
        
        divElement.innerText = before + '\n' + after;
        
        // Place cursor after the newline
        setSelection(sel.start + 1, sel.start + 1);
        
        triggerEvent(divElement, 'input');
    };

    const wrapSelection = (pattern: string): void => {
        const sel = getSelection();
        if (sel.start === sel.end) return; // No selection to wrap
        
        const text = divElement.innerText;
        const selectedText = text.substring(sel.start, sel.end);
        
        // Find the parts to apply pattern to in the selected text
        const parts = pattern.split('{}');
        if (parts.length !== 2) return; // Invalid pattern
        
        const wrapped = parts[0] + selectedText + parts[1];
        setText(wrapped, {
            selection: () => ({
                start: sel.start,
                end: sel.start + wrapped.length
            })
        });
    };

    const replyWith = async (text: string): Promise<void> => {
        divElement.innerText = text;
        focus();
    };

    const quoteMessage = async (message: IMessage): Promise<void> => {
        _quotedMessages = [..._quotedMessages.filter((_message) => _message._id !== message._id), message];
        notifyQuotedMessagesUpdate();
        focus();
    };

    const dismissQuotedMessage = async (mid: IMessage['_id']): Promise<void> => {
        _quotedMessages = _quotedMessages.filter((message) => message._id !== mid);
        notifyQuotedMessagesUpdate();
    };

    const dismissAllQuotedMessages = async (): Promise<void> => {
        _quotedMessages = [];
        notifyQuotedMessagesUpdate();
    };

    const quotedMessages = {
        get: () => _quotedMessages,
        subscribe: (callback: () => void) => emitter.on('quotedMessagesUpdate', callback),
    };

    const [editing, setEditing] = (() => {
        let editing = false;

        return [
            {
                get: () => editing,
                subscribe: (callback: () => void) => emitter.on('editing', callback),
            },
            (value: boolean) => {
                editing = value;
                emitter.emit('editing');
            },
        ];
    })();

    const [recording, setRecordingMode] = (() => {
        let recording = false;

        return [
            {
                get: () => recording,
                subscribe: (callback: () => void) => emitter.on('recording', callback),
            },
            (value: boolean) => {
                recording = value;
                emitter.emit('recording');
            },
        ];
    })();

    const [recordingVideo, setRecordingVideo] = (() => {
        let recordingVideo = false;

        return [
            {
                get: () => recordingVideo,
                subscribe: (callback: () => void) => emitter.on('recordingVideo', callback),
            },
            (value: boolean) => {
                recordingVideo = value;
                emitter.emit('recordingVideo');
            },
        ];
    })();

    const [isMicrophoneDenied, setIsMicrophoneDenied] = (() => {
        let isMicrophoneDenied = false;

        return [
            {
                get: () => isMicrophoneDenied,
                subscribe: (callback: () => void) => emitter.on('mircophoneDenied', callback),
            },
            (value: boolean) => {
                isMicrophoneDenied = value;
                emitter.emit('mircophoneDenied');
            },
        ];
    })();

    const setEditingMode = (editing: boolean): void => {
        setEditing(editing);
    };

    const [formatters, stopFormatterTracker] = (() => {
        let actions: FormattingButton[] = [];

        const c = Tracker.autorun(() => {
            actions = formattingButtons.filter(({ condition }) => !condition || condition());
            emitter.emit('formatting');
        });

        return [
            {
                get: () => actions,
                subscribe: (callback: () => void) => emitter.on('formatting', callback),
            },
            c,
        ];
    })();

    const release = (): void => {
        divElement.removeEventListener('input', persist);
        stopFormatterTracker.stop();
    };

    // Replace text at cursor
    const replaceText = (text: string, selection: { readonly start: number; readonly end: number }): void => {
        const currentSelection = getSelection();
        
        // Set selection to provided range
        setSelection(selection.start, selection.end);
        
        // Insert the text
        const oldText = divElement.innerText;
        const before = oldText.substring(0, selection.start);
        const after = oldText.substring(selection.end);
        divElement.innerText = before + text + after;
        
        // Set cursor position
        if (currentSelection.start !== currentSelection.end) {
            setSelection(currentSelection.start, currentSelection.start + text.length);
        } else {
            setSelection(selection.start + text.length, selection.start + text.length);
        }
        
        triggerEvent(divElement, 'input');
        focus();
    };

    return {
        replaceText,
        insertNewLine,
        blur,
        substring: (start: number, end?: number) => {
            return divElement.innerText.substring(start, end);
        },
        getCursorPosition: () => {
            return getSelection().start;
        },
        setCursorToEnd: () => {
            const textLength = divElement.innerText.length;
            setSelection(textLength, textLength);
            focus();
        },
        setCursorToStart: () => {
            setSelection(0, 0);
            focus();
        },
        release,
        wrapSelection,
        get text(): string {
            return divElement.innerText;
        },
        get selection(): { start: number; end: number } {
            return getSelection();
        },
        editing,
        setEditingMode,
        recording,
        setRecordingMode,
        recordingVideo,
        setRecordingVideo,
        insertText,
        setText,
        clear,
        focus,
        replyWith,
        quoteMessage,
        dismissQuotedMessage,
        dismissAllQuotedMessages,
        quotedMessages,
        formatters,
        isMicrophoneDenied,
        setIsMicrophoneDenied,
    };
}; 