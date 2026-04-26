import { AfterViewChecked, AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, inject, Input, OnDestroy, OnInit, Output, ViewChild, } from '@angular/core';
import { NavigationService } from '../../../../utils/services/navigation.service';
import { IReactions, Message, StoredAttachment } from '../../../../shared/models/message.class';
import { MessageService } from '../../../../utils/services/message.service';
import { UsersService } from '../../../../utils/services/user.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AvatarDirective } from '../../../../utils/directives/avatar.directive';
import { User } from '../../../../shared/models/user.class';
import { MessageEditorComponent } from '../../../message-editor/message-editor.component';
import { ChannelService } from '../../../../utils/services/channel.service';
import { Channel } from '../../../../shared/models/channel.class';
import { EmojipickerService } from '../../../../utils/services/emojipicker.service';
import { EmojiModule } from '@ctrl/ngx-emoji-mart/ngx-emoji';
import { EditedTextLength, isEmptyMessage } from '../../../../utils/quil/utility';

@Component({
  selector: 'app-message',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AvatarDirective,
    MessageEditorComponent,
    EmojiModule,
  ],
  templateUrl: './message.component.html',
  styleUrl: './message.component.scss',
})
export class MessageComponent implements OnDestroy, AfterViewInit, AfterViewChecked {

  private viewObserver!: IntersectionObserver;

  @ViewChild('messagemaindiv', { static: false }) messageMainDiv!: ElementRef;
  @ViewChild('messagediv', { static: false }) messageDiv!: ElementRef;
  @ViewChild('messageeditor', { static: false }) messageEditor!: MessageEditorComponent;

  public userService = inject(UsersService);
  public navigationService = inject(NavigationService);
  public messageService = inject(MessageService);
  public channelService = inject(ChannelService);
  public emojiService = inject(EmojipickerService);
  private resizeobserver!: ResizeObserver;
  public showSmallButtons = false;
  public showBigButtons = false;
  public showMostUsedEmojisCount = 3;

  public textLengthInfo: string = '0/0';
  public showTextLength: boolean = false;

  public _messageData!: Message;
  @Input() set messageData(newMessage: Message) {
    this._messageData = newMessage;
    this.initMessageChangeSubscription();
    if (this._messageData.answerCount > 0) this.channelService.calculateUnreadMessagesCount(this._messageData);
    this.messagefromUser = newMessage.creatorID === this.userService.currentUserID;
    this.fillMessageContentHTML();
  }

  @Input() isThreadView = false;
  @Input() isUnread = true;
  @Input() messageEditorOpen = false;
  @Input() previousMessageFromSameUser = false;

  @Output() messageEditorOpenChange = new EventEmitter<boolean>();
  @Output() messageViewed = new EventEmitter<Message>();

  public messagefromUser = false;
  public messageCreator: User | undefined;
  private messageChangeSubscription: any;
  public _isHovered = false;
  get isHovered() {
    return this._isHovered && this.isAttachmentsHovered.every((hovered) => !hovered);
  }
  public isAttachmentsHovered: boolean[] = [];
  public showEditMessagePopup = false;
  public messageEditorModus = false;
  private needContentUpdate = false;

  getMessageCreatorObject() {
    return this.userService.getUserByID(this._messageData.creatorID);
  }

  constructor(private _cdr: ChangeDetectorRef, private el: ElementRef) { }

  ngOnDestroy(): void {
    if (this.resizeobserver) this.resizeobserver.disconnect();
    if (this.viewObserver) this.viewObserver.disconnect();
    if (this.messageChangeSubscription) this.messageChangeSubscription.unsubscribe();
  }

  handleEditorTextLengthChanged(event: EditedTextLength) {
    this.textLengthInfo = `${event.textLength}/${event.maxLength}`;
    this.showTextLength = event.textLength > event.maxLength * 0.8;
    this._cdr.detectChanges();
  }

  ngAfterViewChecked(): void {
    if (this.messageDiv && this.needContentUpdate) {
      this.needContentUpdate = false;
      this.fillMessageContentHTML();
    }
  }

