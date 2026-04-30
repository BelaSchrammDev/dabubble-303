import { inject, Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, firstValueFrom, Subscription } from 'rxjs';
import { CollectionType, LastReadMessage, User } from '../../shared/models/user.class';
import { Message } from '../../shared/models/message.class';
import { Chat } from '../../shared/models/chat.class';
import { Channel } from '../../shared/models/channel.class';
import { ApiService } from './api.service';
import { SocketService } from './socket.service';
import { AuthService } from './auth.service';
import { EmojipickerService } from './emojipicker.service';

export type CurrentUserChange = 'init' | 'login' | 'logout' | 'update';

function getCollectionType(collection: Channel | Chat | Message): CollectionType {
  if (collection instanceof Channel) return 'channel';
  if (collection instanceof Chat) return 'chat';
  return 'message';
}

@Injectable({ providedIn: 'root' })
export class UsersService implements OnDestroy {
  private api = inject(ApiService);
  private socketService = inject(SocketService);
  private authService = inject(AuthService);
  private emojiService = inject(EmojipickerService);

  private socketSubs: Subscription[] = [];
  private updateCurrentUserDataFunction: any = undefined;

  public isUserMemberOfCurrentChannel = false;

  private changeUserListSubject = new BehaviorSubject<User[]>([]);
  public changeUserList$ = this.changeUserListSubject.asObservable();

  private changeCurrentUserSubject = new BehaviorSubject<CurrentUserChange>('init');
  public changeCurrentUser$ = this.changeCurrentUserSubject.asObservable();

  private selectedUserObjectSubject = new BehaviorSubject<User | undefined>(undefined);
  public selectedUserObject$ = this.selectedUserObjectSubject.asObservable();

  public users: User[] = [];
  public currentUser: User | undefined;
  get currentUserID(): string { return this.currentUser?.id ?? 'no user logged in'; }
  public currentGuestUserID: string = '';

  constructor() {
    this.initUserSubscription();
    this.initSocketListeners();
  }

  // ── Initialisierung ────────────────────────────────────────────────────────

  private async initUserSubscription(): Promise<void> {
    if (!this.authService.isLoggedIn()) return;
    try {
      const users = await firstValueFrom(this.api.get<any[]>('/users'));
      this.users = users.map((u) => new User(u, u.id));
      this.users.sort((a, b) => a.name.localeCompare(b.name));
      this.changeUserListSubject.next(this.users);
      await this.loadCurrentUser();
    } catch (error) {
      console.error('UserService: initUserSubscription', error);
    }
  }

  private async loadCurrentUser(): Promise<void> {
    try {
      const userData = await firstValueFrom(this.api.get<any>('/auth/me'));
      const user = this.users.find((u) => u.id === userData.id)
        ?? new User(userData, userData.id);
      await this.setCurrentUser(user);
    } catch {
      this.authService.clearTokens();
    }
  }

  private initSocketListeners(): void {
    this.socketSubs.push(
      this.socketService.on<any>('user:updated').subscribe((data) => {
        const user = this.users.find((u) => u.id === data.id);
        if (user) {
          user.update(data);
          if (user.id === this.currentUser?.id) this.changeCurrentUserSubject.next('update');
        } else {
          this.users.push(new User(data, data.id));
          this.users.sort((a, b) => a.name.localeCompare(b.name));
        }
        this.changeUserListSubject.next(this.users);
      }),

      this.socketService.on<any>('user:online').subscribe((data) => {
        const user = this.users.find((u) => u.id === data.userId);
        if (user) { user.update({ online: true }); this.changeUserListSubject.next(this.users); }
      }),

      this.socketService.on<any>('user:offline').subscribe((data) => {
        const user = this.users.find((u) => u.id === data.userId);
        if (user) { user.update({ online: false }); this.changeUserListSubject.next(this.users); }
      }),
    );
  }

  // ── Öffentliche Initialisierung nach Login ─────────────────────────────────

  async initAfterLogin(userData: any): Promise<void> {
    const allUsers = await firstValueFrom(this.api.get<any[]>('/users'));
    this.users = allUsers.map((u) => new User(u, u.id));
    this.users.sort((a, b) => a.name.localeCompare(b.name));
    this.changeUserListSubject.next(this.users);

    const user = this.users.find((u) => u.id === userData.id)
      ?? new User(userData, userData.id);
    await this.setCurrentUser(user);
  }

  // ── User-Abfragen ──────────────────────────────────────────────────────────

  getAllUserIDs(): string[] {
    return this.users.filter((u) => !u.guest && !u.bot).map((u) => u.id);
  }

