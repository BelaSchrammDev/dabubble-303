import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, Input, OnDestroy, OnInit, ViewChild, } from '@angular/core';
import { MessageComponent } from './message/message.component';
import { MessageDateComponent } from './message-date/message-date.component';
import { SocketService } from '../../../utils/services/socket.service';
import { MessageService } from '../../../utils/services/message.service';
import { Message } from '../../../shared/models/message.class';
import { MessageGreetingComponent } from './message-greeting/message-greeting.component';
import { CommonModule, Time } from '@angular/common';
import { Subscription } from 'rxjs';
import { SearchService } from '../../../utils/services/search.service';
import { Channel } from '../../../shared/models/channel.class';
import { Chat } from '../../../shared/models/chat.class';
import { NavigationService } from '../../../utils/services/navigation.service';
import { UsersService } from '../../../utils/services/user.service';
import { LastReadMessage, User } from '../../../shared/models/user.class';
import { ChannelService } from '../../../utils/services/channel.service';

@Component({
  selector: 'app-messages-list-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    MessageComponent,
    MessageDateComponent,
    MessageGreetingComponent,
    CommonModule,
  ],
  templateUrl: './messages-list-view.component.html',
  styleUrl: './messages-list-view.component.scss',
})
export class MessagesListViewComponent implements OnInit, OnDestroy {
  private socketService = inject(SocketService);
  private messageService = inject(MessageService);
  public navigationService = inject(NavigationService);
  public userService = inject(UsersService);
  public channelService = inject(ChannelService);
  private currentUserSubscription: any;
  private socketSubs: Subscription[] = [];
  private currentMessagesPath: string | undefined;
  public messages: Message[] = [];
  public messagesDates: Date[] = [];
  public noMessagesAvailable = true;
  public messageEditorOpen = false;
  public newMessagesSeparatorIndex = -1;
  private newCollectionIsSet = false;
  private currentCollection!: Channel | Chat | Message;
  private collectionLRM: LastReadMessage | undefined;

  @ViewChild('newmessageseparator', { static: false }) newMessageSeparator!: ElementRef;

  @Input() set currentObject(currentObject: Channel | Chat | Message) {
    this.currentCollection = currentObject;
    this.updateLastReadMessage();
  }

  @Input()
  set messagesPath(value: string | undefined) {
    this.messages = [];
    this.subscribeMessages(value);
    this.messageEditorOpen = false;
    this.newMessagesSeparatorIndex = -1;
    this.newCollectionIsSet = true;
    this._cdr.detectChanges();
  }

  private messageScrollSubscription: Subscription | undefined;

  constructor(
    private _cdr: ChangeDetectorRef,
    private searchService: SearchService,
  ) { }


  ngOnInit(): void {
    this.messageScrollSubscription =
      this.searchService.messageScrollRequested.subscribe(
        (message: Message) => {
          this.scrollToMessageInView(message);
        }
      );
    this.initCurrentUserWatchDog();
  }


  /**
   * Marks a message as viewed by the user.
   *
   * @param message - The message that has been viewed.
   * @returns void
   */
  messageViewed(message: Message): void {
    this.userService.setLastReadMessage(message, this.currentCollection);
  }


  /**
   * Updates the last read message for the current collection.
   * This method retrieves the last read message object for the current collection
   * from the user service and assigns it to the `collectionLRM` property.
   *
   * @returns {void}
   */
  updateLastReadMessage(): void {
    this.collectionLRM = this.userService.getLastReadMessageObject(this.currentCollection);
  }


  /**
   * Initializes a subscription to watch for changes in the current user.
   * When the current user changes, it triggers an update to the last read message.
   *
   * @private
   */
  initCurrentUserWatchDog() {
    this.currentUserSubscription = this.userService.currentUser?.changeUser$.subscribe(() => {
      this.updateLastReadMessage();
    });
  }


