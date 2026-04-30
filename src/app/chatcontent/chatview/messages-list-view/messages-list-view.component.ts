import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
import { MessageComponent } from './message/message.component';
import { MessageDateComponent } from './message-date/message-date.component';
import { SocketService } from '../../../utils/services/socket.service';
import { MessageService } from '../../../utils/services/message.service';
import { Message } from '../../../shared/models/message.class';
import { MessageGreetingComponent } from './message-greeting/message-greeting.component';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SearchService } from '../../../utils/services/search.service';
import { Channel } from '../../../shared/models/channel.class';
import { Chat } from '../../../shared/models/chat.class';
import { NavigationService } from '../../../utils/services/navigation.service';
import { UsersService } from '../../../utils/services/user.service';
import { LastReadMessage } from '../../../shared/models/user.class';
import { ChannelService } from '../../../utils/services/channel.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-messages-list-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [MessageComponent, MessageDateComponent, MessageGreetingComponent, CommonModule],
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
  private messageScrollSubscription: Subscription | undefined;
  private currentMessagesPath: string | undefined;
  private intersectionObserver: IntersectionObserver | undefined;

  public messages: Message[] = [];
  public messageEditorOpen = false;
  public newMessagesSeparatorIndex = -1;
  public isLoading = false;

  readonly pageSize = environment.messagePageSize;
  private currentOffset = 0;
  private totalMessages = 0;
  get hasMore(): boolean { return this.currentOffset < this.totalMessages; }

  private newCollectionIsSet = false;
  private currentCollection!: Channel | Chat | Message;
  private collectionLRM: LastReadMessage | undefined;

  @Output() messagesLoaded = new EventEmitter<number>();
  @ViewChild('newmessageseparator', { static: false }) newMessageSeparator!: ElementRef;

  @Input() set currentObject(value: Channel | Chat | Message) {
    this.currentCollection = value;
    this.updateLastReadMessage();
  }

  @Input() set messagesPath(value: string | undefined) {
    this.messages = [];
    this.currentOffset = 0;
    this.totalMessages = 0;
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = undefined;
    this.messageEditorOpen = false;
    this.newMessagesSeparatorIndex = -1;
    this.newCollectionIsSet = true;
    this.subscribeMessages(value);
    this._cdr.detectChanges();
  }

  constructor(
    private _cdr: ChangeDetectorRef,
    private searchService: SearchService,
    private el: ElementRef,
    private ngZone: NgZone,
  ) {}

  ngOnInit(): void {
    this.messageScrollSubscription = this.searchService.messageScrollRequested.subscribe(
      (message: Message) => this.scrollToMessageInView(message),
    );
    this.initCurrentUserWatchDog();
  }

  messageViewed(message: Message): void {
    this.userService.setLastReadMessage(message, this.currentCollection);
  }

  updateLastReadMessage(): void {
    this.collectionLRM = this.userService.getLastReadMessageObject(this.currentCollection);
  }

  initCurrentUserWatchDog() {
    this.currentUserSubscription = this.userService.currentUser?.changeUser$.subscribe(() => {
      this.updateLastReadMessage();
    });
  }

  private scrollToMessageInView(message: Message) {
    const maxAttempts = 5;
    let attempts = 0;
    const scrollToElement = () => {
      const targetElement = document.getElementById(message.id);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetElement.classList.add('color-change');
        setTimeout(() => targetElement.classList.remove('color-change'), 2000);
      } else if (attempts < maxAttempts) {
        attempts++;
        setTimeout(scrollToElement, 500);
      }
    };
    setTimeout(scrollToElement, 100);
  }

  private async subscribeMessages(messagesPath: string | undefined): Promise<void> {
    this.socketSubs.forEach((s) => s.unsubscribe());
    this.socketSubs = [];
    this.currentMessagesPath = messagesPath;

    if (!messagesPath) return;

    const channelMatch = messagesPath.match(/^channels\/([^/]+)/);
    const chatMatch    = messagesPath.match(/^chats\/([^/]+)/);
    if (channelMatch) this.socketService.joinChannel(channelMatch[1]);
    if (chatMatch)    this.socketService.joinChat(chatMatch[1]);

    const collectionObject = this.currentCollection;
    if (collectionObject) {
      this.isLoading = true;
      this._cdr.detectChanges();

      const { messages, total } = await this.messageService.getMessages(
        collectionObject, this.pageSize, 0,
      );
      this.totalMessages = total;
      this.currentOffset = messages.length;
      this.messages = messages;
      this.newMessagesSeparatorIndex = -1;
      this.messages.forEach((m, i) => { if (m.propertysUnSet) this.setPropertysForRendering(m, i); });
      this.isLoading = false;
      this._cdr.detectChanges();
      this.messagesLoaded.emit(this.messages.length);

      if (this.newCollectionIsSet) {
        this.newCollectionIsSet = false;
        setTimeout(() => {
          const scrollContainer = this.el.nativeElement.parentElement;
          if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
          this.setupIntersectionObserver();
        }, 100);
      } else {
        this.setupIntersectionObserver();
      }
    }

    const newEvent = channelMatch ? 'channel-message:created' : 'chat-message:created';
    const updEvent = channelMatch ? 'channel-message:updated' : 'chat-message:updated';
    const delEvent = channelMatch ? 'channel-message:deleted' : 'chat-message:deleted';
    const rxnEvent = channelMatch ? 'channel-message:reaction' : 'chat-message:reaction';

    this.socketSubs.push(
      this.socketService.on<any>(newEvent).subscribe((data) => {
        const msgData = data.message ?? data;
        if (this.messages.find((m) => m.id === msgData.id)) return;
        const msg = new Message(msgData, messagesPath, msgData.id);
        msg.unread = this.getIfMessageIsUnread(msg);
        this.messages = [...this.messages, msg];
        this.totalMessages++;
        this.newMessagesSeparatorIndex = -1;
        this.messages.forEach((m, i) => { if (m.propertysUnSet) this.setPropertysForRendering(m, i); });
        this._cdr.detectChanges();
      }),

      this.socketService.on<any>(updEvent).subscribe((data) => {
        const msgData = data.message ?? data;
        const msg = this.messages.find((m) => m.id === msgData.id);
        if (msg) { msg.update(msgData); msg.unread = this.getIfMessageIsUnread(msg); this._cdr.detectChanges(); }
      }),

      this.socketService.on<any>(delEvent).subscribe((data) => {
        const msgId = data.messageId ?? data.id;
        this.messages = this.messages.filter((m) => m.id !== msgId);
        this.totalMessages = Math.max(0, this.totalMessages - 1);
        this.currentOffset = Math.max(0, this.currentOffset - 1);
        this._cdr.detectChanges();
      }),

      this.socketService.on<any>(rxnEvent).subscribe((data) => {
        const msgId = data.messageId ?? data.id;
        const msg = this.messages.find((m) => m.id === msgId);
        if (msg && data.emojies) { msg.update({ emojies: data.emojies }); this._cdr.detectChanges(); }
      }),
    );
  }

  private async loadMoreMessages(): Promise<void> {
    if (this.isLoading || !this.hasMore || !this.currentCollection) return;
    this.isLoading = true;
    this._cdr.detectChanges();

    const scrollContainer = this.el.nativeElement.parentElement;
    const prevScrollHeight = scrollContainer?.scrollHeight ?? 0;

    const { messages: older, total } = await this.messageService.getMessages(
      this.currentCollection, this.pageSize, this.currentOffset,
    );
    this.totalMessages = total;
    const deduped = older.filter((m) => !this.messages.some((e) => e.id === m.id));
    this.messages = [...deduped, ...this.messages];
    this.currentOffset += deduped.length;

    this.newMessagesSeparatorIndex = -1;
    this.messages.forEach((m, i) => { if (m.propertysUnSet) this.setPropertysForRendering(m, i); });
    this.isLoading = false;
    this._cdr.detectChanges();

    if (scrollContainer) {
      scrollContainer.scrollTop += scrollContainer.scrollHeight - prevScrollHeight;
    }

    if (!this.hasMore) {
      this.intersectionObserver?.disconnect();
      this.intersectionObserver = undefined;
    }
  }

  private setupIntersectionObserver(): void {
    const scrollContainer = this.el.nativeElement.parentElement;
    if (!scrollContainer || !this.hasMore) return;

    this.intersectionObserver?.disconnect();

    this.ngZone.runOutsideAngular(() => {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !this.isLoading) {
            this.ngZone.run(() => this.loadMoreMessages());
          }
        },
        { root: scrollContainer, threshold: 0 },
      );
      setTimeout(() => {
        const sentinel = this.el.nativeElement.querySelector('.top-sentinel');
        if (sentinel) this.intersectionObserver?.observe(sentinel);
      }, 200);
    });
  }

  setPropertysForRendering(message: Message, index: number): void {
    message.newDaySeparator = this.ifDaySeparatorIsNeeded(index);
    message.newMessageSeparator = this.ifNewMessagesSeparatorIsNeeded(index);
    if (!message.newDaySeparator && !message.newMessageSeparator)
      message.sameUserAsPrevious = this.ifMessageFromSameUserAsPrevious(index);
    message.unread = this.getIfMessageIsUnread(message);
    message.propertysUnSet = false;
  }

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

  ifDaySeparatorIsNeeded(index: number): boolean {
    if (index === 0) return true;
    return this.messages[index].createdAt.getDate() !== this.messages[index - 1].createdAt.getDate();
  }

  ifMessageFromSameUserAsPrevious(index: number): boolean {
    if (index === 0) return false;
    return this.messages[index].creatorID === this.messages[index - 1].creatorID;
  }

  getIfMessageIsUnread(message: Message): boolean {
    if (this.userService.currentUserID === message.creatorID) return false;
    if (this.collectionLRM) return message.createdAt.getTime() > this.collectionLRM.messageCreateAt;
    return message.createdAt > (this.userService.currentUser?.signupAt ?? 0);
  }

  ngOnDestroy(): void {
    this.intersectionObserver?.disconnect();
    this.socketSubs.forEach((s) => s.unsubscribe());
    this.messageScrollSubscription?.unsubscribe();
    this.currentUserSubscription?.unsubscribe();
  }
}