  getUserByID(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  getUserByName(name: string): User | undefined {
    return this.users.find((u) => u.name === name);
  }

  // ── User-Updates ───────────────────────────────────────────────────────────

  async updateCurrentUserDataOnFirestore(userChangeData: Record<string, any>): Promise<void> {
    await this.updateUserDataOnFirestore(this.currentUserID, userChangeData);
    this.currentUser?.update(userChangeData);
  }

  async updateUserDataOnFirestore(userID: string, userChangeData: Record<string, any>): Promise<void> {
    try {
      await firstValueFrom(this.api.patch(`/users/${userID}`, userChangeData));
    } catch (error) {
      console.error('UserService/patch:', (error as Error).message);
    }
  }

  // ── Current-User-Management ───────────────────────────────────────────────

  private async setCurrentUser(user: User): Promise<void> {
    if (this.currentUser && user) return;
    this.currentUser = user;
    if (user.guest) this.currentGuestUserID = user.id;
    await this.emojiService.loadUserEmojis(user.id);
    await this.updateCurrentUserDataOnFirestore({ online: true });
    this.changeCurrentUserSubject.next('login');
  }

  public async setCurrentUserByEMail(userEmail: string): Promise<void> {
    if (userEmail === '') { this.clearCurrentUser(); return; }
    const sub = this.changeUserList$.subscribe((users) => {
      const user = users.find((u) => u.email === userEmail);
      if (user) {
        this.setCurrentUser(user);
        setTimeout(() => sub.unsubscribe(), 1000);
      }
    });
  }

  public async clearCurrentUser(): Promise<void> {
    if (this.currentUser) {
      if (this.updateCurrentUserDataFunction !== undefined) {
        clearTimeout(this.updateCurrentUserDataFunction);
        this.updateCurrentUserDataFunction = undefined;
      }
      await this.updateCurrentUserDataOnFirestore({
        online: false,
        lastReadMessages: this.currentUser.lastReadMessages,
      });
      this.currentUser = undefined;
      this.currentGuestUserID = '';
      this.changeCurrentUserSubject.next('logout');
    }
  }

  // ── E-Mail-Verifikation ────────────────────────────────────────────────────

  public async sendEmailVerificationLink(): Promise<void> {
    try {
      await firstValueFrom(this.api.post('/auth/resend-verification', {}));
    } catch (error) {
      console.error('UserService/resend-verification:', (error as Error).message);
    }
  }

  public async ifCurrentUserVerified(): Promise<boolean> {
    if (!this.currentUser) return false;
    if (this.currentUser.provider !== 'email') return true;
    if (this.currentUser.emailVerified) return true;
    // Aktuellen Status vom Backend holen
    try {
      const userData = await firstValueFrom(this.api.get<any>('/auth/me'));
      if (userData.emailVerified) {
        this.currentUser.update({ emailVerified: true });
        return true;
      }
    } catch { /* ignorieren */ }
    document.getElementById('emailNotVerifiedPopover')?.showPopover();
    return false;
  }

  // ── Last-Read-Messages ─────────────────────────────────────────────────────

  setLastReadMessage(message: Message, collection: Channel | Chat | Message): void {
    if (!this.currentUser) return;
    const lrm = this.currentUser.lastReadMessages.find((l) => l.collectionID === collection.id);
    const messageCreatedAt = message.createdAt.getTime();
    collection.unreadMessagesCount--;
    collection.update({});
    let updateNeeded = false;

    if (lrm) {
      if (lrm.messageCreateAt < messageCreatedAt) {
        lrm.messageID = message.id;
        lrm.messageCreateAt = messageCreatedAt;
        updateNeeded = true;
      }
    } else {
      if (this.currentUser.signupAt < message.createdAt) {
        const type = getCollectionType(collection);
        this.currentUser.lastReadMessages.push({ collectionType: type, collectionID: collection.id, messageID: message.id, messageCreateAt: messageCreatedAt });
        updateNeeded = true;
      }
    }
    this.changeCurrentUserSubject.next('update');

    if (updateNeeded && this.updateCurrentUserDataFunction === undefined) {
      this.updateCurrentUserDataFunction = setTimeout(() => {
        if (this.currentUser) {
          this.updateCurrentUserDataOnFirestore({ lastReadMessages: this.currentUser.lastReadMessages });
        }
        this.updateCurrentUserDataFunction = undefined;
      }, 10000);
    }
  }

  getLastReadMessageObject(collection: Channel | Chat | Message): LastReadMessage | undefined {
    if (!this.currentUser) return undefined;
    const result = this.currentUser.lastReadMessages.find(
      (l) => l.collectionType === getCollectionType(collection) && l.collectionID === collection.id
    );
    return result ?? {
      collectionType: getCollectionType(collection),
      collectionID: collection.id,
      messageID: '',
      messageCreateAt: this.currentUser.signupAt.getTime(),
    };
  }

  // ── Selektion ──────────────────────────────────────────────────────────────

  updateSelectedUser(user: User | undefined): void {
    this.selectedUserObjectSubject.next(user);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.socketSubs.forEach((s) => s.unsubscribe());
  }
}