  ngAfterViewInit(): void {
    this.initMessageChangeSubscription();
    this.initResizeObserver();
    this.initViewOberserver();
  }

  /**
   * Initializes a ResizeObserver to monitor the width of the message element and update the UI accordingly.
   * 
   * The ResizeObserver is used to detect changes in the width of the message element. When the width changes,
   * the `handleEditorResize` and `handleMostUsedEmojisCountChange` methods are called to update the UI based on the new width.
   * 
   * The ResizeObserver is attached to the message element and the initial width is also used to call the `handleEditorResize` method.
   */
  initResizeObserver() {
    this.resizeobserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        if (this.messageEditorOpen) this.handleEditorResize(entry.contentRect.width);
        this.handleMostUsedEmojisCountChange(entry.contentRect.width);
      });
    });
    this.resizeobserver.observe(this.el.nativeElement);
    this.handleEditorResize(this.el.nativeElement.clientWidth);
  }

  /**
   * Initializes an IntersectionObserver to monitor the visibility of the message element.
   * 
   * If the message is unread, an IntersectionObserver is created to monitor the visibility of the message element.
   * When the message becomes visible in the viewport (with a threshold of 90%), the `messageViewed` event is emitted
   * and the observer is disconnected.
   * 
   * The observer is set up with a delay of 1 second to allow for any initial rendering to complete before
   * starting the observation.
   */
  initViewOberserver() {
    if (this.isUnread) {
      const options = { root: null, rootMargin: '0px', threshold: 0.9, };
      this.viewObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.messageViewed.emit(this._messageData);
            this.viewObserver.disconnect();
          }
        });
      }, options);
      setTimeout(() => {
        this.viewObserver.observe(this.el.nativeElement);
      }, 1000);
    }
  }

  /**
   * Initializes a subscription to the `changeMessage$` observable of the `_messageData` property.
   * 
   * When the `_messageData` object emits a change, this method updates the `isAttachmentsHovered` array,
   * calls the `fillMessageContentHTML` method to update the message content, and triggers change detection.
   * 
   * This method is called to set up the subscription when the component is initialized, and it also
   * unsubscribes from any previous subscription to avoid memory leaks.
   */
  initMessageChangeSubscription() {
    if (this.messageChangeSubscription) this.messageChangeSubscription.unsubscribe();
    this.messageChangeSubscription = this._messageData.changeMessage$.subscribe(() => {
      this.isAttachmentsHovered = new Array(this._messageData.attachments.length).fill(false);
      this.fillMessageContentHTML();
      this._cdr.detectChanges();
    });
  }

  /**
   * Handles the resizing of the editor based on the provided width.
   * 
   * This method is responsible for updating the visibility of the big and small buttons
   * based on the width of the editor. If the width is greater than 700, the big buttons
   * are shown and the small buttons are hidden. Otherwise, the small buttons are shown
   * and the big buttons are hidden.
   * 
   * @param width The current width of the editor.
   */
  handleEditorResize(width: number) {
    this.showBigButtons = width > 700;
    this.showSmallButtons = !this.showBigButtons;
  }

  /**
   * Handles the change in the number of most used emojis to display based on the width of the editor.
   * 
   * This method is responsible for updating the `showMostUsedEmojisCount` property based on the provided width.
   * The number of most used emojis to display is determined by the following rules:
   * - If the width is less than 550, show 0 most used emojis.
   * - If the width is between 550 and 700, show 2 most used emojis.
   * - If the width is between 700 and 850, show 3 most used emojis.
   * - If the width is greater than or equal to 850, show 4 most used emojis.
   * 
   * @param width The current width of the editor.
   */
  handleMostUsedEmojisCountChange(width: number) {
    if (width < 550) this.showMostUsedEmojisCount = 0;
    else if (width < 700) this.showMostUsedEmojisCount = 2;
    else if (width < 850) this.showMostUsedEmojisCount = 3;
    else this.showMostUsedEmojisCount = 4;
  }

  /**
   * Checks if the message content has any text content.
   *
   * This method returns `true` if the `content` property of the `_messageData` object
   * is not an empty string, and `false` otherwise.
   *
   * @returns `true` if the message has text content, `false` otherwise.
   */
  hasMessagetextContent() {
    return !isEmptyMessage(this._messageData.content);
  }

  /**
   * Checks if the current user has reacted to the given reaction.
   *
   * @param reaction - The reaction to check for the current user's reaction.
   * @returns `true` if the current user has reacted to the given reaction, `false` otherwise.
   */
  isReactionSelf(reaction: IReactions) {
    return reaction.userIDs.includes(this.userService.currentUserID);
  }

  /**
   * Gets a string representation of the users who have reacted to the given reaction.
   *
   * This method takes a `reaction` object and returns a string that describes the users who have reacted to the reaction.
   * The string will be formatted differently depending on whether the current user has reacted to the reaction or not.
   *
   * @param reaction - The reaction object to get the user information for.
   * @returns A string representing the users who have reacted to the given reaction.
   */
  getReactionUsers(reaction: IReactions): string {
    const currentUserReacted = reaction.userIDs.includes(this.userService.currentUserID);
    const otherUsers = reaction.userIDs.filter((id) => id !== this.userService.currentUserID)
      .map((id) => this.userService.getUserByID(id)?.name || 'Unbekannter Nutzer');
    if (currentUserReacted) {
      if (otherUsers.length === 1) {
        return `Du und ${otherUsers[0]}`;
      } else if (otherUsers.length > 1) {
        const lastUser = otherUsers.pop();
        return `Du, ${otherUsers.join(', ')} und ${lastUser}`;
      }
      return 'Du';
    } else {
      if (otherUsers.length > 1) {
        const lastUser = otherUsers.pop();
        return `${otherUsers.join(', ')} und ${lastUser}`;
      }
      return otherUsers[0];
    }
  }

  /**
   * Fills the message content HTML and calculates the message spans.
   *
   * This method is responsible for setting the HTML content of the message
   * element and then calculating the message spans, which are used to
   * highlight certain parts of the message (e.g. channel mentions, user
   * mentions).
   */
  fillMessageContentHTML() {
    if (this.messageDiv) {
      this.messageDiv.nativeElement.innerHTML = this._messageData.content;
      this.calculateMessageSpans();
    }
  }

  /**
   * Downloads an attachment by creating a temporary link element and clicking it.
   *
   * This method is used to initiate the download of an attachment. It creates a new
   * `<a>` element, sets its `href` to the attachment's URL and its `download`
   * attribute to the attachment's name, and then clicks the link to trigger the
   * download. The `target="_blank"` attribute is set to open the download in a
   * new tab.
   *
   * @param attachment - The `StoredAttachment` object containing the details of the
   * attachment to be downloaded.
   */
  downloadAttachment(attachment: StoredAttachment) {
    const link = document.createElement('a');
    link.href = attachment.url;
    link.download = attachment.name;
    link.target = '_blank'; // Open in a new tab
    link.click();
  }


  /**
   * Deletes a stored attachment from the message.
   *
   * This method is used to remove an attachment that was previously uploaded and
   * stored with the message. It calls the `deleteStoredAttachment` method on the
   * `messageService` to remove the attachment from the message data.
   *
   * @param attachment - The `StoredAttachment` object containing the details of the
   * attachment to be deleted.
   */
  deleteAttachment(attachment: StoredAttachment) {
    this.messageService.deleteStoredAttachment(this._messageData, attachment);
  }

  /**
   * Calculates the message spans for the message content.
   *
   * This method is responsible for iterating through all the `<span>` elements
   * within the message content and preparing them based on their CSS class.
   * Spans with a class ending in "channel" are prepared using the `prepareChannelSpan`
   * method, and spans with a class ending in "user" are prepared using the
   * `prepareUserSpan` method.
   */
  calculateMessageSpans() {
    const spans = this.messageDiv.nativeElement.querySelectorAll('span');
    spans.forEach((span: HTMLSpanElement) => {
      if (span.classList.length > 0) {
        if (span.classList[0].endsWith('channel'))
          this.prepareChannelSpan(span);
        else if (span.classList[0].endsWith('user')) this.prepareUserSpan(span);
      }
    });
  }

  /**
   * Prepares a channel span element within the message content.
   *
   * This method is responsible for adding the necessary CSS classes and event
   * listeners to a `<span>` element that represents a channel reference within
   * the message content. If the channel represented by the span is not the
   * current chat view object, the span is marked as a clickable item that can
   * be used to navigate to the corresponding channel.
   *
   * @param span - The `HTMLSpanElement` representing the channel reference.
   */
  prepareChannelSpan(span: HTMLSpanElement) {
    const spanChannel = this.getChannelOnlyWhenNotCurrent(span.id);
    if (spanChannel) {
      span.classList.add('highlight-item');
      span.classList.add('highlight-can-clicked');
      span.addEventListener('click', (event) => {
        event.stopPropagation();
        this.navigationService.setChatViewObject(spanChannel);
      });
    }
  }

  /**
   * Retrieves a channel object from the list of channels, but only if it is not the current chat view object.
   *
   * @param channelID - The ID of the channel to retrieve.
   * @returns The channel object if it exists and is not the current chat view object, otherwise `undefined`.
   */
  getChannelOnlyWhenNotCurrent(channelID: string): Channel | undefined {
    const channel = this.channelService.channels.find(
      (channel) => channel.id === channelID
    );
    if (channel && this.navigationService.chatViewObject !== channel)
      return channel;
    return undefined;
  }

  /**
   * Prepares a user span element within the message content.
   *
   * This method is responsible for adding the necessary CSS classes and event
   * listeners to a `<span>` element that represents a user reference within
   * the message content. The span is marked as a clickable item that can
   * be used to navigate to the corresponding user's profile.
   *
   * @param span - The `HTMLSpanElement` representing the user reference.
   */
  prepareUserSpan(span: HTMLSpanElement) {
    span.classList.add('highlight-item');
    span.classList.add('highlight-can-clicked');
    span.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setSelectedUserObject(span.id);
      this.navigationService.setProfileTarget(true);
      const popoverElement = document.getElementById(
        this.navigationService.returnPopoverTarget(span.id)
      );
      if (popoverElement) (popoverElement as any).showPopover();
    });
  }


  /**
   * Updates the content of a message and marks it as edited.
   *
   * This method retrieves the updated message content from the message editor,
   * checks if the content is not empty and has changed from the original message
   * content. If the conditions are met, it updates the message in the message
   * service with the new content, sets the `edited` flag to `true`, and updates
   * the `editedAt` timestamp.
   *
   * After the message has been updated, the method calls `closeMessageEditor()`
   * to close the message editor.
   */
  updateMessage() {
    const editorContent = this.messageEditor.getMessageAsHTML();
    if (
      !isEmptyMessage(editorContent) &&
      editorContent !== this._messageData.content
    ) {
      this.messageService.updateMessage(this._messageData, {
        content: editorContent,
      });
    }
    this.closeMessageEditor();
  }

  /**
   * Adds a reaction to the current message.
   *
   * This method first checks if the current user is verified. If so, it opens an emoji picker
   * and allows the user to select an emoji. Once an emoji is selected, the method calls the
   * `toggleReactionToMessage` method in the `messageService` to add the selected emoji as a
   * reaction to the current message.
   */
  async addReaction() {
    if (await this.userService.ifCurrentUserVerified()) {
      this.emojiService.showPicker((emoji: string) => {
        this.messageService.toggleReactionToMessage(this._messageData, emoji);
      });
    }
  }

  /**
   * Toggles a reaction to the current message.
   *
   * This method first checks if the current user is verified. If so, it adds or removes the specified
   * reaction type to/from the current message by calling the `toggleReactionToMessage` method in the
   * `messageService`.
   *
   * @param reactionType - The type of reaction to toggle (e.g. an emoji string).
   */
  async toggleReaction(reactionType: string) {
    if (await this.userService.ifCurrentUserVerified()) {
      this.messageService.toggleReactionToMessage(this._messageData, reactionType);
    }
  }

  /**
   * Closes the message editor and triggers a content update.
   *
   * This method is responsible for closing the message editor and ensuring that any changes made
   * to the message content are reflected in the UI. It does this by:
   *
   * 1. Calling `toggleMessageEditor()` to close the message editor.
   * 2. Setting `needContentUpdate` to `true` to indicate that the content needs to be updated.
   * 3. Calling `_cdr.detectChanges()` to trigger a change detection cycle and update the UI.
   */
  closeMessageEditor() {
    this.toggleMessageEditor();
    this.needContentUpdate = true;
    this._cdr.detectChanges();
  }

  /**
   * Formats a message time as a localized string with the format "HH:mm Uhr".
   *
   * @param messageTime - The date/time of the message to be formatted.
   * @returns The formatted message time as a string.
   */
  getFormatedMessageTime(messageTime: Date | undefined) {
    let formatedMessageTime = messageTime?.toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${formatedMessageTime} Uhr`;
  }

  /**
   * Formats the date or time of an answered message based on whether it was answered today or not.
   *
   * If the message was answered today, the time is returned in the format "HH:mm Uhr". Otherwise, the
   * date is returned in the format "dd.MM.yyyy".
   *
   * @param answerAt - The date/time when the message was answered.
   * @returns A formatted string representing the date or time of the answered message.
   */
  getLastAnsweredMessagedDateOrTime(answerAt: Date) {
    const now = new Date(); const isToday = answerAt.toDateString() === now.toDateString();
    if (isToday) {
      return answerAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
    } else {
      return answerAt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
  }

  /**
   * Toggles the visibility of the edit message popup.
   *
   * This method is responsible for toggling the `showEditMessagePopup` flag, which controls the
   * visibility of the edit message popup. When the flag is `true`, the popup is shown, and when
   * it is `false`, the popup is hidden.
   */
  toggleEditMessagePopup() {
    this.showEditMessagePopup = !this.showEditMessagePopup;
  }

  /**
   * Toggles the visibility of the message editor and emits an event to notify the parent component.
   *
   * When the message editor is toggled on, the method scrolls the message main div into view. When the
   * message editor is toggled off, the method hides the big and small buttons.
   */
  toggleMessageEditor() {
    this.toggleEditMessagePopup();
    this.messageEditorModus = !this.messageEditorModus;
    this.messageEditorOpenChange.emit(this.messageEditorModus);
    if (this.messageEditorModus) {
      setTimeout(() => {
        if (this.messageMainDiv) {
          this.messageMainDiv.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
    } else {
      this.showBigButtons = false;
      this.showSmallButtons = false;
    }
  }

  /**
   * Shows a user popover for the specified message creator.
   *
   * This method sets the selected user object by calling `updateSelectedUser` on the `userService`,
   * passing in the user object for the specified `messageCreatorID`. It then retrieves the popover
   * element using the `returnPopoverTarget` method of the `navigationService`, sets the
   * `profileTarget` flag to `true`, and shows the popover if the element is found.
   *
   * @param messageCreatorID - The ID of the message creator for whom to show the popover.
   */
  showUserPopover(messageCreatorID: string) {
    this.setSelectedUserObject(messageCreatorID);
    const popoverElement = document.getElementById(
      this.navigationService.returnPopoverTarget(messageCreatorID)
    );
    this.navigationService.setProfileTarget(true);
    if (popoverElement) (popoverElement as any).showPopover();
  }

  /**
   * Sets the selected user object by calling `updateSelectedUser` on the `userService`, passing in the user object for the specified `messageCreatorID`.
   *
   * @param messageCreatorID - The ID of the message creator for whom to set the selected user object.
   */
  setSelectedUserObject(messageCreatorID: string) {
    this.userService.updateSelectedUser(
      this.userService.getUserByID(messageCreatorID)
    );
  }

  /**
   * Sets the thread view object in the navigation service if the provided message is answerable.
   *
   * @param thread - The message object to set as the thread view object.
   */
  setThread(thread: Message) {
    if (thread.answerable) {
      this.navigationService.setThreadViewObject(thread);
    }
  }
}
