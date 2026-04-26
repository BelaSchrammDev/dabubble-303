import { inject, Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, firstValueFrom, Subscription } from 'rxjs';
import { Channel } from '../../shared/models/channel.class';
import { Chat } from '../../shared/models/chat.class';
import { User } from '../../shared/models/user.class';
import { Message } from '../../shared/models/message.class';
import { ApiService } from './api.service';
import { SocketService } from './socket.service';
import { UsersService } from './user.service';

export type ActivChat = {
  chat: Chat;
  partner: User;
  unreadMessagesCount: number;
};

@Injectable({ providedIn: 'root' })
export class ChannelService implements OnDestroy {
  private api = inject(ApiService);
  private socketService = inject(SocketService);
  private userservice = inject(UsersService);

  public defaultChannel: Channel = new Channel({
    name: 'Willkommen',
    description: 'Defaultchannel',
    defaultChannel: true,
  });

  public channels: Channel[] = [this.defaultChannel];
  public chats: Chat[] = [];

  private chatListChangeSubject = new BehaviorSubject<Chat[]>([]);
  public chatListChange$ = this.chatListChangeSubject.asObservable();

  public activeChats$ = new BehaviorSubject<ActivChat[]>([]);

  private socketSubs: Subscription[] = [];
  private userListSub: Subscription | null = null;
  private currentUserSub: Subscription | null = null;
  private activeUserSub: Subscription | null = null;
  private updateAllowed = false;

  constructor() {
    this.userListSub = this.userservice.changeUserList$.subscribe(() => {
      this.defaultChannel.update({ members: this.userservice.getAllUserIDs() });
    });

    this.currentUserSub = this.userservice.changeCurrentUser$.subscribe(async (type) => {
      if (type === 'login') {
        this.updateAllowed = true;
        await this.loadChannels();
        await this.loadChats();
        this.initSocketListeners();
        setTimeout(() => {
          this.channels.forEach((ch) => { if (!ch.defaultChannel) this.calculateUnreadMessagesCount(ch); });
          this.chats.forEach((chat) => { if (this.userservice.currentUser?.chatIDs.includes(chat.id)) this.calculateUnreadMessagesCount(chat); });
          this.initActiveChatsStream();
        }, 500);
      } else if (type === 'logout') {
        this.updateAllowed = false;
        this.socketSubs.forEach((s) => s.unsubscribe());
        this.socketSubs = [];
        this.channels = [this.defaultChannel];
        this.chats = [];
      }
    });
  }

  // ── Daten laden ────────────────────────────────────────────────────────────

  private async loadChannels(): Promise<void> {
    try {
      const data = await firstValueFrom(this.api.get<any[]>('/channels'));
      const loaded = data.map((c) => new Channel(c, c.id));
      this.channels = [this.defaultChannel, ...loaded];
    } catch (error) {
      console.error('ChannelService: loadChannels', error);
    }
  }

  private async loadChats(): Promise<void> {
    try {
      const data = await firstValueFrom(this.api.get<any[]>('/chats'));
      this.chats = data.map((c) => new Chat(c, c.id));
      this.chatListChangeSubject.next(this.chats);
    } catch (error) {
      console.error('ChannelService: loadChats', error);
    }
  }

  // ── Socket-Listener ────────────────────────────────────────────────────────

  private initSocketListeners(): void {
    this.socketSubs.push(
      this.socketService.on<any>('channel:created').subscribe((data) => {
        if (!this.channels.find((c) => c.id === data.id)) {
          const ch = new Channel(data, data.id);
          this.channels.push(ch);
          if (this.updateAllowed) this.calculateUnreadMessagesCount(ch);
        }
      }),

      this.socketService.on<any>('channel:updated').subscribe((data) => {
        const ch = this.channels.find((c) => c.id === data.id);
        if (ch) {
          ch.update(data);
          if (this.updateAllowed) this.calculateUnreadMessagesCount(ch);
        }
      }),

      this.socketService.on<any>('channel:deleted').subscribe((data) => {
        this.channels = this.channels.filter((c) => c.id !== data.id);
      }),

      this.socketService.on<any>('chat:created').subscribe((data) => {
        if (!this.chats.find((c) => c.id === data.id)) {
          this.chats.push(new Chat(data, data.id));
          this.chatListChangeSubject.next(this.chats);
          this.updateActiveChatsStream();
        }
      }),

      this.socketService.on<any>('channel-message:created').subscribe((data) => {
        const ch = this.channels.find((c) => c.id === data.channelId);
        if (ch && data.creatorID !== this.userservice.currentUserID) {
          ch.unreadMessagesCount = (ch.unreadMessagesCount || 0) + 1;
        }
      }),

      this.socketService.on<any>('chat-message:created').subscribe((data) => {
        const chat = this.chats.find((c) => c.id === data.chatId);
        if (chat && data.creatorID !== this.userservice.currentUserID) {
          chat.unreadMessagesCount = (chat.unreadMessagesCount || 0) + 1;
          this.updateActiveChatsStream();
        }
      }),
    );
  }

  // ── Aktive Chats ───────────────────────────────────────────────────────────