  /**
   * Scrolls the view to a specific message element identified by its ID.
   * If the element is not found, it will retry up to a maximum number of attempts.
   * Once the element is found, it scrolls smoothly to the element and applies a temporary color change.
   *
   * @param message - The message object containing the ID of the target element.
   */
  private scrollToMessageInView(message: Message) {
    const maxAttempts = 5;
    let attempts = 0;

    const scrollToElement = () => {
      const targetSelector = `${message.id}`;
      const targetElement = document.getElementById(targetSelector);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetElement.classList.add('color-change');
        setTimeout(() => {
          targetElement.classList.remove('color-change');
        }, 2000);
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(scrollToElement, 500);
      }
    };
    setTimeout(scrollToElement, 100);
  }


  /**
   * Subscribes to Firestore messages collection and handles real-time updates.
   * 
   * @param messagesPath - The path to the Firestore messages collection. If undefined, unsubscribes from the current collection.
   * 
   * This method performs the following actions:
   * - Unsubscribes from the current messages collection if already subscribed.
   * - Subscribes to the new messages collection if `messagesPath` is provided.
   * - Listens for document changes (added, modified, removed) in the collection.
   * - Adds new messages to the `messages` array and marks them as unread if applicable.
   * - Updates existing messages in the `messages` array.
   * - Removes deleted messages from the `messages` array.
   * - Sorts the `messages` array by creation time after new messages are added.
   * - Sets properties for rendering each message.
   * - Triggers change detection to update the view.
   * - Scrolls to the new message separator if a new collection is set.
   */
  private async subscribeMessages(messagesPath: string | undefined): Promise<void> {
    // Alte Socket-Subscriptions abräumen
    this.socketSubs.forEach((s) => s.unsubscribe());
    this.socketSubs = [];
    this.currentMessagesPath = messagesPath;

    if (!messagesPath) return;

    // ── Raum betreten ──────────────────────────────────────────────────────
    const channelMatch = messagesPath.match(/^channels\/([^/]+)/);
    const chatMatch    = messagesPath.match(/^chats\/([^/]+)/);
    if (channelMatch) this.socketService.joinChannel(channelMatch[1]);
    if (chatMatch)    this.socketService.joinChat(chatMatch[1]);

    // ── Initiale Nachrichten per HTTP laden ────────────────────────────────
    const collectionObject = this.currentCollection;
    if (collectionObject) {
      const loaded = await this.messageService.getMessages(collectionObject);
      this.messages = loaded;
      this.messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      this.newMessagesSeparatorIndex = -1;
      this.messages.forEach((m, i) => { if (m.propertysUnSet) this.setPropertysForRendering(m, i); });
      this._cdr.detectChanges();
      if (this.newCollectionIsSet) {
        this.newCollectionIsSet = false;
        setTimeout(() => {
          this.newMessageSeparator?.nativeElement.scrollIntoView({ behavior: 'auto', block: 'start' });
        }, 500);
      }
    }

    // ── Socket-Events für Echtzeit-Updates ────────────────────────────────
    const newEvents = channelMatch ? ['channel-message:created'] : ['chat-message:created'];
    const updEvents = channelMatch ? ['channel-message:updated'] : ['chat-message:updated'];
    const delEvents = channelMatch ? ['channel-message:deleted'] : ['chat-message:deleted'];
    const rxnEvents = channelMatch ? ['channel-message:reaction'] : ['chat-message:reaction'];

    this.socketSubs.push(
      this.socketService.on<any>(newEvents[0]).subscribe((data) => {
        if (this.messages.find((m) => m.id === data.id)) return;
        const msg = new Message(data, messagesPath, data.id);
        msg.unread = this.getIfMessageIsUnread(msg);
        this.messages.push(msg);
        this.messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        this.newMessagesSeparatorIndex = -1;
        this.messages.forEach((m, i) => { if (m.propertysUnSet) this.setPropertysForRendering(m, i); });
        this._cdr.detectChanges();
      }),

      this.socketService.on<any>(updEvents[0]).subscribe((data) => {
        const msg = this.messages.find((m) => m.id === data.id);
        if (msg) { msg.update(data); msg.unread = this.getIfMessageIsUnread(msg); this._cdr.detectChanges(); }
      }),

      this.socketService.on<any>(delEvents[0]).subscribe((data) => {
        this.messages = this.messages.filter((m) => m.id !== data.id);
        this._cdr.detectChanges();
      }),

      this.socketService.on<any>(rxnEvents[0]).subscribe((data) => {
        const msg = this.messages.find((m) => m.id === data.id);
        if (msg && data.emojies) { msg.update({ emojies: data.emojies }); this._cdr.detectChanges(); }
      }),
    );
  }


  /**
   * Sets various properties on a message object to determine how it should be rendered.
   * 
   * @param message - The message object to set properties for.
   * @param index - The index of the message in the list.
   * 
   * Properties set:
   * - `newDaySeparator`: Indicates if a new day separator is needed before this message.
   * - `newMessageSeparator`: Indicates if a new message separator is needed before this message.
   * - `sameUserAsPrevious`: Indicates if this message is from the same user as the previous message.
   * - `unread`: Indicates if the message is unread.
   * - `propertysUnSet`: Set to `false` to indicate that properties have been set.
   */
  setPropertysForRendering(message: Message, index: number): void {
    message.newDaySeparator = this.ifDaySeparatorIsNeeded(index);
    message.newMessageSeparator = this.ifNewMessagesSeparatorIsNeeded(index);
    if (!message.newDaySeparator && !message.newMessageSeparator) message.sameUserAsPrevious = this.ifMessageFromSameUserAsPrevious(index);
    message.unread = this.getIfMessageIsUnread(message);
    message.propertysUnSet = false;
  }


  /**
   * Determines if a new messages separator is needed at the given index.
   *
   * @param index - The index of the message in the messages array.
   * @returns `true` if a new messages separator is needed at the given index, otherwise `false`.
   *
   * This method checks if the current message at the specified index was created after the last read message (LRM)
   * and if the message was not created by the current user. If these conditions are met and a new messages separator
   * index has not been set, it sets the new messages separator index to the current index and returns `true`.
   * Otherwise, it returns `false`.
   */
  ifNewMessagesSeparatorIsNeeded(index: number): boolean {
    if (this.collectionLRM) {
      if (this.newMessagesSeparatorIndex === index) return true;
      const result = this.messages[index].createdAt.getTime() > this.collectionLRM.messageCreateAt;
      if (result && this.messages[index].creatorID !== this.userService.currentUserID && this.newMessagesSeparatorIndex === -1) {
        this.newMessagesSeparatorIndex = index;
        return result;
      }
    }
    return false;
  }


  /**
   * Determines if a day separator is needed between messages.
   *
   * @param index - The index of the current message in the messages array.
   * @returns `true` if a day separator is needed, `false` otherwise.
   *
   * A day separator is needed if the current message is the first message
   * in the list or if the current message was created on a different day
   * than the previous message.
   */
  ifDaySeparatorIsNeeded(index: number): boolean {
    if (index === 0) return true;
    return (
      this.messages[index].createdAt.getDate() !==
      this.messages[index - 1].createdAt.getDate()
    );
  }


  /**
   * Determines if the message at the given index is from the same user as the previous message.
   *
   * @param index - The index of the current message in the messages array.
   * @returns `true` if the current message is from the same user as the previous message, otherwise `false`.
   */
  ifMessageFromSameUserAsPrevious(index: number): boolean {
    if (index === 0) return false;
    return this.messages[index].creatorID === this.messages[index - 1].creatorID;
  }


  /**
   * Determines if a message is unread.
   *
   * @param message - The message to check.
   * @returns `true` if the message is unread, `false` otherwise.
   */
  getIfMessageIsUnread(message: Message): boolean {
    if (this.userService.currentUserID === message.creatorID) return false;
    if (this.collectionLRM) return message.createdAt.getTime() > this.collectionLRM.messageCreateAt;
    return message.createdAt > (this.userService.currentUser?.signupAt ?? 0);
  }


  /**
   * Lifecycle hook that is called when the component is destroyed.
   * 
   * This method performs cleanup by unsubscribing from various subscriptions
   * to prevent memory leaks.
   * 
   * - Unsubscribes from `unsubMessages` if it exists.
   * - Unsubscribes from `messageScrollSubscription` if it exists.
   * - Unsubscribes from `currentUserSubscription` if it exists.
   */
  ngOnDestroy(): void {
    this.socketSubs.forEach((s) => s.unsubscribe());
    this.messageScrollSubscription?.unsubscribe();
    this.currentUserSubscription?.unsubscribe();
  }
}