  initActiveChatsStream(): void {
    if (this.activeUserSub) this.activeUserSub.unsubscribe();
    this.activeUserSub = this.userservice.currentUser?.changeUser$.subscribe(() => {
      this.updateActiveChatsStream();
    }) ?? null;
  }

  updateActiveChatsStream(): void {
    this.activeChats$.next(
      this.chats
        .filter((chat) => this.userservice.currentUser?.chatIDs.includes(chat.id))
        .map((chat) => ({
          chat,
          partner: this.getChatPartner(chat) as User,
          unreadMessagesCount: chat.unreadMessagesCount,
        }))
        .filter((item) => item.partner !== undefined && !item.partner.guest)
        .sort((a, b) => b.chat.createdAt.getTime() - a.chat.createdAt.getTime())
    );
  }

  // ── Unread-Count ───────────────────────────────────────────────────────────

  public async calculateUnreadMessagesCount(collection: Channel | Chat | Message): Promise<void> {
    const lrm = this.userservice.getLastReadMessageObject(collection);
    const lastViewTime = lrm ? new Date(lrm.messageCreateAt) : (this.userservice.currentUser?.signupAt ?? new Date(0));

    let path = '';
    if (collection instanceof Channel) path = `/channels/${collection.id}/messages`;
    else if (collection instanceof Chat) path = `/chats/${collection.id}/messages`;
    else return;

    try {
      const messages = await firstValueFrom(this.api.get<any[]>(path));
      const unread = messages.filter(
        (m) => new Date(m.createdAt) > lastViewTime && m.creatorID !== this.userservice.currentUserID
      ).length;
      if (collection.unreadMessagesCount !== unread) {
        collection.unreadMessagesCount = unread;
        if (collection instanceof Chat) this.updateActiveChatsStream();
      }
    } catch { /* ignorieren */ }
  }

  // ── Channel-Abfragen ───────────────────────────────────────────────────────

  getChatByID(chatID: string): Chat | undefined {
    return this.chats.find((c) => c.id === chatID);
  }

  getChatPartner(chat: Chat): User | undefined {
    if (!this.userservice.currentUser) return undefined;
    const partnerId = chat.memberIDs[0] === this.userservice.currentUserID
      ? chat.memberIDs[1]
      : chat.memberIDs[0];
    return this.userservice.getUserByID(partnerId);
  }

  getChatWithUserByID(selectedUserID: string): Chat | undefined {
    if (!this.userservice.currentUser) return undefined;
    if (this.userservice.currentUserID === selectedUserID) {
      return this.chats.find((c) => c.memberIDs[0] === selectedUserID && c.memberIDs[1] === selectedUserID);
    }
    return this.chats.find((c) => c.memberIDs.includes(selectedUserID) && c.memberIDs.includes(this.userservice.currentUserID));
  }

  getChatWithUserByName(selectedUserName: string): Chat | undefined {
    const user = this.userservice.getUserByName(selectedUserName);
    return user ? this.getChatWithUserByID(user.id) : undefined;
  }

  getChannelByName(channelName: string): Channel | undefined {
    return this.channels.find((c) => c.name === channelName);
  }

  ifCurrentUserMemberOfChannelByName(channelName: string): boolean {
    const ch = this.getChannelByName(channelName);
    return ch ? ch.memberIDs.includes(this.userservice.currentUserID) : false;
  }

  checkForDuplicateChannelName(channelName: string, originalChannelName: string, originalChannelNameRequired = true): boolean {
    const isDuplicate = this.channels.some((c) => c.name.toLowerCase() === channelName.toLowerCase());
    if (originalChannelNameRequired) {
      return isDuplicate && channelName.toLowerCase() !== originalChannelName.toLowerCase();
    }
    return isDuplicate;
  }

  // ── Channel/Chat-CRUD ──────────────────────────────────────────────────────

  async addNewChannelToFirestore(name: string, description: string, membersIDs: string[]): Promise<boolean> {
    try {
      await firstValueFrom(this.api.post('/channels', {
        name,
        description,
        memberIDs: membersIDs,
      }));
      return true;
    } catch (error) {
      console.error('ChannelService: addNewChannelToFirestore', error);
      return false;
    }
  }

  async updateChannelOnFirestore(channel: Channel, updateData: { name?: string; description?: string; memberIDs?: string[] }): Promise<void> {
    try {
      await firstValueFrom(this.api.patch(`/channels/${channel.id}`, updateData));
    } catch (error) {
      console.error('ChannelService: updateChannelOnFirestore', error);
    }
  }

  async addChatWithUserOnFirestore(userID: string): Promise<string | undefined> {
    try {
      const chat = await firstValueFrom(this.api.post<any>('/chats', { partnerUserId: userID }));
      if (!this.chats.find((c) => c.id === chat.id)) {
        this.chats.push(new Chat(chat, chat.id));
        this.chatListChangeSubject.next(this.chats);
      }
      return chat.id;
    } catch (error) {
      console.error('ChannelService: addChatWithUserOnFirestore', error);
      return undefined;
    }
  }

  async addSelfChat(userID: string): Promise<string | undefined> {
    return this.addChatWithUserOnFirestore(userID);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.socketSubs.forEach((s) => s.unsubscribe());
    this.userListSub?.unsubscribe();
    this.currentUserSub?.unsubscribe();
    this.activeUserSub?.unsubscribe();
  }
}
